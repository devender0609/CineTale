import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html'), app=read('app.js'), css=read('styles.css');
const files=[];
(function walk(dir){for(const name of fs.readdirSync(dir)){if(['.git','node_modules'].includes(name))continue;const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory())walk(p);else files.push(p)}})(root);

const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate static HTML ids detected');
const dynamicIds=[...app.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const knownIds=new Set([...ids,...dynamicIds]);
const dollarRefs=[...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m=>m[1]);
const missingIds=[...new Set(dollarRefs.filter(id=>!knownIds.has(id)))];
assert.deepEqual(missingIds,[],`Static/dynamic DOM id references missing: ${missingIds.join(', ')}`);

const viewIds=new Set([...html.matchAll(/<section[^>]+class=["'][^"']*\bview\b[^"']*["'][^>]+id=["']([^"']+)["']/g)].map(m=>m[1]));
const viewTargets=[...new Set([...html.matchAll(/data-view=["']([^"']+)["']/g)].map(m=>m[1]))];
for(const v of viewTargets) assert.ok(viewIds.has(v),`data-view target has no matching view section: ${v}`);

const apiRefs=[...new Set([...app.matchAll(/["'`]\/api\/([A-Za-z0-9_-]+)/g)].map(m=>m[1]))];
for(const name of apiRefs) assert.ok(fs.existsSync(path.join(root,'api',`${name}.js`)),`Missing API route for /api/${name}`);

const localRefs=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]).filter(x=>!x.startsWith('http')&&!x.startsWith('#')&&!x.startsWith('data:')&&!x.startsWith('mailto:'));
for(const ref of localRefs){const clean=ref.split(/[?#]/)[0].replace(/^\.\//,'');if(clean)assert.ok(fs.existsSync(path.join(root,clean)),`Missing local asset: ${ref}`)}

const mergeMarkers=['<<'+'<<<<<','==='+'====','>>'+'>>>>>'];
for(const f of files.filter(x=>/\.(js|mjs)$/.test(x))){const t=fs.readFileSync(f,'utf8');assert.ok(!mergeMarkers.some(m=>t.includes(m)),`Merge marker found in ${path.relative(root,f)}`)}
assert.ok((css.match(/{/g)||[]).length===(css.match(/}/g)||[]).length,'CSS brace count mismatch');
assert.ok(html.includes('id="storyReviewPanel"')&&html.includes('id="approveFullStory"'),'Story Review UI missing');
assert.ok(app.includes('function requireApprovedStory')&&app.includes("requireApprovedStory('create the final video')"),'Story approval production gate incomplete');
assert.ok(!html.includes('Provider-limit protection')&&!html.includes('protect provider limits'),'Creator-facing provider-limit jargon present');
assert.ok(!app.includes('Provider-limit protection · next clip in'),'Creator-facing provider-limit pacing jargon present in app');
assert.ok(app.includes('function openPortraitSetup')&&app.includes('id=\"portraitStyle\"'),'Portrait setup workflow missing');
assert.ok(app.includes('Generate alternative')&&app.includes('portraitAppearance')&&app.includes('portraitBackground'),'Portrait customization controls missing');
assert.ok(css.includes('.portrait-setup-head')&&css.includes('.portrait-setup-thumb'),'Portrait setup responsive styling missing');
assert.ok(app.includes('data-scene-framing')&&app.includes('setSceneFraming'),'Safe framing UI wiring missing');
assert.ok(css.includes('.scene-production-controls'),'Safe framing control styling missing');

console.log(`CineTale deep QA passed: ${ids.length} static IDs, ${dollarRefs.length} DOM refs, ${apiRefs.length} API routes, ${localRefs.length} local assets, ${files.length} files checked.`);
