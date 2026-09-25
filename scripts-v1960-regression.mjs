import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8');
const must=(re,msg)=>{if(!re.test(app))throw new Error(msg)};

must(/function sceneProductionReady\(project=\{\},scene=\{\}\)\{return Boolean\(scene\?\.videoUrl&&\(!sceneHasSpokenContent\(scene\)\|\|sceneHasValidatedLipSync\(project,scene\)\)\)\}/,'Speaking scenes are not gated on validated lip sync.');
must(/function resetSceneLipSyncForNewSource\(scene=\{\},videoUrl=''\)/,'Missing new-source lip-sync reset helper.');
must(/function scheduleSceneLipSyncAfterSourceReady\(projectId,episodeId,index/,'Missing automatic post-video lip-sync scheduler.');
must(/ensureSceneLipSync\(project,scene,index,\{quiet:true,allowSubmit:true\}\)/,'Post-video sync does not explicitly submit the fresh source.');
must(/resetSceneLipSyncForNewSource\(target,d\.videoUrl\)/,'Fresh video completion does not invalidate stale synchronized output.');
must(/toast\('Scene video clip is ready\.'\);scheduleSceneLipSyncAfterSourceReady/,'Manual video completion does not launch post-video synchronization.');
must(/Saved video render recovered\.\'\);scheduleSceneLipSyncAfterSourceReady/,'Recovered video render does not launch post-video synchronization.');
must(/selected\.filter\(x=>sceneProductionReady\(p,x\.scene\)\)\.length/,'Final readiness still counts raw source video as production-ready.');
must(/productionReady=sceneProductionReady\(p,scene\),syncing=scene\.videoUrl&&sceneHasSpokenContent\(scene\)&&!productionReady/,'Final assembly does not expose synchronization-in-progress state.');
must(/'◌ SYNCING'/,'Final assembly has no syncing state label.');
must(/scenes\.some\(x=>!sceneProductionReady\(p,x\.scene\)\)/,'Prepare final assembly does not enforce synchronized speaking scenes.');


must(/lipSyncAutoPending=true/,'Fresh speaking source is not persisted as auto-sync pending.');
must(/allowSubmit:liveScene\.lipSyncAutoPending===true/,'Reload warmup cannot resume an explicitly authorized post-video sync submission.');
must(/WAITING_FOR_SLOT[\s\S]*?scheduleSceneLipSyncAfterSourceReady/,'Busy-provider path does not retry the authorized scene after the active slot clears.');

console.log('v1.9.66 post-video sync + readiness regression: PASS');
