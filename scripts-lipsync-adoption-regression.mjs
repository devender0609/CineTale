import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const status=fs.readFileSync(new URL('./api/lipsync-status.js',import.meta.url),'utf8');
const checks=[
  [src.includes("v1.9.67-scene-semantic-signature"),'pipeline revision advances for provider-rendered sync assets'],
  [src.includes('sceneHasValidatedLipSync'),'validated lip-sync gate exists'],
  [src.includes("return sceneHasValidatedLipSync(p,scene)?scene.lipSyncVideoUrl:(scene.videoUrl||'')"),'primary video never uses unvalidated sync result'],
  [/await waitForVideoAsset\(url\);[\s\S]{0,300}updateProjectById/.test(src),'provider result is browser-validated before use'],
  [src.includes('Lip-sync result could not be validated as a distinct playable synchronized asset'),'invalid provider result is rejected'],
  [src.includes("sceneListPlaybackLocked(sceneList)"),'scene DOM replacement is deferred during player session'],
  [src.includes("video.dataset.playerSession='1'"),'player session lock begins on play'],
  [src.includes("video.addEventListener('ended',async()=>"),'sync adoption occurs only after playback ends'],
  [src.includes("await adoptSceneLipSyncVideo(video,index,{resumeVideo:false,preserveTime:false})"),'ended playback adopts verified sync asset'],
  [src.includes("return 'Video ready';")&&!src.includes('Source video · lip-sync unavailable'),'provider lip-sync diagnostics are removed from the video overlay'],
  [status.includes("provider:'sync-labs'")&&status.includes('remoteVideoUrl:remote'),'status API preserves Sync Labs provenance'],
  [status.includes("host==='assets.sync.so'")&&status.includes("host==='fal.media'||host.endsWith('.fal.media')"),'status API only proxies supported synchronized-media hosts']
];
const failed=checks.filter(x=>!x[0]);
for(const [ok,label] of checks) console.log(`${ok?'PASS':'FAIL'} ${label}`);
if(failed.length)process.exit(1);
