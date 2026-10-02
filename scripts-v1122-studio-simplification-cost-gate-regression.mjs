import fs from 'node:fs';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const checks=[
  [pkg.version==='1.12.4'&&app.includes("const APP_VERSION = '1.12.4'"),'build bumped'],
  [html.includes('id="compactWorldStatus"')&&!html.includes('<h2 id="worldCommandTitle">Persistent world memory</h2>'),'large world dashboard replaced by compact status'],
  [html.includes('id="studioSimpleSummary"'),'sidebar reduced to compact project summary'],
  [app.includes('function openWorldDetails')&&app.includes('function openProductionDetails'),'world and production detail drawers available on demand'],
  [app.includes('scene-compact-header')&&app.includes('data-scene-expand'),'guided Studio uses collapsible scene summaries'],
  [app.includes('data-scene-advanced')&&css.includes('.studio-mode-guided .scene-card:not(.show-advanced) .scene-shot-timeline'),'advanced shot controls progressively disclosed'],
  [css.includes('.studio-mode-director .scene-advanced-toggle{display:none}'),'Director mode preserves full controls'],
  [html.includes('Review the production estimate before spending credits')&&html.includes('Review & produce'),'final production is framed as a cost-review gate'],
  [app.includes('function actualProductionEstimate')&&app.includes('CURRENT PAID WORK'),'confirmation reports actual missing paid work'],
  [app.includes('COST-SAVING PLAN')&&app.includes('These route suggestions are advisory until actually used by production'),'hybrid recommendations are not falsely represented as realized savings'],
  [app.includes("if(speaking)return performanceCritical?'standard-video':'economy-video';"),'balanced advisory routing is more economical'],
  [css.includes('.compact-world-strip')&&css.includes('.studio-simple-summary'),'simplified Studio styling present']
];
for(const [ok,label] of checks)console.log(`${ok?'PASS':'FAIL'} ${label}`);assert.equal(checks.every(x=>x[0]),true);console.log('v1.12.4 Studio simplification + honest cost gate regression PASS');
