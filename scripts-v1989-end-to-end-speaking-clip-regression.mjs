import fs from 'node:fs';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.match(app,/v1\.9\.89-end-to-end-speaking-clip/);
assert.match(app,/if\(speaking&&!isMountedSynced\)[\s\S]{0,1200}scene-source-preview[\s\S]*data-sync-gated=\"1\"/,'intermediate speaking source must remain visually playable without overlay copy');
assert.match(app,/button\.textContent='Finalizing dialogue…'/);
assert.match(app,/synced=await ensureSceneLipSync\(liveProject,liveScene,i,\{quiet:false,allowSubmit:true,propagateErrors:true\}\)/);
assert.match(app,/synced=await ensureSceneLipSync\(afterSource,afterScene,i,\{quiet:false,allowSubmit:true,propagateErrors:true\}\)/);
assert.match(app,/source video remains available for retry/);
console.log('v1.10.9 end-to-end speaking clip regression PASS');
