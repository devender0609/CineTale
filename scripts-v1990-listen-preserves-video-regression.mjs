import fs from 'node:fs';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const a=app.indexOf('function sceneVideoMarkup'),b=app.indexOf('function fitSceneVideoToSurface',a),markup=app.slice(a,b),unfinished=markup.slice(markup.indexOf('if(speaking&&!isMountedSynced)'),markup.lastIndexOf('return `<video controls'));
assert.match(unfinished,/scene-source-preview[\s\S]*data-sync-gated=\"1\"/,'unsynchronized source must stay visibly mounted as a visual-only preview');
assert.doesNotMatch(unfinished,/Visual ready|Finish dialogue/,'Listen must not rely on a message card in place of the video');
assert.match(app,/async function listenScene\(i,button\)\{[\s\S]*?playSceneAudio\(p,s\)/,'Listen must preview approved audio independently');
assert.doesNotMatch(app,/async function listenScene\(i,button\)\{[\s\S]{0,1500}?renderStudio\(/,'Listen must not remount Studio or remove the visual source');
console.log('v1.10.9 Listen-preserves-visual regression passed');
