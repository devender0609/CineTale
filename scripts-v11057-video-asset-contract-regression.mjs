import assert from 'node:assert/strict';
import handler from './api/video-status.js';

function responseCapture(){
  const out={statusCode:200,headers:{},body:null};
  return {
    out,
    res:{
      setHeader(k,v){out.headers[String(k).toLowerCase()]=v},
      status(code){out.statusCode=code;return this},
      json(body){out.body=body;return this},
      end(body){out.body=body;return this},
    }
  };
}
async function run(providerBody){
  const oldFetch=global.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-key';
  global.fetch=async()=>({ok:true,status:200,json:async()=>providerBody});
  const {out,res}=responseCapture();
  try{await handler({method:'GET',query:{operation:'operations/test-op'}},res);return out}
  finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey}
}
const official=await run({done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/official1:download?alt=media'}}]}}});
assert.equal(official.body.status,'ready');
assert.match(official.body.videoUrl,/official1/);

const sdk=await run({done:true,response:{generatedVideos:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/sdk1:download?alt=media'}}]}});
assert.equal(sdk.body.status,'ready');

// Current Google File contract: downloadable generated files may expose downloadUri.
const downloadUri=await run({done:true,response:{generatedVideos:[{video:{downloadUri:'https://generativelanguage.googleapis.com/v1beta/files/download1:download?alt=media'}}]}});
assert.equal(downloadUri.body.status,'ready');
assert.match(downloadUri.body.videoUrl,/download1/);

// A downloadable file object/name is also accepted by the SDK download surface.
const resourceName=await run({done:true,response:{generatedVideos:[{video:{name:'files/name1',mimeType:'video/mp4'}}]}});
assert.equal(resourceName.body.status,'ready');
assert.match(decodeURIComponent(resourceName.body.videoUrl),/files\/name1:download\?alt=media/);

const resultEnvelope=await run({done:true,result:{generatedVideos:[{video:{downloadUri:'https://generativelanguage.googleapis.com/v1beta/files/result1:download?alt=media'}}]}});
assert.equal(resultEnvelope.body.status,'ready');

const noAsset=await run({done:true,response:{generateVideoResponse:{generatedSamples:[]}}});
assert.equal(noAsset.body.status,'error');
assert.equal(noAsset.body.errorCode,'VIDEO_ASSET_MISSING');
assert.equal(noAsset.body.terminal,true);

const pending=await run({done:false});
assert.equal(pending.body.status,'processing');
assert.equal(pending.body.done,false);

console.log('v1.11.0 video asset response-contract regression: PASS');
