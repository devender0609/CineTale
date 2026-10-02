import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('./app.js', import.meta.url),'utf8');
assert.match(src,/APP_VERSION\s*=\s*'1\.12\.4'/,'build must be v1.12.4');
assert.match(src,/stage'?,?\s*'inflight-sync-found|syncDiag\('inflight-sync-found'/,'must trace in-flight sync collisions');
assert.match(src,/const joined=await existing/,'explicit retry must wait for existing background sync task');
assert.match(src,/inflight-sync-finished-for-retry/,'must trace retry after background task finishes');
assert.match(src,/\['PENDING','PROCESSING','COMPLETED'\]\.includes\(providerState\)/,'saved pending/completed provider generation must be resumable by generation id');
assert.match(src,/resumable-job-found/,'must trace recovered provider job');
assert.match(src,/gate-submit-disabled/,'must trace pre-submit early return');
assert.match(src,/gate-other-scene-processing/,'must trace provider-slot gate');
assert.match(src,/gate-source-provenance-failed/,'must trace source-provenance gate');
assert.match(src,/sourceRuntime=sceneMediaRuntimeUrl\(scene,'source'\)[\s\S]*canonicalMediaUrl\(sourceRuntime\|\|\(sceneSourceMediaHydrationPending\(scene\)\?'':scene\.videoUrl/,'studio source must be canonicalized and must not remount a stale provider URL while durable media is hydrating');

// Exercise the exact duplicated-origin repair algorithm independently of the browser app shell.
function canonicalMediaUrl(value='', origin='https://cine-tale.vercel.app'){
  let raw=String(value||'').trim();if(!raw)return '';
  if(/^(?:blob:|data:)/i.test(raw))return raw;
  origin=String(origin||'').replace(/\/+$/,'');
  if(origin){let guard=0;while(raw.startsWith(origin)&&/^https?:\/\//i.test(raw.slice(origin.length))&&guard++<4)raw=raw.slice(origin.length)}
  const firstMatch=raw.match(/^https?:\/\//i);
  if(firstMatch){const firstLen=firstMatch[0].length,rest=raw.slice(firstLen),rel=rest.search(/https?:\/\//i);if(rel>=0)raw=rest.slice(rel)}
  const glued=raw.match(/^(https?:\/\/[^/?#]+)(https?:\/\/.+)$/i);if(glued)raw=glued[2];
  try{return new URL(raw,origin||undefined).href}catch{return raw}
}
assert.equal(canonicalMediaUrl('https://cine-tale.vercel.apphttps://cine-tale.vercel.app/abc'),'https://cine-tale.vercel.app/abc');
assert.equal(canonicalMediaUrl('/api/video-file?x=1'),'https://cine-tale.vercel.app/api/video-file?x=1');
assert.equal(canonicalMediaUrl('blob:https://cine-tale.vercel.app/abc'),'blob:https://cine-tale.vercel.app/abc');
assert.equal(canonicalMediaUrl(''),'');
console.log('v1.10.20 live pre-submit regression PASS');
