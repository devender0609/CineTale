import fs from 'node:fs';
import assert from 'node:assert/strict';
import {coverageLogicAudit,repairCoverageLogic} from './lib/production.js';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));

// Reproduce the real legacy-project shape that escaped earlier tests:
// current dialogue is stored as objects with explicit speaker fields, while
// the persisted shot plan still contains stale IDs/names from older builds.
const scene={
  id:'kailash-scene-2',
  title:'माता पार्वती का संकेत',
  durationSec:32,
  visual:'कैलाश के खुले प्रांगण में माता पार्वती के सम्मुख दोनों बालक खड़े हैं।',
  visualProgression:[
    'पार्वती जी का ध्यानावस्था से कोमलता से आँखें खोलना',
    'कार्तिकेय का औचित्य से आगे बढ़कर प्रश्न पूछना',
    'माता का मुस्कुराते हुए दोनों के सिर पर वात्सल्य भरा हाथ रखना',
    'माता द्वारा दूर हिम-गुहाओं की दिशा में संकेत करना'
  ],
  dialogue:[
    {speaker:'बाल कार्तिकेय',text:'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?'},
    {speaker:'माता पार्वती',text:'नहीं पुत्र। यह प्रकाश तभी शांत होता है जब कोई निर्दोष जीव भय में अपना मार्ग खो देता है।'}
  ],
  coverageClips:[],
  coveragePlan:[
    {id:'s2-1',order:1,kind:'establishing',speaking:false,storyBeat:'पार्वती जी का ध्यानावस्था से कोमलता से आँखें खोलना',startSec:0,endSec:6},
    {id:'s2-2',order:2,kind:'speaking-medium',speaking:true,speaker:'Kartikeya',spokenLine:'old stale line',dialogueCharacterId:'legacy-k',dialogueTurnIndex:'',startSec:6,endSec:12},
    {id:'s2-3',order:3,kind:'speaking-medium',speaking:true,speaker:'Parvati',spokenLine:'old stale line',dialogueCharacterId:'legacy-p',dialogueTurnIndex:null,startSec:12,endSec:18},
    {id:'s2-4',order:4,kind:'movement',speaking:false,storyBeat:'कार्तिकेय का औचित्य से आगे बढ़कर प्रश्न पूछना',startSec:18,endSec:23},
    {id:'s2-5',order:5,kind:'movement',speaking:false,storyBeat:'माता का मुस्कुराते हुए दोनों के सिर पर वात्सल्य भरा हाथ रखना',startSec:23,endSec:28},
    {id:'s2-6',order:6,kind:'movement',speaking:false,storyBeat:'माता द्वारा दूर हिम-गुहाओं की दिशा में संकेत करना',startSec:28,endSec:32}
  ]
};

const before=coverageLogicAudit(scene,scene.coveragePlan);
assert.equal(before.ok,false,'legacy stale shot metadata should initially fail the production logic audit');
assert.ok(before.issues.some(x=>x.code==='speaker-mismatch'));
assert.ok(before.issues.some(x=>x.code==='spoken-line-mismatch'));

const repaired=repairCoverageLogic(structuredClone(scene),structuredClone(scene.coveragePlan),'balanced');
assert.equal(repaired.after.ok,true,JSON.stringify(repaired.after.issues));
const speaking=repaired.repaired.filter(x=>x.speaking);
assert.equal(speaking.length,2);
assert.equal(speaking[0].speaker,'बाल कार्तिकेय');
assert.equal(speaking[0].spokenLine,'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?');
assert.equal(speaking[0].dialogueTurnIndex,0);
assert.equal(speaking[1].speaker,'माता पार्वती');
assert.equal(speaking[1].spokenLine,'नहीं पुत्र। यह प्रकाश तभी शांत होता है जब कोई निर्दोष जीव भय में अपना मार्ग खो देता है।');
assert.equal(speaking[1].dialogueTurnIndex,1);

// Guard against the root cause: object dialogue speaker metadata must be read by
// the shared production module, not only by app.js.
const production=fs.readFileSync(new URL('./lib/production.js',import.meta.url),'utf8');
assert.ok(production.includes("entry.speaker||entry.character||entry.name||entry.who"));
assert.ok(production.includes("const PRODUCTION_LOGIC_GATE_REV='v1.12.4-system-integrity'"));

console.log('v1.11.0 legacy object-dialogue lifecycle regression: PASS');
