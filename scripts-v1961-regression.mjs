import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(app.includes("const STUDIO_LIPSYNC_MIGRATION_REV='v1.9.62'"),'missing migration revision');
ok(app.includes('authorizeUnsyncedSpeakingScenesOnStudioOpen(p,ep);updateSceneMediaStatuses'),'studio-open migration is not wired before status/final assembly');
ok(app.includes('scene.lipSyncAutoPending=true'),'legacy speaking source is not authorized for sync');
ok(app.includes("scene.lipSyncStudioMigrationRev===STUDIO_LIPSYNC_MIGRATION_REV"),'migration is not one-shot');
ok(app.includes("if(sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project||{},scene))return 'Source preview + approved voice';"),'unsynced speaking source does not clearly identify the safe review mode');
ok(app.includes("allowSubmit:liveScene.lipSyncAutoPending===true"),'warmup no longer requires explicit authorization');
console.log('v1.9.62 existing-source auto-sync migration regression: PASS');
