import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
for(const token of [
  'function selectedShotVoiceCharacterIndex',
  'function selectedShotVoiceSummary',
  'function selectedShotDialogueDisplay',
  'function sceneCopyUi',
  'function bindSceneContextControls',
  "if(shot?.speaking)return `${shot.speaker||'Character'}: ${String(shot.spokenLine||'').trim()}`",
  "if(shot)return `Shot ${shot.order} has no dialogue.`",
  'data-selected-shot-id',
  "idx=selectedShotVoiceCharacterIndex(p,s)",
  "openSceneAudioEditor(sceneIndex,edit.dataset.selectedShotId||'')",
  "sceneCopyUi(p,scene,index).trim()"
]) assert.ok(app.includes(token),`missing selected-shot context contract token: ${token}`);
assert.ok(app.includes('Selected Shot ${Number(selectedShot.order)'), 'performance editor must surface selected shot context');
console.log('v1.11.0 selected-shot context regression PASS');
