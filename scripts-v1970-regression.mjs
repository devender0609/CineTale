import fs from 'node:fs';
const s=fs.readFileSync('app.js','utf8');
const must=[
  'function finalSceneTargetDuration(project,scene)',
  'useEmbeddedSyncedAudio:spoken&&synced',
  'const sceneDuration=spoken&&synced?primaryDuration:Math.max(primaryDuration,Math.min(Math.max(primaryDuration,requested),visualDuration));',
  'videos[i].muted=!(useEmbeddedSyncedAudio&&i===0);',
  'useEmbeddedSyncedAudio&&i===0&&clipIndex===0?1:0',
  "durationMode:'atomic-synced-scenes-no-silent-padding',pipelineVersion:10",
  'if(live?.finalVideoMeta){const liveEp=findEpisodeById(live,episodeId)||episodeOf(live);renderWorkflow(live);renderFinalAssembly(live,liveEp);const asset=finalVideoAssets.get(finalVideoAssetKey(live,liveEp));if(asset)applyFinalVideoUi(live,liveEp,asset)}else renderStudio()'
];
for(const x of must)if(!s.includes(x))throw new Error('Missing v1.9.76 final-output invariant: '+x);
if(s.includes('clipIndex%videos.length'))throw new Error('Generated video clips can still repeat in final render.');
const segment=s.slice(s.indexOf('async function prepareFinalSceneAsset'),s.indexOf('async function renderFinalVideoFile'));
if(segment.includes('sceneCachedVoiceUrls(')||segment.includes('voiceEls'))throw new Error('Detached approved-audio playback can still drift over synchronized video.');
console.log('v1.9.76 synchronized-audio + no-repeat + stable final player regression passed.');
