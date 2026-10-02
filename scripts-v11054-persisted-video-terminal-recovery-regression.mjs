import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8');
const api=fs.readFileSync('api/video-status.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const recovery=app.slice(app.indexOf('async function reconcilePersistedVideoJobsOnOpen'),app.indexOf('async function finishSceneClip'));
const checks=[
  ['version bumped',pkg.version==='1.12.4'&&app.includes("const APP_VERSION = '1.12.4'")],
  ['status fetch bypasses caches',app.includes("cache:'no-store'")&&app.includes("'cache-control':'no-cache'")&&app.includes('cacheBust')],
  ['status api forbids caching',api.includes("Cache-Control','no-store, no-cache")&&api.includes("Surrogate-Control','no-store")],
  ['persisted project recovery scans all episodes',app.includes('async function reconcilePersistedVideoJobsOnOpen(projectId)')&&app.includes('for(const ep of project.episodes||[])')],
  ['terminal primary jobs release generation lock',app.includes("t.videoOperation=null;t.videoQueuedAt=null;t.videoError=videoUserFailureMessage(terminalError)")],
  ['terminal recovery runs automatically on load',app.includes('queueMicrotask(reconcileAllPersistedVideoJobs);')],
  ['recovery does not auto-submit paid render',!recovery.includes("apiPost('/api/video-job'")],
  ['active or recovering jobs block duplicate paid submission',app.includes("videoCooldownSeconds(scene)>0||Boolean(scene.videoOperation)||sceneVideoAction")],
  ['ready recovery requires actual asset',app.includes("if(d.status==='ready'&&d.videoUrl){")&&app.includes('claimCompletedPrimaryVideo')&&app.includes('commitPrimarySceneVideo')],
  ['poll timeout preserves existing paid job',app.includes('kept the existing render job so another paid request cannot start accidentally')&&!app.includes('pending job was released so it will not appear to render forever')],
  ['saved status verification failure preserves operation',app.includes('existing job is preserved so another paid request cannot start accidentally')],
  ['coverage ready jobs recover on project open',recovery.includes("if(d.status==='ready'&&d.videoUrl){")&&recovery.includes('persistCoverageMediaUrl')],
];
let bad=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++}
if(bad)process.exit(1);
