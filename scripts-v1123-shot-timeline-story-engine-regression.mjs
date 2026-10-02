import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildCoveragePlan,coverageTargetCount} from './lib/production.js';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));

const scene={id:'scene-x',durationSec:90,visual:'Kitchen mystery',camera:'cinematic',narration:'A hidden clue changes the meaning of the house.',dialogue:[
  'David: First line.',
  'Maya: Second line.',
  'David: Third line.',
  'Maya: Fourth line.'
]};
const fast=buildCoveragePlan(structuredClone(scene),'fast');
assert.ok(coverageTargetCount(scene,'fast')>=4,'fast production must preserve every distinct dialogue turn');
assert.equal(fast.filter(x=>x.speaking).length,4,'each dialogue turn needs its own speaking shot');
assert.deepEqual(fast.filter(x=>x.speaking).map(x=>x.spokenLine),['First line.','Second line.','Third line.','Fourth line.']);
assert.ok(fast[0].narrationSupport===true&&!fast[0].speaking,'opening story coverage should support narration when capacity allows');

for(const needle of [
  'function coverageShotSyncIdentity',
  'function coverageShotSyncValid',
  'async function ensureCoverageShotLipSync',
  'async function ensureSceneShotTimelineReady',
  'async function persistCoverageSyncMediaUrl',
  'async function hydrateCoverageSyncMedia',
  'completePlannedShotCoverage:true',
  'allSpeakingShotsSynchronized:true',
  "audioPurpose:shot.speaking?'dialogue':'ambience'",
  "audioPolicy:'validated-dialogue+narration+controlled-visual-silence'",
  "item.entry?.synchronized?1:0",
  "if(narrationGain)narrationGain.gain.value=item.entry?.speaking?0:.9",
  "if(item.entry?.speaking&&narrationSource&&narrationStarted){try{narrationSource.stop()}catch{};narrationSource=null;narrationGain=null}",
  "durationMode:'auto-edited-planned-shot-story-timeline'",
  'pipelineVersion:13'
]) assert.ok(app.includes(needle),`missing shot-timeline production safeguard: ${needle}`);

assert.ok(app.includes('for(const sceneIndex of indices){await ensureSceneShotTimelineReady'), 'automatic final production must finish the full shot timeline before rendering');
assert.ok(app.includes('sceneStoryTimelineReady(p,x.scene)'), 'final readiness must be based on full story timeline, not one primary clip');
assert.ok(!app.includes('clipIndex%videos.length'),'final rendering must never loop clips to fake runtime');
assert.ok(app.includes('CineTale stopped instead of creating an incomplete story.'),'missing-shot final rendering must fail closed');
assert.ok(app.includes('scenes production-ready')&&app.includes('planned shots'),'Final Assembly UI must describe scene/shot production rather than implying one clip equals a full scene');

console.log('v1.11.0 shot timeline story engine regression passed');
