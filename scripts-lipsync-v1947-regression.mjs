import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const status=fs.readFileSync(new URL('./api/lipsync-status.js',import.meta.url),'utf8');
const checks=[
  [src.includes("const APP_VERSION = '1.9.79'"),'app version advanced'],
  [src.includes("normalizedMediaUrl(pin.url)===normalizedMediaUrl(desired)"),'studio source pin follows the newly validated desired asset instead of pinning Veo forever'],
  [src.includes("sceneHasValidatedLipSync(liveProject,liveScene)&&liveScene.lipSyncValidated===true")||src.includes("sceneHasCurrentLipSync(liveProject,liveScene)&&liveScene.lipSyncValidated===true"),'playback only treats a validated synchronized URL as authoritative'],
  [src.includes('function resumableSceneLipSyncJob'),'saved queue jobs can resume'],
  [src.includes("t.lipSyncStatusUrl=d.statusUrl||''")&&src.includes("t.lipSyncResponseUrl=d.responseUrl||''")&&src.includes("t.lipSyncModel=d.model||''"),'queue metadata persists for refresh-safe resume'],
  [src.includes('let job=resumableSceneLipSyncJob(liveScene,signature);'),'existing paid job is resumed before new submission'],
  [src.includes("return 'Video ready';")&&!src.includes('Source video · lip-sync unavailable'),'user video overlay has no provider/debug lip-sync wording'],
  [status.includes('async function syncLabsStatus'),'Sync Labs status endpoint is present'],
  [status.includes("raw==='COMPLETED'"),'completed Sync Labs generations are recognized'],
  [status.includes('d.outputUrl||d.output_url'),'Sync Labs output URL is retrieved'],
  [status.includes('async function falStatus'),'FAL fallback status path remains available']
];
for(const [ok,label] of checks)console.log(`${ok?'PASS':'FAIL'} ${label}`);
assert.equal(checks.every(([ok])=>ok),true);
console.log('v1.9.51 carries forward lip-sync adoption/resume regression PASS');
