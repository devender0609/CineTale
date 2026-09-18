export default function handler(req,res){
  const code=req.headers['x-owner-code']||req.body?.code;
  if(process.env.OWNER_CODE && code!==process.env.OWNER_CODE) return res.status(401).json({error:'Unauthorized'});
  return res.status(200).json({environment:process.env.VERCEL_ENV||'local',configured:{story:Boolean(process.env.OPENAI_API_KEY||process.env.GEMINI_API_KEY),image:Boolean(process.env.OPENAI_API_KEY),voice:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_DEFAULT_VOICE_ID),video:Boolean(process.env.VIDEO_PROVIDER_URL&&process.env.VIDEO_PROVIDER_KEY)}});
}
