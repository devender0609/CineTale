import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const must=[
  ['dedicated finish action',/async function finishSceneClip\(i,button\)/],
  ['user initiated sync propagates failures',/propagateErrors:true,userInitiated:true/],
  ['not configured is explicit error',/lipsync_not_configured/],
  ['persistent preparing state',/lipSyncStatus='preparing'/],
  ['persistent scene error text',/Dialogue sync needs attention/],
  ['source shot metadata used for synchronization',/sourceSpeakingShot\(s\)\|\|primaryCoverageShot/],
  ['direct scene video binding',/\[data-scene-video\].*onclick/s],
];
for(const [name,test] of must){const ok=test instanceof RegExp?test.test(src):Boolean(test);if(!ok)throw new Error(`FAIL: ${name}`);}
if(/const sceneListEl=\$\('#sceneList'\)/.test(src))throw new Error('FAIL: old delegated pointer activation removed');
console.log('v1.10.9 Finish clip action regression: PASS');
