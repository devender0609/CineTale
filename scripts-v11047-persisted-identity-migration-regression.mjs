import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('function dialogueEntries');
const end=app.indexOf('function hashString',start);
assert.ok(start>=0&&end>start,'identity migration source region missing');
const ctx={
  console,
  dialogueText(entry){if(typeof entry==='string')return entry;if(entry&&typeof entry==='object')return String(entry.text||entry.line||entry.dialogue||'');return String(entry||'')},
  uid(prefix='id'){return `${prefix}-generated`},
  sceneHasAnyProducedShotMedia(){return false},
  normalizeSceneMediaReferences(){},
  ensureSceneCoverage(scene){return scene.coveragePlan||[]}
};
vm.createContext(ctx);
vm.runInContext(`${app.slice(start,end)}\n;globalThis.__id={resolveCharacterIdentity,migratePersistedProjectIdentityReferences,recoverSceneDialogueIdentityBindings,normalizeSpeakerAlias};`,ctx);
const api=ctx.__id;

const project={characters:[
  {id:'g1',name:'बाल गणेश',sacredIdentity:'Lord Ganesha (Bal Swaroop)',aliases:['Ganesha','Ganesh']},
  {id:'k1',name:'बाल कार्तिकेय',sacredIdentity:'Lord Kartikeya / Skanda (Bal Swaroop)',aliases:['Kartikeya','Skanda']},
  {id:'p1',name:'माता पार्वती',sacredIdentity:'Goddess Parvati / Uma',aliases:['Parvati','Uma']}
],episodes:[{id:'e1',scenes:[{id:'s2',title:'माता पार्वती का संकेत',dialogue:[
  'बाल कार्तिकेय: माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?',
  'माता पार्वती: नहीं पुत्र। यह प्रकाश तभी शांत होता है जब कोई निर्दोष जीव भय में अपना मार्ग खो देता है।'
],dialogueBindings:[
  {characterId:'legacy-deleted-k',speakerLabel:'Kartikeya',sourceSpeaker:'Kartikeya'},
  {characterId:'g1',speakerLabel:'Ganesha',sourceSpeaker:'Parvati'}
],coveragePlan:[
  {id:'s2-1',order:1,speaking:false,visual:'Parvati opens her eyes.'},
  {id:'s2-2',order:2,speaking:true,speaker:'Kartikeya',spokenLine:'old line',dialogueCharacterId:'legacy-deleted-k'},
  {id:'s2-3',order:3,speaking:true,speaker:'Parvati',spokenLine:'old line',dialogueCharacterId:'g1'}
]}]}]};

const stale=api.resolveCharacterIdentity(project,{speaker:'बाल कार्तिकेय',characterId:'g1'});
assert.equal(stale.status,'resolved');
assert.equal(stale.character.id,'g1','ordinary stable IDs remain authoritative outside migration');

const migrated=api.migratePersistedProjectIdentityReferences(project);
assert.equal(migrated.unresolved.length,0,'deterministic multilingual migration should resolve both speakers');
const scene=project.episodes[0].scenes[0];
assert.equal(JSON.stringify(Array.from(scene.dialogueBindings,x=>x.characterId)),JSON.stringify(['k1','p1']));
assert.equal(JSON.stringify(Array.from(scene.coveragePlan.filter(x=>x.speaking),x=>x.dialogueCharacterId)),JSON.stringify(['k1','p1']));
assert.equal(JSON.stringify(Array.from(scene.coveragePlan.filter(x=>x.speaking),x=>x.speaker)),JSON.stringify(['बाल कार्तिकेय','माता पार्वती']));
assert.ok(scene.coveragePlan[1].spokenLine.startsWith('माता, क्या किसी ने'),'authoritative dialogue text must replace stale shot text');
assert.equal(scene.identityMigrationRevision,'v1.11.0');

const ambiguous={characters:[{id:'a',name:'Asha',role:'Mother'},{id:'b',name:'Mira',role:'Mother'}]};
const amb=api.resolveCharacterIdentity(ambiguous,{speaker:'Mother'});
assert.equal(amb.status,'ambiguous','generic role collisions must fail closed rather than guess');

assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes('function migratePersistedProjectIdentityReferences'));
assert.ok(app.includes('function recoverSceneDialogueIdentityBindings'));
assert.ok(app.includes("identityMigrationRevision='v1.11.0'"));
console.log('v1.11.0 persisted multilingual identity migration regression: PASS');
