export default function handler(req,res){
  const configuredCode=String(process.env.OWNER_CODE||'').trim();
  const code=String(req.headers['x-owner-code']||req.body?.code||'');
  if(!configuredCode)return res.status(503).json({error:'Owner access is not configured. Set OWNER_CODE in the deployment environment and redeploy.'});
  if(code!==configuredCode)return res.status(401).json({error:'Unauthorized'});
  const hasGemini=Boolean(process.env.GEMINI_API_KEY),hasOpenAI=Boolean(process.env.OPENAI_API_KEY),hasEleven=Boolean(process.env.ELEVENLABS_API_KEY),liveVeo=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true'&&hasGemini,genericVideo=Boolean(process.env.VIDEO_PROVIDER_URL&&process.env.VIDEO_PROVIDER_KEY);
  return res.status(200).json({environment:process.env.VERCEL_ENV||'local',configured:{story:hasOpenAI||hasGemini,image:hasGemini||hasOpenAI,voice:hasEleven,video:liveVeo||genericVideo},providers:{image:{primary:hasGemini?'gemini':hasOpenAI?'openai':null,backup:hasGemini&&hasOpenAI?'openai':null,gemini:hasGemini,openai:hasOpenAI,referenceFallback:hasOpenAI},story:{gemini:hasGemini,openai:hasOpenAI},voice:{elevenlabs:hasEleven,defaultVoiceConfigured:Boolean(process.env.ELEVENLABS_DEFAULT_VOICE_ID),narratorVoiceConfigured:Boolean(process.env.ELEVENLABS_NARRATOR_VOICE_ID)},video:{veo:liveVeo,generic:genericVideo}},routing:{imageFallbackEnabled:hasGemini&&hasOpenAI,videoFallbackEnabled:liveVeo}});
}
