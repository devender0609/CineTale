import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
function extract(name){
  const start=src.indexOf(`async function ${name}(`);assert.ok(start>=0,`${name} missing`);
  const openParen=src.indexOf('(',start);let parenDepth=0,bodyStart=-1;for(let i=openParen;i<src.length;i++){if(src[i]==='(')parenDepth++;else if(src[i]===')'&&--parenDepth===0){bodyStart=src.indexOf('{',i);break}}
  let brace=bodyStart,depth=0,end=-1;
  for(let i=brace;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0){end=i+1;break}}
  assert.ok(end>brace,`${name} parse failed`);return src.slice(start,end);
}
const project={id:'p1'},episode={id:'e1',scenes:[{id:'s1',videoUrl:'https://old.example/temporary.mp4',videoLocalMediaKey:'local-source-key',videoStoragePath:'user/p1/e1/scene-media/s1-source-old.mp4',videoMediaPersistedAt:'2026-09-01T00:00:00Z',videoMediaOwnership:'cloud',videoMediaExpired:false}]};
project.episodes=[episode];
const blob=new Blob([new Uint8Array(4096).fill(1)],{type:'video/mp4'});
let getCount=0,posted=false,updated=false;
const context={
  console,
  state:{projects:[project]},
  findEpisodeById:(p,id)=>p?.episodes?.find(e=>e.id===id),
  finalVideoStorageReady:()=>true,
  loadSceneMediaBlob:async key=>key==='local-source-key'?blob:null,
  sceneMediaRuntimeUrl:()=>'',
  fetch:async()=>{throw new Error('runtime URL fetch should not be needed')},
  normalizeVideoBlobForPlayback:async b=>b,
  playableVideoBlob:async b=>Boolean(b?.size),
  supabaseStorageObject:async(path,{method='GET'}={})=>{
    if(method==='GET'&&getCount++===0){const e=new Error('not found');e.status=404;throw e}
    if(method==='POST'){posted=true;return {text:async()=>''}}
    return {blob:async()=>blob};
  },
  saveSceneMediaBlob:async()=>true,
  setSceneMediaRuntimeUrl:()=> 'blob:repaired',
  signedSceneMediaUrl:async()=> 'https://signed.example/repaired.mp4',
  sceneMediaCloudPath:()=> 'user/p1/e1/scene-media/new.mp4',
  updateProjectById:(id,fn)=>{assert.equal(id,'p1');fn(project);updated=true},
  persistSceneMediaUrl:async()=>{throw new Error('legacy provider rescue should not run when local bytes survive')},
  Date,
};
vm.createContext(context);
vm.runInContext(`${extract('sceneMediaBlobFromLocal')}\n${extract('repairSceneCloudMedia')}\nthis.repairSceneCloudMedia=repairSceneCloudMedia;`,context);
const out=await context.repairSceneCloudMedia('p1','e1',0,'source');
assert.equal(out,'https://signed.example/repaired.mp4');
assert.equal(posted,true,'missing cloud object must be re-uploaded');
assert.equal(updated,true,'scene ownership metadata must be repaired');
assert.equal(episode.scenes[0].videoCloudMissing,false);
assert.equal(episode.scenes[0].videoMediaOwnership,'cloud');
assert.ok(episode.scenes[0].videoDurableVerifiedAt);
console.log('v1.10.9 404 -> IndexedDB -> cloud self-repair runtime regression PASS');
