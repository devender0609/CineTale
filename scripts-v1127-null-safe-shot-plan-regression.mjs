import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
assert.ok(app.includes("function coverageSourceDurablyOwned(entry={}){return Boolean(entry&&(entry.videoLocalMediaKey||entry.videoStoragePath)"),'coverage source ownership must tolerate null planned-shot entries');
assert.ok(app.includes("function coverageSyncDurablyOwned(entry={}){return Boolean(entry&&(entry.syncLocalMediaKey||entry.syncStoragePath)"),'coverage sync ownership must tolerate null planned-shot entries');
assert.ok(app.includes("const key=String(entry?.videoLocalMediaKey||entry?.videoStoragePath||'')"),'coverage runtime URL helper must tolerate null entries');
assert.ok(app.includes("const key=String(entry?.syncLocalMediaKey||entry?.syncStoragePath||'')"),'coverage sync runtime URL helper must tolerate null entries');

function coverageSourceDurablyOwned(entry={}){return Boolean(entry&&(entry.videoLocalMediaKey||entry.videoStoragePath)&&entry.videoMediaPersistedAt&&!entry.videoMediaExpired)}
function coverageSyncDurablyOwned(entry={}){return Boolean(entry&&(entry.syncLocalMediaKey||entry.syncStoragePath)&&entry.syncMediaPersistedAt&&entry.syncValidated===true&&entry.syncProviderAudioAuthoritative===true)}
assert.equal(coverageSourceDurablyOwned(null),false);
assert.equal(coverageSyncDurablyOwned(null),false);
assert.equal(coverageSourceDurablyOwned({videoLocalMediaKey:'k',videoMediaPersistedAt:'now'}),true);
console.log('v1.11.0 null-safe migrated shot-plan regression PASS');
