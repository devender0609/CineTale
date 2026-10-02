import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css', import.meta.url),'utf8');
const checks=[
  ['build advanced to 1.11.0', /const APP_VERSION = '1\.12\.4'/],
  ['durable source waits for runtime hydration instead of remounting stale provider URL', /sourceRuntime\|\|\(sceneSourceMediaHydrationPending\(scene\)\?'':scene\.videoUrl/],
  ['durable sync waits for runtime hydration instead of remounting stale provider URL', /syncRuntime\|\|\(sceneSyncMediaHydrationPending\(scene\)\?'':scene\.lipSyncVideoUrl/],
  ['scene video markup includes decode shield', /sceneMediaDecodeShieldMarkup\(art,title\).*<video controls playsinline/s],
  ['decode shield stays visible while media loads', /const shield=.*data-scene-media-shield[\s\S]*markSceneMediaLoading=.*guard=shield\(\);if\(guard\)guard\.hidden=false/],
  ['decode shield is removed only after decoded media becomes playable', /markSceneMediaLoaded=.*guard\.hidden=true/s],
  ['media errors re-enter protected loading state before recovery', /video\.addEventListener\('error',\(\)=>\{\s*markSceneMediaLoading\(\)/],
  ['decode shield does not intercept controls', /\.scene-media-decode-shield\{[^}]*pointer-events:none/],
  ['loaded scene hides decode shield', /\.scene-visual\.media-loaded \.scene-media-decode-shield\{display:none!important\}/]
];
let failed=0;
for(const [name,rule] of checks){const text=(name.includes('controls')||name.includes('loaded scene'))?css:app;const ok=rule.test(text);console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log('PASS v1.11.0 shot-switch media stability regression');
