import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const must=[
  "const APP_VERSION = '1.12.4'",
  "VIDEO SAVED · SYNC NEEDED",
  "Shot ${shot.order} video is already saved.",
  "if((status.kind==='pending'||status.kind==='sync-error')&&shot.speaking){await ensureCoverageShotLipSync",
  "Never collapse a saved speaking source back to PLANNED",
  "use ${liveStatus?.kind==='sync-error'?'Retry':'Finish'} Shot ${shot.order} dialogue when ready.",
];
for(const token of must){if(!src.includes(token))throw new Error(`v1.11.0 regression missing: ${token}`)}
const fn=src.slice(src.indexOf('async function requestSelectedCoverageShot'),src.indexOf('async function handleSceneVideoActionClick'));
const pendingBranch=fn.indexOf("if((status.kind==='pending'||status.kind==='sync-error')&&shot.speaking)");
const generationBranch=fn.indexOf('await ensureAutoCoverageShot');
if(pendingBranch<0||generationBranch<0||pendingBranch>generationBranch)throw new Error('Pending speaking-shot path must finish lip-sync before any generation branch.');
console.log('PASS v1.11.0 speaking-shot completion regression');
