import assert from 'node:assert/strict';
import fs from 'node:fs';
import videoStatusHandler from './api/video-status.js';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const app=fs.readFileSync('app.js','utf8');
const status=fs.readFileSync('api/video-status.js','utf8');
const html=fs.readFileSync('index.html','utf8');

assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
assert.ok(status.includes("errorCode:'VIDEO_ASSET_MISSING'"));
assert.ok(status.includes("terminal:true"));
assert.ok(status.includes("retryable:false"));
assert.ok(status.includes('raiMediaFilteredReasons'));
assert.ok(status.includes('generatedVideos'));
assert.ok(status.includes('generatedSamples'));
assert.ok(app.includes('function videoStatusTerminalError'));
assert.ok(app.includes('if(d?.done===true||d?.terminal===true'));
assert.ok(app.includes('function videoUserFailureMessage'));
assert.ok(app.includes("return 'Video could not be prepared. Your project is safe. Try this shot again when ready.'"));
assert.ok((app.match(/videoStatusTerminalError\(d\)/g)||[]).length>=4);
assert.ok(app.includes('target.videoOperation=null;target.videoQueuedAt=null;target.videoError=message'));
assert.ok(app.includes('clearPendingPrimaryVideoState(target)'));
assert.ok(app.includes('item.operation=null;item.queuedAt=null;item.error=message'));
assert.ok(app.includes("return 'Taking longer than usual…'"));
assert.ok(app.includes("return 'Creating video…'"));
assert.ok(app.includes("return 'Preparing video…'"));
assert.ok(app.includes("if(scene.videoError&&!scene.videoUrl)return 'Try video again'"));
assert.ok(app.includes("s.videoError?'Video needs retry'"));

function makeRes(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(value){this.body=value;return this}}}
const originalFetch=globalThis.fetch,originalKey=process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY='test-key';
try{
  // Official REST Veo response shape.
  globalThis.fetch=async()=>new Response(JSON.stringify({done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/video-1'}}]}}}),{status:200,headers:{'content-type':'application/json'}});
  let res=makeRes();await videoStatusHandler({method:'GET',query:{operation:'models/veo-3.1-fast-generate-preview/operations/op1'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.status,'ready');assert.equal(res.body.done,true);assert.match(res.body.videoUrl,/\/api\/video-file\?uri=/);

  // SDK-like response shape is also accepted.
  globalThis.fetch=async()=>new Response(JSON.stringify({done:true,response:{generatedVideos:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/video-2'}}]}}),{status:200,headers:{'content-type':'application/json'}});
  res=makeRes();await videoStatusHandler({method:'GET',query:{operation:'operations/op2'}},res);
  assert.equal(res.body.status,'ready');assert.equal(res.body.terminal,true);

  // Exact failure class observed in production: done=true, but no downloadable media.
  globalThis.fetch=async()=>new Response(JSON.stringify({done:true,response:{generateVideoResponse:{generatedSamples:[]}}}),{status:200,headers:{'content-type':'application/json'}});
  res=makeRes();await videoStatusHandler({method:'GET',query:{operation:'operations/op3'}},res);
  assert.deepEqual({status:res.body.status,done:res.body.done,terminal:res.body.terminal,errorCode:res.body.errorCode,retryable:res.body.retryable},{status:'error',done:true,terminal:true,errorCode:'VIDEO_ASSET_MISSING',retryable:false});
  assert.match(res.body.error,/no usable video file/i);

  // Safety/media filtering is surfaced as terminal rather than infinite rendering.
  globalThis.fetch=async()=>new Response(JSON.stringify({done:true,response:{generateVideoResponse:{generatedSamples:[],raiMediaFilteredCount:1,raiMediaFilteredReasons:['generated media filtered']}}}),{status:200,headers:{'content-type':'application/json'}});
  res=makeRes();await videoStatusHandler({method:'GET',query:{operation:'operations/op4'}},res);
  assert.equal(res.body.status,'error');assert.equal(res.body.errorCode,'VIDEO_PROVIDER_POLICY_FILTER');assert.equal(res.body.retryable,false);assert.match(res.body.error,/filtered/i);

  // In-progress jobs remain the only non-terminal state.
  globalThis.fetch=async()=>new Response(JSON.stringify({done:false}),{status:200,headers:{'content-type':'application/json'}});
  res=makeRes();await videoStatusHandler({method:'GET',query:{operation:'operations/op5'}},res);
  assert.deepEqual(res.body,{status:'processing',done:false,terminal:false});
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey}

console.log('v1.11.0 terminal video state + missing-asset recovery regression: PASS');
