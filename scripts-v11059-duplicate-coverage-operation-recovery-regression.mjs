import fs from 'fs';
import vm from 'vm';
import assert from 'assert/strict';

const app=fs.readFileSync('app.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));

function extractFunction(name){
  const marker=`function ${name}(`;
  const start=app.indexOf(marker);
  if(start<0) throw new Error(`Missing function ${name}`);
  const brace=app.indexOf('{',start);
  let depth=0, quote='', esc=false;
  for(let i=brace;i<app.length;i++){
    const ch=app[i];
    if(quote){
      if(esc){esc=false;continue}
      if(ch==='\\'){esc=true;continue}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--;if(depth===0)return app.slice(start,i+1)}
  }
  throw new Error(`Unclosed function ${name}`);
}

for(const token of [
  'function coverageEntryForOperation',
  "coverageRecoveryKey(projectId,episodeId,sceneIndex,shotId,operation='')",
  'coverageEntryForOperation(scene,shotId,operation)',
  'videoSupersededOperations:superseded',
  'scene.coverageClips=clips.filter(c=>c?.shotId!==shotId);scene.coverageClips.push(merged)'
]) assert.ok(app.includes(token),`Missing duplicate-operation recovery guard: ${token}`);

const scene={coverageClips:[
  {shotId:'scene-2-shot-1',operation:null,errorCode:'VIDEO_ASSET_MISSING',failedAt:'2026-10-01T20:42:31.894Z'},
  {shotId:'scene-2-shot-1',operation:'op-a',queuedAt:100},
  {shotId:'scene-2-shot-1',operation:'op-b',queuedAt:200},
  {shotId:'scene-2-shot-1',operation:'op-ready',queuedAt:300}
]};
const state={projects:[{id:'p1',episodes:[{id:'ep1',scenes:[scene]}]}]};
const ctx={state,console,Set,Array,Date,Math,
  coverageClips:s=>Array.isArray(s?.coverageClips)?s.coverageClips:[],
  coverageClipVideoUrl:x=>x?.videoUrl||'',
  findEpisodeById:(p,id)=>p.episodes.find(e=>e.id===id),
  updateProjectById:(projectId,fn)=>{const p=state.projects.find(x=>x.id===projectId);fn(p)}
};
vm.createContext(ctx);
for(const name of ['coverageEntry','coverageEntryForOperation','claimCompletedCoverageVideo']){
  vm.runInContext(extractFunction(name),ctx);
}

assert.equal(ctx.coverageEntryForOperation(scene,'scene-2-shot-1','op-ready')?.operation,'op-ready','must resolve the exact persisted operation, not the first duplicate row');
assert.equal(ctx.coverageEntryForOperation(scene,'scene-2-shot-1','missing-op'),null,'unknown operation must not fall through to another duplicate');
const claimed=ctx.claimCompletedCoverageVideo('p1','ep1',0,'scene-2-shot-1','op-ready','/api/video-file?uri=ready');
assert.equal(claimed,true,'terminal READY duplicate operation must be claimable');
assert.equal(scene.coverageClips.length,1,'successful READY claim must collapse duplicate rows to one canonical shot record');
assert.equal(scene.coverageClips[0].videoUrl,'/api/video-file?uri=ready');
assert.equal(scene.coverageClips[0].operation,null);
assert.equal(scene.coverageClips[0].videoRecoveryState,'saving');
assert.deepEqual([...scene.coverageClips[0].videoSupersededOperations].sort(),['op-a','op-b'].sort(),'other duplicate paid operations must be recorded as superseded, not left active');

console.log('v1.11.0 duplicate coverage operation recovery regression PASS');
