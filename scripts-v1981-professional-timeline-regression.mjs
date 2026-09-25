import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCoveragePlan,coverageTargetCount} from './lib/production.js';

const app=fs.readFileSync('app.js','utf8');
const videoApi=fs.readFileSync('api/video-job.js','utf8');
const ttsApi=fs.readFileSync('api/tts.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.equal(pkg.version,'1.9.81');
assert.ok(app.includes("const APP_VERSION = '1.9.81'"));
assert.ok(html.includes('/app.js?v=1.9.81')&&html.includes('/styles.css?v=1.9.81'));

const scene={id:'scene-test',durationSec:35,visual:'Attic discovery',camera:'Slow cinematic movement',dialogue:['Maya: Dad, listen to this.']};
const plan=buildCoveragePlan(scene,'balanced');
assert.equal(plan.length,coverageTargetCount(scene,'balanced'));
assert.ok(plan.length>=2,'long scene must plan multiple shots');
assert.equal(plan.filter(x=>x.speaking).length,1,'one dialogue turn must map to one performance shot');
assert.equal(plan.find(x=>x.speaking)?.speaker,'Maya');
assert.equal(plan.find(x=>x.speaking)?.spokenLine,'Dad, listen to this.');
assert.ok(plan.every((shot,i)=>shot.order===i+1&&shot.endSec>shot.startSec&&shot.durationSec>0),'every shot needs ordered explicit timing');
assert.ok(plan.every(shot=>shot.durationSec<=6.01),'balanced provider shots may not exceed the supported six-second generation slot');
assert.ok(Math.abs(plan.at(-1).endSec-35)<.11,'timed shot plan must cover the full story beat');
for(let i=1;i<plan.length;i++)assert.ok(Math.abs(plan[i].startSec-plan[i-1].endSec)<.11,'shot timeline must be contiguous');

const multi=buildCoveragePlan({id:'scene-multi',durationSec:30,dialogue:['Maya: First line.','David: Second line.']},'balanced');
assert.deepEqual(multi.filter(x=>x.speaking).map(x=>x.speaker),['Maya','David'],'dialogue turns must preserve speaker order');
assert.deepEqual(multi.filter(x=>x.speaking).map(x=>x.spokenLine),['First line.','Second line.'],'dialogue text must preserve line order');

assert.ok(app.includes("video.dataset.voiceSync='visual-only'"),'untrusted source video must be explicitly visual-only internally');
const playBlock=app.slice(app.indexOf("video.addEventListener('play'"),app.indexOf("video.addEventListener('pause'"));
assert.ok(!playBlock.includes('startSceneVideoVoicePlayback'),'source video playback must not fake synchronization with detached TTS');
assert.ok(!app.includes('Source preview + approved voice'),'technical source-preview wording must not appear in user UI');
assert.ok(app.includes("if(scene?.videoUrl)return '';"),'playable video frame must not receive a status overlay');
const endedBlock=app.slice(app.indexOf("video.addEventListener('ended'"),app.indexOf('function playAudioUrl'));
assert.ok(!endedBlock.includes('renderStudio()')&&!endedBlock.includes('adoptSceneLipSyncVideo'),'video completion must not remount or hot-swap the player');
assert.ok(app.includes('function renderStudioAfterSceneMediaUpdate(index=null)')&&app.includes('data-scene-card-index'),'provider completion must patch a single scene card');

assert.ok(app.includes('function sceneFinalVideoEntries'),'final assembly must derive an ordered shot timeline');
assert.ok(app.includes('.sort((a,b)=>(a.startSec-b.startSec)||(a.order-b.order))'),'final shot order must follow planned scene time');
assert.ok(app.includes('item.entry?.plannedDurationSec'),'final renderer must respect planned shot duration');
assert.ok(app.includes('item.entry?.synchronized'),'final renderer must identify authoritative synchronized media');
assert.ok(!app.includes('clipIndex%videos.length'),'final renderer must never loop clips to manufacture runtime');

assert.ok(videoApi.includes("const planned=Number(scene?.coverageShot?.durationSec||scene?.coverageShot?.targetClipSec||0)"),'video API must choose provider duration from the timed shot plan');
assert.ok(videoApi.includes("duration=planned<=4?'4':planned<=6?'6':'8'"),'planned shot duration must map to supported provider duration');
assert.ok(ttsApi.includes('Generic \'natural/conversational\' delivery should remain'),'TTS must avoid automatic generic performance-tag stacking');
assert.ok(!ttsApi.includes("add(kind==='narration'?'natural storyteller':'conversational')"),'TTS must not inject a generic performance tag into every line');

console.log('v1.9.81 professional timed-shot + stable-media regression PASS');
