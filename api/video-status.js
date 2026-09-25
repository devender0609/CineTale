export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const operation=String(req.query?.operation||'');
  const key=process.env.GEMINI_API_KEY;
  if(!operation||!key) return res.status(400).json({error:'Operation and video credentials are required'});
  if(!/^(operations|models\/[^/]+\/operations|projects\/[^/]+(?:\/locations\/[^/]+)?\/operations)\//.test(operation) || operation.includes('..')) return res.status(400).json({error:'Invalid operation'});
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${operation}`,{headers:{'x-goog-api-key':key}});
    const d=await r.json();
    if(!r.ok) return res.status(502).json({error:d?.error?.message||`Video status error (${r.status})`});
    if(!d.done) return res.status(200).json({status:'processing',done:false});
    if(d.error) return res.status(200).json({status:'error',done:true,error:d.error.message||'Video generation failed'});
    const uri=d.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || d.response?.generatedVideos?.[0]?.video?.uri;
    if(!uri) return res.status(200).json({status:'error',done:true,error:'Video completed without a downloadable asset'});
    const videoUrl=`/api/video-file?uri=${encodeURIComponent(uri)}`;
    return res.status(200).json({status:'ready',done:true,videoUrl});
  }catch(e){return res.status(502).json({error:e.message||'Video status unavailable'});}
}
