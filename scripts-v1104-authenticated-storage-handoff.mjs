import assert from 'node:assert/strict';
import handler from './api/lipsync-job.js';

process.env.ENABLE_LIVE_LIPSYNC='true';
process.env.LIPSYNC_PROVIDER='sync-labs';
process.env.SYNC_API_KEY='sync-test-key';
process.env.SUPABASE_URL='https://project.supabase.co';
process.env.SUPABASE_ANON_KEY='anon-test-key';
process.env.SYNC_LIPSYNC_MODEL='sync-3';

const videoBytes=new Uint8Array(2_820_000).fill(7);
const audioBytes=Buffer.from('RIFF0000WAVEfmt data','utf8');
const audioDataUrl='data:audio/wav;base64,'+audioBytes.toString('base64');
let storageRead=false,generateCalled=false,signedUrlFetched=false;

globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://project.supabase.co/storage/v1/object/cinetale-final-videos/user123/p/e/scene-media/source.mp4'){
    storageRead=true;
    assert.equal(opts.headers.apikey,'anon-test-key');
    assert.equal(opts.headers.Authorization,'Bearer user-token');
    return new Response(videoBytes,{status:200,headers:{'content-type':'video/mp4','content-length':String(videoBytes.length)}});
  }
  if(u==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  if(u==='https://api.sync.so/v2/generate'){
    generateCalled=true;
    assert.ok(opts.body instanceof FormData);
    assert.ok(opts.body.get('video') instanceof Blob,'verified storage bytes must be forwarded as the video file');
    assert.ok(opts.body.get('audio') instanceof Blob,'approved audio must be forwarded as the audio file');
    assert.equal(opts.body.get('model'),'sync-3');
    return new Response(JSON.stringify({id:'gen_1104',status:'PENDING'}),{status:201,headers:{'content-type':'application/json'}});
  }
  if(u.includes('signed.example')){signedUrlFetched=true;throw new Error('signed URL must not be used when authenticated storage path is available')}
  throw new Error('Unexpected fetch '+u);
};

const req={method:'POST',headers:{authorization:'Bearer user-token'},body:{videoUrl:'https://signed.example/stale.mp4',sourceStoragePath:'user123/p/e/scene-media/source.mp4',audioDataUrl,submissionKey:'abc123'}};
let statusCode=0,payload=null;
const res={status(n){statusCode=n;return this},json(v){payload=v;return this}};
await handler(req,res);
assert.equal(statusCode,200);
assert.equal(payload.status,'queued');
assert.equal(payload.requestId,'gen_1104');
assert.equal(storageRead,true,'server must read the exact authenticated CineTale storage object');
assert.equal(generateCalled,true);
assert.equal(signedUrlFetched,false,'server must not re-fetch the fragile signed URL when a verified storage path exists');
console.log('v1.10.9 authenticated storage -> actual bytes -> Sync Labs regression PASS');
