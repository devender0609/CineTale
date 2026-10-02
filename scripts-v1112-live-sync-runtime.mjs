import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
function take(name,next){
  const a=src.indexOf(`function ${name}`);assert.ok(a>=0,`missing ${name}`);
  const b=next?src.indexOf(`function ${next}`,a+1):-1;assert.ok(b>a,`missing next ${next}`);
  return src.slice(a,b);
}
const ctx={location:{origin:'https://cine-tale.vercel.app'},URL,console};vm.createContext(ctx);
vm.runInContext(take('canonicalMediaUrl','normalizeSceneMediaReferences')+';this.canonicalMediaUrl=canonicalMediaUrl;',ctx);
assert.equal(ctx.canonicalMediaUrl(''),'');
assert.equal(ctx.canonicalMediaUrl('https://cine-tale.vercel.apphttps://cine-tale.vercel.app/abc?token=1'),'https://cine-tale.vercel.app/abc?token=1');
assert.equal(ctx.canonicalMediaUrl('https://assets.sync.so/result.mp4'),'https://assets.sync.so/result.mp4');
assert.equal(ctx.canonicalMediaUrl('/api/video-file?id=x'),'https://cine-tale.vercel.app/api/video-file?id=x');

const cctx={JSON,String,Array};vm.createContext(cctx);
vm.runInContext(take('productionContractIdentityCompatible','sceneLipSyncAudioProvenanceValid')+';this.compat=productionContractIdentityCompatible;',cctx);
const base={pipeline:'old',projectId:'p',episodeId:'e',sceneId:'s',sceneTitle:'T',sceneVisual:'V',shotId:'sh2',shotOrder:2,shotSpeaking:true,shotSpeaker:'David Vance',shotSpeakerCharacterId:'david-vance',shotLine:'Exact line',shotVisual:'speaker close',shotCamera:'medium',storyboardAssetKey:'',cast:[{id:'david-vance',name:'David Vance',age:'43',appearance:'A',wardrobe:'W',sacredIdentity:''}]};
const newer={...base,pipeline:'new'};
assert.equal(cctx.compat(JSON.stringify(base),JSON.stringify(newer)),true,'pipeline label alone may migrate');
assert.equal(cctx.compat(JSON.stringify(base),JSON.stringify({...newer,shotLine:'Different line'})),false,'dialogue drift must fail');
assert.equal(cctx.compat(JSON.stringify(base),JSON.stringify({...newer,shotSpeakerCharacterId:'maya-vance'})),false,'speaker identity drift must fail');

const h='async '+take('handleSceneVideoActionClick','renderLibrary');
let diag=null,scheduled=0,requested=0,prevented=0,stopped=0;
const fakeScene={id:'s1'},fakeProject={id:'p1'};
const hctx={Number,String,Promise,console,current:()=>fakeProject,episodeOf:()=>({id:'e1',scenes:[fakeScene]}),selectedStudioShot:()=>({id:'sh2',order:2}),shotTimelineStatus:()=>({kind:'pending'}),shotIsPrimary:()=>true,sceneVideoAction:()=> 'finalizing',syncDiag:(stage,p,s,extra)=>{diag={stage,p,s,extra}},scheduleSceneLipSyncAfterSourceReady:()=>{scheduled++},requestVideo:async()=>{requested++},requestSelectedCoverageShot:async()=>{requested++}};vm.createContext(hctx);
vm.runInContext(h+';this.handle=handleSceneVideoActionClick;',hctx);
const button={dataset:{sceneVideo:'0'},textContent:'Finalizing dialogue…'};
const result=await hctx.handle(button,{preventDefault(){prevented++},stopPropagation(){stopped++}});
assert.equal(result,undefined);assert.equal(scheduled,1);assert.equal(requested,0);assert.equal(prevented,1);assert.equal(stopped,1);
assert.equal(diag.stage,'scene-video-action-click');assert.equal(diag.extra.userInitiated,true);assert.equal(diag.extra.allowSubmit,false);assert.equal(diag.extra.action,'finalizing');
console.log('v1.10.20 live sync runtime regression: PASS');
