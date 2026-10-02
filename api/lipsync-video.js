const typeCache=new Map();
function safeId(value=''){const s=String(value||'').trim();return /^[a-z0-9][a-z0-9._:-]{5,240}$/i.test(s)?s:''}
function parseRange(range,total){
  const m=/^bytes=(\d*)-(\d*)$/i.exec(String(range||'').trim());if(!m||!Number.isFinite(total)||total<=0)return null;
  let start=m[1]?Number(m[1]):null,end=m[2]?Number(m[2]):null;
  if(start===null&&end!==null){const count=Math.min(total,end);start=Math.max(0,total-count);end=total-1}
  else{if(start===null)start=0;if(end===null||end>=total)end=total-1}
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=total)return null;return {start,end};
}
function allowedSyncOutput(value=''){
  try{const u=new URL(String(value||'')),h=u.hostname.toLowerCase();return u.protocol==='https:'&&(h==='assets.sync.so'||h.endsWith('.sync.so')||h==='storage.googleapis.com'||h.endsWith('.amazonaws.com')||h.endsWith('.cloudfront.net'))?u:null}catch{return null}
}
async function readJson(r){const t=await r.text().catch(()=> '');if(!t)return {};try{return JSON.parse(t)}catch{return {message:t.slice(0,1200)}}}
async function generationOutput(id,key){
  const r=await fetch(`https://api.sync.so/v2/generate/${encodeURIComponent(id)}`,{headers:{'x-api-key':key,'cache-control':'no-cache'}}),d=await readJson(r);
  if(!r.ok)throw new Error(d.error||d.message||`Sync Labs generation lookup failed (${r.status})`);
  if(String(d.status||'').toUpperCase()!=='COMPLETED')throw new Error('Synchronized scene is not ready yet.');
  const u=allowedSyncOutput(d.outputUrl||d.output_url||d.output?.url||d.video?.url||'');if(!u)throw new Error('Sync Labs completed without a supported output video URL.');return u;
}
function sniff(buf,header=''){if(buf?.length>=12&&buf.slice(4,8).toString('ascii')==='ftyp')return 'video/mp4';const t=String(header||'').split(';')[0].trim().toLowerCase();return t.startsWith('video/')?t:'video/mp4'}
function headers(res,type){res.setHeader('content-type',type||'video/mp4');res.setHeader('content-disposition','inline; filename="cinetale-synced-clip.mp4"');res.setHeader('accept-ranges','bytes');res.setHeader('cache-control','private, max-age=300, stale-while-revalidate=60')}
export default async function handler(req,res){
  if(!['GET','HEAD'].includes(req.method))return res.status(405).end('Method not allowed');
  if(String(req.query?.provider||'sync-labs')!=='sync-labs')return res.status(400).end('Unsupported lip-sync provider');
  const id=safeId(req.query?.id||''),key=String(process.env.SYNC_API_KEY||'').trim();if(!id)return res.status(400).end('Invalid generation ID');if(!key)return res.status(503).end('Sync Labs is not configured');
  try{
    const output=await generationOutput(id,key),range=String(req.headers?.range||'').trim(),upHeaders={};if(range)upHeaders.Range=range;
    const r=await fetch(output,{method:req.method==='HEAD'?'HEAD':'GET',headers:upHeaders,redirect:'follow'});if(!r.ok&&r.status!==206)return res.status(502).end('Synchronized video unavailable');
    const declared=r.headers.get('content-type')||'video/mp4',cr=r.headers.get('content-range'),cl=r.headers.get('content-length');
    if(req.method==='HEAD'){headers(res,declared);if(cr)res.setHeader('content-range',cr);if(cl)res.setHeader('content-length',cl);return res.status(r.status===206?206:200).end()}
    const buf=Buffer.from(await r.arrayBuffer()),type=sniff(buf,declared);headers(res,type);
    if(range&&r.status!==206){const rr=parseRange(range,buf.length);if(rr){const part=buf.subarray(rr.start,rr.end+1);res.setHeader('content-range',`bytes ${rr.start}-${rr.end}/${buf.length}`);res.setHeader('content-length',String(part.length));return res.status(206).send(part)}}
    if(cr)res.setHeader('content-range',cr);res.setHeader('content-length',cl||String(buf.length));return res.status(r.status===206?206:200).send(buf);
  }catch(e){console.error('[CineTale lipsync-video]',e);return res.status(409).end(e?.message||'Synchronized video is not ready')}
}
