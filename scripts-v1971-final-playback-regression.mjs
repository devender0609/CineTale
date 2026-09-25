import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8');
const must=[
  "['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=h264,aac','video/mp4']",
  'async function verifyFinalVideoBlob(blob)',
  'const verifiedDuration=await verifyFinalVideoBlob(blob)',
  "durationSec:verifiedDuration",
  "pipelineVersion:10",
  "preview.dataset.finalVideoReady='1'",
  "Saved final video is not playable",
  'const duration=await verifyFinalVideoBlob(saved.blob)'
];
for(const x of must){if(!app.includes(x))throw new Error('Missing v1.9.81 final playback safeguard: '+x)}
const metaPos=app.indexOf("x.finalVideoMeta=meta");
const verifyPos=app.indexOf('const verifiedDuration=await verifyFinalVideoBlob(blob)');
if(!(verifyPos>=0&&metaPos>verifyPos))throw new Error('Final video metadata can be marked ready before playback verification.');
console.log('v1.9.81 final playback verification regression PASS');
