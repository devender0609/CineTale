import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
const a=src.indexOf('function sceneVideoMarkup'),b=src.indexOf('function fitSceneVideoToSurface',a),markup=src.slice(a,b),unfinished=markup.slice(markup.indexOf('if(speaking&&!isMountedSynced)'),markup.lastIndexOf('return `<video controls'));
const checks=[
  ['unsynced speaking visual stays a clean source-video preview', /scene-source-preview[\s\S]*data-sync-gated=\"1\"/s.test(unfinished)&&!/(Visual ready|Finish dialogue)/.test(unfinished)],
  ['requestVideo persists without global render', /Single-scene regeneration must not remount every other scene\/video[\s\S]*updateProjectById\(p\.id,[\s\S]*\{render:false\}\)/.test(src)],
  ['media completion patches one scene instead of remounting Studio', /function renderStudioAfterSceneMediaUpdate\(index=null\)[\s\S]*data-scene-card-index[\s\S]*bindSceneVideoVoicePlayback\(p,ep\)[\s\S]*return;/.test(src)]
];
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
if(!process.exitCode)console.log('v1.10.9 scene isolation regression passed');
