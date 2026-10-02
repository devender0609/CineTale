import assert from 'node:assert/strict';import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'));
const start=app.indexOf('function sceneVideoMarkup'),end=app.indexOf('function fitSceneVideoToSurface',start),markup=app.slice(start,end),unfinished=markup.slice(markup.indexOf('if(speaking&&!isMountedSynced)'),markup.lastIndexOf('return `<video controls'));
assert.match(unfinished,/<video controls playsinline[^>]*muted[^>]*scene-source-preview/,'unfinished speaking source must remain a controllable visual preview');
assert.doesNotMatch(unfinished,/Visual ready|Finish dialogue/,'video surface must have no status copy');
assert.match(markup,/<video controls playsinline preload="metadata" class="scene-video-element"/,'validated synchronized/non-speaking media must retain native controls');assert.match(markup,/data-lip-sync-ready="1"/);
console.log('v1.10.9 media-control interactivity regression PASS');
