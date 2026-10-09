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

function omniVideoContent(d={}){
  const steps=Array.isArray(d?.steps)?d.steps:[];
  for(const step of steps){
    if(step?.type!=='model_output'||!Array.isArray(step?.content))continue;
    for(const item of step.content){if(item?.type==='video')return item;}
  }
  return null;
}

function interactionRetrievalPending(status,message=''){
  const code=Number(status)||0,text=String(message||'');
  return [408,425,429,500,502,503,504].includes(code)||(code===400&&/multiple authentication credentials received/i.test(text));
}
function interactionFailure(d={}){
  const status=String(d?.status||'').toLowerCase();
  const message=String(d?.error?.message||d?.error||d?.incomplete_details?.reason||`Video job ended with status ${status||'unknown'}`);
  const retryable=/temporar|unavailable|rate limit|quota|resource exhausted|internal|deadline|timeout/i.test(message);
  return {status:'error',done:true,terminal:true,errorCode:'VIDEO_PROVIDER_FAILED',retryable,error:message};
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
  if(operation.startsWith('interaction:')){
    const id=operation.slice('interaction:'.length).trim();
    if(!/^v1_[A-Za-z0-9_-]+$/.test(id))return res.status(400).json({error:'Invalid interaction'});
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(id)}`,{headers:{'x-goog-api-key':key,'Api-Revision':'2026-05-20'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        const message=d?.error?.message||`Video status error (${r.status})`;
        const authBlocked=[401,403].includes(Number(r.status));
        const missing=Number(r.status)===404;
        const ambiguousBadRequest=Number(r.status)===400&&!interactionRetrievalPending(r.status,message);
        const retryAfterSeconds=ambiguousBadRequest?300:r.status===429?45:authBlocked?300:missing?120:30;
        const providerErrorCode=String(d?.error?.code||d?.error?.status||'').slice(0,64).replace(/[^A-Za-z0-9_-]/g,'');
        // An existing interaction id is paid-work identity. A provider retrieval failure must
        // never become a browser-visible 5xx or permission to submit a replacement job.
        // Keep the operation durable and let the client recovery circuit back off safely.
        return res.status(200).json({
          status:'recovery_pending',done:false,terminal:false,retryable:!ambiguousBadRequest,manualReviewRequired:ambiguousBadRequest,retryAfterSeconds,
          provider:'google-gemini-omni',providerFailureScope:'interaction-retrieval',providerErrorCode,
          providerHttpStatus:Number(r.status)||0,
          recoveryReason:ambiguousBadRequest?'provider-invalid-request':authBlocked?'provider-auth':missing?'provider-not-found':interactionRetrievalPending(r.status,message)?'provider-temporary':'provider-retrieval',
          error:ambiguousBadRequest?'Google returned an unclassified retrieval error for this saved job. The operation is preserved and automatic checks are paused for review.':authBlocked?'CineTale cannot verify this saved Gemini job right now because provider access needs attention. The existing job id is preserved and no replacement will be submitted.':missing?'CineTale cannot retrieve this saved Gemini job right now. The existing job id is preserved while recovery remains pending.':'CineTale is preserving this existing Gemini job while Google status retrieval recovers.'
        });
      }
      const state=String(d?.status||'').toLowerCase();
      if(['queued','in_progress'].includes(state))return res.status(200).json({status:'processing',done:false,terminal:false,provider:'google-gemini-omni'});
      if(state!=='completed')return res.status(200).json(interactionFailure(d));
      const video=omniVideoContent(d);
      if(!video)return res.status(200).json({status:'error',done:true,terminal:true,errorCode:'VIDEO_ASSET_MISSING',retryable:false,error:'The video job completed but returned no usable video output.'});
      // Keep Omni playback/recovery bound to the durable interaction id.
      // The provider may return a protected/expiring URI that browsers cannot fetch later.
      // /api/video-file re-reads the stored interaction server-side with GEMINI_API_KEY and
      // materializes either inline bytes or the provider URI without exposing credentials.
      const videoUrl=`/api/video-file?interaction=${encodeURIComponent(id)}`;
      return res.status(200).json({status:'ready',done:true,terminal:true,provider:'google-gemini-omni',model:d?.model||'gemini-omni-1.1-flash',videoUrl});
    }catch(e){return res.status(200).json({status:'recovery_pending',done:false,terminal:false,retryable:true,retryAfterSeconds:30,provider:'google-gemini-omni',providerFailureScope:'interaction-retrieval',error:'CineTale is preserving this existing Gemini job while Google status retrieval recovers.'});}
  }
  if(!/^(operations|models\/[^/]+\/operations|projects\/[^/]+(?:\/locations\/[^/]+)?\/operations)\//.test(operation) || operation.includes('..')) return res.status(400).json({error:'Invalid operation'});
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${operation}`,{headers:{'x-goog-api-key':key}});
    const d=await r.json();
    if(!r.ok){
      // A status lookup failure is never evidence that an existing paid job has failed.
      // Keep the provider operation recoverable; never invite automatic resubmission.
      const providerHttpStatus=Number(r.status)||0;
      const retryAfterSeconds=providerHttpStatus===429?45:[401,403].includes(providerHttpStatus)?300:providerHttpStatus===404?120:30;
      return res.status(200).json({status:'recovery_pending',done:false,terminal:false,retryable:true,
        retryAfterSeconds,providerHttpStatus,providerFailureScope:'operation-retrieval',
        recoveryReason:[401,403].includes(providerHttpStatus)?'provider-auth':providerHttpStatus===404?'provider-not-found':'provider-temporary',
        error:'CineTale cannot verify this saved provider operation right now. The paid operation remains preserved; no replacement job was started.'});
    }
    if(!d.done) return res.status(200).json({status:'processing',done:false,terminal:false});
    if(d.error){
      const retryable=transientProviderFailure(d.error);
      return res.status(200).json({status:'error',done:true,terminal:true,errorCode:'VIDEO_PROVIDER_FAILED',retryable,error:d.error.message||'Video generation failed'});
    }
    const uri=extractVideoUri(d);
    if(!uri){const filtered=mediaFilterClassification(d);if(filtered)return res.status(200).json({status:'error',done:true,terminal:true,...filtered,error:filtered.userMessage});return res.status(200).json({status:'error',done:true,terminal:true,errorCode:'VIDEO_ASSET_MISSING',retryable:false,error:terminalReason(d)});}
    const videoUrl=`/api/video-file?uri=${encodeURIComponent(uri)}`;
    return res.status(200).json({status:'ready',done:true,terminal:true,videoUrl});
  }catch(e){return res.status(200).json({status:'recovery_pending',done:false,terminal:false,retryable:true,
    retryAfterSeconds:30,providerFailureScope:'operation-retrieval',recoveryReason:'network',
    error:'Video status is temporarily unavailable. The existing paid operation is preserved.'});}
}
