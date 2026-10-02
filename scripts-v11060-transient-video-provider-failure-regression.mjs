import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from './api/video-status.js';

function responseCapture(){
  const out={statusCode:200,headers:{},body:null};
  return {out,res:{setHeader(k,v){out.headers[String(k).toLowerCase()]=v},status(code){out.statusCode=code;return this},json(body){out.body=body;return this},end(body){out.body=body;return this}}};
}
async function run(providerBody){
  const oldFetch=global.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-key';
  global.fetch=async()=>({ok:true,status:200,json:async()=>providerBody});
  const {out,res}=responseCapture();
  try{await handler({method:'GET',query:{operation:'models/veo-3.1-fast-generate-preview/operations/test-op'}},res);return out.body}
  finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey}
}

const liveShape=await run({done:true,error:{code:13,status:'INTERNAL',message:'Video generation failed due to an internal server issue. Please try again in a few minutes.'}});
assert.equal(liveShape.status,'error');
assert.equal(liveShape.done,true);
assert.equal(liveShape.terminal,true);
assert.equal(liveShape.errorCode,'VIDEO_PROVIDER_FAILED');
assert.equal(liveShape.retryable,true,'temporary INTERNAL provider failure must be manually retryable');

const unavailable=await run({done:true,error:{code:14,status:'UNAVAILABLE',message:'Service unavailable'}});
assert.equal(unavailable.retryable,true);

const permanent=await run({done:true,error:{code:3,status:'INVALID_ARGUMENT',message:'Invalid video request'}});
assert.equal(permanent.retryable,false,'permanent provider validation failure must not be marked retryable');

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("code==='VIDEO_PROVIDER_FAILED'&&error?.retryable"));
assert.ok(app.includes('Your project is safe. Try this shot again in a few minutes.'));
assert.ok(app.includes('videoErrorRetryable=Boolean(terminalError.retryable)'));
assert.ok(app.includes('errorRetryable=Boolean(terminalError.retryable)'));

console.log('v1.11.0 transient video provider failure regression: PASS');
