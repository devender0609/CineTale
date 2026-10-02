import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
// One authoritative speaking asset.
assert.match(app,/function sceneStudioCandidateUrls[\s\S]*sceneHasValidatedLipSync[\s\S]*return candidates/s,'validated sync candidate path missing');
assert.match(app,/owned source was preserved and was not substituted as a silent finished scene/,'sync failure must never silently fall back to source');
const mv=app.slice(app.indexOf('function sceneVideoMarkup'),app.indexOf('function fitSceneVideoToSurface'));
const unsynced=mv.slice(mv.indexOf('if(speaking&&!isMountedSynced)'),mv.lastIndexOf('return `<video controls'));
assert.match(unsynced,/<video controls playsinline[^>]*muted[^>]*scene-source-preview[^>]*data-sync-gated=\"1\"/,'unfinished speaking source must stay visible without status overlay');
assert.doesNotMatch(unsynced,/Visual ready|Finish dialogue/,'unfinished media surface must contain no status copy');
assert.match(mv,/<video controls playsinline preload="metadata" class="scene-video-element"/,'finished media must use native controls');
assert.match(app,/mountedAuthoritativeSync[\s\S]*video\.defaultMuted=false;video\.muted=false[\s\S]*video\.volume=1/s,'finished AV must explicitly enable embedded audio from live authoritative state');
// Durable ownership and refresh restoration.
assert.match(app,/async function persistSceneMediaUrl[\s\S]*saveSceneMediaBlob/s);
assert.match(app,/normalizeVideoBlobForPlayback/,'MP4-family MIME normalization missing');
assert.match(app,/async function recoverSavedLipSyncAsset[\s\S]*persistSceneMediaUrl\([^\n]*'sync'/s,'saved synchronized output must be made durable before adoption');
assert.match(app,/resetSceneLipSyncOnly/,'sync-only reset missing');
assert.match(app,/clearSceneLipSyncForIntegrityRepair[\s\S]*resetSceneLipSyncOnly/s,'sync integrity repair must preserve durable source');
// Final preview/render must consume owned media, not expiring provider URLs.
const preview=app.slice(app.indexOf('async function previewFinalSequence'),app.indexOf('async function prepareFinalSceneAsset'));
assert.match(preview,/sceneValidatedSyncPlaybackUrl\(scene,liveProject\)\|\|await hydrateSceneMedia/);
assert.doesNotMatch(preview,/scene\.lipSyncVideoUrl/,'final preview must not directly use provider sync URLs');
const prepare=app.slice(app.indexOf('async function prepareFinalSceneAsset'),app.indexOf('function clearSceneLipSyncForIntegrityRepair'));
assert.match(prepare,/await hydrateSceneMedia\([^\n]*'source'/);
assert.match(prepare,/await hydrateSceneMedia\([^\n]*'sync'/);
assert.match(prepare,/await hydrateCoverageMedia/);
const dup=app.slice(app.indexOf('async function duplicateFinalMediaConflicts'),app.indexOf('async function repairDuplicateFinalMedia'));
assert.match(dup,/sceneMediaRuntimeUrl\(s,'source'\)\|\|await hydrateSceneMedia/);
assert.match(dup,/sceneValidatedSyncPlaybackUrl\(s,project\)\|\|await hydrateSceneMedia/);
// Audio contract: no browser-timed production dialogue overlay in final renderer.
const finalPlay=app.slice(app.indexOf('async function playPreparedFinalScene'),app.indexOf('async function renderFinalVideo'));
assert.ok(finalPlay.includes("item.entry?.synchronized?1:0"),'final renderer must use synchronized dialogue and controlled visual silence');
assert.doesNotMatch(finalPlay,/sceneCachedVoiceUrls/,'final render must not layer cached TTS over synchronized AV');
// Navigation and project lifecycle essentials remain wired.
for(const view of ['create','projects','studio','library','settings','characters','episodes'])assert.ok(html.includes(`id="${view}"`)||html.includes(`data-view="${view}"`),`missing ${view} surface`);
assert.match(app,/promptAccountSelection|prompt:'select_account'/,'Google account chooser missing');
assert.match(app,/deleteProfileWorkspace/,'workspace deletion missing');
assert.match(app,/data-project-open|openProject/,'clickable project opening missing');
assert.match(app,/deleteEpisode|data-episode-delete/,'episode deletion missing');
// Normal UI stays provider-agnostic while diagnostics remain owner scoped.
assert.match(html,/id="verifyBackupVisualBtn"[^>]*owner-only|owner-only[^>]*id="verifyBackupVisualBtn"/);
assert.match(html,/id="verifyVoiceBtn"[^>]*owner-only|owner-only[^>]*id="verifyVoiceBtn"/);
assert.ok(app.includes('capability-level health only')&&app.includes('if(!isOwnerMode())')); 
assert.match(css,/\.scene-awaiting-sync\{/);
console.log('v1.10.9 production-contract regression PASS');
