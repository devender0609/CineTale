import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCoveragePlan} from './lib/production.js';
import {normalizePlan} from './api/generate-plan.js';

const raw={
  title:'Signal at Low Tide',logline:'A harbor apprentice must decode a warning before the tide traps her community.',
  worldBible:{premise:'A storm-threatened harbor town.',visualLanguage:'Naturalistic maritime suspense',rules:[],canon:[],storyArchitecture:{dramaticSpine:'Mara races to decode a damaged beacon warning before the tide closes the harbor.',protagonistGoal:'Decode and act on the warning.',stakes:'Boats and families could be trapped.',centralConflict:'Time, skepticism, and failing equipment.',theme:'Trust earned through action.',midpointTurn:'The signal points to a second danger.',climax:'Mara chooses to trigger the old harbor alarm.',resolution:'The harbor clears before the surge.',openThreads:[]}},
  characters:[{id:'mara',name:'Mara Vale',role:'apprentice',age:'19'}],
  episodes:[{number:1,title:'Low Tide',synopsis:'A warning arrives.',storyText:'Mara hears a damaged beacon signal during a storm. She tries to decode it while the harbor master dismisses the noise as interference. A second pulse reveals that the outer marker has failed. Mara follows the physical clues through the wet radio room, proves the warning is real, and chooses to sound an old manual alarm. The harbor clears just before the surge reaches the breakwater, changing how the town sees her judgment.',scenes:[{id:'s1',number:1,title:'The Broken Signal',durationSec:24,purpose:'Mara realizes the signal is a real warning.',dramaticPurpose:'Turn uncertainty into urgent action.',characterObjective:'Decode the signal before the tide changes.',obstacle:'The receiver is failing and the harbor master doubts her.',newInformation:'The outer marker has failed.',emotionalTurn:'Mara moves from curiosity to alarmed certainty.',entryState:'Mara is alone, unsure whether the signal matters.',exitState:'Mara knows there is an immediate harbor danger.',handoff:'She must convince the harbor master and act.',storyQuestion:'Is the signal real?',continuityLocks:['Mara wears the same yellow oilskin','The cracked green receiver remains the same object'],visualProgression:['Mara tunes the cracked receiver while rain rattles the windows.','A weak pulse repeats and the meter needle jumps in a recognizable pattern.','Mara compares the pulse to a handwritten tide code and realizes the outer marker has failed.','She grabs the code sheet and turns toward the harbor office with new urgency.'],visual:'Rain lashes the radio room while Mara works at a cracked receiver.',dialogue:['Mara Vale: That is not interference.'],audioDirection:'restrained urgency',narrationStyle:'none',music:'low maritime pulse',sfx:'rain, radio static',camera:'controlled handheld',tier:'standard'}]}]
};
const plan=normalizePlan(structuredClone(raw),{idea:'harbor warning',format:'Episode',duration:'2–3 minutes',storySource:'idea'},'ai');
const scene=plan.episodes[0].scenes[0];
assert.equal(scene.storyIntelligenceVersion,'v1.10.49');
for(const key of ['dramaticPurpose','characterObjective','obstacle','newInformation','emotionalTurn','entryState','exitState','handoff','storyQuestion','scoreIntent'])assert.ok(String(scene[key]||'').length>5,`missing ${key}`);
assert.ok(scene.visualProgression.length>=4);
assert.ok(scene.coveragePlan.some(x=>x.storyBeat),'coverage did not inherit story beats');
assert.ok(scene.coveragePlan.every(x=>typeof x.sceneDramaticPurpose==='string'));

const coverage=buildCoveragePlan(scene,'balanced');
const visual=coverage.filter(x=>!x.speaking);
assert.ok(visual.length>=2);
assert.notEqual(visual[0].storyBeat,visual.at(-1).storyBeat,'visual shots should advance different story beats');
assert.match(visual[0].directorAction,/Concrete opening event|Opening story state|Concrete action|Story action/i);
assert.ok(coverage.some(x=>x.speaking&&/exact spoken exchange/i.test(x.directorObjective)));

const generatePlan=fs.readFileSync(new URL('./api/generate-plan.js',import.meta.url),'utf8');
for(const phrase of ['STORY INTELLIGENCE / DRAMATIC DESIGN','STORY-TO-CINEMA RULE','SCENE-TO-SHOT RULE','qualityRepairIfNeeded','visualProgression','characterObjective','emotionalTurn','continuityLocks'])assert.ok(generatePlan.includes(phrase),`generate-plan missing ${phrase}`);
const videoJob=fs.readFileSync(new URL('./api/video-job.js',import.meta.url),'utf8');
for(const phrase of ['SCENE DRAMATIC PURPOSE','CHARACTER OBJECTIVE','EXIT STATE TO REACH','NEW STORY INFORMATION / CHANGE','ASSIGNED STORY BEAT','SCENE CONTINUITY LOCKS','STORY DRAMATIC SPINE'])assert.ok(videoJob.includes(phrase),`video prompt missing ${phrase}`);
const next=fs.readFileSync(new URL('./api/generate-next.js',import.meta.url),'utf8');
assert.ok(next.includes('STORY INTELLIGENCE: Continue the causal dramatic spine'));
assert.ok(next.includes('visualProgression[]'));
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes("SHOT_DIRECTOR_PIPELINE_REV = 'v1.10.49-story-to-shot-director'"));
assert.ok(app.includes("VIDEO_PRODUCTION_PIPELINE_REV = 'v1.9.86-character-shot-contract'"),'existing durable video production contract must remain unchanged');
console.log('v1.11.0 story intelligence + cinematic direction regression: PASS');
