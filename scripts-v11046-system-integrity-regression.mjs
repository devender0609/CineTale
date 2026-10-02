import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {coverageLogicAudit,repairCoverageLogic} from './lib/production.js';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
for(const phrase of [
  'function resolveCharacterIdentity',
  'function reconcileSceneIdentityOwnership',
  "'ambiguous-speaking-character'",
  "'orphaned-shot-media'",
  "revision:'v1.12.4-system-integrity'",
  'reconcileSceneIdentityOwnership(x,target',
  'resolveCharacterIdentityAuthoritative(project',
])assert.ok(app.includes(phrase),`missing ${phrase}`);

// Execute the actual identity helper block from app.js in isolation so multilingual alias
// behavior is regression-tested without booting the browser application.
const start=app.indexOf("function normalizeName(value='')");
const end=app.indexOf('function embeddedDialogueCharacterId',start);
assert.ok(start>=0&&end>start,'identity helper block not found');
const source=app.slice(start,end)+`\nfunction characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1}\nthis.__resolve=resolveCharacterIdentity;this.__aliases=characterIdentityAliases;this.__norm=normalizeSpeakerAlias;`;
const context={uid:(p='c')=>`${p}-test`};vm.createContext(context);vm.runInContext(source,context);
const resolve=context.__resolve;
const project={characters:[
  {id:'g1',name:'बाल गणेश',sacredIdentity:'Lord Ganesha (Bal Swaroop)',aliases:['Ganesh','Vinayaka']},
  {id:'k1',name:'बाल कार्तिकेय',sacredIdentity:'Lord Kartikeya / Skanda (Bal Swaroop)',aliases:['Kartikeya']},
  {id:'p1',name:'माता पार्वती',sacredIdentity:'Goddess Parvati / Uma',aliases:['Parvati']}
]};
for(const [speaker,id] of [
  ['बाल गणेश','g1'],['गणेश','g1'],['Ganesha','g1'],['Ganapati','g1'],
  ['बाल कार्तिकेय','k1'],['कार्तिकेय','k1'],['Kartikeya','k1'],['Skanda','k1'],
  ['माता पार्वती','p1'],['पार्वती','p1'],['Parvati','p1'],['Uma','p1']
]){
  const m=resolve(project,{speaker});assert.equal(m.status,'resolved',`${speaker} should resolve`);assert.equal(m.character.id,id,`${speaker} identity mismatch`);
}
assert.equal(resolve(project,{speaker:'anything',characterId:'k1'}).character.id,'k1','stable ID must be authoritative');
const ambiguous={characters:[{id:'a',name:'Maya'},{id:'b',name:'Maya'}]};
assert.equal(resolve(ambiguous,{speaker:'Maya'}).status,'ambiguous','duplicate aliases must fail closed');
assert.equal(resolve(project,{speaker:'Unknown deity'}).status,'missing','unknown identities must not be guessed');

const scene={id:'s',durationSec:18,dialogue:['बाल कार्तिकेय: माता, क्या दीप बुझ गया?','माता पार्वती: हाँ पुत्र, पर कारण भय है।'],coverageClips:[],coveragePlan:[
 {id:'s1',order:1,speaking:false,storyBeat:'दीप बुझता है',startSec:0,endSec:6},
 {id:'s2',order:2,speaking:true,speaker:'माता पार्वती',spokenLine:'गलत',startSec:6,endSec:12},
 {id:'s3',order:3,speaking:true,speaker:'बाल कार्तिकेय',spokenLine:'हाँ पुत्र, पर कारण भय है।',startSec:12,endSec:18}
]};
const repaired=repairCoverageLogic(structuredClone(scene),structuredClone(scene.coveragePlan),'balanced');
assert.equal(repaired.after.ok,true,JSON.stringify(repaired.after.issues));
assert.equal(repaired.repaired[1].speaker,'बाल कार्तिकेय');
assert.equal(repaired.repaired[2].speaker,'माता पार्वती');

// Produced media must remain fail-closed, never silently rebound.
const protectedScene=structuredClone(scene);protectedScene.coverageClips=[{shotId:'s2',videoStoragePath:'durable.mp4',videoMediaPersistedAt:'2026-10-01T00:00:00Z'}];
const protectedRepair=repairCoverageLogic(protectedScene,protectedScene.coveragePlan,'balanced');
assert.equal(protectedRepair.changed,false);
assert.equal(coverageLogicAudit(protectedScene,protectedScene.coveragePlan).ok,false);

console.log('v1.11.0 system integrity regression: PASS');
