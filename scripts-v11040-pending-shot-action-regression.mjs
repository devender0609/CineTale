import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
for(const token of [
  'const coverageShotActionsInFlight=new Set()',
  'function coverageShotActionKey',
  "if(coverageShotActionsInFlight.has(key))return;coverageShotActionsInFlight.add(key);",
  'coverageShotActionsInFlight.delete(key)',
  "action.removeAttribute('disabled')",
  "delete action.dataset.finishRunning",
  "$$('[data-scene-video]').forEach(b=>b.onclick=e=>{e?.stopPropagation?.();handleSceneVideoActionClick(b,e)})",
  "if((status.kind==='pending'||status.kind==='sync-error')&&shot.speaking){await ensureCoverageShotLipSync"
]) assert.ok(app.includes(token),`missing pending-shot action contract token: ${token}`);
const handler=app.slice(app.indexOf('async function handleSceneVideoActionClick'),app.indexOf('function renderLibrary'));
assert.ok(!handler.includes("button.dataset.finishRunning==='1'"),'stale DOM finishRunning flag must not block future shot completion clicks');
console.log('v1.11.0 pending speaking-shot action regression PASS');
