import assert from 'node:assert/strict';
import fs from 'node:fs';
import jobHandler from './api/lipsync-job.js';
import statusHandler from './api/lipsync-status.js';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const env=fs.readFileSync(new URL('./.env.example',import.meta.url),'utf8');
const vf=fs.readFileSync(new URL('./api/video-file.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.9.77'"));
assert.ok(app.includes("v1.9.67-scene-semantic-signature"));
assert.ok(app.includes("['sync-labs','fal-sync'].includes(scene.lipSyncProvider)"));
assert.ok(app.includes("provider:job.provider||''"));
assert.ok(html.includes('/app.js?v=1.9.77')&&html.includes('/styles.css?v=1.9.77'));
assert.ok(env.includes('SYNC_API_KEY=')&&env.includes('SYNC_LIPSYNC_MODEL=sync-3')&&env.includes('LIPSYNC_PROVIDER=auto'));
assert.ok(vf.includes("u.hostname==='assets.sync.so'"));
assert.ok(css.includes('.final-scene-strip{display:grid')&&css.includes('overflow:visible'));

function mockRes(){return {code:200,body:null,status(n){this.code=n;return this},json(v){this.body=v;return this},end(v){this.body=v;return this}}}
const originalFetch=global.fetch;
const oldEnv={...process.env};
try{
  process.env.ENABLE_LIVE_LIPSYNC='true';
  process.env.LIPSYNC_PROVIDER='sync-labs';
  process.env.SYNC_API_KEY='test-sync-key';
  process.env.SYNC_LIPSYNC_MODEL='sync-3';
  let sawForm=false;
  global.fetch=async (url,opts={})=>{
    assert.equal(url,'https://api.sync.so/v2/generate');
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers['x-api-key'],'test-sync-key');
    assert.ok(opts.body instanceof FormData);
    assert.equal(opts.body.get('model'),'sync-3');
    assert.ok(opts.body.get('audio') instanceof Blob);
    const input=JSON.parse(opts.body.get('input'));
    assert.equal(input[0].type,'video');
    assert.equal(input[0].url,'https://cine-tale.vercel.app/api/video-file?uri=x');
    const options=JSON.parse(opts.body.get('options'));
    assert.equal(options.active_speaker_detection.auto_detect,true);
    assert.equal(options.active_speaker_detection.v3,true);
    assert.equal(options.sync_mode,'silence');
    sawForm=true;
    return new Response(JSON.stringify({id:'gen_123456',status:'PENDING',outputUrl:''}),{status:201,headers:{'content-type':'application/json'}});
  };
  const wav='data:audio/wav;base64,'+Buffer.from('RIFFfakewav').toString('base64');
  let res=mockRes();
  await jobHandler({method:'POST',body:{videoUrl:'https://cine-tale.vercel.app/api/video-file?uri=x',audioDataUrl:wav}},res);
  assert.equal(res.code,200);assert.equal(res.body.provider,'sync-labs');assert.equal(res.body.requestId,'gen_123456');assert.ok(sawForm);

  global.fetch=async (url,opts={})=>{
    assert.equal(url,'https://api.sync.so/v2/generate/gen_123456?wait=true&timeout=10');
    assert.equal(opts.headers['x-api-key'],'test-sync-key');
    return new Response(JSON.stringify({id:'gen_123456',status:'COMPLETED',outputUrl:'https://assets.sync.so/org/test/synced.mp4'}),{status:200,headers:{'content-type':'application/json'}});
  };
  res=mockRes();
  await statusHandler({method:'POST',body:{provider:'sync-labs',requestId:'gen_123456',model:'sync-3'}},res);
  assert.equal(res.code,200);assert.equal(res.body.status,'ready');assert.equal(res.body.provider,'sync-labs');
  assert.ok(res.body.videoUrl.includes('/api/lipsync-video?provider=sync-labs&id=gen_123456'));assert.equal(res.body.remoteVideoUrl,'https://assets.sync.so/org/test/synced.mp4');assert.equal(res.body.generationId,'gen_123456');
} finally {
  global.fetch=originalFetch;
  process.env=oldEnv;
}
console.log('v1.9.51 production Sync Labs render-stage regression PASS');
