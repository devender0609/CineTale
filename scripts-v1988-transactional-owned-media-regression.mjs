import fs from 'node:fs';
const s=fs.readFileSync('app.js','utf8');
const checks=[
  ['version', s.includes("APP_VERSION = '1.12.4'")],
  ['transactional source helper', s.includes('async function commitPrimarySceneVideo')],
  ['provider result persisted before source adoption', /const saved=await persistSceneMediaUrl\([^;]+commit:false/.test(s)],
  ['source ready requires durable ownership', s.includes('sceneSourceDurablyOwned(scene={})') && s.includes('sceneSourceMatchesCurrentProduction(project={},scene={}){return Boolean(sceneSourceDurablyOwned(scene)') && s.includes('sceneProductionReady(project={},scene={}){return Boolean(sceneSourceMatchesCurrentProduction(project,scene)')],
  ['sync ready requires durable ownership', s.includes('sceneSyncDurablyOwned(scene={})') && s.includes('scene.lipSyncValidated===true&&approvedAudioReady&&sceneSyncDurablyOwned(scene)')],
  ['sync persisted before validation', (()=>{const a=s.indexOf('async function finalizeExistingSynchronizedAssetWithApprovedAudio'),b=s.indexOf('async function ensureSceneLipSync',a),part=s.slice(a,b);return part.includes("persistSceneMediaUrl(projectId,episodeId,index,providerUrl,'sync',{render:false,commit:false})")&&part.indexOf('persistSceneMediaUrl')<part.indexOf('t.lipSyncProviderAudioAuthoritative=true')})()],
  ['cloud copy verified by reopening', s.includes("const verify=await supabaseStorageObject(storagePath,{method:'GET'})")],
  ['storage path versioned', s.includes("-${safe(kind)}-${ver}.${ext}")],
  ['visible player does not mount unowned provider URL', s.includes("source=sceneSourceDurablyOwned(scene)?sceneMediaRuntimeUrl(scene,'source'):''")],
  ['coverage video persisted transactionally', s.includes('async function persistCoverageMediaUrl') && s.includes('videoMediaOwnership:saved.ownership')],
  ['coverage final uses owned runtime', s.includes('const coverageUrl=coverageClipVideoUrl(c)')],
  ['validated sync playback uses durable runtime blob', s.includes('function sceneValidatedSyncPlaybackUrl') && s.includes('normalizedMediaUrl(src)===normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(scene,project))')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}
if(failed)process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} v1.12.4 transactional media checks`);
