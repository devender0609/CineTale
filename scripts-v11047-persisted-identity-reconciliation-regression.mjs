import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
for(const phrase of [
  'function resolveCharacterIdentityConsensus',
  'function shotIdentityHints',
  "logicGateRevision:'v1.11.0-persisted-identity-reconciliation'",
  "scene.identityMigrationRevision='v1.11.0'",
  "revision:'v1.12.4-system-integrity'",
  'conflicting-stable-ids',
  'stable-id-speaker-conflict',
  'stale-id-no-name-match'
]) assert.ok(app.includes(phrase),`missing ${phrase}`);

const start=app.indexOf("function normalizeName(value='')");
const end=app.indexOf('function embeddedDialogueCharacterId',start);
assert.ok(start>=0&&end>start,'identity helper block not found');
const source=app.slice(start,end)+`\nfunction characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1}\nthis.__resolve=resolveCharacterIdentity;this.__consensus=resolveCharacterIdentityConsensus;`;
const context={uid:(p='c')=>`${p}-test`};vm.createContext(context);vm.runInContext(source,context);
const resolve=context.__resolve,consensus=context.__consensus;

const project={characters:[
  {id:'g1',name:'बाल गणेश',sacredIdentity:'Lord Ganesha (Bal Swaroop)',aliases:['Ganesh','Vinayaka']},
  {id:'k1',name:'बाल कार्तिकेय',sacredIdentity:'Lord Kartikeya / Skanda (Bal Swaroop)',aliases:['Kartikeya']},
  {id:'p1',name:'माता पार्वती',sacredIdentity:'Goddess Parvati / Uma',aliases:['Parvati']}
]};

// A stale legacy ID must not block a unique canonical multilingual speaker match.
let m=consensus(project,{characterIds:['legacy-kartikeya-123'],speakerHints:['बाल कार्तिकेय','Kartikeya']});
assert.equal(m.status,'resolved');assert.equal(m.character.id,'k1');assert.equal(m.reason,'speaker-consensus');

// A stale legacy ID plus one usable alias is still deterministic and safe.
m=consensus(project,{characterIds:['old-parvati'],speakerHints:['माता पार्वती']});
assert.equal(m.status,'resolved');assert.equal(m.character.id,'p1');

// Multiple hints that agree should converge on the stable cast identity.
m=consensus(project,{speakerHints:['गणेश','Ganapati','Lord Ganesha']});
assert.equal(m.status,'resolved');assert.equal(m.character.id,'g1');

// A valid stable ID conflicting with a different resolved speaker must fail closed.
m=consensus(project,{characterIds:['k1'],speakerHints:['माता पार्वती']});
assert.equal(m.status,'ambiguous');assert.equal(m.reason,'stable-id-speaker-conflict');

// Two valid stable IDs must never be silently chosen between.
m=consensus(project,{characterIds:['g1','k1'],speakerHints:['गणेश']});
assert.equal(m.status,'ambiguous');assert.equal(m.reason,'conflicting-stable-ids');

// Unknown speakers remain fail-closed.
m=consensus(project,{characterIds:['stale-x'],speakerHints:['Unknown deity']});
assert.equal(m.status,'missing');assert.equal(m.reason,'stale-id-no-name-match');

// Baseline resolver still preserves exact alias behavior.
assert.equal(resolve(project,{speaker:'Skanda'}).character.id,'k1');
assert.equal(resolve(project,{speaker:'Uma'}).character.id,'p1');

console.log('v1.11.0 persisted identity reconciliation regression: PASS');
