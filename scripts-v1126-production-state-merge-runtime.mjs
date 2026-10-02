import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
function extract(name){
  const start=src.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} missing`);
  const brace=src.indexOf('){',start)+1;assert.ok(brace>0,`${name} body missing`);let depth=0,quote='',esc=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i];if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++; else if(c==='}'&&--depth===0)return src.slice(start,i+1)
  }
  throw new Error(`Could not extract ${name}`)
}
const code=[extract('mergeCharacterVoiceSelections'),extract('mediaBearingSceneScore'),extract('mergeSceneProductionState'),extract('mergeProjectProductionState')].join('\n');
const factory=new Function('normalizeName','voiceSelectionStamp',`${code}; return {mergeProjectProductionState};`);
const normalizeName=v=>String(v||'').trim().toLowerCase();
const voiceSelectionStamp=c=>new Date(c?.voiceSelectionUpdatedAt||0).getTime()||0;
const {mergeProjectProductionState}=factory(normalizeName,voiceSelectionStamp);
const cloud={id:'p1',title:'Story',episodes:[{id:'ep1',number:1,title:'Episode 1',scenes:[]}],characters:[]};
const local={id:'p1',title:'Story',episodes:[{id:'ep1',number:1,title:'Episode 1',scenes:[{id:'s1',number:1,title:'Scene 1',videoUrl:'https://provider/video.mp4',videoLocalMediaKey:'p1:ep1:s1:source:key',videoMediaPersistedAt:'2026-09-29T00:00:00Z'}]}],characters:[]};
const merged=mergeProjectProductionState(cloud,local);
assert.equal(merged.episodes[0].scenes.length,1,'richer same-project episode was not restored');
assert.equal(merged.episodes[0].scenes[0].videoLocalMediaKey,'p1:ep1:s1:source:key');
const richerCloud={id:'p1',episodes:[{id:'ep1',number:1,scenes:[{id:'s1',number:1,videoUrl:'https://cloud/current.mp4',videoStoragePath:'u/p/e/scene.mp4',videoMediaPersistedAt:'2026-09-30T00:00:00Z',lipSyncVideoUrl:'https://cloud/sync.mp4',lipSyncStoragePath:'u/p/e/sync.mp4',lipSyncMediaPersistedAt:'2026-09-30T00:00:00Z'}]}],characters:[]};
const staleLocal={id:'p1',episodes:[{id:'ep1',number:1,scenes:[{id:'s1',number:1,videoUrl:'https://old.mp4'}]}],characters:[]};
const merged2=mergeProjectProductionState(richerCloud,staleLocal);
assert.equal(merged2.episodes[0].scenes[0].lipSyncStoragePath,'u/p/e/sync.mp4','richer cloud media must not be downgraded');
console.log('v1.11.0 production-state merge runtime PASS');
