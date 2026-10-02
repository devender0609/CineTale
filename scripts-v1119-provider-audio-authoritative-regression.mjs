import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const must=[
  "lipSyncProviderAudioAuthoritative===true",
  "stage:String(stage||'')",
  "provider-audio-adoption-start",
  "provider-audio-authoritative",
  "sync-provider-exact-approved-audio",
  "persistSceneMediaUrl(projectId,episodeId,index,url,'sync'",
  "sceneLipSyncAudioProvenanceValid(x,t)"
];
for(const x of must) if(!src.includes(x)) throw new Error(`missing v1.10.20 provider-audio contract: ${x}`);
const completedSection=src.slice(src.indexOf("syncDiag('sync-url-playable'"),src.indexOf("syncDiag('sync-authoritative'"));
if(completedSection.includes('finalizeSynchronizedVideoWithApprovedAudio(')) throw new Error('new provider completion still depends on browser MediaRecorder finalization');
const existing=src.slice(src.indexOf('async function finalizeExistingSynchronizedAssetWithApprovedAudio'),src.indexOf('async function ensureSceneLipSync'));
if(existing.includes('finalizeSynchronizedVideoWithApprovedAudio(')) throw new Error('existing completed provider asset still depends on browser MP4 re-recording');
if(!existing.includes('lipSyncProviderAudioAuthoritative=true')||!existing.includes('lipSyncValidated=true')) throw new Error('existing provider asset is not adopted as authoritative');
console.log('v1.10.20 provider-audio authoritative regression passed');
