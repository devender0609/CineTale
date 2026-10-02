import fs from 'node:fs';
const s=fs.readFileSync('app.js','utf8');
const must=[
  'function finalSceneTargetDuration(project,scene)',
  "audioPolicy:'validated-dialogue+narration+controlled-visual-silence'",
  'const editPlan=sceneEditPlan(liveProject,liveScene)',
  'available=Math.max(.25,media-Math.max(0,Number(edit.trimInSec)||0)-Math.max(0,Number(edit.trimOutSec)||0))',
  'item.entry?.synchronized?1:0',
  'videoGains[i].gain.value=i===clipIndex?(item.entry?.synchronized?1:0):0',
  "durationMode:'auto-edited-planned-shot-story-timeline',pipelineVersion:13",
  'if(live?.finalVideoMeta){const liveEp=findEpisodeById(live,episodeId)||episodeOf(live);renderWorkflow(live);renderFinalAssembly(live,liveEp);const asset=finalVideoAssets.get(finalVideoAssetKey(live,liveEp));if(asset)applyFinalVideoUi(live,liveEp,asset)}else renderStudio()'
];
for(const x of must)if(!s.includes(x))throw new Error('Missing v1.12.4 final-output invariant: '+x);
if(s.includes('clipIndex%videos.length'))throw new Error('Generated video clips can still repeat in final render.');
const segment=s.slice(s.indexOf('async function prepareFinalSceneAsset'),s.indexOf('async function renderFinalVideoFile'));
if(segment.includes('sceneCachedVoiceUrls(')||segment.includes('voiceEls'))throw new Error('Detached approved-audio playback can still drift over synchronized video.');
console.log('v1.12.4 synchronized-audio + no-repeat + stable final player regression passed.');
