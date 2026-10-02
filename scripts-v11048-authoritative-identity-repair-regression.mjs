import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes('function resolveCharacterIdentityAuthoritative'));
assert.ok(app.includes("reason:'authoritative-dialogue-speaker'"));
assert.ok(app.includes("reason:'authoritative-shot-speaker'"));
assert.ok(app.includes('dialogueSpeaker:parts.speaker,shotSpeaker:shot.speaker||shot.character||shot.characterName'));
// Execute the actual resolver helpers from app.js in isolation.
const start=app.indexOf('function dialogueEntries');
const end=app.indexOf('function embeddedDialogueCharacterId');
assert.ok(start>=0&&end>start);
const snippet=`function uid(prefix='x'){return prefix+'_test'}; function characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1};\n${app.slice(start,end)}\nthis.api={normalizeName,resolveCharacterIdentity,resolveCharacterIdentityConsensus,resolveCharacterIdentityAuthoritative,ensureCharacterIdentityIds};`;
const ctx={};vm.createContext(ctx);vm.runInContext(snippet,ctx);
const {api}=ctx;
const p={characters:[
  {id:'c_ganesha',name:'बाल गणेश',sacredIdentity:'Lord Ganesha (Bal Swaroop)',aliases:['Ganesha','Ganesh','Ganapati']},
  {id:'c_kartikeya',name:'बाल कार्तिकेय',sacredIdentity:'Lord Kartikeya / Skanda (Bal Swaroop)',aliases:['Kartikeya','Skanda']},
  {id:'c_parvati',name:'माता पार्वती',sacredIdentity:'Goddess Parvati / Uma',aliases:['Parvati','Uma']}
]};
let r=api.resolveCharacterIdentityAuthoritative(p,{shotSpeaker:'बाल कार्तिकेय',characterIds:['stale-old-id'],fallbackSpeakers:['माता पार्वती']});
assert.equal(r.status,'resolved');assert.equal(r.character.id,'c_kartikeya');assert.equal(r.reason,'authoritative-shot-speaker');
r=api.resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:'गणेश',shotSpeaker:'बाल कार्तिकेय',characterIds:['c_kartikeya']});
assert.equal(r.status,'resolved');assert.equal(r.character.id,'c_ganesha');assert.equal(r.reason,'authoritative-dialogue-speaker');
r=api.resolveCharacterIdentityAuthoritative(p,{shotSpeaker:'Skanda',characterIds:['stale-id']});
assert.equal(r.character.id,'c_kartikeya');
r=api.resolveCharacterIdentityAuthoritative(p,{shotSpeaker:'उमा'});
assert.equal(r.character.id,'c_parvati');
console.log('v1.11.0 authoritative identity repair regression: PASS');
