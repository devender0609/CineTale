import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import handler from './api/lipsync-job.js';
const oldFetch=globalThis.fetch,oldEnv={...process.env};
Object.assign(process.env,{ENABLE_LIVE_LIPSYNC:'true',LIPSYNC_PROVIDER:'sync-labs',SYNC_API_KEY:'test-sync-key',SYNC_LIPSYNC_MODEL:'sync-3',GEMINI_API_KEY:'test-gemini-key'});
function resHarness(){return {statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const tinyMp4=Buffer.concat([Buffer.alloc(4),Buffer.from('ftypisom'),Buffer.alloc(128)]),audio='data:audio/mpeg;base64,'+Buffer.from('approved-audio').toString('base64'),proxied='https://cine-tale.vercel.app/api/video-file?uri='+encodeURIComponent('https://generativelanguage.googleapis.com/v1beta/files/demo:download?alt=media');
// A transient provider failure must not be retried repeatedly inside one Vercel invocation.
let posts=0;
globalThis.fetch=async (url,opts={})=>{const u=String(url);if(u==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});if(u==='https://api.sync.so/v2/generate'){posts++;return new Response(JSON.stringify({error:'Controller temporarily unavailable',errorCode:'controller_unavailable',requestId:'req_transient'}),{status:503,headers:{'content-type':'application/json','retry-after':'0'}})}throw new Error('Unexpected fetch '+u)};
let res=resHarness();await handler({method:'POST',body:{videoUrl:proxied,audioDataUrl:audio,submissionKey:'v1954_safe'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.status,'retryable');assert.equal(res.body.errorCode,'controller_unavailable');assert.equal(posts,1);
// Non-transient quota exhaustion remains terminal.
posts=0;globalThis.fetch=async (url,opts={})=>{const u=String(url);if(u==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});if(u.includes('generativelanguage.googleapis.com'))return new Response(tinyMp4,{status:200,headers:{'content-type':'video/mp4'}});if(u==='https://api.sync.so/v2/generate'){posts++;return new Response(JSON.stringify({error:'Sync-3 allowance exhausted',errorCode:'generation_quota_exceeded',requestId:'req_quota'}),{status:429,headers:{'content-type':'application/json'}})}throw new Error('Unexpected fetch '+u)};
res=resHarness();await handler({method:'POST',body:{videoUrl:proxied,audioDataUrl:audio,submissionKey:'v1954_quota'}},res);assert.equal(res.statusCode,429);assert.equal(res.body.errorCode,'generation_quota_exceeded');assert.equal(res.body.providerDetails.providerRequestId,'req_quota');assert.equal(posts,1);
const app=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');assert.match(app,/v1\.9\.67-scene-semantic-signature/);
Object.keys(process.env).forEach(k=>{if(!(k in oldEnv))delete process.env[k]});Object.assign(process.env,oldEnv);globalThis.fetch=oldFetch;console.log('v1.9.54 transient-provider safety regression carried forward: PASS');
