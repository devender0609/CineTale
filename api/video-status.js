function firstString(...values){
  for(const value of values){
    if(typeof value==='string'&&value.trim())return value.trim();
  }
  return '';
}
function asArray(value){return Array.isArray(value)?value:[]}
function generatedFileDownloadUri(name=''){
  const raw=String(name||'').trim();
  if(!raw)return '';
  if(/^https?:\/\//i.test(raw))return raw;
  const m=raw.match(/(?:^|\/)files\/([a-z0-9-]{1,80})$/i);
  return m?`https://generativelanguage.googleapis.com/v1beta/files/${m[1]}:download?alt=media`:'';
}
function candidateVideos(d={}){
  const response=d?.response||{}, result=d?.result||response?.result||{};
  const candidates=[
    ...asArray(response?.generateVideoResponse?.generatedSamples),
    ...asArray(response?.generateVideoResponse?.generatedVideos),
    ...asArray(response?.generatedVideos),
    ...asArray(response?.generateVideosResponse?.generatedVideos),
    ...asArray(result?.generatedVideos),
    ...asArray(d?.generatedVideos),
  ];
  return candidates.map(item=>item?.video||item?.file||item).filter(Boolean);
}
function extractVideoUri(d={}){
  for(const video of candidateVideos(d)){
    const uri=firstString(
      video?.downloadUri,video?.download_uri,
      video?.uri,video?.videoUri,video?.fileUri,video?.url,
      typeof video==='string'?video:''
    );
    if(uri)return uri;
    const fromName=generatedFileDownloadUri(video?.name||video?.fileName||video?.file_name);
    if(fromName)return fromName;
  }
  const direct=firstString(
    d?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.downloadUri,
    d?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
    d?.response?.generatedVideos?.[0]?.video?.downloadUri,
    d?.response?.generatedVideos?.[0]?.video?.uri,
    d?.result?.generatedVideos?.[0]?.video?.downloadUri,
    d?.result?.generatedVideos?.[0]?.video?.uri
  );
  if(direct)return direct;
  return generatedFileDownloadUri(
    d?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.name||
    d?.response?.generatedVideos?.[0]?.video?.name||
    d?.result?.generatedVideos?.[0]?.video?.name
  );
}
function transientProviderFailure(error={}){
  const status=String(error?.status||error?.code||'').trim().toUpperCase();
  const numeric=Number(error?.code);
  const message=String(error?.message||'').toLowerCase();
  if(['INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED','ABORTED'].includes(status))return true;
  if([4,10,13,14].includes(numeric))return true;
  return /internal server|temporar(?:y|ily)|try again|service unavailable|backend error|deadline exceeded|connection reset|upstream/.test(message);
}

function mediaFilterClassification(d={}){
  const response=d?.response||{},gv=response?.generateVideoResponse||{};
  const reasons=[...(Array.isArray(gv?.raiMediaFilteredReasons)?gv.raiMediaFilteredReasons:[]),...(Array.isArray(response?.raiMediaFilteredReasons)?response.raiMediaFilteredReasons:[])].map(x=>String(x||'').trim()).filter(Boolean);
  const text=reasons.join(' ').toLowerCase();
  if(/real people|real person|celebrity|public figure|likeness|famous person|identity/.test(text)){
    return {errorCode:'VIDEO_REAL_PERSON_LIKENESS_FILTER',retryable:true,requiresPromptAdjustment:true,userMessage:'This shot was filtered because the video service detected a possible real-person or celebrity likeness. CineTale will use a safer original-character prompt on the next manual retry.'};
  }
  if(reasons.length||Number(gv?.raiMediaFilteredCount||response?.raiMediaFilteredCount||0)>0){
    return {errorCode:'VIDEO_PROVIDER_POLICY_FILTER',retryable:false,requiresPromptAdjustment:false,userMessage:'The video service filtered this completed shot and did not return a usable clip.'};
  }
  return null;
}
function terminalReason(d={}){
  const response=d?.response||{};
  const gv=response?.generateVideoResponse||{};
  const reasons=[
    ...(Array.isArray(gv?.raiMediaFilteredReasons)?gv.raiMediaFilteredReasons:[]),
    ...(Array.isArray(response?.raiMediaFilteredReasons)?response.raiMediaFilteredReasons:[]),
  ].map(x=>String(x||'').trim()).filter(Boolean);
  if(reasons.length)return `Video generation was completed without a usable clip (${reasons.join('; ')})`;
  if(Number(gv?.raiMediaFilteredCount||response?.raiMediaFilteredCount||0)>0)return 'Video generation was completed without a usable clip because the generated media was filtered.';
  return 'Video generation completed, but no usable video file was returned. No additional retry was started.';
}
export default async function handler(req,res){
  if(typeof res.setHeader==='function'){
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
    res.setHeader('Surrogate-Control','no-store');
  }
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const operation=String(req.query?.operation||'');
  const key=process.env.GEMINI_API_KEY;
  if(!operation||!key) return res.status(400).json({error:'Operation and video credentials are required'});
  if(!/^(operations|models\/[^/]+\/operations|projects\/[^/]+(?:\/locations\/[^/]+)?\/operations)\//.test(operation) || operation.includes('..')) return res.status(400).json({error:'Invalid operation'});
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${operation}`,{headers:{'x-goog-api-key':key}});
    const d=await r.json();
    if(!r.ok) return res.status(502).json({error:d?.error?.message||`Video status error (${r.status})`});
    if(!d.done) return res.status(200).json({status:'processing',done:false,terminal:false});
    if(d.error){
      const retryable=transientProviderFailure(d.error);
      return res.status(200).json({status:'error',done:true,terminal:true,errorCode:'VIDEO_PROVIDER_FAILED',retryable,error:d.error.message||'Video generation failed'});
    }
    const uri=extractVideoUri(d);
    if(!uri){const filtered=mediaFilterClassification(d);if(filtered)return res.status(200).json({status:'error',done:true,terminal:true,...filtered,error:filtered.userMessage});return res.status(200).json({status:'error',done:true,terminal:true,errorCode:'VIDEO_ASSET_MISSING',retryable:false,error:terminalReason(d)});}
    const videoUrl=`/api/video-file?uri=${encodeURIComponent(uri)}`;
    return res.status(200).json({status:'ready',done:true,terminal:true,videoUrl});
  }catch(e){return res.status(502).json({error:e.message||'Video status unavailable'});}
}
