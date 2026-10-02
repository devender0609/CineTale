import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
const preview=app.slice(app.indexOf('async function previewFinalSequence()'), app.indexOf('async function prepareFinalSceneAsset'));
assert.match(preview,/selectedFinalScenes\(ep\)/,'preview must be based on selected final scenes');
assert.match(preview,/sceneHasValidatedLipSync\(p,scene\)/,'preview must include canonical synchronized assets for speaking scenes');
assert.match(preview,/const liveProject=state\.projects\.find/,'preview must re-resolve live scene state before playback');
console.log('v1.9.66 preview sequence carry-forward regression: PASS');
