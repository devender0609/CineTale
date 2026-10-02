import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildCoveragePlan,coverageTargetCount,ensureSceneCoverage} from './lib/production.js';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));

const legacy={id:'scene-legacy',durationSec:90,visual:'A mystery unfolds',dialogue:[
  'David: First line.', 'Maya: Second line.', 'David: Third line.', 'Maya: Fourth line.'
]};
const count=coverageTargetCount(legacy,'balanced');
assert.ok(count>=15,'a 90-second balanced scene needs enough real provider-length shot slots; it must not be represented by one short clip');
const plan=ensureSceneCoverage(legacy,'balanced');
assert.equal(plan.length,count);
assert.ok(plan.filter(x=>x.speaking).length===4,'every dialogue turn must remain a distinct speaking shot');
assert.ok(plan.every(x=>x.durationSec<=6.1),'balanced planned shot duration must not exceed the provider clip target by conceptual stretching');
assert.ok(Math.abs(plan.at(-1).endSec-90)<.2,'planned shot timeline should cover the full scene beat');

for(const needle of [
  'function migrateProjectShotTimelines',
  "scene.shotTimelineVersion!=='1.11.0'",
  'function sceneShotTimelineUi',
  'function shotTimelineStatus',
  'Story shot plan',
  'need generation',
  '${sceneShotTimelineUi(p,s)}',
  'migrateProjectShotTimelines(p)'
]) assert.ok(app.includes(needle),`missing existing-project migration safeguard: ${needle}`);
for(const needle of ['.scene-shot-timeline{','.scene-shot-strip{','.scene-shot-card{']) assert.ok(css.includes(needle),`missing visible shot-plan UI: ${needle}`);

console.log('v1.11.0 existing-project shot migration regression passed');
