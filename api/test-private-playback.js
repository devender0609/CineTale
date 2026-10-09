/** Staging-only deterministic private Storage playback probe.
 * Never accepts a caller-selected bucket, object path, or provider operation.
 * It is not the production ownership-aware media endpoint.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
const MAX_TEST_MEDIA_BYTES=5*1024*1024;
function matchesExpectedSha256(buf, expected) {
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual=createHash('sha256').update(buf).digest();
  return timingSafeEqual(actual, Buffer.from(expected,'hex'));
}
async function readBoundedMedia(response) {
  const chunks=[];
  let total=0;
  if (!response.body?.getReader) throw new Error('Storage response not streamable');
  const reader=response.body.getReader();
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_TEST_MEDIA_BYTES)throw new Error('Test media exceeds size limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks,total);
  } catch(error) {
    try {await reader.cancel()} catch {}
    throw error;
  } finally {reader.releaseLock()}
}
export function createTestPrivatePlaybackHandler({env=process.env, fetchImpl=globalThis.fetch}={}) {
  return async function handler(req,res) {
    const reply=(status,message)=>{res.setHeader('cache-control','no-store');return res.status(status).end(message)};
    if(!['GET','HEAD'].includes(req.method))return reply(405,'Method not allowed');
    if(env.CINETALE_ENABLE_PRIVATE_MEDIA_PROBE!=='true'||env.CINETALE_RUNTIME_MODE!=='development'||env.CINETALE_ALLOW_PAID_GENERATION!=='false')return reply(404,'Not found');
    const endpoint=String(env.SUPABASE_URL||'').replace(/\/+$/,'');
    const key=String(env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY||'');
    const service=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
    const allowedId=String(env.CINETALE_PRIVATE_MEDIA_TEST_USER_ID||'');
    const expectedSha=String(env.CINETALE_PRIVATE_MEDIA_TEST_SHA256||'');
    const bearer=String(req.headers?.authorization||'').match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if(!/^https:\/\/[^/?#]+$/.test(endpoint)||!key||!service||!/^[0-9a-f-]{36}$/i.test(allowedId)||!/^[a-f0-9]{64}$/i.test(expectedSha))return reply(503,'Probe unavailable');
    if(!bearer)return reply(401,'Sign in required');
    try {
      const userResponse=await fetchImpl(`${endpoint}/auth/v1/user`,{
        headers:{apikey:key,authorization:`Bearer ${bearer}`},redirect:'error',signal:AbortSignal.timeout(8000)
      });
      if(!userResponse.ok)return reply(userResponse.status===401||userResponse.status===403?401:503,'Authentication unavailable');
      const user=await userResponse.json();
      if(user?.id!==allowedId)return reply(403,'Not authorized');
      // The only object served is the synthetic test fixture, not user-chosen media.
      const media=await fetchImpl(`${endpoint}/storage/v1/object/cinetale-test-media/assembled.mp4`,{
        headers:{apikey:service,authorization:`Bearer ${service}`},redirect:'error',signal:AbortSignal.timeout(15000)
      });
      if(!media.ok)return reply(503,'Test media unavailable');
      const declared=Number(media.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>MAX_TEST_MEDIA_BYTES)return reply(413,'Test media too large');
      const buf=await readBoundedMedia(media);
      if(buf.length<12||buf.length>MAX_TEST_MEDIA_BYTES||buf.toString('ascii',4,8)!=='ftyp'||!matchesExpectedSha256(buf,expectedSha))return reply(422,'Invalid test media');
      const range=String(req.headers?.range||'').trim();
      let start=0,end=buf.length-1;
      if(range){
        const m=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!m||(m[1]===''&&m[2]==='')){res.setHeader('content-range',`bytes */${buf.length}`);return reply(416,'Invalid range')}
        if(m[1]===''){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0){res.setHeader('content-range',`bytes */${buf.length}`);return reply(416,'Invalid range')}start=Math.max(0,buf.length-suffix)}
        else {start=Number(m[1]);if(m[2]!=='')end=Number(m[2])}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=buf.length||end<start){res.setHeader('content-range',`bytes */${buf.length}`);return reply(416,'Invalid range')}
        end=Math.min(end,buf.length-1);
        res.setHeader('content-range',`bytes ${start}-${end}/${buf.length}`);
      }
      res.setHeader('content-type','video/mp4');
      res.setHeader('accept-ranges','bytes');
      res.setHeader('cache-control','private, no-store');
      res.setHeader('x-content-type-options','nosniff');
      res.setHeader('content-length',String(end-start+1));
      return req.method==='HEAD'?res.status(range?206:200).end():res.status(range?206:200).send(buf.subarray(start,end+1));
    }catch{return reply(503,'Test media unavailable')}
  };
}
export default createTestPrivatePlaybackHandler();
