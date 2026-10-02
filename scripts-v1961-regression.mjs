import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(app.includes('authorizeUnsyncedSpeakingScenesOnStudioOpen(p,ep);updateSceneMediaStatuses'),'studio-open safety hook is not wired before status/final assembly');
ok(app.includes('Opening Studio is not consent to spend additional lip-sync credits'),'Studio open can still silently authorize legacy paid lip-sync work');
ok(/function authorizeUnsyncedSpeakingScenesOnStudioOpen[\s\S]*?return false;\n}/.test(app),'legacy auto-sync migration should be inert');
ok(app.includes("if(scene?.videoUrl)return '';"),'playable scene media must keep the frame free of status labels');
ok(app.includes("allowSubmit:liveScene.lipSyncAutoPending===true"),'warmup must only submit when a fresh user-triggered video generation already authorized synchronization');
console.log('v1.12.4 studio-open no-surprise-billing regression: PASS');
