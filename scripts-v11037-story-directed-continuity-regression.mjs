import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCoveragePlan} from './lib/production.js';

const scene={id:'s1',title:'The Cedar Trunk',durationSec:28,visual:'Afternoon sunlight streams through an attic circular window. Maya sits beside an open cedar chest, lifting out a tarnished pewter frame containing a black-and-white portrait of a teenage girl wearing a braided key pendant.',camera:'Cinematic',dialogue:['Maya Vance: Dad, did Grandma ever mention a greenhouse? Or this key?']};
const plan=buildCoveragePlan(scene,'balanced');
assert.equal(plan.length,5);
assert.equal(plan[0].kind,'establishing');
assert.equal(plan[1].speaking,true);
assert.equal(plan[2].kind,'movement');
assert.equal(plan[3].kind,'reaction');
assert.equal(plan[4].kind,'detail');
assert.match(plan[0].directorAvoid,/Do not perform the central discovery\/reveal/i);
assert.match(plan[2].directorAction,/story action|concrete action/i);
assert.match(plan[3].directorAction,/face, eyes, breath, posture/i);
assert.match(plan[4].directorAction,/true insert\/close detail/i);
assert.ok(plan.every(x=>typeof x.directorObjective==='string'&&x.directorObjective.length>10));

const api=fs.readFileSync(new URL('./api/video-job.js',import.meta.url),'utf8');
for(const phrase of ['SCENE CONTINUITY CONTRACT','PREVIOUS SHOT STATE','NEXT SHOT INTENT','ANTI-REPETITION','ACTION CONTINUITY','STORY-BEAT CONTEXT ONLY','Preserve story-critical props exactly across shots']) assert.ok(api.includes(phrase),`missing ${phrase}`);
assert.ok(api.includes('Continue AFTER that action; do not replay it.'));
assert.ok(api.includes("CURRENT SHOT ACTION ONLY"));

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes("const SHOT_DIRECTOR_PIPELINE_REV = 'v1.10.49-story-to-shot-director'"));
console.log('v1.11.0 story-directed continuity regression: PASS');
