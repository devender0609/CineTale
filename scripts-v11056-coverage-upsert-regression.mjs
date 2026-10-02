import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));
assert.ok(app.includes('function upsertCoverageEntry(target,shotId,patch={})'));
assert.ok(app.includes("target.coverageClips=clips.filter(c=>c?.shotId!==shotId);target.coverageClips.push(merged)"));
assert.ok(app.includes("upsertCoverageEntry(target,shot.id,{order:shot.order,startSec:Number(shot.startSec)||0"));
assert.ok(!app.includes("target.coverageClips.push({shotId:shot.id,order:shot.order,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,operation:d.operation"));
assert.ok(app.includes('const matches=coverageClips(scene).filter(x=>x?.shotId===shotId)'));
assert.ok(app.includes("if(x?.operation)n+=60"));
// Model the recovered-shot retry that failed in v1.10.55: stale entry exists, new operation must replace it, not append a duplicate.
function choose(clips,shotId){const m=clips.filter(x=>x?.shotId===shotId);const score=x=>(x.videoUrl?100:0)+(x.operation?60:0)+(Number(x.queuedAt||0)/1e12);return m.reduce((b,x)=>score(x)>=score(b)?x:b,m[0]);}
function upsert(target,shotId,patch){const clips=Array.isArray(target.coverageClips)?target.coverageClips:[],existing=choose(clips,shotId)||{},merged={...existing,...patch,shotId};target.coverageClips=clips.filter(c=>c?.shotId!==shotId);target.coverageClips.push(merged);return merged;}
const target={coverageClips:[{shotId:'shot-1',operation:null,error:'Video needs retry',failedAt:'2026-10-01T20:00:00Z'}]};
upsert(target,'shot-1',{operation:'operations/new-render',queuedAt:123,error:null,failedAt:null});
assert.equal(target.coverageClips.length,1);
assert.equal(target.coverageClips[0].operation,'operations/new-render');
assert.equal(choose(target.coverageClips,'shot-1').operation,'operations/new-render');
console.log('v1.11.0 duplicate-safe coverage upsert regression: PASS');
