export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).end('Method not allowed');
  const raw=String(req.query?.uri||'');
  const key=process.env.GEMINI_API_KEY;
  if(!raw||!key) return res.status(400).end('Missing video asset');
  let u;
  try{u=new URL(raw);}catch{return res.status(400).end('Invalid video URI');}
  if(!u.hostname.endsWith('googleapis.com')) return res.status(400).end('Invalid video host');
  try{
    const r=await fetch(raw,{headers:{'x-goog-api-key':key},redirect:'follow'});
    if(!r.ok) return res.status(502).end('Video download failed');
    const buf=Buffer.from(await r.arrayBuffer());
    res.setHeader('content-type',r.headers.get('content-type')||'video/mp4');
    res.setHeader('cache-control','private, max-age=3600');
    return res.status(200).send(buf);
  }catch{return res.status(502).end('Video download unavailable');}
}
