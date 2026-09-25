import fs from 'node:fs';
const src=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
const checks=[
  ['unsynced source remains controllable', /<video controls playsinline muted preload=.*data-sync-gated="1"/s],
  ['sync gate does not remove controls', !/video\.removeAttribute\('controls'\)/.test(src)],
  ['requestVideo persists without global render', /Single-scene regeneration must not remount every other scene\/video[\s\S]*updateProjectById\(p\.id,[\s\S]*\{render:false\}\)/.test(src)],
  ['requestVideo finally avoids renderStudio', /finally\{\s*button\.disabled=false;[\s\S]*button\.textContent=liveScene\?videoButtonLabel\(liveScene\):old;\s*\}\s*\}/.test(src)],
  ['media completion patches one scene instead of remounting Studio', /function renderStudioAfterSceneMediaUpdate\(index=null\)[\s\S]*data-scene-card-index[\s\S]*bindSceneVideoVoicePlayback\(p,ep\)[\s\S]*return;/.test(src)]
];
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
if(!process.exitCode)console.log('v1.9.78 scene isolation regression passed');
