const MAX_SYNC_DIRECT_FILE_BYTES=19*1024*1024;
const SYNC_SUBMIT_TIMEOUT_MS=18000;
function allowedUrl(value=''){
  try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u:null}catch{return null}
}
function parseDataAudio(value=''){
  const s=String(value||'');
  const m=/^data:(audio\/(?:wav|x-wav|mpeg|mp3|ogg|webm|mp4|m4a|aac));base64,([A-Za-z0-9+/=]+)$/i.exec(s);
  if(!m)return null;
  const buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>20*1024*1024)return null;
  const mime=m[1].toLowerCase()==='audio/x-wav'?'audio/wav':m[1].toLowerCase();
  const ext=mime.includes('wav')?'wav':mime.includes('mpeg')||mime.includes('mp3')?'mp3':mime.includes('ogg')?'ogg':mime.includes('webm')?'webm':mime.includes('mp4')||mime.includes('m4a')?'m4a':'aac';
  return {buf,mime,ext};
}
function providerMessage(payload,fallback=''){
  const pick=payload?.detail??payload?.error??payload?.message??payload;
  if(typeof pick==='string'&&pick.trim())return pick.trim();
  try{const s=JSON.stringify(pick);if(s&&s!=='{}')return s.slice(0,1600)}catch{}
  return fallback||'Lip-sync provider request failed.';
}
class ProviderError extends Error{
  constructor(message,{status=502,code='',details=null}={}){super(message);this.name='ProviderError';this.providerStatus=Number(status)||502;this.code=String(code||'');this.details=details||null}
}
function chosenProvider(){
  const requested=String(process.env.LIPSYNC_PROVIDER||'auto').trim().toLowerCase();
  const hasSync=Boolean(String(process.env.SYNC_API_KEY||'').trim()),hasFal=Boolean(String(process.env.FAL_KEY||'').trim());
  if(requested==='sync-labs'||requested==='sync')return hasSync?'sync-labs':'';
  if(requested==='fal'||requested==='fal-sync')return hasFal?'fal-sync':'';
  return hasSync?'sync-labs':hasFal?'fal-sync':'';
}
function videoMimeExt(header='',url=''){
  const t=String(header||'').split(';')[0].trim().toLowerCase();
  if(t==='video/webm')return {mime:'video/webm',ext:'webm'};
  if(t==='video/quicktime')return {mime:'video/quicktime',ext:'mov'};
  if(t.startsWith('video/'))return {mime:t,ext:'mp4'};
  try{const p=new URL(String(url||'')).pathname.toLowerCase();if(p.endsWith('.webm'))return {mime:'video/webm',ext:'webm'};if(p.endsWith('.mov'))return {mime:'video/quicktime',ext:'mov'}}catch{}
  return {mime:'video/mp4',ext:'mp4'};
}
function sourceFetchTarget(video){
  try{if(video.pathname==='/api/video-file'){const raw=video.searchParams.get('uri')||'';const upstream=allowedUrl(raw);if(upstream)return upstream}}catch{}
  return video;
}
async function fetchWithTimeout(url,options={},timeoutMs=15000){
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:ctl.signal})}finally{clearTimeout(timer)}
}
async function fetchSyncSourceVideo(video){
  const target=sourceFetchTarget(video);if(!target)return null;
  const headers={},host=target.hostname.toLowerCase(),isGoogle=host==='googleapis.com'||host.endsWith('.googleapis.com'),isPublicStorage=host==='storage.googleapis.com';
  if(isGoogle&&!isPublicStorage){const key=String(process.env.GEMINI_API_KEY||'').trim();if(!key)return null;headers['x-goog-api-key']=key}
  try{
    const r=await fetchWithTimeout(target,{headers,redirect:'follow'},12000);if(!r.ok)return null;
    const declared=Number(r.headers.get('content-length')||0);if(declared>MAX_SYNC_DIRECT_FILE_BYTES)return null;
    const buf=Buffer.from(await r.arrayBuffer());if(!buf.length||buf.length>MAX_SYNC_DIRECT_FILE_BYTES)return null;
    const {mime,ext}=videoMimeExt(r.headers.get('content-type')||'',target.href);return {buf,mime,ext,sourceUrl:target.href};
  }catch{return null}
}
async function readProviderJson(r){const text=await r.text().catch(()=> '');if(!text)return {};try{return JSON.parse(text)}catch{return {message:text.slice(0,1600)}}}
function syncRetryDelayMs(response){
  const raw=String(response?.headers?.get?.('retry-after')||'').trim();
  if(raw){const seconds=Number(raw);if(Number.isFinite(seconds)&&seconds>=0)return Math.min(10000,Math.max(500,seconds*1000));const when=Date.parse(raw);if(Number.isFinite(when))return Math.min(10000,Math.max(500,when-Date.now()))}
  return 2000;
}

function syncSubmitIsConcurrency(status,code=''){
  if(Number(status)!==429)return false;
  return ['concurrency_limit_reached','concurrency_limit_exceeded','generation_concurrency_limit_exceeded'].includes(String(code||'').trim().toLowerCase());
}
function syncSubmitIsRetryable(status,code=''){
  const n=Number(status),c=String(code||'').trim().toLowerCase();
  if([500,503,504].includes(n))return true;
  if(n!==429)return false;
  if(!c)return true;
  return ['rate_limit_exceeded','concurrency_limit_exceeded','generation_concurrency_limit_exceeded','controller_unavailable','controller_dependency_error','controller_timeout'].includes(c);
}
function syncProviderRequestId(payload,response){return String(payload?.requestId||payload?.request_id||response?.headers?.get?.('x-request-id')||response?.headers?.get?.('x-sync-request-id')||'').trim()}
function safeSubmissionKey(value=''){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,72)}
async function recoverSyncGeneration(key,outputFileName){
  try{
    const r=await fetchWithTimeout('https://api.sync.so/v2/generations',{headers:{'x-api-key':key,'accept':'application/json','cache-control':'no-cache'}},7000);
    if(!r.ok)return null;const d=await r.json().catch(()=>[]);const list=Array.isArray(d)?d:(Array.isArray(d?.data)?d.data:[]);
    const now=Date.now();
    return list.find(g=>String(g?.outputFileName||'').replace(/\.mp4$/i,'')===outputFileName&&(!g?.createdAt||Math.abs(now-Date.parse(g.createdAt))<30*60*1000))||null;
  }catch{return null}
}
async function submitSyncLabs(video,audio,submissionKey=''){
  const key=String(process.env.SYNC_API_KEY||'').trim();
  const model=String(process.env.SYNC_LIPSYNC_MODEL||'sync-3').trim()||'sync-3';
  const allowed=new Set(['sync-3','lipsync-2','lipsync-2-pro','lipsync-1.9.0-beta','react-1']);if(!allowed.has(model))throw new Error('Invalid SYNC_LIPSYNC_MODEL configuration.');
  const token=safeSubmissionKey(submissionKey)||String(Date.now());
  const outputFileName=`cinetale_sync_${token}`.slice(0,120);
  const recovered=await recoverSyncGeneration(key,outputFileName);
  if(recovered?.id&&['PENDING','PROCESSING','COMPLETED'].includes(String(recovered.status||'').toUpperCase())){
    const requestId=String(recovered.id),statusUrl=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}`;
    return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,recovered:true,providerStatus:recovered.status||'PENDING'};
  }
  const directVideo=await fetchSyncSourceVideo(video);
  const form=new FormData();
  form.append('model',model);
  form.append('audio',new Blob([audio.buf],{type:audio.mime}),`cinetale-approved-dialogue.${audio.ext}`);
  if(directVideo)form.append('video',new Blob([directVideo.buf],{type:directVideo.mime}),`cinetale-source.${directVideo.ext}`);
  else form.append('input',JSON.stringify([{type:'video',url:video.href}]));
  form.append('options',JSON.stringify({sync_mode:'silence',active_speaker_detection:{auto_detect:true,v3:true}}));
  form.append('outputFileName',outputFileName);
  let r,d;
  try{
    r=await fetchWithTimeout('https://api.sync.so/v2/generate',{method:'POST',headers:{'x-api-key':key,'accept':'application/json'},body:form},SYNC_SUBMIT_TIMEOUT_MS);
    d=await readProviderJson(r);
  }catch(e){
    const maybe=await recoverSyncGeneration(key,outputFileName);
    if(maybe?.id&&['PENDING','PROCESSING','COMPLETED'].includes(String(maybe.status||'').toUpperCase())){
      const requestId=String(maybe.id),statusUrl=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}`;
      return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,recovered:true,providerStatus:maybe.status||'PENDING'};
    }
    return {status:'submission_unknown',provider:'sync-labs',model,error:'Sync Labs did not confirm the submission before the server timeout. CineTale will safely check for an existing generation before any retry.',errorCode:'sync_submit_ambiguous',retryAfterMs:4000};
  }
  if(r.ok){
    const requestId=String(d.id||'').trim();if(!requestId)throw new ProviderError('Sync Labs accepted the request but did not return a generation ID.',{status:502,details:d});
    const statusUrl=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}`;
    return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,transport:directVideo?'direct-files':'audio-file-video-url'};
  }
  const code=String(d.errorCode||d.code||'').trim(),providerRequestId=syncProviderRequestId(d,r),details={...d,providerRequestId:providerRequestId||undefined};
  if(syncSubmitIsConcurrency(r.status,code)){
    // A 429 concurrency response often means this scene's earlier request was accepted but
    // the browser lost the acknowledgement. Recover the deterministic generation before
    // allowing any further POST, so one user action can never fan out into duplicate paid jobs.
    const busyRecovered=await recoverSyncGeneration(key,outputFileName);
    if(busyRecovered?.id&&['PENDING','PROCESSING','COMPLETED'].includes(String(busyRecovered.status||'').toUpperCase())){
      const requestId=String(busyRecovered.id),statusUrl=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}`;
      return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,recovered:true,providerStatus:busyRecovered.status||'PROCESSING'};
    }
    return {status:'busy',provider:'sync-labs',model,providerStatus:r.status,error:providerMessage(d,'Sync Labs is already processing another generation.'),errorCode:code||'concurrency_limit_reached',retryAfterMs:syncRetryDelayMs(r),providerDetails:details};
  }
  if(syncSubmitIsRetryable(r.status,code))return {status:'retryable',provider:'sync-labs',model,providerStatus:r.status,error:providerMessage(d,`Sync Labs submission failed (${r.status})`),errorCode:code,retryAfterMs:syncRetryDelayMs(r),providerDetails:details};
  throw new ProviderError(providerMessage(d,`Sync Labs submission failed (${r.status})`),{status:r.status,code,details});
}
async function submitFal(video,audioDataUrl){
  const key=String(process.env.FAL_KEY||'').trim(),model=String(process.env.LIPSYNC_MODEL||'fal-ai/sync-lipsync/v3').trim()||'fal-ai/sync-lipsync/v3',mode=String(process.env.LIPSYNC_SYNC_MODE||'remap').trim();
  if(!['cut_off','loop','bounce','silence','remap'].includes(mode))throw new Error('Invalid LIPSYNC_SYNC_MODE configuration.');
  const r=await fetch(`https://queue.fal.run/${model}`,{method:'POST',headers:{Authorization:`Key ${key}`,'content-type':'application/json'},body:JSON.stringify({video_url:video.href,audio_url:audioDataUrl,sync_mode:mode})});
  const d=await readProviderJson(r);if(!r.ok)throw new ProviderError(providerMessage(d,`FAL lip-sync submission failed (${r.status})`),{status:r.status,code:d.errorCode||d.code||'',details:d});
  const requestId=d.request_id||d.requestId,statusUrl=d.status_url||d.statusUrl,responseUrl=d.response_url||d.responseUrl;if(!requestId||!statusUrl||!responseUrl)throw new Error('FAL lip-sync provider did not return a complete queue job.');
  return {status:'queued',requestId,statusUrl,responseUrl,provider:'fal-sync',model,syncMode:mode};
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const enabled=String(process.env.ENABLE_LIVE_LIPSYNC||'false').toLowerCase()==='true',provider=chosenProvider();
  if(!enabled||!provider)return res.status(200).json({status:'not_configured',reason:'lip-sync-not-configured'});
  const video=allowedUrl(req.body?.videoUrl),audio=parseDataAudio(req.body?.audioDataUrl);if(!video||!audio)return res.status(400).json({error:'A public video URL and approved audio track are required.'});
  try{
    const result=provider==='sync-labs'?await submitSyncLabs(video,audio,req.body?.submissionKey):await submitFal(video,String(req.body?.audioDataUrl||''));return res.status(200).json(result);
  }catch(e){
    console.error('[CineTale lipsync-job]',e);const providerStatus=Number(e?.providerStatus)||0,passthrough=[400,401,402,403,409,422,429].includes(providerStatus)?providerStatus:502;
    return res.status(passthrough).json({error:e?.message||'Lip-sync submission failed.',errorCode:e?.code||'',provider,providerStatus:providerStatus||undefined,providerDetails:e?.details||undefined});
  }
}
