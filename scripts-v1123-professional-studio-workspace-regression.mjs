import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const checks=[
 ['build bumped',()=>assert.equal(pkg.version,'1.12.4')],
 ['story review gains approved state',()=>assert.match(app,/panel\.classList\.toggle\('is-approved'/)],
 ['studio gains story pending gate',()=>assert.match(app,/classList\.toggle\('story-pending',productionLocked\)/)],
 ['pending story hides production workspace',()=>assert.match(css,/#studioContent\.story-pending \.compact-world-strip,#studioContent\.story-pending \.studio-layout\{display:none!important\}/)],
 ['approved story collapses',()=>assert.match(css,/\.story-review\.is-approved \.story-review-text/)],
 ['guided storyboard action exists',()=>assert.match(app,/data-scene-guided-art/)],
 ['guided storyboard action bound',()=>assert.match(app,/data-scene-guided-art.*generateScene/s)],
 ['scene workspace uses restrained two-column layout',()=>assert.match(css,/\.scene-card\.studio-scene-open \.scene-expanded-body\{display:grid!important;grid-template-columns:minmax\(230px,34%\)/)],
 ['technical scene controls hidden until advanced',()=>assert.match(css,/\.studio-mode-guided \.scene-card:not\(\.show-advanced\) \.scene-shot-timeline/)],
 ['final empty player suppressed',()=>assert.match(css,/\.final-output-stage:not\(\.has-final-video\).*\.final-video-placeholder\{display:none!important\}/s)],
 ['final UI tracks final-video state',()=>assert.match(app,/stage\?\.classList\.toggle\('has-final-video'/)],
 ['cache bust uses current build',()=>{assert.match(html,/styles\.css\?v=1\.12\.4/);assert.match(html,/app\.js\?v=1\.12\.4/)}],
];
let pass=0;
for(const [name,fn] of checks){try{fn();pass++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1}}
console.log(`CineTale v1.12.4 professional Studio regression: ${pass}/${checks.length} passed.`);
if(pass!==checks.length)process.exit(1);
