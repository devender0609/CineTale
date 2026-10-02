import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureSceneCoverage} from './lib/production.js';

const hindiScene={
  id:'s1',durationSec:28,title:'अनादि ज्योति का लोप',
  purpose:'अखंड दीप के बुझने से रहस्य आरंभ होता है।',
  dramaticPurpose:'शांत कैलाश को रहस्य और तात्कालिकता में बदलना।',
  characterObjective:'बाल गणेश और बाल कार्तिकेय समझना चाहते हैं कि दीप क्यों बुझा।',
  obstacle:'ठंड और नीली बर्फ का असामान्य फैलाव।',
  newInformation:'यह साधारण हवा से बुझी लौ नहीं है।',
  emotionalTurn:'खेल से जिज्ञासा और चिंता की ओर परिवर्तन।',
  entryState:'दोनों भाई नंदी के पास खेल रहे हैं।',
  exitState:'दोनों बुझी वेदी की ओर बढ़ते हैं।',
  visual:'कैलाश पर संध्या में अखंड दीप अचानक बुझ जाता है।',
  visualProgression:[
    'संध्या की स्वर्णिम रोशनी में अखंड दीप अचानक काँपता है और बुझ जाता है।',
    'बाल कार्तिकेय खेलते-खेलते रुककर अंधेरी वेदी की ओर मुड़ते हैं।',
    'बाल गणेश सूंड उठाकर हवा में फैली असामान्य ठंड को महसूस करते हैं।',
    'नीली बर्फ वेदी के पाषाण किनारों पर फैलती हुई दिखाई देती है।',
    'दोनों भाई साथ-साथ बुझी वेदी की ओर दौड़ पड़ते हैं।'
  ],
  dialogue:['बाल कार्तिकेय: गणेश भैया... उस वेदी का प्रकाश कहाँ चला गया?'],
  coveragePlan:[
    {id:'s1-shot-1',order:1,kind:'establishing',purpose:'Orient the viewer before the story beat advances.',visual:'Orient the viewer before the story beat advances.',speaking:false,startSec:0,endSec:6,durationSec:6},
    {id:'s1-shot-2',order:2,kind:'speaking-medium',purpose:'On-camera performance',visual:'बाल कार्तिकेय बोलते हैं।',speaker:'बाल कार्तिकेय',spokenLine:'गणेश भैया... उस वेदी का प्रकाश कहाँ चला गया?',speaking:true,startSec:6,endSec:12,durationSec:6},
    {id:'s1-shot-3',order:3,kind:'movement',purpose:'Advance physical action from the prior shot to the next story state.',visual:'Advance physical action from the prior shot to the next story state.',speaking:false,startSec:12,endSec:17.3,durationSec:5.3},
    {id:'s1-shot-4',order:4,kind:'movement',purpose:'Advance physical action from the prior shot to the next story state.',visual:'Advance physical action from the prior shot to the next story state.',speaking:false,startSec:17.3,endSec:22.6,durationSec:5.3},
    {id:'s1-shot-5',order:5,kind:'movement',purpose:'Advance physical action from the prior shot to the next story state.',visual:'Advance physical action from the prior shot to the next story state.',speaking:false,startSec:22.6,endSec:28,durationSec:5.4}
  ],coverageClips:[]
};
const migrated=ensureSceneCoverage(structuredClone(hindiScene),'balanced');
assert.equal(migrated.length,5);
assert.ok(migrated.every(x=>x.plannerRevision==='v1.10.49-story-to-shot-director'));
assert.match(migrated[0].storyBeat,/दीप/);
assert.ok(migrated.filter(x=>!x.speaking).every(x=>!/^Advance physical action|^Orient the viewer/i.test(x.storyBeat||'')));

const modelDirected={...hindiScene,coveragePlan:[
  {kind:'establishing',purpose:'अखंड दीप बुझता है',visual:'संध्या की स्वर्णिम रोशनी में अखंड दीप काँपकर बुझ जाता है।',speaking:false},
  {kind:'speaking-medium',purpose:'कार्तिकेय पहला प्रश्न पूछते हैं',visual:'कार्तिकेय अंधेरी वेदी की ओर देखकर रुकते हैं।',speaker:'बाल कार्तिकेय',spokenLine:'गणेश भैया... उस वेदी का प्रकाश कहाँ चला गया?',speaking:true},
  {kind:'detail',purpose:'असामान्य ठंड का पहला दृश्य संकेत',visual:'नीली बर्फ वेदी के किनारों पर फैलती है।',speaking:false},
  {kind:'reaction',purpose:'गणेश खतरे को महसूस करते हैं',visual:'गणेश सूंड उठाकर ठंडी हवा को परखते हैं और गंभीर हो जाते हैं।',speaking:false},
  {kind:'movement',purpose:'दोनों खोज की ओर बढ़ते हैं',visual:'दोनों भाई बुझी वेदी की ओर दौड़ पड़ते हैं।',speaking:false}
],coverageClips:[]};
const compiled=ensureSceneCoverage(structuredClone(modelDirected),'balanced');
assert.equal(compiled[0].visual,'संध्या की स्वर्णिम रोशनी में अखंड दीप काँपकर बुझ जाता है।');
assert.equal(compiled[1].spokenLine,'गणेश भैया... उस वेदी का प्रकाश कहाँ चला गया?');
assert.equal(compiled.at(-1).endSec,28);
assert.ok(compiled.every(x=>x.plannerRevision==='v1.10.49-story-to-shot-director'));

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes("SHOT_DIRECTOR_PIPELINE_REV = 'v1.10.49-story-to-shot-director'"));
assert.ok(app.includes("shot.storyBeat||shot.displayText||shot.visual||shot.purpose"));
assert.ok(app.includes("voiceLabel=shot?.speaking?'Character voice':'Scene audio'"));
assert.ok(app.includes("No dialogue · ambience / foley"));

const generatePlan=fs.readFileSync(new URL('./api/generate-plan.js',import.meta.url),'utf8');
for(const phrase of ['SCENE-TO-SHOT DIRECTOR RULE','generic placeholder shot direction','CONCRETE story event','Examples that are FORBIDDEN','user-facing purpose and visual fields'])assert.ok(generatePlan.includes(phrase),`generate-plan missing ${phrase}`);
console.log('v1.11.0 story-to-shot director regression: PASS');
