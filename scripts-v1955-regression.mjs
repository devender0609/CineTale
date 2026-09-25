import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import handler from './api/lipsync-job.js';

const oldFetch=globalThis.fetch;
const oldEnv={...process.env};
Object.assign(process.env,{ENABLE_LIVE_LIPSYNC:'true',LIPSYNC_PROVIDER:'sync-labs',SYNC_API_KEY:'test-sync-key',SYNC_LIPSYNC_MODEL:'sync-3',GEMINI_API_KEY:'test-gemini-key'});
function resHarness(){return {statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const tinyMp4=Buffer.concat([Buffer.alloc(4),Buffer.from('ftypisom'),Buffer.alloc(128)]);
const audio='data:audio/mpeg;base64,'+Buffer.from('approved-audio').toString('base64');
const proxied='https://cine-tale.vercel.app/api/video-file?uri='+encodeURIComponent('https://generativelanguage.googleapis.com/v1beta/files/demo:download?alt=media');
const body={videoUrl:proxied,audioDataUrl:audio,submissionKey:'scene_sig_123'};

// One server invocation must make at most one Sync create request. A 503 is returned as a
// retryable 200 payload so Vercel never spends ~60 seconds retrying inside one function.
let posts=0,lists=0;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://api.sync.so/v2/generations'){lists++;return new Response('[]',{status:200,headers:{'content-type':'application/json'}})}
  if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});
  if(u==='https://api.sync.so/v2/generate'){
    posts++;assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('outputFileName'),'cinetale_sync_scene_sig_123');
    return new Response(JSON.stringify({error:'Controller unavailable',errorCode:'controller_unavailable',requestId:'sync_req_1'}),{status:503,headers:{'content-type':'application/json','retry-after':'2'}});
  }
  throw new Error('Unexpected fetch '+u);
};
let res=resHarness();await handler({method:'POST',body},res);
assert.equal(res.statusCode,200);assert.equal(res.body.status,'retryable');assert.equal(res.body.providerStatus,503);assert.equal(res.body.errorCode,'controller_unavailable');assert.equal(res.body.retryAfterMs,2000);assert.equal(posts,1);assert.equal(lists,1);

// Next browser retry is a new server invocation. It first recovers any already-created job,
// then submits only if none exists.
posts=0;lists=0;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://api.sync.so/v2/generations'){lists++;return new Response('[]',{status:200,headers:{'content-type':'application/json'}})}
  if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});
  if(u==='https://api.sync.so/v2/generate'){posts++;return new Response(JSON.stringify({id:'gen_ok_55',status:'PENDING'}),{status:201,headers:{'content-type':'application/json'}})}
  throw new Error('Unexpected fetch '+u);
};
res=resHarness();await handler({method:'POST',body},res);
assert.equal(res.statusCode,200);assert.equal(res.body.status,'queued');assert.equal(res.body.requestId,'gen_ok_55');assert.equal(posts,1);assert.equal(lists,1);

// Ambiguous network outcome is recovered by deterministic outputFileName before any duplicate POST.
posts=0;lists=0;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://api.sync.so/v2/generations'){
    lists++;
    if(lists===1)return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify([{id:'gen_recovered_55',status:'PENDING',createdAt:new Date().toISOString(),outputFileName:'cinetale_sync_scene_sig_123.mp4'}]),{status:200,headers:{'content-type':'application/json'}});
  }
  if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});
  if(u==='https://api.sync.so/v2/generate'){posts++;throw new Error('socket closed after upload')}
  throw new Error('Unexpected fetch '+u);
};
res=resHarness();await handler({method:'POST',body},res);
assert.equal(res.statusCode,200);assert.equal(res.body.status,'queued');assert.equal(res.body.requestId,'gen_recovered_55');assert.equal(res.body.recovered,true);assert.equal(posts,1);assert.equal(lists,2);

// Quota exhaustion remains terminal and is never disguised as a transient retry.
posts=0;lists=0;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://api.sync.so/v2/generations'){lists++;return new Response('[]',{status:200,headers:{'content-type':'application/json'}})}
  if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});
  if(u==='https://api.sync.so/v2/generate'){posts++;return new Response(JSON.stringify({error:'Allowance exhausted',errorCode:'generation_quota_exceeded'}),{status:429,headers:{'content-type':'application/json'}})}
  throw new Error('Unexpected fetch '+u);
};
res=resHarness();await handler({method:'POST',body},res);
assert.equal(res.statusCode,429);assert.equal(res.body.errorCode,'generation_quota_exceeded');assert.equal(posts,1);

const app=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');
assert.match(app,/v1\.9\.67-scene-semantic-signature/);
assert.match(app,/submitSceneLipSyncRequest/);
assert.match(app,/submissionKey/);

Object.keys(process.env).forEach(k=>{if(!(k in oldEnv))delete process.env[k]});Object.assign(process.env,oldEnv);globalThis.fetch=oldFetch;
console.log('v1.9.55 split Sync Labs submit/recovery regression: PASS');
