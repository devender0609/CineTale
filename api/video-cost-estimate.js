function qualityDefaults(mode='balanced'){
  if(mode==='fast')return {quality:'draft',model:'gemini-omni-1.1-flash',resolution:'360p'};
  if(mode==='cinematic')return {quality:'premium',model:'gemini-omni-1.1-flash',resolution:'1080p'};
  return {quality:'standard',model:'gemini-omni-1.1-flash',resolution:'720p'};
}
function configuredRoute(mode='balanced'){
  const d=qualityDefaults(mode),q=d.quality;
  const model=String(process.env[`OMNI_VIDEO_MODEL_${q.toUpperCase()}`]||process.env.OMNI_VIDEO_MODEL||d.model).trim();
  const resolution=String(process.env[`OMNI_VIDEO_RESOLUTION_${q.toUpperCase()}`]||process.env.OMNI_VIDEO_RESOLUTION||d.resolution).trim().toLowerCase();
  return {...d,model,resolution};
}
function plannedSeconds(values=[]){
  return values.reduce((sum,value)=>{
    const n=Number(value)||0;
    return sum+(n>0?Math.max(3,Math.min(10,n)):0);
  },0);
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const mode=['fast','balanced','cinematic'].includes(String(req.body?.mode||''))?String(req.body.mode):'balanced';
  const durations=Array.isArray(req.body?.durations)?req.body.durations.slice(0,200):[];
  const liveGoogle=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true'&&Boolean(String(process.env.GEMINI_API_KEY||'').trim());
  const custom=Boolean(String(process.env.VIDEO_PROVIDER_URL||'').trim()&&String(process.env.VIDEO_PROVIDER_KEY||'').trim());
  if(!liveGoogle){
    return res.status(200).json({ok:true,known:false,provider:custom?'Custom video provider':'Video provider not configured',reason:custom?'The deployment is using a custom video endpoint, so CineTale will not invent a public list price.':'Live Google video generation is not enabled on this deployment.'});
  }
  const cfg=configuredRoute(mode),seconds=plannedSeconds(durations);
  if(cfg.model!=='gemini-omni-1.1-flash'){
    return res.status(200).json({ok:true,known:false,provider:'Google Gemini API',model:cfg.model,resolution:cfg.resolution,plannedOutputSeconds:seconds,reason:'The configured model is not CineTale’s verified Gemini Omni 1.1 Flash route, so no public dollar estimate is invented.'});
  }
  // Google currently publishes an effective Standard-tier video price only for 720p output.
  if(cfg.resolution!=='720p'){
    return res.status(200).json({ok:true,known:false,provider:'Google Gemini API',model:cfg.model,resolution:cfg.resolution,plannedOutputSeconds:seconds,reason:`Google publishes the effective per-second Omni 1.1 Flash video price for 720p output; CineTale does not extrapolate that rate to ${cfg.resolution}.`});
  }
  const rate=0.10;
  return res.status(200).json({ok:true,known:true,provider:'Google Gemini API',model:cfg.model,resolution:cfg.resolution,ratePerSecond:rate,billableSeconds:seconds,plannedOutputSeconds:seconds,estimatedUsd:Number((seconds*rate).toFixed(2)),pricingAsOf:'2026-10-08',pricingBasis:'Google Gemini Developer API Standard pricing for Gemini Omni 1.1 Flash video output at the published effective 720p rate (~$0.10/sec). Actual billing is token-based and generated duration can vary.'});
}
