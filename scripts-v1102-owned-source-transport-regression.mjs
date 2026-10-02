import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./api/lipsync-job.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
assert.ok(src.includes('/v2/assets/upload'),'large source must use Sync asset presign');
assert.ok(src.includes('/v2/assets'),'large source must register a Sync asset');
assert.ok(src.includes("assetId:uploadedVideo.assetId"),'generation must use registered assetId');
assert.ok(!src.includes("audio-file-video-url"),'owned Sync source must not fall back to provider URL transport');
assert.ok(src.includes("Idempotency-Key"),'provider submission must use idempotency');
assert.ok(src.includes("owned_source_unreachable")&&src.includes("owned_source_fetch_failed"),'owned source failures must be explicit');
assert.ok(src.includes("direct-files")&&src.includes("sync-asset"),'both safe source transports must be represented');
console.log('v1.10.9 owned-source transport regression PASS');

// Runtime regression: a CineTale-owned source above the direct multipart ceiling must be
// uploaded as a Sync asset and referenced by assetId; it must never fall back to a URL input.
const {default:jobHandler}=await import('./api/lipsync-job.js');
function mockRes(){return {code:200,body:null,status(n){this.code=n;return this},json(v){this.body=v;return this},end(v){this.body=v;return this}}}
const oldFetch=global.fetch,oldEnv={...process.env};
try{
  process.env.ENABLE_LIVE_LIPSYNC='true';process.env.LIPSYNC_PROVIDER='sync-labs';process.env.SYNC_API_KEY='test-sync-key';process.env.SYNC_LIPSYNC_MODEL='sync-3';
  const large=Buffer.alloc(20*1024*1024,1);let uploaded=false,registered=false,generated=false;
  global.fetch=async (url,opts={})=>{
    url=String(url);
    if(url==='https://owned.example/source.mp4')return new Response(large,{status:200,headers:{'content-type':'video/mp4','content-length':String(large.length)}});
    if(url==='https://api.sync.so/v2/assets/upload')return new Response(JSON.stringify({uploadUrl:'https://upload.example/presigned',url:'https://assets.sync.so/uploads/source.mp4',expiresIn:3600}),{status:201,headers:{'content-type':'application/json'}});
    if(url==='https://upload.example/presigned'){uploaded=true;assert.equal(opts.method,'PUT');assert.equal(opts.headers['content-type'],'video/mp4');return new Response('',{status:200});}
    if(url==='https://api.sync.so/v2/assets'){registered=true;const body=JSON.parse(opts.body);assert.equal(body.type,'VIDEO');assert.equal(body.url,'https://assets.sync.so/uploads/source.mp4');return new Response(JSON.stringify({id:'asset_video_123'}),{status:201,headers:{'content-type':'application/json'}});}
    if(url==='https://api.sync.so/v2/generations')return new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});
    if(url==='https://api.sync.so/v2/generate'){
      generated=true;assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('video'),null);const input=JSON.parse(opts.body.get('input'));assert.deepEqual(input,[{type:'video',assetId:'asset_video_123'}]);assert.ok(opts.headers['Idempotency-Key']);return new Response(JSON.stringify({id:'gen_large_123'}),{status:201,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const audio='data:audio/wav;base64,'+Buffer.from('RIFFfakewav').toString('base64');const res=mockRes();
  await jobHandler({method:'POST',body:{videoUrl:'https://owned.example/source.mp4',audioDataUrl:audio,submissionKey:'abc123'}},res);
  assert.equal(res.code,200);assert.equal(res.body.requestId,'gen_large_123');assert.equal(res.body.transport,'sync-asset');assert.ok(uploaded&&registered&&generated);
} finally {global.fetch=oldFetch;process.env=oldEnv}
console.log('v1.10.9 large owned-source asset transport runtime regression PASS');
