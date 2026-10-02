import fs from 'fs';
const app=fs.readFileSync('app.js','utf8');
const must=[
  "function claimCompletedPrimaryVideo",
  "function claimCompletedCoverageVideo",
  "videoProviderCompletedAt",
  "videoRecoveryState='saving'",
  "videoRecoveryState='save_failed'",
  "item.state==='recover'",
  "Restore Shot ${shot.order}",
  "Finished video restored without starting another generation job.",
  "CineTale did not start another paid video job.",
  "already finished at the video service, but its saved result could not be restored"
];
for(const x of must) if(!app.includes(x)) throw new Error('Missing v1.11.0 lifecycle guard: '+x);
if(!app.includes("claimCompletedCoverageVideo(projectId,episodeId,sceneIndex,shotId,operation,d.videoUrl)")) throw new Error('Saved coverage poll does not claim terminal READY before persistence');
if(!app.includes("claimCompletedPrimaryVideo(p.id,ep.id||ep.number,i,operation,d.videoUrl")) throw new Error('Saved primary recovery does not claim terminal READY before persistence');
if(!app.includes("needsVideo:!sourceDurable&&!recoveryPending")) throw new Error('Provider-complete unsaved shots can still be counted as missing generation');
console.log('v1.11.0 READY adoption lifecycle regression PASS');
