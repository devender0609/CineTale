const typeCache=new Map();
function parseRange(range,total){
  const m=/^bytes=(\d*)-(\d*)$/i.exec(String(range||'').trim());
  if(!m||!Number.isFinite(total)||total<=0)return null;
  let start=m[1]?Number(m[1]):null,end=m[2]?Number(m[2]):null;
  if(start===null&&end!==null){const count=Math.min(total,end);start=Math.max(0,total-count);end=total-1}
  else {if(start===null)start=0;if(end===null||end>=total)end=total-1}
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=total)return null;
  return {start,end};
}
function normalizedVideoType(value=''){
  const t=String(value).split(';')[0].trim().toLowerCase();
  return t.startsWith('video/')?t:'';
}
function sniffVideoType(buf,header=''){
  if(buf?.length>=12){
    if(buf[0]===0x1a&&buf[1]===0x45&&buf[2]===0xdf&&buf[3]===0xa3)return 'video/webm';
    if(buf.slice(4,8).toString('ascii')==='ftyp'){
      const brand=buf.slice(8,12).toString('ascii').toLowerCase();
      return brand.startsWith('qt')?'video/quicktime':'video/mp4';
    }
  }
  return normalizedVideoType(header)||'';
}
async function probeVideoType(raw,key,hint=''){
  const cached=typeCache.get(raw);if(cached)return cached;
  const declared=normalizedVideoType(hint);
  try{
    const r=await fetch(raw,{headers:{'x-goog-api-key':key,Range:'bytes=0-63'},redirect:'follow'});
    if(!r.ok&&r.status!==206)return declared;
    const reader=r.body?.getReader?.();
    let first=Buffer.alloc(0);
    if(reader){const out=await reader.read();if(out?.value)first=Buffer.from(out.value);try{await reader.cancel()}catch{}}
    else first=Buffer.from(await r.arrayBuffer());
    // Trust file magic before the upstream label. Some generated-media range responses
    // can report a generic or stale video type that Firefox treats strictly.
    const magic=sniffVideoType(first,'');
    const type=magic||normalizedVideoType(r.headers.get('content-type')||'')||declared;
    if(type)typeCache.set(raw,type);
    return type;
  }catch{return declared}
}
function setVideoHeaders(res,type){
  const t=type||'application/octet-stream';
  res.setHeader('content-type',t);
  const ext=t==='video/webm'?'webm':t==='video/quicktime'?'mov':'mp4';
  res.setHeader('content-disposition',`inline; filename="cinetale-clip.${ext}"`);
  res.setHeader('accept-ranges','bytes');
  res.setHeader('cache-control','private, max-age=3600, stale-while-revalidate=300');
}
export default async function handler(req,res){
  if(!['GET','HEAD'].includes(req.method)) return res.status(405).end('Method not allowed');
  const raw=String(req.query?.uri||'');
  const key=process.env.GEMINI_API_KEY;
  if(!raw) return res.status(400).end('Missing video asset');
  let u;
  try{u=new URL(raw);}catch{return res.status(400).end('Invalid video URI');}
  const isFal=u.hostname==='fal.media'||u.hostname.endsWith('.fal.media');
  const isSyncLabs=u.hostname==='assets.sync.so';
  const isPublicStorage=u.hostname==='storage.googleapis.com';
  const isGoogleApi=u.hostname==='googleapis.com'||u.hostname.endsWith('.googleapis.com');
  if(!(isFal||isSyncLabs||isPublicStorage||isGoogleApi)) return res.status(400).end('Invalid video host');
  if(isGoogleApi&&!isPublicStorage&&!key)return res.status(400).end('Missing video asset');
  try{
    const requestedRange=String(req.headers?.range||'').trim();
    const headers={};
    if(isGoogleApi&&!isPublicStorage&&key)headers['x-goog-api-key']=key;
    if(requestedRange)headers.Range=requestedRange;
    const r=await fetch(raw,{method:req.method==='HEAD'?'HEAD':'GET',headers,redirect:'follow'});
    if(!r.ok && r.status!==206) return res.status(502).end('Video download failed');
    const upstreamType=r.headers.get('content-type')||'';
    const upstreamRange=r.headers.get('content-range');
    const upstreamLength=r.headers.get('content-length');
    if(req.method==='HEAD'){
      const type=isGoogleApi&&!isPublicStorage?await probeVideoType(raw,key,upstreamType):(normalizedVideoType(upstreamType)||'video/mp4');
      setVideoHeaders(res,type);
      if(upstreamRange)res.setHeader('content-range',upstreamRange);
      if(upstreamLength)res.setHeader('content-length',upstreamLength);
      return res.status(r.status===206?206:200).end();
    }
    const buf=Buffer.from(await r.arrayBuffer());
    const localMagic=sniffVideoType(buf,'');
    const type=localMagic||(isGoogleApi&&!isPublicStorage?await probeVideoType(raw,key,upstreamType):normalizedVideoType(upstreamType))||'video/mp4';
    setVideoHeaders(res,type);
    if(requestedRange && r.status!==206){
      const rr=parseRange(requestedRange,buf.length);
      if(rr){const part=buf.subarray(rr.start,rr.end+1);res.setHeader('content-range',`bytes ${rr.start}-${rr.end}/${buf.length}`);res.setHeader('content-length',String(part.length));return res.status(206).send(part)}
    }
    if(upstreamRange)res.setHeader('content-range',upstreamRange);
    res.setHeader('content-length',upstreamLength||String(buf.length));
    return res.status(r.status===206?206:200).send(buf);
  }catch(e){
    console.error('[CineTale video-file]',e);
    return res.status(502).end('Video download unavailable');
  }
}
