function providerMessage(payload,fallback=''){
  const pick=payload?.detail??payload?.error??payload?.message??payload;
  if(typeof pick==='string'&&pick.trim())return pick.trim();
  try{const s=JSON.stringify(pick);if(s&&s!=='{}')return s.slice(0,1600)}catch{}
  return fallback||'Lip-sync provider request failed.';
}
function safeRequestId(value=''){
  const s=String(value||'').trim();return /^[a-z0-9][a-z0-9._:-]{5,240}$/i.test(s)?s:'';
}
function safeModel(value=''){
  const s=String(value||'').trim();return /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*){0,5}$/i.test(s)?s:'';
}
function proxiedVideo(url=''){
  try{
    const u=new URL(String(url||'')),host=u.hostname.toLowerCase();
    const allowed=host==='assets.sync.so'||host.endsWith('.sync.so')||host==='fal.media'||host.endsWith('.fal.media')||host==='storage.googleapis.com'||host.endsWith('.amazonaws.com')||host.endsWith('.cloudfront.net');
    return allowed?`/api/video-file?uri=${encodeURIComponent(u.href)}`:'';
  }catch{return ''}
}
function syncGenerationVideo(requestId=''){
  const id=safeRequestId(requestId);return id?`/api/lipsync-video?provider=sync-labs&id=${encodeURIComponent(id)}`:'';
}
function normalizedCompareUrl(value=''){
  try{return new URL(String(value||''),'https://cinetale.invalid').href}catch{return String(value||'')}
}
async function readJson(response){const text=await response.text().catch(()=> '');if(!text)return {};try{return JSON.parse(text)}catch{return {message:text.slice(0,1600)}}}
function isTransient(code){return code===404||code===408||code===409||code===425||code===429||code>=500}

async function syncLabsStatus(req){
  const key=String(process.env.SYNC_API_KEY||'').trim();
  if(!key)return {status:'error',error:'Sync Labs is not configured on this deployment.',provider:'sync-labs'};
  const requestId=safeRequestId(req.body?.requestId||'');if(!requestId)return {status:'error',error:'Invalid Sync Labs generation ID.',provider:'sync-labs'};
  const model=safeModel(req.body?.model||process.env.SYNC_LIPSYNC_MODEL||'sync-3')||'sync-3';
  const url=`https://api.sync.so/v2/generate/${encodeURIComponent(requestId)}?wait=true&timeout=10`;
  try{
    const r=await fetch(url,{headers:{'x-api-key':key,'cache-control':'no-cache'}}),d=await readJson(r);
    if(!r.ok){const msg=providerMessage(d,`Sync Labs status failed (${r.status})`);return isTransient(r.status)?{status:'processing',transient:true,providerStatus:r.status,providerMessage:msg,provider:'sync-labs',model}:{status:'error',error:msg,providerStatus:r.status,provider:'sync-labs',model}}
    const raw=String(d.status||'').toUpperCase();
    if(raw==='COMPLETED'){
      const remote=String(d.outputUrl||d.output_url||d.output?.url||d.video?.url||'').trim();
      if(!remote)return {status:'error',error:'Sync Labs completed without an output video URL.',provider:'sync-labs',model,errorCode:d.errorCode||''};
      const source=String(req.body?.sourceVideoUrl||'').trim();
      if(source&&normalizedCompareUrl(remote)===normalizedCompareUrl(source))return {status:'error',error:'Sync Labs returned the original source URL instead of a synchronized render.',provider:'sync-labs',model,errorCode:'sync_output_matches_source'};
      const stable=syncGenerationVideo(requestId),fallback=proxiedVideo(remote),videoUrl=stable||fallback;
      if(!videoUrl)return {status:'error',error:'Sync Labs completed but the synchronized output could not be routed for playback.',provider:'sync-labs',model,errorCode:'sync_output_unroutable'};
      return {status:'ready',videoUrl,remoteVideoUrl:remote,generationId:requestId,provider:'sync-labs',model,contentType:'video/mp4',outputDuration:d.outputDuration??null};
    }
    if(['FAILED','REJECTED','CANCELLED','CANCELED','ERROR'].includes(raw))return {status:'error',error:providerMessage(d,'Sync Labs lip synchronization failed.'),errorCode:d.errorCode||'',provider:'sync-labs',model};
    return {status:raw==='PENDING'?'queued':'processing',queueStatus:raw||null,provider:'sync-labs',model};
  }catch(e){return {status:'processing',transient:true,providerMessage:e?.message||'Sync Labs status temporarily unavailable.',provider:'sync-labs',model}}
}

function falQueueUrl(value=''){try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='queue.fal.run'?u:null}catch{return null}}
function canonicalFalUrls(model,requestId){if(!model||!requestId)return null;const base=`https://queue.fal.run/${model}/requests/${encodeURIComponent(requestId)}`;return {statusUrl:new URL(`${base}/status`),responseUrl:new URL(base)}}
async function probeFalResult(responseUrl,headers,model){
  try{const rr=await fetch(responseUrl,{headers}),rd=await readJson(rr);if(rr.ok){const remote=rd?.video?.url||rd?.data?.video?.url||rd?.output?.video?.url||'',videoUrl=proxiedVideo(remote);if(videoUrl)return {status:'ready',videoUrl,remoteVideoUrl:remote,provider:'fal-sync',model,contentType:'video/mp4'};return {status:'processing',providerStatus:rr.status,providerMessage:providerMessage(rd,'FAL result is still being prepared.'),provider:'fal-sync',model}}const msg=providerMessage(rd,`FAL result unavailable (${rr.status})`);return isTransient(rr.status)?{status:'processing',transient:true,providerStatus:rr.status,providerMessage:msg,provider:'fal-sync',model}:{status:'error',error:msg,providerStatus:rr.status,provider:'fal-sync',model}}catch(e){return {status:'processing',transient:true,providerMessage:e?.message||'FAL result temporarily unavailable.',provider:'fal-sync',model}}
}
async function falStatus(req){
  const key=String(process.env.FAL_KEY||'').trim();if(!key)return {status:'error',error:'FAL lip sync is not configured on this deployment.',provider:'fal-sync'};
  const model=safeModel(req.body?.model||process.env.LIPSYNC_MODEL||'fal-ai/sync-lipsync/v3'),requestId=safeRequestId(req.body?.requestId||''),canonical=canonicalFalUrls(model,requestId),statusUrl=falQueueUrl(req.body?.statusUrl)||canonical?.statusUrl||null,responseUrl=falQueueUrl(req.body?.responseUrl)||canonical?.responseUrl||null;
  if(!model||!requestId||!statusUrl||!responseUrl)return {status:'error',error:'Invalid FAL lip-sync queue job.',provider:'fal-sync'};
  const headers={Authorization:`Key ${key}`};
  try{const sr=await fetch(statusUrl,{headers}),sd=await readJson(sr);if(!sr.ok){const msg=providerMessage(sd,`FAL status failed (${sr.status})`);if(isTransient(sr.status)){const p=await probeFalResult(responseUrl,headers,model);return p.status==='ready'||p.status==='error'?p:{status:'processing',transient:true,providerStatus:sr.status,providerMessage:msg,provider:'fal-sync',model}}return {status:'error',error:msg,providerStatus:sr.status,provider:'fal-sync',model}}const raw=String(sd.status||sd.state||'').toUpperCase();if(['COMPLETED','SUCCEEDED','SUCCESS'].includes(raw)){const target=falQueueUrl(sd.response_url||sd.responseUrl)||responseUrl;return await probeFalResult(target,headers,model)}if(['FAILED','ERROR','CANCELLED','CANCELED'].includes(raw))return {status:'error',error:providerMessage(sd,'FAL lip synchronization failed.'),provider:'fal-sync',model};const p=await probeFalResult(responseUrl,headers,model);return p.status==='ready'||p.status==='error'?p:{status:raw==='IN_QUEUE'?'queued':'processing',queueStatus:raw||null,provider:'fal-sync',model}}catch(e){const p=await probeFalResult(responseUrl,headers,model);return p.status==='ready'||p.status==='error'?p:{status:'processing',transient:true,providerMessage:e?.message||'FAL status temporarily unavailable.',provider:'fal-sync',model}}
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const enabled=String(process.env.ENABLE_LIVE_LIPSYNC||'false').toLowerCase()==='true';
  if(!enabled)return res.status(200).json({status:'not_configured'});
  let provider=String(req.body?.provider||'').trim().toLowerCase();
  if(provider==='sync')provider='sync-labs';if(provider==='fal')provider='fal-sync';
  if(!provider)provider=String(process.env.SYNC_API_KEY||'').trim()?'sync-labs':'fal-sync';
  try{return res.status(200).json(provider==='sync-labs'?await syncLabsStatus(req):await falStatus(req))}
  catch(e){console.error('[CineTale lipsync-status]',e);return res.status(200).json({status:'processing',transient:true,providerMessage:e?.message||'Lip-sync status temporarily unavailable.',provider})}
}
