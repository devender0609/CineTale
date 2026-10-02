import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coverageLogicAudit,repairCoverageLogic} from './lib/production.js';

const scene={
  id:'self-heal',durationSec:24,title:'माता पार्वती का संकेत',
  visual:'माता पार्वती दोनों बालकों को संकेत देती हैं।',
  visualProgression:['दोनों बालक माता पार्वती के सामने पहुँचते हैं।','कार्तिकेय प्रश्न पूछते हैं।','माता पार्वती उत्तर देती हैं।','दोनों भाई संकेत समझकर आगे बढ़ते हैं।'],
  dialogue:['बाल कार्तिकेय: माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?','माता पार्वती: नहीं पुत्र। यह भय और पीड़ा का संकेत है।'],
  coveragePlan:[
    {id:'same',order:1,kind:'establishing',speaking:false,storyBeat:'दोनों बालक माता पार्वती के सामने पहुँचते हैं।',startSec:0,endSec:6},
    {id:'same',order:2,kind:'speaking-medium',speaking:true,speaker:'माता पार्वती',spokenLine:'गलत पंक्ति',storyBeat:'कार्तिकेय प्रश्न पूछते हैं।',startSec:5,endSec:11},
    {id:'c',order:2,kind:'speaking-medium',speaking:true,speaker:'बाल कार्तिकेय',spokenLine:'नहीं पुत्र। यह भय और पीड़ा का संकेत है।',storyBeat:'माता पार्वती उत्तर देती हैं।',startSec:11,endSec:17},
    {id:'d',order:4,kind:'movement',speaking:false,storyBeat:'दोनों भाई संकेत समझकर आगे बढ़ते हैं।',startSec:17,endSec:24}
  ],coverageClips:[]
};
const before=coverageLogicAudit(scene,scene.coveragePlan);
assert.equal(before.ok,false);
const repaired=repairCoverageLogic(structuredClone(scene),structuredClone(scene.coveragePlan),'balanced');
assert.equal(repaired.after.ok,true,JSON.stringify(repaired.after.issues));
assert.equal(repaired.repaired[1].speaker,'बाल कार्तिकेय');
assert.equal(repaired.repaired[1].spokenLine,'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?');
assert.equal(repaired.repaired[2].speaker,'माता पार्वती');
assert.equal(new Set(repaired.repaired.map(x=>x.id)).size,repaired.repaired.length);
assert.deepEqual(repaired.repaired.map(x=>x.order),[1,2,3,4]);
for(let i=1;i<repaired.repaired.length;i++)assert.ok(repaired.repaired[i].startSec>=repaired.repaired[i-1].endSec-.01);

const protectedScene={...scene,coverageClips:[{shotId:'same',videoStoragePath:'paid.mp4',videoMediaPersistedAt:'2026-10-01T00:00:00Z'}]};
const protectedRepair=repairCoverageLogic(protectedScene,protectedScene.coveragePlan,'balanced');
assert.equal(protectedRepair.changed,false);
assert.equal(protectedRepair.after.ok,false);

const duplicateScene={id:'dup',durationSec:12,visualProgression:['दीप बुझता है।','नीली बर्फ फैलती है।','दोनों भाई वेदी की ओर बढ़ते हैं।'],dialogue:[],coverageClips:[],coveragePlan:[
  {id:'a',order:1,speaking:false,storyBeat:'दीप बुझता है।',startSec:0,endSec:4},
  {id:'b',order:2,speaking:false,storyBeat:'दीप बुझता है।',startSec:4,endSec:8},
  {id:'c',order:3,speaking:false,storyBeat:'दीप बुझता है।',startSec:8,endSec:12}
]};
const duplicateRepair=repairCoverageLogic(duplicateScene,duplicateScene.coveragePlan,'balanced');
assert.equal(duplicateRepair.after.ok,true,JSON.stringify(duplicateRepair.after.issues));
assert.equal(new Set(duplicateRepair.repaired.map(x=>x.storyBeat)).size,3);

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
for(const phrase of [
  "const APP_VERSION = '1.12.4'",
  'repairCoverageLogic',
  'function sceneLogicIssueText',
  'function repairSceneProductionLogic',
  'Recheck & repair',
  'Plan still needs attention',
  'sceneHasAnyProducedShotMedia'
])assert.ok(app.includes(phrase),`missing ${phrase}`);
assert.ok(app.includes("target.shotTimelineVersion='1.11.0'"));
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
assert.ok(css.includes('v1.10.49 self-healing production-logic diagnostics'));
console.log('v1.11.0 self-healing plan regression: PASS');
