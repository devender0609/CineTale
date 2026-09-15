export default function handler(req,res){
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const liveVideo=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true' && hasGemini;
  return res.status(200).json({ok:true,services:{
    story:hasOpenAI || hasGemini,
    image:hasGemini || hasOpenAI,
    voice:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_DEFAULT_VOICE_ID),
    video:liveVideo||Boolean(process.env.VIDEO_PROVIDER_URL&&process.env.VIDEO_PROVIDER_KEY)
  },videoGuard:{enabled:liveVideo}});
}
