const MAX_SYNC_DIRECT_FILE_BYTES=19*1024*1024;
const MAX_SYNC_OWNED_SOURCE_BYTES=512*1024*1024;
const SYNC_SOURCE_FETCH_TIMEOUT_MS=45000;
const SYNC_ASSET_UPLOAD_TIMEOUT_MS=90000;
const SYNC_SUBMIT_TIMEOUT_MS=18000;

const CINETALE_SOURCE_BUCKET=String(process.env.CINETALE_MEDIA_BUCKET||'cinetale-final-videos').trim()||'cinetale-final-videos';
function cleanStoragePath(value=''){return String(value||'').replace(/^\/+|\/+$/g,'').trim()}
async function fetchOwnedSourceFromSupabase(storagePath,authorization=''){
  const path=cleanStoragePath(storagePath),base=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,''),anon=String(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'').trim(),auth=String(authorization||'').trim();
  if(!path||!base||!anon||!/^Bearer\s+.+/i.test(auth))return null;
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  let r;
  try{r=await fetchWithTimeout(`${base}/storage/v1/object/${encodeURIComponent(CINETALE_SOURCE_BUCKET)}/${encoded}`,{headers:{apikey:anon,Authorization:auth},redirect:'follow'},SYNC_SOURCE_FETCH_TIMEOUT_MS)}catch(e){throw new ProviderError('CineTale could not retrieve the verified account-saved source video.',{status:422,code:'owned_storage_fetch_failed',details:{stage:'supabase-storage',message:e?.message||String(e)}})}
  if(!r.ok)throw new ProviderError(`CineTale could not read the verified account-saved source video (${r.status}).`,{status:422,code:'owned_storage_fetch_failed',details:{stage:'supabase-storage',status:r.status}});
  const declared=Number(r.headers.get('content-length')||0);if(declared>MAX_SYNC_OWNED_SOURCE_BYTES)throw new ProviderError('The owned source video is too large for the configured CineTale synchronization transport.',{status:422,code:'owned_source_too_large'});
  const buf=Buffer.from(await r.arrayBuffer());if(!buf.length)throw new ProviderError('The verified account-saved source video was empty.',{status:422,code:'owned_source_empty'});if(buf.length>MAX_SYNC_OWNED_SOURCE_BYTES)throw new ProviderError('The owned source video is too large for the configured CineTale synchronization transport.',{status:422,code:'owned_source_too_large'});
  const {mime,ext}=videoMimeExt(r.headers.get('content-type')||'',path);return {buf,mime,ext,sourceUrl:`supabase:${path}`};
}

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
    const r=await fetchWithTimeout(target,{headers,redirect:'follow'},SYNC_SOURCE_FETCH_TIMEOUT_MS);if(!r.ok)throw new ProviderError(`CineTale could not read the owned source video (${r.status}).`,{status:422,code:'owned_source_fetch_failed'});
    const declared=Number(r.headers.get('content-length')||0);if(declared>MAX_SYNC_OWNED_SOURCE_BYTES)throw new ProviderError('The owned source video is too large for the configured CineTale synchronization transport.',{status:422,code:'owned_source_too_large'});
    const buf=Buffer.from(await r.arrayBuffer());if(!buf.length)throw new ProviderError('The owned source video was empty.',{status:422,code:'owned_source_empty'});if(buf.length>MAX_SYNC_OWNED_SOURCE_BYTES)throw new ProviderError('The owned source video is too large for the configured CineTale synchronization transport.',{status:422,code:'owned_source_too_large'});
    const {mime,ext}=videoMimeExt(r.headers.get('content-type')||'',target.href);return {buf,mime,ext,sourceUrl:target.href};
  }catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError('CineTale could not retrieve its owned source video for dialogue synchronization.',{status:422,code:'owned_source_unreachable',details:{message:e?.message||String(e)}})}
}

async function uploadSyncAsset(key,file,{type='VIDEO',name='cinetale-source.mp4'}={}){
  if(!file?.buf?.length)throw new ProviderError('CineTale could not prepare the owned source video for provider upload.',{status:422,code:'owned_source_empty'});
  const contentType=file.mime||'video/mp4',size=file.buf.length;
  const presign=await fetchWithTimeout('https://api.sync.so/v2/assets/upload',{method:'POST',headers:{'x-api-key':key,'content-type':'application/json','accept':'application/json'},body:JSON.stringify({fileName:name,contentType,size})},15000);
  const pd=await readProviderJson(presign);if(!presign.ok||!pd?.uploadUrl||!pd?.url){const blocked=String(pd?.errorCode||'')==='provider_access_blocked';throw new ProviderError(blocked?'Dialogue synchronization service temporarily rejected the server request.':providerMessage(pd,`Sync Labs asset upload preparation failed (${presign.status})`),{status:blocked?503:(presign.status||502),code:blocked?'provider_access_blocked':'sync_asset_presign_failed',details:blocked?{stage:'sync-asset-presign',providerStatus:presign.status}:pd})}
  const put=await fetchWithTimeout(pd.uploadUrl,{method:'PUT',headers:{'content-type':contentType},body:file.buf},SYNC_ASSET_UPLOAD_TIMEOUT_MS);
  if(!put.ok)throw new ProviderError(`Sync Labs source upload failed (${put.status}).`,{status:put.status||502,code:'sync_asset_upload_failed'});
  const register=await fetchWithTimeout('https://api.sync.so/v2/assets',{method:'POST',headers:{'x-api-key':key,'content-type':'application/json','accept':'application/json'},body:JSON.stringify({url:pd.url,type,name})},15000);
  const rd=await readProviderJson(register);if(!register.ok||!rd?.id){const blocked=String(rd?.errorCode||'')==='provider_access_blocked';throw new ProviderError(blocked?'Dialogue synchronization service temporarily rejected the server request.':providerMessage(rd,`Sync Labs source registration failed (${register.status})`),{status:blocked?503:(register.status||502),code:blocked?'provider_access_blocked':'sync_asset_register_failed',details:blocked?{stage:'sync-asset-register',providerStatus:register.status}:rd})}
  return {assetId:String(rd.id),size,contentType};
}
function providerBlockPage(text=''){const s=String(text||'');return /<title>Attention Required!\s*\|\s*Cloudflare<\/title>|Sorry, you have been blocked|cf-error-details/i.test(s)}
function safeProviderPayload(text=''){const s=String(text||'').trim();if(!s)return {};if(providerBlockPage(s))return {message:'Dialogue synchronization service temporarily rejected the server request.',errorCode:'provider_access_blocked'};try{return JSON.parse(s)}catch{return {message:s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,500)}}}
async function readProviderJson(r){const text=await r.text().catch(()=> '');return safeProviderPayload(text)}
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
async function submitSyncLabs(video,audio,submissionKey='',sourceContext={}){
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
  const ownedVideo=(sourceContext?.storagePath?await fetchOwnedSourceFromSupabase(sourceContext.storagePath,sourceContext.authorization):null)||await fetchSyncSourceVideo(video);
  const directVideo=ownedVideo.buf.length<=MAX_SYNC_DIRECT_FILE_BYTES?ownedVideo:null;
  const uploadedVideo=!directVideo?await uploadSyncAsset(key,ownedVideo,{type:'VIDEO',name:`cinetale-source-${token}.${ownedVideo.ext||'mp4'}`}):null;
  const form=new FormData();
  form.append('model',model);
  form.append('audio',new Blob([audio.buf],{type:audio.mime}),`cinetale-approved-dialogue.${audio.ext}`);
  if(directVideo)form.append('video',new Blob([directVideo.buf],{type:directVideo.mime}),`cinetale-source.${directVideo.ext}`);
  else form.append('input',JSON.stringify([{type:'video',assetId:uploadedVideo.assetId}]));
  form.append('options',JSON.stringify({sync_mode:'silence',active_speaker_detection:{auto_detect:true}}));
  form.append('outputFileName',outputFileName);
  let r,d;
  try{
    r=await fetchWithTimeout('https://api.sync.so/v2/generate',{method:'POST',headers:{'x-api-key':key,'accept':'application/json','Idempotency-Key':`cinetale-${token}`.slice(0,128)},body:form},SYNC_SUBMIT_TIMEOUT_MS);
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
    return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,transport:directVideo?'direct-files':'sync-asset'};
  }
  if(Number(r.status)===403&&String(d?.errorCode||'')==='provider_access_blocked')throw new ProviderError('Dialogue synchronization service temporarily rejected the server request.',{status:503,code:'provider_access_blocked',details:{stage:'sync-submit',providerStatus:403}});
  // Some Sync Labs deployments can reject an otherwise valid multipart upload with 422 even
  // when both media files are readable. A 422 is a validation rejection, so no generation was
  // accepted and it is safe to retry the SAME media through the documented assetId JSON path.
  // This also removes multipart parsing as a failure point without ever falling back to provider-fetch URLs.
  if(Number(r.status)===422){
    const retryVideo=uploadedVideo||await uploadSyncAsset(key,ownedVideo,{type:'VIDEO',name:`cinetale-source-${token}.${ownedVideo.ext||'mp4'}`});
    const retryAudio=await uploadSyncAsset(key,{buf:audio.buf,mime:audio.mime,ext:audio.ext},{type:'AUDIO',name:`cinetale-approved-dialogue-${token}.${audio.ext||'wav'}`});
    const retryPayload={model,input:[{type:'video',assetId:retryVideo.assetId},{type:'audio',assetId:retryAudio.assetId}],options:{sync_mode:'silence',active_speaker_detection:{auto_detect:true}},outputFileName};
    const retry=await fetchWithTimeout('https://api.sync.so/v2/generate',{method:'POST',headers:{'x-api-key':key,'accept':'application/json','content-type':'application/json','Idempotency-Key':`cinetale-${token}-asset`.slice(0,128)},body:JSON.stringify(retryPayload)},SYNC_SUBMIT_TIMEOUT_MS);
    const retryData=await readProviderJson(retry);
    if(Number(retry.status)===403&&String(retryData?.errorCode||'')==='provider_access_blocked')throw new ProviderError('Dialogue synchronization service temporarily rejected the server request.',{status:503,code:'provider_access_blocked',details:{stage:'sync-asset-retry',providerStatus:403}});
    if(retry.ok){
      const requestId=String(retryData.id||'').trim();if(!requestId)throw new ProviderError('Sync Labs accepted the asset-based retry but did not return a generation ID.',{status:502,details:retryData});
      const statusUrl=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}`;
      return {status:'queued',requestId,statusUrl,responseUrl:statusUrl,provider:'sync-labs',model,transport:'asset-json-retry'};
    }
    const retryCode=String(retryData.errorCode||retryData.code||'').trim(),providerRequestId=syncProviderRequestId(retryData,retry);
    throw new ProviderError(providerMessage(retryData,`Sync Labs asset-based lip-sync submission failed (${retry.status})`),{status:retry.status,code:retryCode,details:{...retryData,providerRequestId:providerRequestId||undefined,initialMultipart422:d}});
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
  const submissionKey=req.body?.submissionKey,sourceContext={storagePath:req.body?.sourceStoragePath||'',authorization:req.headers?.authorization||''};
  try{
    const result=provider==='sync-labs'?await submitSyncLabs(video,audio,submissionKey,sourceContext):await submitFal(video,String(req.body?.audioDataUrl||''));return res.status(200).json(result);
  }catch(e){
    console.error('[CineTale lipsync-job]',e);
    // A Cloudflare/WAF rejection happens before a generation is accepted, so it is safe to use the
    // configured secondary provider without duplicating paid work. Never regenerate the source video.
    if(provider==='sync-labs'&&String(e?.code||'')==='provider_access_blocked'&&String(process.env.FAL_KEY||'').trim()){
      try{const fallback=await submitFal(video,String(req.body?.audioDataUrl||''));return res.status(200).json({...fallback,fallbackFrom:'sync-labs'});}
      catch(fallbackError){console.error('[CineTale lipsync-job fallback]',fallbackError);}
    }
    const providerStatus=Number(e?.providerStatus)||0,blocked=String(e?.code||'')==='provider_access_blocked';
    const passthrough=blocked?503:([400,401,402,403,409,422,429].includes(providerStatus)?providerStatus:502);
    const userError=blocked?'Dialogue synchronization is temporarily unavailable. Your generated video and approved voice are safe; retry synchronization later.':(e?.message||'Dialogue synchronization could not start.');
    return res.status(passthrough).json({error:userError,errorCode:e?.code||'',provider,providerStatus:providerStatus||undefined,providerDetails:e?.details||undefined});
  }
}
