import fs from 'node:fs';
const s=fs.readFileSync('app.js','utf8');
const must=[
  "const syncTargets=selectedFinalScenes(integrityEpisode).filter(x=>x.scene?.videoUrl&&sceneHasSpokenContent(x.scene)&&!sceneHasValidatedLipSync(integrityProject,x.scene))",
  "await ensureSceneLipSync(lp,ls,index,{quiet:true,allowSubmit:true})",
  "notProductionReady=selectedFinalScenes(productionEpisode).filter(x=>!sceneProductionReady(productionProject,x.scene))",
  "const notReady=selected.filter(scene=>!sceneProductionReady(p,scene))",
  "renderWorkflow(liveProject);renderFinalAssembly(liveProject,liveEpisode);applyFinalVideoUi(liveProject,liveEpisode,asset)"
];
for(const x of must){if(!s.includes(x))throw new Error('Missing v1.9.69 final-render invariant: '+x)}
if(s.includes("applyFinalVideoUi(p,ep,asset);renderAll();renderWorkflow(p)"))throw new Error('Final video completion still destroys/remounts its player via renderAll().');
const createStart=s.indexOf('async function createFinalVideoAutomatically');
const renderStart=s.indexOf('async function renderFinalVideoFile');
if(createStart<0||renderStart<0)throw new Error('Final production functions missing');
const create=s.slice(createStart,renderStart);
if(create.indexOf('const syncTargets=')>create.indexOf('const manifest=finalAssemblyManifest'))throw new Error('Dialogue synchronization gate runs after final assembly manifest.');
console.log('v1.9.69 final-render sync gate + stable player regression passed.');
