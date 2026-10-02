import assert from 'node:assert/strict';
import fs from 'node:fs';
import statusHandler from './api/video-status.js';
import {sceneToPrompt,providerSafeStyle,videoIdentitySafetyPacket} from './api/video-job.js';

function responseCapture(){
  const out={statusCode:200,headers:{},body:null};
  return {out,res:{setHeader(k,v){out.headers[String(k).toLowerCase()]=v},status(code){out.statusCode=code;return this},json(body){out.body=body;return this},end(body){out.body=body;return this}}};
}
async function runStatus(providerBody){
  const oldFetch=global.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-key';
  global.fetch=async()=>({ok:true,status:200,json:async()=>providerBody});
  const {out,res}=responseCapture();
  try{await statusHandler({method:'GET',query:{operation:'models/veo-3.1-fast-generate-preview/operations/test-op'}},res);return out.body}
  finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey}
}

const project={
  title:'कैलाश का बुझा दीप',
  format:'Episode',
  style:'cinematic photorealistic live-action look, natural skin and fabric texture, believable lighting',
  characters:[
    {name:'बाल कार्तिकेय',role:'divine child',age:'child',appearance:'youthful mythological child deity',wardrobe:'red uttariya',sacredIdentity:'Kartikeya'},
    {name:'माता पार्वती',role:'divine mother',age:'adult',appearance:'radiant mother goddess',wardrobe:'red-gold sari',sacredIdentity:'Parvati'}
  ],
  worldBible:{storyArchitecture:{dramaticSpine:'A compassionate mystery on Kailash.'}}
};
const scene={
  title:'माता पार्वती का संकेत',
  visual:'A devotional family conversation in a mythological fantasy setting.',
  framing:'safe',
  coverageShot:{id:'scene-2-shot-2',order:2,kind:'speaking-medium',speaker:'बाल कार्तिकेय',speaking:true,spokenLine:'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?',purpose:'On-camera performance',visual:'बाल कार्तिकेय asks माता पार्वती a question.',durationSec:6}
};
const prompt=sceneToPrompt(scene,project);
assert.match(prompt,/wholly original synthetic character design/i);
assert.match(prompt,/not an identifiable real person/i);
assert.match(prompt,/traditional sacred or mythological story identities/i);
assert.match(prompt,/not requests to portray any real actor or public figure/i);
assert.match(prompt,/cinematic realistic fantasy/i);
assert.doesNotMatch(prompt,/photorealistic live-action/i);
assert.match(providerSafeStyle(project.style),/original synthetic faces/i);
assert.match(videoIdentitySafetyPacket(project),/No real-person likeness is requested or required/i);

const likeness=await runStatus({done:true,response:{generateVideoResponse:{generatedSamples:[],raiMediaFilteredReasons:["Sorry, we can't create videos with real people's names or likenesses. Please remove the celebrity reference and try again."]}}});
assert.equal(likeness.status,'error');
assert.equal(likeness.done,true);
assert.equal(likeness.terminal,true);
assert.equal(likeness.errorCode,'VIDEO_REAL_PERSON_LIKENESS_FILTER');
assert.equal(likeness.retryable,true);
assert.equal(likeness.requiresPromptAdjustment,true);
assert.match(likeness.error,/safer original-character prompt/i);

const genericFilter=await runStatus({done:true,response:{generateVideoResponse:{generatedSamples:[],raiMediaFilteredReasons:['Generated media was filtered.']}}});
assert.equal(genericFilter.errorCode,'VIDEO_PROVIDER_POLICY_FILTER');
assert.equal(genericFilter.retryable,false);

const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.ok(app.includes("code==='VIDEO_REAL_PERSON_LIKENESS_FILTER'"));
assert.ok(app.includes('safer original-character prompt'));
assert.ok(app.includes("code==='VIDEO_PROVIDER_POLICY_FILTER'"));

console.log('v1.11.0 provider-policy-safe video prompt regression: PASS');
