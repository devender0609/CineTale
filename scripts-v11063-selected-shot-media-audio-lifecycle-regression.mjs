import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const checks=[
 ['build bumped',app.includes("const APP_VERSION = '1.12.4';")],
 ['coverage sync operation tracked',app.includes('const dialogueOperation=shot?.speaking?(primary?scene?.lipSyncOperation:entry?.syncOperation):null;')],
 ['syncing status exposed',app.includes("return {label:'DIALOGUE SYNCING',kind:'syncing'}")],
 ['selected coverage shot gets decode shield',app.includes('scene-selected-shot-video')&&app.includes('sceneMediaDecodeShieldMarkup(art,title)')],
 ['selected shot player has lifecycle binder',app.includes('function bindSelectedShotMediaPlayback(project,episode)')],
 ['selected shot binder runs after selection',app.includes('bindSceneVideoVoicePlayback(p,ep);bindSelectedShotMediaPlayback(p,ep);')],
 ['loading player fully hidden',css.includes('opacity:0!important;visibility:hidden!important;pointer-events:none!important')],
 ['loaded player restored',css.includes('opacity:1!important;visibility:visible!important;pointer-events:auto!important')],
 ['coverage sync auto pending persisted',app.includes('it.syncAutoPending=true')],
 ['coverage sync auto pending cleared',app.includes('it.syncAutoPending=false')],
 ['existing paid coverage sync resumes on studio open',app.includes('function scheduleStudioCoverageSyncWarmup(project,episode)')&&app.includes('entry?.syncOperation&&!coverageShotSyncValid')],
 ['coverage warmup invoked',app.includes('scheduleStudioCoverageSyncWarmup(p,ep)')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}if(failed)process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} v1.11.0 selected-shot media/audio lifecycle checks`);
