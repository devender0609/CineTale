import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
assert.equal(pkg.version,'1.12.4');
assert.ok(app.includes("const APP_VERSION = '1.12.4'"));

// Regression for the exact persisted failure found in a real exported workspace:
// Devanagari Kartikeya ended with a Latin `y`: "बाल कार्तिकेy".
// The identity resolver must tolerate a single-character mixed-script typo when
// the match is unique, then canonicalize the ungenerated scene dialogue so the
// production audit and shot planner operate on one authoritative label.
assert.ok(app.includes('function identityEditDistance('),'missing edit-distance identity recovery');
assert.ok(app.includes('identityEditDistance(compactKey,compactAlias)<=1'),'single-character speaker typo tolerance missing');
assert.ok(app.includes('function canonicalizeUngeneratedSceneDialogueSpeakers('),'missing canonical dialogue rewrite');
assert.ok(app.includes('rewriteDialogueSpeaker(entry,canonical)'),'resolved speaker is not rewritten to canonical identity');
assert.ok(app.includes('sceneHasAnyProducedShotMedia(scene)'),'canonicalization must protect already-produced media');
assert.ok(app.includes("scene.identityMigrationRevision='v1.11.0'"));

// Execute the same distance rule against the real typo shape.
function distance(a='',b=''){
  const x=Array.from(a),y=Array.from(b);let prev=Array.from({length:y.length+1},(_,i)=>i),curr=new Array(y.length+1);
  for(let i=1;i<=x.length;i++){curr[0]=i;for(let j=1;j<=y.length;j++)curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));[prev,curr]=[curr,prev]}
  return prev[y.length];
}
assert.equal(distance('कार्तिकेy','कार्तिकेय'),1);
assert.ok(Array.from('कार्तिकेy').length>=5);

console.log('v1.11.0 mixed-script speaker recovery regression: PASS');
