import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.dirname(new URL(import.meta.url).pathname);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicates)],[],'duplicate static DOM ids');
const requiredViews=['create','projects','studio','library'];
for(const view of requiredViews){
  assert.ok(new RegExp(`data-view="${view}"`).test(html),`missing nav entry for ${view}`);
  assert.ok(new RegExp(`id="${view}"`).test(html),`missing view container for ${view}`);
}
for(const token of [
  'renderProjects()','renderCharacters()','renderEpisodes()','renderStudio()','renderLibrary()',
  'sceneShotTimelineUi','previewSceneSequence','selectedShotPlayback','selectedShotListenState',
  'persistSceneMediaUrl','sceneHasValidatedLipSync','finalAssemblyManifest','renderFinalVideoFile',
  'openVoicePicker','openSceneAudioEditor','setSceneFinalIncluded','resumePendingVideoPolls'
]) assert.ok(app.includes(token),`missing core app contract: ${token}`);
for(const forbidden of ['<'.repeat(7),'='.repeat(7),'>'.repeat(7)]) assert.ok(!app.includes(forbidden)&&!html.includes(forbidden),`merge marker ${forbidden}`);
assert.ok(styles.includes('@media'),'responsive CSS media rules missing');
assert.ok(app.includes("video.muted=!shot.speaking")&&app.includes("video.volume=shot.speaking?1:0"),'scene preview audio isolation missing');
assert.ok(app.includes("status.kind==='pending'")&&app.includes('Finish Shot ${shot.order} dialogue'),'speaking-shot resume state missing');
assert.ok(app.includes('source video remains available for retry')||app.includes('source video remains available'),'durable source retry copy missing');
assert.ok(app.includes('provider') && app.includes('owner'),'owner diagnostics/provider separation support missing');
console.log(`v1.11.0 app-wide release audit PASS · ${ids.length} static IDs · ${requiredViews.length} primary views`);
