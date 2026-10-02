import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from './api/lipsync-job.js';

const app=fs.readFileSync('app.js','utf8');
const api=fs.readFileSync('api/lipsync-job.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const html=fs.readFileSync('index.html','utf8');
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
assert.ok(app.includes('function userSafeLipSyncError(error)'));
assert.ok(app.includes("code==='provider_access_blocked'"));
assert.ok(app.includes('function offlineAudioDecoder()'));
assert.ok(!/async function sceneLipSyncAudioDataUrl[\s\S]{0,900}new Ctx\(/.test(app),'background dialogue prep must not create a realtime AudioContext');
assert.ok(!/async function approvedAudioMetrics[\s\S]{0,500}new Ctx\(/.test(app),'background audio validation must not create a realtime AudioContext');
assert.ok(api.includes('providerBlockPage'));
assert.ok(api.includes("fallbackFrom:'sync-labs'"));

const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
function response(status,body,headers={}){return new Response(body,{status,headers})}
function makeRes(){return {statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const cloudflare='<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1></body></html>';
const req={method:'POST',headers:{},body:{videoUrl:'https://media.example/source.mp4',audioDataUrl:'data:audio/wav;base64,AAECAwQ=',submissionKey:'abc123'}};
try{
  process.env.ENABLE_LIVE_LIPSYNC='true';
  process.env.LIPSYNC_PROVIDER='auto';
  process.env.SYNC_API_KEY='sync-test';
  process.env.FAL_KEY='fal-test';
  let calls=[];
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);calls.push([u,opts.method||'GET']);
    if(u==='https://api.sync.so/v2/generations')return response(200,'[]',{'content-type':'application/json'});
    if(u==='https://media.example/source.mp4')return response(200,new Uint8Array([0,1,2,3]),{'content-type':'video/mp4','content-length':'4'});
    if(u==='https://api.sync.so/v2/generate')return response(403,cloudflare,{'content-type':'text/html'});
    if(u.startsWith('https://queue.fal.run/'))return response(200,JSON.stringify({request_id:'fal-1',status_url:'https://fal/status/fal-1',response_url:'https://fal/result/fal-1'}),{'content-type':'application/json'});
    throw new Error(`unexpected fetch ${u}`);
  };
  let res=makeRes();await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.provider,'fal-sync');
  assert.equal(res.body.fallbackFrom,'sync-labs');
  assert.equal(res.body.requestId,'fal-1');
  assert.equal(calls.filter(x=>x[0]==='https://api.sync.so/v2/generate').length,1,'must not duplicate Sync generation submission');

  delete process.env.FAL_KEY;calls=[];
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url);calls.push([u,opts.method||'GET']);
    if(u==='https://api.sync.so/v2/generations')return response(200,'[]',{'content-type':'application/json'});
    if(u==='https://media.example/source.mp4')return response(200,new Uint8Array([0,1,2,3]),{'content-type':'video/mp4','content-length':'4'});
    if(u==='https://api.sync.so/v2/generate')return response(403,cloudflare,{'content-type':'text/html'});
    throw new Error(`unexpected fetch ${u}`);
  };
  res=makeRes();await handler(req,res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.errorCode,'provider_access_blocked');
  assert.match(res.body.error,/temporarily unavailable/i);
  assert.ok(!JSON.stringify(res.body).includes('<!DOCTYPE html>'),'Cloudflare HTML must never reach creator UI');
} finally {
  globalThis.fetch=originalFetch;
  process.env=originalEnv;
}
console.log('v1.11.0 lip-sync block recovery regression PASS');
