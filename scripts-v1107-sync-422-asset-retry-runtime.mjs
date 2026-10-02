import assert from 'node:assert/strict';
import handler from './api/lipsync-job.js';
process.env.ENABLE_LIVE_LIPSYNC='true';
process.env.LIPSYNC_PROVIDER='sync-labs';
process.env.SYNC_API_KEY='sync-test-key';
process.env.SYNC_LIPSYNC_MODEL='sync-3';
const videoBytes=new Uint8Array(2_820_000).fill(7);
const audioBytes=Buffer.from('RIFF0000WAVEfmt data','utf8');
const audioDataUrl='data:audio/wav;base64,'+audioBytes.toString('base64');
let generateCount=0,assetPresigns=0,assetRegisters=0;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);
  if(u==='https://owned.example/source.mp4')return new Response(videoBytes,{status:200,headers:{'content-type':'video/mp4','content-length':String(videoBytes.length)}});
  if(u==='https://api.sync.so/v2/generations')return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  if(u==='https://api.sync.so/v2/generate'){
    generateCount++;
    if(generateCount===1){
      assert.ok(opts.body instanceof FormData);
      const options=JSON.parse(opts.body.get('options'));
      assert.deepEqual(options,{sync_mode:'silence',active_speaker_detection:{auto_detect:true}});
      return new Response(JSON.stringify({detail:'multipart validation rejected'}),{status:422,headers:{'content-type':'application/json'}});
    }
    assert.equal(opts.headers['content-type'],'application/json');
    const body=JSON.parse(opts.body);
    assert.equal(body.model,'sync-3');
    assert.equal(body.input.length,2);
    assert.equal(body.input[0].type,'video');
    assert.equal(body.input[1].type,'audio');
    assert.ok(body.input[0].assetId&&body.input[1].assetId);
    assert.deepEqual(body.options,{sync_mode:'silence',active_speaker_detection:{auto_detect:true}});
    assert.match(opts.headers['Idempotency-Key'],/-asset$/);
    return new Response(JSON.stringify({id:'gen_asset_retry_1',status:'PENDING'}),{status:201,headers:{'content-type':'application/json'}});
  }
  if(u==='https://api.sync.so/v2/assets/upload'){
    assetPresigns++;
    const req=JSON.parse(opts.body);
    return new Response(JSON.stringify({uploadUrl:`https://uploads.example/${assetPresigns}`,url:`https://assets.sync.so/uploads/${assetPresigns}/${req.fileName}`,expiresIn:3600}),{status:201,headers:{'content-type':'application/json'}});
  }
  if(u.startsWith('https://uploads.example/'))return new Response('',{status:200});
  if(u==='https://api.sync.so/v2/assets'){
    assetRegisters++;
    const req=JSON.parse(opts.body);
    return new Response(JSON.stringify({id:req.type==='VIDEO'?'asset_video_retry':'asset_audio_retry'}),{status:201,headers:{'content-type':'application/json'}});
  }
  throw new Error('Unexpected fetch '+u);
};
const req={method:'POST',headers:{},body:{videoUrl:'https://owned.example/source.mp4',audioDataUrl,submissionKey:'retry422'}};
let statusCode=0,payload=null;const res={status(n){statusCode=n;return this},json(v){payload=v;return this}};
await handler(req,res);
assert.equal(statusCode,200);
assert.equal(payload.status,'queued');
assert.equal(payload.requestId,'gen_asset_retry_1');
assert.equal(payload.transport,'asset-json-retry');
assert.equal(generateCount,2);
assert.equal(assetPresigns,2);
assert.equal(assetRegisters,2);
console.log('v1.10.9 Sync Labs 422 -> assetId JSON retry runtime regression PASS');
