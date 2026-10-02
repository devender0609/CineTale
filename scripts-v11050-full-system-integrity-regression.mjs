import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes("p.identityGraphRevision='v1.11.0'"));
assert.ok(app.includes("function normalizeProjectIdentityBindings(p)"));
assert.ok(app.includes("recoverSceneDialogueIdentityBindings(p,scene);"));
assert.ok(app.includes("reconcileSceneIdentityOwnership(p,scene,'balanced');"));
assert.ok(app.includes("const audit=sceneProductionLogicAudit(p,scene,'balanced');"));
assert.ok(app.includes("CineTale is refreshing this scene’s character links before production."));
// Execute the actual identity resolver helpers in isolation with the same Hindi sacred cast
// and deliberately stale project IDs that caused the deployed project to fail.
const start=app.indexOf('function dialogueEntries');
const end=app.indexOf('function embeddedDialogueCharacterId');
assert.ok(start>=0&&end>start);
const snippet=`function uid(prefix='x'){return prefix+'_test'}; function characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1};\n${app.slice(start,end)}\nthis.api={resolveCharacterIdentityAuthoritative,resolveCharacterIdentity,normalizeSpeakerAlias};`;
const ctx={};vm.createContext(ctx);vm.runInContext(snippet,ctx);
const p={characters:[
  {id:'g',name:'बाल गणेश',sacredIdentity:'Lord Ganesha (Bal Swaroop)',aliases:['Ganesh','Ganesha','Ganapati']},
  {id:'k',name:'बाल कार्तिकेय',sacredIdentity:'Lord Kartikeya / Skanda (Bal Swaroop)',aliases:['Kartikeya','Skanda']},
  {id:'p',name:'माता पार्वती',sacredIdentity:'Goddess Parvati / Uma',aliases:['Parvati','Uma']}
]};
let r=ctx.api.resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:'',shotSpeaker:'बाल कार्तिकेय',characterIds:['legacy-stale-id'],fallbackSpeakers:['Kartikeya']});
assert.equal(r.status,'resolved');assert.equal(r.character.id,'k');assert.equal(r.reason,'authoritative-shot-speaker');
r=ctx.api.resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:'माता पार्वती',shotSpeaker:'बाल कार्तिकेय',characterIds:['legacy-k']});
assert.equal(r.status,'resolved');assert.equal(r.character.id,'p');assert.equal(r.reason,'authoritative-dialogue-speaker');
r=ctx.api.resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:'',shotSpeaker:'Skanda',characterIds:['missing']});
assert.equal(r.character.id,'k');
r=ctx.api.resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:'',shotSpeaker:'उमा'});
assert.equal(r.character.id,'p');
console.log('v1.11.0 full system integrity regression: PASS');
