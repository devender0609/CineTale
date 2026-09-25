import assert from 'node:assert/strict';
import handler from './api/lipsync-job.js';

const oldFetch=globalThis.fetch;
const oldEnv={...process.env};
process.env.ENABLE_LIVE_LIPSYNC='true';
process.env.LIPSYNC_PROVIDER='sync-labs';
process.env.SYNC_API_KEY='test-sync-key';
process.env.SYNC_LIPSYNC_MODEL='sync-3';
process.env.GEMINI_API_KEY='test-gemini-key';

function resHarness(){
  return {statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
}
const tinyMp4=Buffer.concat([Buffer.alloc(4),Buffer.from('ftypisom'),Buffer.alloc(128)]);
const audio='data:audio/mpeg;base64,'+Buffer.from('approved-audio').toString('base64');
const proxied='https://cine-tale.vercel.app/api/video-file?uri='+encodeURIComponent('https://generativelanguage.googleapis.com/v1beta/files/demo:download?alt=media');

let calls=[];
globalThis.fetch=async (url,opts={})=>{
  calls.push({url:String(url),opts});
  if(String(url)==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  if(String(url).includes('generativelanguage.googleapis.com')){
    assert.equal(opts.headers['x-goog-api-key'],'test-gemini-key');
    return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4','content-length':String(tinyMp4.length)}});
  }
  if(String(url)==='https://api.sync.so/v2/generate'){
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers['x-api-key'],'test-sync-key');
    assert.ok(opts.body instanceof FormData);
    assert.equal(opts.body.get('model'),'sync-3');
    assert.ok(opts.body.get('video') instanceof Blob,'source video should be uploaded directly');
    assert.ok(opts.body.get('audio') instanceof Blob,'approved audio should be uploaded directly');
    assert.equal(opts.body.get('input'),null,'direct video upload should avoid nested public proxy URL');
    const options=JSON.parse(opts.body.get('options'));
    assert.equal(options.sync_mode,'silence');
    assert.equal(options.active_speaker_detection.auto_detect,true);
    return new Response(JSON.stringify({id:'gen_123456',status:'PENDING'}),{status:201,headers:{'content-type':'application/json'}});
  }
  throw new Error('Unexpected fetch '+url);
};
let res=resHarness();
await handler({method:'POST',body:{videoUrl:proxied,audioDataUrl:audio}},res);
assert.equal(res.statusCode,200);
assert.equal(res.body.requestId,'gen_123456');
assert.equal(res.body.provider,'sync-labs');
assert.equal(res.body.transport,'direct-files');
assert.equal(calls.filter(x=>x.url.includes('api.sync.so')).length,2);

// Provider validation errors must preserve the real HTTP status and machine-readable code.
calls=[];
globalThis.fetch=async (url,opts={})=>{
  if(String(url)==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  if(String(url).includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});
  if(String(url)==='https://api.sync.so/v2/generate')return new Response(JSON.stringify({error:'Free account Sync-3 allowance exhausted',errorCode:'generation_quota_exceeded'}),{status:429,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected fetch '+url);
};
res=resHarness();
await handler({method:'POST',body:{videoUrl:proxied,audioDataUrl:audio}},res);
assert.equal(res.statusCode,429);
assert.equal(res.body.errorCode,'generation_quota_exceeded');
assert.equal(res.body.providerStatus,429);
assert.match(res.body.error,/allowance exhausted/i);

// Static app guard: same-signature terminal submissions must not auto-resubmit indefinitely.
const app=await (await import('node:fs/promises')).readFile(new URL('./app.js',import.meta.url),'utf8');
assert.match(app,/lipSyncSubmissionFailedAt/);
assert.match(app,/v1\.9\.67-scene-semantic-signature/);
assert.match(app,/s\.lipSyncPlaybackFailedAt\|\|s\.lipSyncSubmissionFailedAt/);

Object.assign(process.env,oldEnv);
globalThis.fetch=oldFetch;
console.log('v1.9.53 Sync Labs direct-upload/submission regression: PASS');
