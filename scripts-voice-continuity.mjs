import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app.js','utf8');
function extractFunction(name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`Missing ${name}`);
  const openParen=source.indexOf('(',start);let parenDepth=0,quote='',escape=false,closeParen=-1;
  for(let i=openParen;i<source.length;i++){const ch=source[i];if(quote){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='(')parenDepth++;else if(ch===')'&&--parenDepth===0){closeParen=i;break}}
  assert.ok(closeParen>0,`Could not parse signature for ${name}`);const brace=source.indexOf('{',closeParen);let depth=0;quote='';escape=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote)quote='';continue}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Unclosed ${name}`);
}
const names=['dialogueText','dialogueEntries','dialogueList','dialogueParts','normalizeName','normalizeSpeakerAlias','ensureCharacterIdentityIds','embeddedDialogueCharacterId','characterIndexById','sceneDialogueBindingAt','characterIndexForSpeaker','resolveDialogueCharacterIndex','bindSceneDialogueCharacters'];
let seq=0;const sandbox={uid:(prefix='id')=>`${prefix}_test_${++seq}`,structuredClone,Date};vm.createContext(sandbox);
vm.runInContext(names.map(extractFunction).join('\n'),sandbox);

const p={characters:[{id:'c_david',name:'David Lin',voiceId:'voice_david'},{id:'c_maya',name:'Maya Lin',voiceId:'voice_maya'}]};
const scene={dialogue:['David Lin: We need to leave.']};
sandbox.bindSceneDialogueCharacters(p,scene);
assert.equal(scene.dialogueBindings[0].characterId,'c_david','Exact speaker should bind to David stable ID');
assert.equal(sandbox.resolveDialogueCharacterIndex(p,scene,scene.dialogue[0],0),0,'Bound line should resolve David by stable ID');

scene.dialogue=['Dad: We need to leave.'];
scene.dialogueBindings=[{characterId:'c_david',speakerLabel:'Dad',boundAt:'2026-09-23T00:00:00.000Z'}];
assert.equal(sandbox.resolveDialogueCharacterIndex(p,scene,scene.dialogue[0],0),0,'Saved character ID must outrank an unrecognized display label');

assert.equal(sandbox.characterIndexForSpeaker(p,'Mr. David Lin'),0,'Honorific variant should resolve David');
assert.equal(sandbox.characterIndexForSpeaker(p,'David'),0,'Unique first name should resolve David');
assert.equal(sandbox.characterIndexForSpeaker(p,'Lin'),-1,'Ambiguous family name must not choose the wrong Lin');

const objectScene={dialogue:[{speaker:'David Lin',text:'Object dialogue',characterId:'c_david'}]};
assert.equal(sandbox.resolveDialogueCharacterIndex(p,objectScene,objectScene.dialogue[0],0),0,'Object dialogue characterId should resolve directly');

const before=scene.dialogueBindings[0].boundAt;sandbox.bindSceneDialogueCharacters(p,scene);assert.equal(scene.dialogueBindings[0].boundAt,before,'Unchanged bindings should not churn timestamps on save');
console.log('character-ID voice continuity regression PASS');
