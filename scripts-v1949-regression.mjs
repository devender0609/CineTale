import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.ok(app.includes("const APP_VERSION = '1.9.79'"));
assert.ok(app.includes('LIP_SYNC_JOB_STALE_MS=15*60*1000'),'stale job guard missing');
assert.ok(app.includes('lipSyncRetryCount'),'bounded stale-job retry missing');
// v1.9.66 intentionally replaced the old source-audio browser gate with sync-gated playback.
assert.ok(app.includes('data-sync-gated="1"'),'sync-gated playback markup missing');
assert.ok(app.includes('sceneHasValidatedLipSync'),'validated synchronized-asset gate missing');
assert.ok(!app.includes('ctl.gating=true'),'obsolete source-audio timing gate returned');
assert.ok(html.includes('/app.js?v=1.9.79')&&html.includes('/styles.css?v=1.9.79'));
console.log('carry-forward stale-job protection + current sync-gated playback regression PASS');
