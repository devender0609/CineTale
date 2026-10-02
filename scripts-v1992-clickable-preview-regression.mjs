import fs from 'node:fs';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');const css=fs.readFileSync(new URL('./styles.css', import.meta.url),'utf8');const html=fs.readFileSync(new URL('./index.html', import.meta.url),'utf8');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"),'version');assert.ok(html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'),'cache bust');
const a=app.indexOf('function sceneVideoMarkup'),b=app.indexOf('function fitSceneVideoToSurface',a),markup=app.slice(a,b),unfinished=markup.slice(markup.indexOf('if(speaking&&!isMountedSynced)'),markup.lastIndexOf('return `<video controls'));
assert.match(unfinished,/<video controls playsinline[^>]*muted[^>]*scene-source-preview/,'unfinished speaking visual must remain a clickable visual-only player');assert.doesNotMatch(unfinished,/Visual ready|Finish dialogue/,'preview must have no message overlay');assert.match(css,/\.scene-video-element\{/,'video styling must exist');
console.log('v1.10.9 unambiguous visual-preview regression PASS');
