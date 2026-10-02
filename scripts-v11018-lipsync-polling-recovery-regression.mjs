import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const a=src.indexOf('async function pollSceneLipSync('),b=src.indexOf('async function finalizeExistingSynchronizedAssetWithApprovedAudio',a);
assert.ok(a>=0&&b>a,'pollSceneLipSync source missing');
const fn=src.slice(a,b);
function makeCtx(apiPost){
  const scene={id:'s1',number:1,videoUrl:'source.mp4',lipSyncSignature:'sig',lipSyncRequestDigest:'digest',lipSyncProductionContract:'contract',lipSyncOperation:'job-1',lipSyncGenerationId:'job-1',lipSyncStatus:'processing',lipSyncProviderStatus:'PROCESSING'};
  const project={id:'p1',episodes:[{id:'e1',scenes:[scene]}]};
  const events=[];
  const ctx={console,Date,String,Number,Boolean,Math,Error,Promise,
    sleep:async()=>{},apiPost,state:{projects:[project]},
    findEpisodeById:(p,id)=>p?.episodes?.find(e=>e.id===id),
    sceneAtIdentity:(e,index,id)=>e?.scenes?.find(s=>s.id===id)||e?.scenes?.[index],
    sceneLipSyncSignature:()=> 'sig',sceneVideoProductionProvenanceValid:()=>true,
    diagnosticUrl:x=>x||'',syncDiag:(stage,p,s,extra)=>events.push({stage,extra}),
    updateProjectById:(id,mut)=>{const p=ctx.state.projects.find(x=>x.id===id);mut(p)},
  };
  vm.createContext(ctx);vm.runInContext(fn+';this.pollSceneLipSync=pollSceneLipSync;',ctx);return {ctx,scene,events};
}
let calls=0;
{
  const {ctx,scene,events}=makeCtx(async()=>{calls++;if(calls<=2)throw new TypeError('NetworkError when attempting to fetch resource.');if(calls===3)return {status:'processing',queueStatus:'PROCESSING',provider:'sync-labs',model:'lipsync-2-pro'};return {status:'ready',queueStatus:'',provider:'sync-labs',model:'lipsync-2-pro',generationId:'job-1',videoUrl:'/api/lipsync-video?id=job-1',remoteVideoUrl:'https://api.sync.so/result'};});
  const url=await ctx.pollSceneLipSync('p1','e1',0,{requestId:'job-1',provider:'sync-labs',model:'lipsync-2-pro'},'sig','digest','contract','s1');
  assert.equal(url,'/api/lipsync-video?id=job-1');
  assert.equal(scene.lipSyncGenerationId,'job-1');
  assert.equal(scene.lipSyncStatus,'ready');
  assert.equal(events.filter(e=>e.stage==='lipsync-status-transient-retry').length,2,'must retry transient network failures');
  assert.ok(events.some(e=>e.stage==='lipsync-ready-received'),'must recover same job to ready');
}
{
  let failed=0;
  const {ctx,scene,events}=makeCtx(async()=>{failed++;throw new TypeError('Failed to fetch');});
  const url=await ctx.pollSceneLipSync('p1','e1',0,{requestId:'job-1',provider:'sync-labs'},'sig','digest','contract','s1');
  assert.equal(url,'');
  assert.equal(failed,8,'poll loop should pause after bounded consecutive transport failures');
  assert.equal(scene.lipSyncOperation,'job-1','must preserve provider request id');
  assert.equal(scene.lipSyncGenerationId,'job-1','must preserve durable generation id');
  assert.equal(scene.lipSyncStatus,'processing','must remain resumable, not error');
  assert.ok(events.some(e=>e.stage==='poll-paused-preserving-job'));
}
assert.match(src,/hasDurableProviderGeneration/,'durable provider generations must bypass stale wall-clock rejection');
console.log('v1.10.20 lip-sync polling recovery regression PASS');
