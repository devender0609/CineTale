async function probeElevenLabs(key){
  if(!key)return {configured:false,status:'not-configured',reachable:false};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const r=await fetch('https://api.elevenlabs.io/v2/voices?page_size=1',{headers:{'xi-api-key':key},signal:controller.signal});
    if(r.ok)return {configured:true,status:'ready',reachable:true};
    return {configured:true,status:'unreachable',reachable:false,httpStatus:r.status};
  }catch(e){
    return {configured:true,status:'unreachable',reachable:false,error:e?.name==='AbortError'?'timeout':'request-failed'};
  }finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  const hasGemini=Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI=Boolean(process.env.OPENAI_API_KEY);
  const elevenKey=String(process.env.ELEVENLABS_API_KEY||'').trim();
  const defaultVoiceId=String(process.env.ELEVENLABS_DEFAULT_VOICE_ID||'').trim();
  const narratorVoiceId=String(process.env.ELEVENLABS_NARRATOR_VOICE_ID||'').trim();
  const liveVideo=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true'&&hasGemini;
  const genericVideo=Boolean(process.env.VIDEO_PROVIDER_URL&&process.env.VIDEO_PROVIDER_KEY);
  const lipSyncEnabled=String(process.env.ENABLE_LIVE_LIPSYNC||'false').toLowerCase()==='true';
  const syncLabsConfigured=Boolean(String(process.env.SYNC_API_KEY||'').trim());
  const falConfigured=Boolean(String(process.env.FAL_KEY||'').trim());
  const requestedLipProvider=String(process.env.LIPSYNC_PROVIDER||'auto').trim().toLowerCase();
  const lipSyncProvider=(requestedLipProvider==='fal'||requestedLipProvider==='fal-sync')?'fal-sync':(requestedLipProvider==='sync'||requestedLipProvider==='sync-labs')?'sync-labs':syncLabsConfigured?'sync-labs':falConfigured?'fal-sync':'none';
  const lipSync=lipSyncEnabled&&((lipSyncProvider==='sync-labs'&&syncLabsConfigured)||(lipSyncProvider==='fal-sync'&&falConfigured));
  const requestedVisualPrimary=String(process.env.VISUAL_PRIMARY_PROVIDER||'').trim().toLowerCase();
  const visualPrimary=hasOpenAI&&(requestedVisualPrimary!=='gemini'||!hasGemini)?'openai':hasGemini?'gemini':hasOpenAI?'openai':'none';
  const voiceProvider=await probeElevenLabs(elevenKey);
  const warnings=[];
  if(elevenKey&&!defaultVoiceId)warnings.push('Default character voice is not pinned; CineTale will auto-select from the connected ElevenLabs catalog when needed.');
  if(elevenKey&&!narratorVoiceId)warnings.push('Dedicated narrator voice is not pinned; CineTale will use the project narrator selection or catalog fallback.');
  if(elevenKey&&!voiceProvider.reachable)warnings.push('ElevenLabs is configured but the live voice catalog check did not succeed.');
  return res.status(200).json({
    ok:true,
    services:{story:hasOpenAI||hasGemini,image:hasGemini||hasOpenAI,voice:Boolean(elevenKey),video:liveVideo||genericVideo,lipSync},
    providers:{
      lipSync:{provider:lipSyncProvider,configured:lipSync,model:lipSyncProvider==='sync-labs'?(process.env.SYNC_LIPSYNC_MODEL||'sync-3'):(process.env.LIPSYNC_MODEL||'fal-ai/sync-lipsync/v3'),fallbackConfigured:syncLabsConfigured&&falConfigured},
      voice:{
        provider:'elevenlabs',
        configured:Boolean(elevenKey),
        status:voiceProvider.status,
        reachable:voiceProvider.reachable,
        defaultVoiceConfigured:Boolean(defaultVoiceId),
        narratorVoiceConfigured:Boolean(narratorVoiceId),
        ...(voiceProvider.httpStatus?{httpStatus:voiceProvider.httpStatus}:{}),
        ...(voiceProvider.error?{error:voiceProvider.error}:{})
      }
    },
    warnings,
    resilience:{imageFallback:hasGemini&&hasOpenAI,imageFallbackStatus:hasGemini&&hasOpenAI?'configured-unverified':'not-configured',openAIVisual:hasOpenAI,geminiVisual:hasGemini,visualPrimary,videoFallback:liveVideo},
    videoGuard:{enabled:liveVideo}
  });
}
