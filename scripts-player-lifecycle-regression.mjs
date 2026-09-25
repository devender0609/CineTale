import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
const checks=[
  ['studio source is pinned for the mounted scene lifecycle', /const studioVideoSourcePins=new Map\(\)/],
  ['studio pin is signature-aware', /pin&&pin\.signature===signature&&pin\.source===source&&normalizedMediaUrl\(pin\.url\)===normalizedMediaUrl\(desired\)/],
  ['only validated sync can become primary video', /function scenePrimaryVideoUrl[\s\S]*sceneHasValidatedLipSync/],
  ['scene markup uses stable studio source', /function sceneVideoMarkup[\s\S]*sceneStudioVideoUrl/],
  ['new lip-sync jobs clear prior validation', /lipSyncStatus='processing'[\s\S]*lipSyncValidated=false/],
  ['provider result remains unvalidated until browser probe succeeds', /lipSyncStatus='ready';t\.lipSyncValidated=false/],
  ['FAL result is browser-probed before validation', /await waitForVideoAsset\(url\);[\s\S]{0,300}updateProjectById/],
  ['saved FAL result is revalidated before reuse', /sceneHasCurrentLipSync\(p,s\)&&s\.lipSyncVideoUrl[\s\S]*await waitForVideoAsset\(s\.lipSyncVideoUrl\)/],
  ['active player session prevents scene DOM replacement', /if\(sceneListPlaybackLocked\(sceneList\)\)\{sceneList\.__cinetaleDeferredRender=true/],
  ['player session lock begins on play', /video\.dataset\.playerSession='1'/],
  ['pause never adopts a new source', /video\.addEventListener\('pause',[^\n]*stopSceneVideoVoicePlayback/],
  ['ended never hot-swaps a new source', /video\.addEventListener\('ended',\(\)=>[\s\S]{0,500}Playback completion must be visually inert/],
  ['background sync does not require a Studio remount', /scheduleStudioLipSyncWarmup[\s\S]*updateSceneMediaStatuses/],
  ['adoption function itself rejects active playback', /if\(!video\.paused&&!video\.ended\)\{video\.dataset\.lipSyncPendingAdoption='1';return false\}/],
  ['failed synchronized playback restores source', /Synchronized video failed to load; original scene restored/],
  ['ended does not remount Studio', !/video\.addEventListener\('ended',[\s\S]{0,900}renderStudio\(\)/.test(app)]
];
let failed=0;
for(const [name,rule] of checks){const ok=typeof rule==='boolean'?rule:rule.test(app);console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}
if(/video\.addEventListener\('play',[\s\S]{0,1400}adoptSceneLipSyncVideo/.test(app)){console.log('FAIL play handler may hot-swap source');failed++}
if(/video\.addEventListener\('pause',[^\n]*adoptSceneLipSyncVideo/.test(app)){console.log('FAIL pause handler may hot-swap source');failed++}
if(failed)process.exit(1);
console.log('PASS stable scene-player lifecycle regression');
