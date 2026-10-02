import assert from 'node:assert/strict';
const {default:status}=await import('./api/lipsync-status.js');
const prior={...process.env};
process.env.ENABLE_LIVE_LIPSYNC='true';process.env.FAL_KEY='test-fal-key';process.env.LIPSYNC_MODEL='fal-ai/sync-lipsync/v3';
function resObj(){return {code:0,body:null,status(n){this.code=n;return this},json(v){this.body=v;return v}}}
const reqBase={method:'POST',body:{requestId:'req-123456',model:'fal-ai/sync-lipsync/v3',statusUrl:'https://queue.fal.run/fal-ai/sync-lipsync/v3/requests/req-123456/status',responseUrl:'https://queue.fal.run/fal-ai/sync-lipsync/v3/requests/req-123456'}};
// Reproduce production failure shape: first queue poll is a retryable non-2xx with object detail.
globalThis.fetch=async()=>new Response(JSON.stringify({detail:{type:'queue_not_ready',message:'request is propagating'}}),{status:404,headers:{'content-type':'application/json'}});
let r=resObj();await status(reqBase,r);assert.equal(r.code,200);assert.equal(r.body.status,'processing');assert.equal(r.body.transient,true);assert.notEqual(r.body.providerMessage,'[object Object]');
// If queue status is stale/404 but the result endpoint is already ready, adopt the real FAL output immediately.
let step=0;globalThis.fetch=async()=>{step++;return step===1?new Response(JSON.stringify({detail:{message:'request is propagating'}}),{status:404,headers:{'content-type':'application/json'}}):new Response(JSON.stringify({data:{video:{url:'https://v3b.fal.media/files/b/test/recovered.mp4',content_type:'video/mp4'}}}),{status:200,headers:{'content-type':'application/json'}})};
r=resObj();await status(reqBase,r);assert.equal(r.code,200);assert.equal(r.body.status,'ready');assert.match(r.body.remoteVideoUrl,/recovered\.mp4$/);
// Network failure while polling is also retryable and must not permanently poison the scene.
globalThis.fetch=async()=>{throw new Error('temporary network failure')};
r=resObj();await status(reqBase,r);assert.equal(r.code,200);assert.equal(r.body.status,'processing');assert.equal(r.body.transient,true);
// Terminal auth rejection is surfaced as a stable error but still via a JSON 200 contract so the UI can handle it deliberately.
globalThis.fetch=async()=>new Response(JSON.stringify({detail:{message:'Invalid API key'}}),{status:401,headers:{'content-type':'application/json'}});
r=resObj();await status(reqBase,r);assert.equal(r.code,200);assert.equal(r.body.status,'error');assert.match(r.body.error,/Invalid API key/);assert.notEqual(r.body.error,'[object Object]');
// Completed jobs still resolve to a FAL media asset.
step=0;globalThis.fetch=async()=>{step++;return step===1?new Response(JSON.stringify({status:'COMPLETED',response_url:reqBase.body.responseUrl}),{status:200}):new Response(JSON.stringify({video:{url:'https://v3b.fal.media/files/b/test/output.mp4',content_type:'video/mp4'}}),{status:200})};
r=resObj();await status(reqBase,r);assert.equal(r.code,200);assert.equal(r.body.status,'ready');assert.equal(r.body.provider,'fal-sync');assert.match(r.body.videoUrl,/^\/api\/video-file\?uri=/);
for(const [k,v] of Object.entries(prior))process.env[k]=v;for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];
console.log('lip-sync status resilience regression PASS');
