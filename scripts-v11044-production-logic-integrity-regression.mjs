import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureSceneCoverage,coverageLogicAudit} from './lib/production.js';

const scene={
  id:'logic-scene',durationSec:24,title:'माता पार्वती का संकेत',
  visual:'माता पार्वती दोनों बालकों को संकेत देती हैं।',
  visualProgression:['दोनों बालक माता पार्वती के सामने पहुँचते हैं।','कार्तिकेय प्रश्न पूछते हैं।','माता पार्वती उत्तर देती हैं।','दोनों भाई संकेत समझकर आगे बढ़ते हैं।'],
  dialogue:['बाल कार्तिकेय: माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?','माता पार्वती: नहीं पुत्र। यह भय और पीड़ा का संकेत है।'],
  coveragePlan:[
    {id:'a',order:1,kind:'establishing',speaking:false,visual:'दोनों बालक माता पार्वती के सामने पहुँचते हैं।'},
    {id:'b',order:2,kind:'speaking-medium',speaking:true,speaker:'माता पार्वती',spokenLine:'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?',visual:'बाल कार्तिकेय माता से प्रश्न करते हैं।'},
    {id:'c',order:3,kind:'speaking-medium',speaking:true,speaker:'बाल कार्तिकेय',spokenLine:'नहीं पुत्र। यह भय और पीड़ा का संकेत है।',visual:'माता पार्वती शांत स्वर में उत्तर देती हैं।'},
    {id:'d',order:4,kind:'movement',speaking:false,visual:'दोनों भाई संकेत समझकर आगे बढ़ते हैं।'}
  ],coverageClips:[]
};
const repaired=ensureSceneCoverage(structuredClone(scene),'balanced');
const speaking=repaired.filter(x=>x.speaking);
assert.equal(speaking.length,2);
assert.equal(speaking[0].speaker,'बाल कार्तिकेय');
assert.equal(speaking[0].spokenLine,'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?');
assert.equal(speaking[1].speaker,'माता पार्वती');
assert.equal(speaking[1].spokenLine,'नहीं पुत्र। यह भय और पीड़ा का संकेत है।');
assert.equal(coverageLogicAudit({...scene,coveragePlan:repaired},repaired).ok,true);

const nested={...scene,dialogue:['बाल कार्तिकेय: माता पार्वती: दीप क्यों बुझा?'],coveragePlan:[{id:'x',order:1,speaking:true,speaker:'बाल कार्तिकेय',spokenLine:'माता पार्वती: दीप क्यों बुझा?'}],coverageClips:[{shotId:'x',videoStoragePath:'saved.mp4',videoMediaPersistedAt:'2026-10-01T00:00:00Z'}]};
const nestedAudit=coverageLogicAudit(nested,nested.coveragePlan);
assert.equal(nestedAudit.ok,false);
assert.ok(nestedAudit.issues.some(x=>x.code==='nested-speaker-conflict'));

const duplicate={...scene,dialogue:[],coveragePlan:[
  {id:'v1',order:1,speaking:false,storyBeat:'नीली बर्फ वेदी पर फैलती है।'},
  {id:'v2',order:2,speaking:false,storyBeat:'नीली बर्फ वेदी पर फैलती है।'}
]};
assert.ok(coverageLogicAudit(duplicate,duplicate.coveragePlan).issues.some(x=>x.code==='duplicate-visual-beat'));

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
for(const phrase of [
  "const APP_VERSION = '1.12.4'",
  'function sceneProductionLogicAudit',
  'function assertSceneProductionLogic',
  'function episodeProductionLogicAudit',
  'CineTale stopped before generation because the scene plan has a logic conflict',
  'Production paused before credits',
  'Plan verified',
  "scene.shotTimelineVersion='1.11.0'"
])assert.ok(app.includes(phrase),`app missing ${phrase}`);

const generatePlan=fs.readFileSync(new URL('./api/generate-plan.js',import.meta.url),'utf8');
assert.ok(generatePlan.includes('coverageLogicAudit'));
assert.ok(generatePlan.includes('Never assign one character\'s line to another character'));
assert.ok(generatePlan.includes("never a speaker label or nested 'Name:' prefix"));
console.log('v1.11.0 production logic integrity regression: PASS');
