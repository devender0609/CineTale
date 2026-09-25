import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalFetch=globalThis.fetch;
const originalKey=process.env.GEMINI_API_KEY;
const originalTextModel=process.env.GEMINI_TEXT_MODEL;
const originalImageModel=process.env.GEMINI_IMAGE_MODEL;
const originalOpenAIKey=process.env.OPENAI_API_KEY;

try{
  process.env.GEMINI_API_KEY='test-key';
  process.env.GEMINI_TEXT_MODEL='gemini-2.5-flash';
  process.env.GEMINI_IMAGE_MODEL='gemini-3.1-flash-image';

  const {generateWithGemini,createImage,createImageWithMeta}=await import('./lib/ai.js');
  const {normalizePlan}=await import('./api/generate-plan.js');

  const storyCalls=[];
  globalThis.fetch=async (url,opts)=>{
    storyCalls.push(String(url));
    if(String(url).includes('gemini-3.8-flash')){
      const plan={title:'Jaipur Test',logline:'A hidden key opens a family mystery.',characters:[{name:'Asha'}],episodes:[{number:1,title:'The Key',storyText:"Asha discovers a brass key hidden inside her grandmother's trunk. The key opens a sealed room in the family haveli, where letters reveal that a forgotten promise divided two branches of the family. Asha follows the clues across the old courtyard, confronts the relative who hid the truth, and chooses to return the letters to everyone instead of keeping the secret. By sunset, the family finally understands what happened and the locked room is opened for good.",scenes:[{number:1,title:'The Trunk',dialogue:[{speaker:'Asha',text:'This key was hidden on purpose.'}]}]}]};
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected story URL: ${url}`);
  };

  const rawPlan=await generateWithGemini('test story');
  assert.equal(rawPlan.title,'Jaipur Test');
  assert.equal(rawPlan.__cinetaleGeminiModel,'gemini-3.8-flash');
  assert.equal(storyCalls.length,1);
  assert.match(storyCalls[0],/gemini-3\.8-flash/);
  const normalized=normalizePlan(rawPlan,{idea:'Jaipur mystery'},'ai');
  assert.deepEqual(normalized.episodes[0].scenes[0].dialogue,['Asha: This key was hidden on purpose.']);

  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/\/v1\/models\/gemini-3\.1-flash-image:generateContent$/);
    const body=JSON.parse(opts.body);
    assert.deepEqual(body.generationConfig,{responseModalities:['TEXT','IMAGE'],responseFormat:{image:{aspectRatio:'16:9',imageSize:'1K'}}});
    assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');
    assert.equal(body.contents[0].parts[1].inlineData.data,'QUJD');
    return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/jpeg',data:'QUJD'}}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  assert.equal(await createImage('test storyboard','16:9',['data:image/png;base64,QUJD']),'data:image/jpeg;base64,QUJD');

  // v1.9.15 integrated visual routing: when both providers are configured, the
  // same live-verifiable OpenAI route is used first so an exhausted Gemini quota
  // cannot block real scene generation.
  process.env.OPENAI_API_KEY='test-openai-key';
  let routeCalls=0;
  globalThis.fetch=async (url,opts)=>{
    routeCalls++;
    assert.match(String(url),/api\.openai\.com\/v1\/images\/generations$/);
    assert.equal(opts.headers.authorization,'Bearer test-openai-key');
    return new Response(JSON.stringify({data:[{b64_json:'T1BFTkFJ'}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const routedImage=await createImageWithMeta('real scene storyboard','16:9',[],'standard');
  assert.equal(routedImage.image,'data:image/png;base64,T1BFTkFJ');assert.equal(routedImage.provider,'openai');assert.equal(routedImage.providerRoute,'primary');assert.equal(routeCalls,1);

  // A higher-quality OpenAI request that receives a quota/rate-limit response
  // retries once at low quality on the same verified provider before falling back.
  let qualityCalls=0;
  globalThis.fetch=async (url,opts)=>{
    qualityCalls++;
    assert.match(String(url),/api\.openai\.com\/v1\/images\/generations$/);
    const body=JSON.parse(opts.body);
    if(qualityCalls===1){assert.equal(body.quality,'medium');return new Response(JSON.stringify({error:{message:'rate limit reached'}}),{status:429,headers:{'content-type':'application/json'}})}
    assert.equal(body.quality,'low');
    return new Response(JSON.stringify({data:[{b64_json:'TE9XUkVUUlk='}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const lowRetry=await createImageWithMeta('quota resilient scene','16:9',[],'standard');
  assert.equal(lowRetry.image,'data:image/png;base64,TE9XUkVUUlk=');assert.equal(lowRetry.provider,'openai');assert.equal(lowRetry.quality,'low');assert.equal(qualityCalls,2);

  // Reference-photo/identity-preserving art uses the same OpenAI provider route.
  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/api\.openai\.com\/v1\/images\/edits$/);assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('model'),'gpt-image-2');assert.ok(opts.body.get('image') instanceof Blob);
    return new Response(JSON.stringify({data:[{b64_json:'UkVGUk9VVEU='}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const referenceRoute=await createImageWithMeta('reference-preserving portrait','1:1',['data:image/png;base64,QUJD'],'standard');
  assert.equal(referenceRoute.image,'data:image/png;base64,UkVGUk9VVEU=');assert.equal(referenceRoute.provider,'openai');assert.equal(referenceRoute.providerRoute,'primary');
  delete process.env.OPENAI_API_KEY;

  // Project creation integration: flexible cast size and persisted original idea.
  let planPrompt='';
  globalThis.fetch=async (url,opts)=>{
    if(String(url).includes('gemini-2.5-flash')) return new Response(JSON.stringify({error:{message:'model not found'}}),{status:404,headers:{'content-type':'application/json'}});
    if(String(url).includes('gemini-3.8-flash')){
      const body=JSON.parse(opts.body);planPrompt=body.contents?.[0]?.parts?.[0]?.text||'';
      const plan={title:'Flexible Cast',logline:'Four friends solve a coastal mystery.',characters:[1,2,3,4].map(i=>({name:`C${i}`})),episodes:[{number:1,title:'Pilot',storyText:"Four friends discover a weathered chart inside a coastal boathouse and realize it marks a dangerous channel that no longer appears on modern maps. They disagree about whether to investigate, but when an incoming storm threatens a fishing family, they follow the chart, uncover the remains of an old signal station, and restore its lamp just in time to guide the boat home. The mystery ends with the friends understanding why the channel was erased and deciding to preserve the station's history together.",scenes:[{number:1,title:'Start',dialogue:['C1: Go.']}]}]};
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected plan URL: ${url}`);
  };
  const {default:planHandler}=await import('./api/generate-plan.js');
  let planStatus=0,planPayload=null;const planRes={status(code){planStatus=code;return this},json(value){planPayload=value;return value}};
  await planHandler({method:'POST',body:{idea:'Baby Goddess Durga protects a Himalayan village.',castSize:'4',genre:'Mythology + Devotional Story',language:'Hindi',languageScope:'entire-story',culturalTreatment:'reverent-devotional',languageDirection:'Entire story in Hindi; sacred chants may remain Sanskrit',duration:'2–3 minutes'}},planRes);
  assert.equal(planStatus,200);assert.equal(planPayload.plan.characters.length,4);assert.equal(planPayload.plan.castSize,'4');assert.equal(planPayload.plan.idea,'Baby Goddess Durga protects a Himalayan village.');assert.equal(planPayload.plan.languageScope,'entire-story');assert.equal(planPayload.plan.culturalTreatment,'reverent-devotional');assert.match(planPrompt,/Create exactly 4 recurring characters/);assert.match(planPrompt,/LANGUAGE SCOPE: Entire story/);assert.match(planPrompt,/Do not silently switch back to English/);assert.match(planPrompt,/reverent devotional treatment/i);assert.match(planPrompt,/unrelated ordinary person/i);

  // v1.9.15 live anti-repetition repair: a new project that reuses a recent
  // character/title is regenerated rather than accepted as a superficial template clone.
  let diversityPass=0;
  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/gemini-3\.8-flash/);
    const body=JSON.parse(opts.body),text=body.contents?.[0]?.parts?.[0]?.text||'';
    diversityPass++;
    const reused={title:'Silver Gelatin',logline:'A familiar archive mystery.',characters:[{name:'Maya Lin'}],episodes:[{number:1,title:'The Negative Space',storyText:'Maya Lin enters an old archive after receiving a coded map. She follows a trail through storage rooms and discovers a concealed ledger that changes what she believed about the building. The mystery escalates when the map points to a sealed stairwell, forcing her to choose between exposing the institution and protecting someone who trusted her. By the end, she reveals the truth publicly, preserves the evidence, and leaves with a changed understanding of the place and her own role in it.',scenes:[{number:1,title:'Archive',dialogue:['Maya Lin: This feels familiar.']}]}]};
    const fresh={title:'Salt Wind Radio',logline:'A teen boat mechanic intercepts a weather transmission from a decommissioned island station.',characters:[{name:'Nia Okafor'}],worldBible:{premise:'A working harbor town during an off-season storm.'},episodes:[{number:1,title:'Frequency Nine',storyText:'Nia Okafor repairs marine radios at her aunt’s harbor workshop when a silent emergency channel suddenly carries a transmission dated three days in the future. Rather than chasing a family secret, she traces the signal through tide gauges, ferry relays, and a decommissioned island weather station. A rival apprentice joins her reluctantly, and their technical disagreement becomes the key to decoding the broadcast. They discover the message is an automated forecast loop triggered by an unstable sensor network, not a supernatural prophecy. As the real storm arrives, Nia uses the decoded pattern to redirect two fishing boats away from a collapsing breakwater. The station is shut down safely, the false mystery is resolved, and Nia earns the harbor master’s trust through practical judgment rather than destiny.',scenes:[{number:1,title:'Dead Channel',dialogue:['Nia Okafor: That timestamp cannot be right.']}]}]};
    const plan=/DIVERSITY REPAIR PASS/.test(text)?fresh:reused;
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  planStatus=0;planPayload=null;
  await planHandler({method:'POST',body:{idea:'A teen hears an impossible radio signal near the ocean.',storySource:'idea',format:'Story',duration:'',genre:'Mystery',language:'English',diversityContext:[{title:'Silver Gelatin',characters:['Maya Lin'],logline:'A girl discovers an impossible photograph in a family archive.',world:'An old family property and archive.',episodeTitles:['The Negative Space'],storySignature:'Maya searches an archive, follows hidden evidence, and uncovers a family-linked mystery.'}]}},planRes);
  assert.equal(planStatus,200);assert.equal(planPayload.plan.title,'Salt Wind Radio');assert.equal(planPayload.plan.characters[0].name,'Nia Okafor');assert.ok(diversityPass>=2,'Anti-repetition repair pass did not run');

  // v1.9.5 format/runtime integrity: Story must remain standalone and 5-minute targets stay 5 minutes.
  const storyPlan=normalizePlan({title:'Standalone Test',logline:'A complete mystery.',characters:[{name:'Maya'}],episodes:[{number:1,title:'The Photograph',storyText:Array.from({length:675},(_,i)=>`word${i}`).join(' '),scenes:Array.from({length:5},(_,i)=>({number:i+1,title:`Beat ${i+1}`,durationSec:30,dialogue:['Maya: We keep going.']}))}]},{idea:'A family photograph changes each night.',format:'Story',duration:'5 minutes'},'ai');
  assert.equal(storyPlan.format,'Story');assert.equal(storyPlan.requestedFormat,'Story');assert.equal(storyPlan.targetRuntimeSec,300);assert.equal(storyPlan.episodes[0].unitKind,'Story');assert.equal(storyPlan.episodes[0].storyWordCount,675);assert.equal(storyPlan.episodes[0].scenes.reduce((sum,x)=>sum+x.durationSec,0),300);

  // Image quota handling must be a real failure; do not disguise it as preview art.
  globalThis.fetch=async ()=>new Response(JSON.stringify({error:{message:'RESOURCE_EXHAUSTED: quota exceeded'}}),{status:429,headers:{'content-type':'application/json'}});
  const {default:imageHandler}=await import('./api/generate-image.js');
  let imageStatus=0,imagePayload=null;const imageRes={status(code){imageStatus=code;return this},json(value){imagePayload=value;return value}};
  await imageHandler({method:'POST',body:{prompt:'test',label:'Quota test',aspect:'16:9'}},imageRes);
  assert.equal(imageStatus,429);assert.equal(imagePayload.errorCode,'VISUAL_QUOTA');assert.match(imagePayload.error,/Visual generation limit reached/);assert.equal(imagePayload.image,undefined);

  // v1.9.15 exact API-route regression: /api/generate-image must use the live-
  // verifiable OpenAI path when both keys exist, without first spending a Gemini call.
  process.env.OPENAI_API_KEY='route-openai-key';process.env.GEMINI_API_KEY='route-gemini-key';
  let routeApiCalls=0;imageStatus=0;imagePayload=null;
  globalThis.fetch=async (url,opts)=>{routeApiCalls++;assert.match(String(url),/api\.openai\.com\/v1\/images\/generations$/);return new Response(JSON.stringify({data:[{b64_json:'Uk9VVEVPSw=='}]}),{status:200,headers:{'content-type':'application/json'}})};
  await imageHandler({method:'POST',body:{prompt:'real scene route test',label:'Scene',aspect:'16:9',quality:'standard'}},imageRes);
  assert.equal(imageStatus,200);assert.equal(imagePayload.mode,'ai');assert.equal(imagePayload.provider,'openai');assert.equal(imagePayload.image,'data:image/png;base64,Uk9VVEVPSw==');assert.equal(routeApiCalls,1);

  // The exact API route also survives a medium-tier 429 when the same provider can
  // complete a low-tier request, so users do not see a false quota dead-end.
  let routeQualityCalls=0;imageStatus=0;imagePayload=null;
  globalThis.fetch=async (url,opts)=>{routeQualityCalls++;const body=JSON.parse(opts.body);if(routeQualityCalls===1){assert.equal(body.quality,'medium');return new Response(JSON.stringify({error:{message:'rate limit'}}),{status:429,headers:{'content-type':'application/json'}})}assert.equal(body.quality,'low');return new Response(JSON.stringify({data:[{b64_json:'Uk9VVEVMT1c='}]}),{status:200,headers:{'content-type':'application/json'}})};
  await imageHandler({method:'POST',body:{prompt:'real scene quality fallback',label:'Scene',aspect:'16:9',quality:'standard'}},imageRes);
  assert.equal(imageStatus,200);assert.equal(imagePayload.provider,'openai');assert.equal(imagePayload.quality,'low');assert.equal(routeQualityCalls,2);
  delete process.env.OPENAI_API_KEY;process.env.GEMINI_API_KEY='test-key';

  // If optional image formatting is rejected, createImage retries minimal config.
  let compatibilityCalls=0;
  globalThis.fetch=async (url,opts)=>{
    compatibilityCalls++;
    const body=JSON.parse(opts.body);
    if(compatibilityCalls===1){
      assert.ok(body.generationConfig.responseFormat);
      return new Response(JSON.stringify({error:{message:'Image delivery mode is not supported.'}}),{status:400,headers:{'content-type':'application/json'}});
    }
    assert.deepEqual(body.generationConfig,{responseModalities:['TEXT','IMAGE']});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'REVG'}}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  assert.equal(await createImage('compatibility retry','16:9',[],'standard'),'data:image/png;base64,REVG');
  assert.equal(compatibilityCalls,2);

  // A persistent Gemini request-shape failure must return an error, not preview art.
  globalThis.fetch=async ()=>new Response(JSON.stringify({error:{message:'Image delivery mode is not supported.'}}),{status:400,headers:{'content-type':'application/json'}});
  imageStatus=0;imagePayload=null;
  await imageHandler({method:'POST',body:{prompt:'test',label:'Compatibility test',aspect:'16:9'}},imageRes);
  assert.equal(imageStatus,502);assert.equal(imagePayload.errorCode,'VISUAL_REQUEST');assert.doesNotMatch(imagePayload.error,/quota|limit reached/i);assert.match(imagePayload.error,/did not substitute preview artwork/i);assert.equal(imagePayload.image,undefined);

  // Voice transcription fallback: browsers without SpeechRecognition can record audio and use server transcription.
  const {default:transcribeHandler}=await import('./api/transcribe.js');
  const oldElevenKey=process.env.ELEVENLABS_API_KEY; process.env.ELEVENLABS_API_KEY='test-eleven-key';
  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/elevenlabs\.io\/v1\/speech-to-text$/);
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers['xi-api-key'],'test-eleven-key');
    return new Response(JSON.stringify({text:'A boy finds a letter written by his future self.'}),{status:200,headers:{'content-type':'application/json'}});
  };
  let trStatus=0,trPayload=null;const trRes={status(code){trStatus=code;return this},json(value){trPayload=value;return value}};
  await transcribeHandler({method:'POST',body:{audio:'data:audio/webm;base64,QUJD',mimeType:'audio/webm'}},trRes);
  assert.equal(trStatus,200);assert.equal(trPayload.text,'A boy finds a letter written by his future self.');
  // Gemini audio fallback keeps voice input available when ElevenLabs is not configured.
  delete process.env.ELEVENLABS_API_KEY;
  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/gemini-3\.8-flash:generateContent/);
    const body=JSON.parse(opts.body);assert.equal(body.contents[0].parts[1].inlineData.mimeType,'audio/webm');assert.equal(body.contents[0].parts[1].inlineData.data,'QUJD');
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Recorded fallback transcript.'}]}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  trStatus=0;trPayload=null;await transcribeHandler({method:'POST',body:{audio:'data:audio/webm;codecs=opus;base64,QUJD',mimeType:'audio/webm;codecs=opus'}},trRes);
  assert.equal(trStatus,200);assert.equal(trPayload.text,'Recorded fallback transcript.');
  if(oldElevenKey===undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldElevenKey;

  // Natural character audio: Eleven v3 receives performance tags/context and falls back cleanly to multilingual v2.
  const oldTtsKey=process.env.ELEVENLABS_API_KEY, oldDefaultVoice=process.env.ELEVENLABS_DEFAULT_VOICE_ID, oldTtsModel=process.env.ELEVENLABS_TTS_MODEL, oldNarratorVoice=process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  process.env.ELEVENLABS_API_KEY='tts-test-key';process.env.ELEVENLABS_DEFAULT_VOICE_ID='voice-default';process.env.ELEVENLABS_TTS_MODEL='eleven_v3';process.env.ELEVENLABS_NARRATOR_VOICE_ID='voice-narrator';
  const {default:ttsHandler}=await import('./api/tts.js');
  const {default:voicesHandler}=await import('./api/voices.js');
  let ttsCalls=[];
  globalThis.fetch=async (url,opts)=>{
    ttsCalls.push({url:String(url),body:JSON.parse(opts.body)});
    const body=ttsCalls.at(-1).body;assert.equal(body.model_id,'eleven_v3');assert.equal(body.language_code,'en');assert.match(body.text,/^\[softly\] \[curious\]/);assert.equal(body.voice_settings,undefined);
    return new Response(new Uint8Array([1,2,3,4]),{status:200,headers:{'content-type':'audio/mpeg'}});
  };
  let ttsStatus=0,ttsPayload=null;const ttsRes={status(code){ttsStatus=code;return this},json(value){ttsPayload=value;return value}};
  await ttsHandler({method:'POST',body:{text:'Grandpa... what is this?',voiceId:'voice-zoya',kind:'dialogue',direction:'quiet, curious and natural',language:'English',speakerProfile:'15-year-old; restrained'}},ttsRes);
  assert.equal(ttsStatus,200);assert.equal(ttsPayload.mode,'ai');assert.equal(ttsPayload.model,'eleven_v3');assert.equal(ttsPayload.voiceId,'voice-zoya');assert.match(ttsPayload.audio,/^data:audio\/mpeg;base64,/);

  let fallbackCall=0;
  globalThis.fetch=async (url,opts)=>{
    fallbackCall++;const body=JSON.parse(opts.body);
    if(fallbackCall===1){assert.equal(body.model_id,'eleven_v3');return new Response(JSON.stringify({detail:{message:'model unavailable'}}),{status:422,headers:{'content-type':'application/json'}})}
    assert.equal(body.model_id,'eleven_multilingual_v2');assert.equal(body.text,'We should go now.');assert.equal(body.voice_settings.stability,.38);assert.equal(body.voice_settings.similarity_boost,.78);assert.equal(body.voice_settings.speed,1.04);
    return new Response(new Uint8Array([5,6]),{status:200,headers:{'content-type':'audio/mpeg'}});
  };
  ttsStatus=0;ttsPayload=null;await ttsHandler({method:'POST',body:{text:'We should go now.',voiceId:'voice-zoya',kind:'dialogue',direction:'urgent, breathless',language:'English'}},ttsRes);
  assert.equal(ttsStatus,200);assert.equal(ttsPayload.model,'eleven_multilingual_v2');assert.equal(fallbackCall,2);

  globalThis.fetch=async (url,opts)=>{
    assert.match(String(url),/elevenlabs\.io\/v2\/voices/);assert.equal(opts.headers['xi-api-key'],'tts-test-key');
    return new Response(JSON.stringify({voices:[{voice_id:'voice-zoya',name:'Maya',category:'premade',labels:{gender:'female',age:'young'}},{voice_id:'voice-narrator',name:'Story Narrator',category:'premade',labels:{use_case:'narration'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  let voiceStatus=0,voicePayload=null;const voiceRes={status(code){voiceStatus=code;return this},json(value){voicePayload=value;return value}};
  await voicesHandler({method:'GET'},voiceRes);assert.equal(voiceStatus,200);assert.equal(voicePayload.mode,'ai');assert.equal(voicePayload.narratorVoiceId,'voice-narrator');assert.equal(voicePayload.voices[0].labels.age,'young');assert.equal(voicePayload.voices[0].meta.age,'Young adult');assert.equal(voicePayload.voices[0].meta.presentation,'Feminine');assert.equal(voicePayload.voices[1].meta.use,'Narration');

  const {default:dialogueHandler}=await import('./api/dialogue.js');
  globalThis.fetch=async (url,opts)=>{
    assert.equal(String(url),'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128');
    const body=JSON.parse(opts.body);assert.equal(body.model_id,'eleven_v3');assert.equal(body.language_code,'en');assert.equal(body.inputs.length,2);assert.equal(body.inputs[0].voice_id,'voice-zoya');assert.equal(body.inputs[1].voice_id,'voice-grandpa');assert.match(body.inputs[0].text,/\[softly\]/);assert.match(body.inputs[0].text,/\[nervous\]/);
    return new Response(new Uint8Array([7,8,9]),{status:200,headers:{'content-type':'audio/mpeg'}});
  };
  let diaStatus=0,diaPayload=null;const diaRes={status(code){diaStatus=code;return this},json(value){diaPayload=value;return value}};
  await dialogueHandler({method:'POST',body:{language:'English',turns:[{text:'Grandpa... what is this?',voiceId:'voice-zoya',direction:'quiet and uneasy'},{text:'You found it.',voiceId:'voice-grandpa',direction:'reflective and warm'}]}},diaRes);
  assert.equal(diaStatus,200);assert.equal(diaPayload.mode,'ai');assert.match(diaPayload.audio,/^data:audio\/mpeg;base64,/);

  // v1.9.13 live voice verification must prove both catalog access and actual TTS permission.
  const {default:verifyVoiceHandler}=await import('./api/verify-voice.js');
  let verifyVoiceCall=0;globalThis.fetch=async (url,opts)=>{
    verifyVoiceCall++;
    if(String(url).includes('/v2/voices'))return new Response(JSON.stringify({voices:[{voice_id:'voice-narrator',name:'Story Narrator'}]}),{status:200,headers:{'content-type':'application/json'}});
    assert.match(String(url),/text-to-speech\/voice-narrator/);const body=JSON.parse(opts.body);assert.equal(body.text,'CineTale voice check.');assert.equal(body.model_id,'eleven_v3');return new Response(new Uint8Array(256).fill(7),{status:200,headers:{'content-type':'audio/mpeg'}});
  };
  let vvStatus=0,vvPayload=null;const vvRes={status(code){vvStatus=code;return this},json(value){vvPayload=value;return value}};
  await verifyVoiceHandler({method:'POST',body:{}},vvRes);assert.equal(vvStatus,200);assert.equal(vvPayload.ok,true);assert.equal(vvPayload.model,'eleven_v3');assert.equal(vvPayload.voiceId,'voice-narrator');assert.equal(verifyVoiceCall,2);
  if(oldTtsKey===undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldTtsKey;
  if(oldDefaultVoice===undefined) delete process.env.ELEVENLABS_DEFAULT_VOICE_ID; else process.env.ELEVENLABS_DEFAULT_VOICE_ID=oldDefaultVoice;
  if(oldTtsModel===undefined) delete process.env.ELEVENLABS_TTS_MODEL; else process.env.ELEVENLABS_TTS_MODEL=oldTtsModel;
  if(oldNarratorVoice===undefined) delete process.env.ELEVENLABS_NARRATOR_VOICE_ID; else process.env.ELEVENLABS_NARRATOR_VOICE_ID=oldNarratorVoice;

  let nextPrompt='', nextRequestBody=null;
  globalThis.fetch=async (url,opts)=>{
    if(String(url).includes('gemini-2.5-flash')) return new Response(JSON.stringify({error:{message:'model not found'}}),{status:404,headers:{'content-type':'application/json'}});
    if(String(url).includes('gemini-3.8-flash')){
      nextRequestBody=JSON.parse(opts.body);nextPrompt=nextRequestBody.contents?.[0]?.parts?.[0]?.text||'';
      const episode={number:2,title:'The Third Tape',synopsis:'The mystery deepens.',storyText:'Kiran replays the mysterious tape and hears a warning that was not present the first time. The message points toward a family storage room that has been locked for years. With the earlier clues still unresolved, Kiran convinces the family to open it and discovers a third cassette beside an old photograph. The new tape reveals that the warnings were recorded by someone who knew the family intimately. By the end of the episode, Kiran understands that the mystery is tied to the family history rather than a random experiment, and chooses to keep investigating despite the danger.',scenes:[{number:1,title:'Playback',dialogue:[{speaker:'Kiran',text:'Play it again.'}],visual:'Kiran replays the tape.'}]};
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(episode)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected next-episode URL: ${url}`);
  };
  const {default:nextHandler}=await import('./api/generate-next.js');
  let nextStatus=0,nextPayload=null;
  const nextRes={status(code){nextStatus=code;return this},json(value){nextPayload=value;return value}};
  await nextHandler({method:'POST',body:{requestId:'request-123',project:{title:'Tape Mystery',logline:'A predictive tape.',genre:'Mystery + Sci-Fi',audience:'13+',language:'English + Malayalam',languageDirection:'Narration in English; family dialogue in Malayalam',continuityStrength:'strict',characters:[{name:'Kiran',appearance:'wavy black hair',locked:true}],episodes:[{number:1,title:'Tape One',synopsis:'The first warning.'},{number:2,title:'Tape Two A',synopsis:'A branch.'},{number:2,title:'Tape Two B',synopsis:'Another branch.'}]}}},nextRes);
  assert.equal(nextStatus,200);
  assert.equal(nextPayload.episode.number,3,'Next episode should use max episode number + 1, not array length or returned model number');
  assert.equal(nextPayload.episode.id,'ep_request-123');
  assert.deepEqual(nextPayload.episode.scenes[0].dialogue,['Kiran: Play it again.']);
  assert.match(nextPrompt,/Narration in English; family dialogue in Malayalam/);
  assert.match(nextPrompt,/Mystery \+ Sci-Fi/);

  const appSource=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const htmlSource=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const cssSource=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
  const aiSource=fs.readFileSync(new URL('./lib/ai.js',import.meta.url),'utf8');
  assert.ok(appSource.includes('function openPortraitSetup'),'Portrait setup modal is missing');
  assert.ok(appSource.includes('portraitStyleOptions'),'Portrait style chooser is missing');
  assert.ok(appSource.includes('Generate alternative'),'Portrait alternative flow is missing');
  assert.ok(appSource.includes('image-generation quota'),'Portrait quota confirmation copy is missing');
  assert.ok(cssSource.includes('.portrait-setup'),'Portrait setup styling is missing');

  for(const label of ['Cinematic Realistic','3D Animated','2D Animated','Anime','Illustrated / Storybook','Devotional Art','Sacred Cinematic','Watercolor','Graphic Novel','Clay / Stop-motion Inspired','Custom']) assert.ok(htmlSource.includes(label),`Missing visual style option: ${label}`);
  for(const genre of ['Mystery','Thriller','Suspense','Crime','Detective','Sci-Fi','Fantasy','Adventure','Action','Family Drama','Romantic Comedy','Dark Comedy','Psychological','Period Drama','Political Drama','Coming-of-Age','Heist','Spy / Espionage','Mythology','Sacred Legend','Mythological Adventure','Devotional Story','Folklore','Indian Family Drama','Indian Mythology','Partition-era Drama','Regional Cultural Story']) assert.ok(appSource.includes(`'${genre}'`),`Missing genre preset: ${genre}`);
  for(const language of ['English','Spanish','French','German','Portuguese','Italian','Arabic','Mandarin Chinese','Japanese','Korean','Hindi','Urdu','Bengali','Punjabi','Gujarati','Marathi','Tamil','Telugu','Kannada','Malayalam','Odia','Assamese','Nepali','Sanskrit','Konkani','Sindhi','Kashmiri','Bhojpuri','Maithili','Rajasthani','Dogri','Manipuri / Meitei','Spanish','French','Arabic','Persian / Farsi','Mandarin Chinese','Cantonese','Japanese','Korean','Thai','Vietnamese','Swahili']) assert.ok(appSource.includes(`'${language}'`),`Missing language preset: ${language}`);
  assert.ok(htmlSource.includes('id="genrePickerButton"'),'Genre multi-picker missing');
  assert.ok(htmlSource.includes('id="languagePickerButton"'),'Language multi-picker missing');
  assert.ok(appSource.includes('openMultiPicker'),'Searchable multi-picker logic missing');
  assert.ok(appSource.includes('pickerAddCustom'),'Custom genre/language support missing');
  assert.ok(htmlSource.includes('id="languageDirection"'),'Mixed-language direction field missing');
  assert.ok(htmlSource.includes('id="languageScope"'),'Language scope control missing');
  assert.ok(htmlSource.includes('id="culturalTreatment"'),'Cultural / sacred treatment control missing');
  assert.ok(htmlSource.includes('Entire story in selected language(s)'),'Entire-story language scope option missing');
  assert.ok(htmlSource.includes('Reverent / Devotional'),'Reverent devotional treatment option missing');
  assert.ok(htmlSource.includes('id="continuityStrength"'),'Character continuity control missing');
  assert.ok(htmlSource.includes('id="castSize"'),'Flexible cast size control missing');
  assert.ok(htmlSource.includes('id="editStorySetup"'),'Edit story setup action missing');
  assert.ok(htmlSource.includes('id="saveSetupOnly"'),'Non-destructive setup save missing');
  assert.ok(htmlSource.includes('id="runtimeLabel"')&&htmlSource.includes('target runtime'),'Clear target-runtime label missing');
  assert.ok(htmlSource.includes('nav-indicator'),'Moving navigation indicator missing');
  assert.ok(appSource.includes('startEditSetup'),'Project setup editor logic missing');
  assert.ok(appSource.includes('updateNavIndicator'),'Navigation motion logic missing');
  assert.ok(appSource.includes('Visual generation limit reached for now') || fs.readFileSync(new URL('./api/generate-image.js',import.meta.url),'utf8').includes('Visual generation limit reached for now'),'Quota-friendly image message missing');
  assert.ok(appSource.includes('portraitReferenceEntries'),'Named storyboard reference continuity missing');
  assert.ok(appSource.includes('STRICT IDENTITY LOCK'),'Strict continuity prompt missing');
  assert.ok(appSource.includes('episodeLockKey'),'Cross-tab episode lock missing');
  assert.ok(appSource.includes('state.episodeCreating'),'Rapid-click episode guard missing');
  assert.ok(appSource.includes('deleteEpisode'),'Episode delete support missing');
  assert.ok(appSource.includes('renameEpisode'),'Episode rename support missing');
  assert.ok(appSource.includes('duplicateEpisodeDraft'),'Episode duplicate-as-draft support missing');
  assert.ok(appSource.includes('culturalPrompt'),'Cultural visual prompt layer missing');
  assert.ok(appSource.includes('activeEpisodeId'),'Stable episode identity missing');
  assert.ok(htmlSource.includes('owner-only'),'Owner/user settings separation missing');
assert.ok(htmlSource.includes('system-health-card')&&!htmlSource.includes('setting-card owner-only" style="display:none"><h3>System health'),'System Health should be directly visible in Settings');
assert.ok(appSource.includes('resolveOwnerAccess')&&appSource.includes('/api/owner-status'),'Authenticated owner access resolution missing');
  assert.ok(appSource.includes("get('owner')==='1'"),'Owner mode URL gate missing');
  assert.ok(cssSource.includes('.picker-options'),'Picker styling missing');
  assert.ok(appSource.includes('audioPreviewCache'),'Repeat audio cache missing');
  assert.ok(appSource.includes('Generating natural voice…'),'Audio latency feedback missing');
  assert.ok(cssSource.includes('position:static!important'),'Non-overlapping Studio management menu fix missing');
  assert.ok(htmlSource.includes('id="accountButton"'),'Creator account header control missing');
  assert.ok(htmlSource.includes('id="projectSearch"')&&htmlSource.includes('id="projectStatusFilter"')&&htmlSource.includes('id="projectSort"'),'Project organization controls missing');
  assert.ok(htmlSource.includes('id="exportWorkspaceBtn"')&&htmlSource.includes('id="importWorkspaceBtn"'),'Workspace backup controls missing');
  assert.ok(htmlSource.includes('id="clearLocalDataBtn"')&&!htmlSource.includes('id="clearLibraryBtn"'),'Destructive clear-data control must live in Settings, not Library');
  assert.ok(appSource.includes('openAccountModal')&&appSource.includes('supabaseAuth'),'Optional creator authentication flow missing');
  assert.ok(appSource.includes('duplicateProject')&&appSource.includes('archiveProject')&&appSource.includes('deleteProject'),'Project management actions missing');
  assert.ok(appSource.includes('exportWorkspace')&&appSource.includes('importWorkspaceFile'),'Workspace backup logic missing');
  assert.ok(appSource.includes('duplicateSavedStory'),'Saved-story duplicate action missing');
  const authApi=fs.readFileSync(new URL('./api/auth-config.js',import.meta.url),'utf8');
  assert.ok(authApi.includes('SUPABASE_URL')&&authApi.includes('SUPABASE_ANON_KEY'),'Auth configuration endpoint missing');


  // Navigation/tab integrity: every data-view target in the primary nav/settings controls must have a section.
  const sectionIds=new Set([...htmlSource.matchAll(/<section[^>]+id="([^"]+)"/g)].map(m=>m[1]));
  const viewTargets=[...htmlSource.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]);
  for(const target of viewTargets) assert.ok(sectionIds.has(target),`data-view target has no section: ${target}`);
  const ids=[...htmlSource.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
  assert.deepEqual([...new Set(duplicates)],[],`Duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);

  // v1.4.1 UX and sacred-identity hardening.
  const primaryNav=htmlSource.match(/<nav class="nav"[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok(!primaryNav.includes('data-view="characters"'),'Characters should be contextual, not a duplicate primary nav tab');
  assert.ok(!primaryNav.includes('data-view="episodes"'),'Episodes should be contextual, not a duplicate primary nav tab');
  assert.ok(primaryNav.includes('data-view="create"')&&primaryNav.includes('data-view="projects"')&&primaryNav.includes('data-view="studio"')&&primaryNav.includes('data-view="library"'),'Streamlined primary navigation is incomplete');
  assert.ok(htmlSource.includes('data-view="characters">Cast & characters<')&&htmlSource.includes('id="studioEpisodesBtn"')&&htmlSource.includes('data-view="episodes">Episodes<'),'Studio contextual project managers missing');
  assert.ok(htmlSource.includes('id="workflow"')&&htmlSource.includes('id="nextStepCard"'),'Guided workflow progress/action missing');
  assert.ok(!/<button class="workflow-step/.test(htmlSource),'Workflow progress must not behave like a second set of action tabs');
  assert.ok(appSource.includes('sacredFigureGuidance'),'Sacred figure visual guidance missing');
  assert.ok(appSource.includes('This character is the Hindu goddess Parvati'),'Parvati deity fidelity guidance missing');
  assert.ok(appSource.includes('CLEAN PORTRAIT ONLY'),'No-label portrait protection missing');
  assert.ok(appSource.includes('sacredReferenceReady'),'Legacy sacred portrait refresh protection missing');
  const planApi=fs.readFileSync(new URL('./api/generate-plan.js',import.meta.url),'utf8');
  assert.ok(planApi.includes('entityType,sacredIdentity,representationMode,canonicalVisualCues[]'),'Sacred identity metadata schema missing');
  assert.ok(planApi.includes('Mata Parvati')&&planApi.includes('must not be described merely as an ordinary woman'),'Sacred parent-role preservation rule missing');


  // v1.5.6 cast, sacred representation, and expanded voice library.
  assert.ok(htmlSource.includes('id="sacredRepresentation"'),'Sacred figure representation control missing');
  assert.ok(htmlSource.includes('Visible divine character')&&htmlSource.includes('Traditional mythological depiction'),'Sacred representation options incomplete');
  assert.ok(appSource.includes('data-delete-character')&&appSource.includes('function deleteCharacter'),'Cast removal workflow missing');
  assert.ok(appSource.includes('cfEntityType')&&appSource.includes('cfSacredIdentity')&&appSource.includes('cfRepresentationMode'),'Character sacred-identity override controls missing');
  assert.ok(appSource.includes('voiceFilterBar')&&appSource.includes('bindVoiceFilters'),'Expanded searchable voice library missing');
  assert.ok(appSource.includes('Accent / region')&&appSource.includes('Age feel')&&appSource.includes('Voice presentation'),'Voice filters incomplete');
  assert.ok(appSource.includes('VOICE_FILTER_PRESETS')&&appSource.includes("'Indian / South Asian'")&&appSource.includes("'Mandarin / Mainland China'"),'World-aware voice filter presets missing');
  assert.ok(appSource.includes("opts('Language','Language')"),'Voice language filter missing');
  assert.ok(appSource.includes('No exact voice matches every selected filter.')&&appSource.includes('Closest available'),'Precise voice zero-match fallback state missing');
  assert.ok(appSource.includes('setVoicePreviewState')&&appSource.includes('setVoiceSelectedState'),'Voice preview/selected interaction states missing');
  assert.ok(appSource.includes('Tone / style'),'Voice tone/style filter missing');
  assert.ok(appSource.includes('Clear all'),'Voice clear-filter control missing');
  assert.ok(appSource.includes('voiceLanguageName'),'Human-readable voice language normalization missing');
  assert.ok(appSource.includes("GENRE_PRESETS=[")&&appSource.includes("].sort((a,b)=>a.localeCompare(b));"),'Alphabetical genre/language ordering missing');
  assert.ok(appSource.includes("if(key==='age')")&&appSource.includes("return values.sort((a,b)=>a.localeCompare(b))"),'Semantic/alphabetical voice filter ordering missing');
  assert.ok(appSource.includes('closestRows')&&appSource.includes('voice-closest-badge'),'Ranked voice fallback matches missing');
  assert.ok(appSource.includes('voiceAccentDirection')&&appSource.includes('narratorAccentDirection'),'Accent/regional direction persistence missing');
  assert.ok(planApi.includes('SACRED FIGURE REPRESENTATION')&&planApi.includes('visible-divine'),'Story planner sacred representation instruction missing');
  assert.ok(planApi.includes('CREATIVE INTELLIGENCE RULE')&&planApi.includes('generic Western/English defaults'),'Smart project-context inference rule missing');
  assert.ok(planApi.includes('Do not infer a person\'s accent merely from ethnicity'),'Accent inference safeguard missing');
  assert.ok(htmlSource.includes('Story basics')&&htmlSource.includes('Creative direction')&&htmlSource.includes('Cast & continuity'),'Organized Create sections missing');
  assert.ok(htmlSource.includes('Usage & limits')&&htmlSource.includes('No app-level daily cap'),'Usage/limits explanation missing');
  assert.ok(planApi.includes('2-5 recurring MAIN characters'),'Smarter Auto cast rule missing');
  assert.ok(planApi.includes('Incidental/background people may appear without becoming permanent cast')||planApi.includes('Incidental people can appear in scenes without becoming permanent cast')||planApi.includes('Do not promote incidental shopkeepers'),'Incidental cast protection missing');
  assert.ok(planApi.includes('MUST NOT change the story output language'),'Selected-language enforcement missing');
  assert.ok(htmlSource.includes('class="create-section create-section-advanced advanced-details"'),'Advanced controls should be collapsible by default');
  assert.ok(htmlSource.includes('id="nextStepCard"')&&htmlSource.includes('id="nextStepAction"'),'Guided recommended-next action missing');
  assert.ok(appSource.includes('function renderUsage')&&appSource.includes('function bumpUsage'),'Usage-metering foundation missing');
  assert.ok(cssSource.includes('.next-step-card')&&cssSource.includes('.studio-manage-menu'),'Streamlined premium Studio styling missing');
  assert.ok(htmlSource.includes('Preschool · 3–5')&&htmlSource.includes('Family / All ages')&&htmlSource.includes('Young Adult'),'Expanded audience options missing');
  assert.ok(planApi.includes('AUDIENCE: ${audience}')&&planApi.includes('emotional intensity'),'Audience behavior instruction missing');
  assert.ok(htmlSource.includes('Generation quality')&&!htmlSource.includes('<div class="legend"><span><i class="dot draft"></i>Draft'),'Legacy unexplained quality legend should be removed');
  assert.ok(appSource.includes('data-scene-tier')&&appSource.includes('Premium / Cinematic'),'Per-scene quality control missing');
  const imageApi=fs.readFileSync(new URL('./api/generate-image.js',import.meta.url),'utf8');
  const aiLib=fs.readFileSync(new URL('./lib/ai.js',import.meta.url),'utf8');
  assert.ok(imageApi.includes("quality='standard'")&&aiLib.includes('GEMINI_IMAGE_MODEL_${q.toUpperCase()}'),'Quality-aware image routing foundation missing');
  assert.ok(appSource.includes('const FORMAT_CONFIG'),'Format-aware UI config missing');
  assert.ok(appSource.includes("Short:{title:'Short'")&&appSource.includes("Movie:{title:'Movie'"),'Short/Movie format configs missing');
  assert.ok(appSource.includes("Only Episode projects create a next episode"),'Client-side standalone continuation guard missing');
  assert.ok(planApi.includes('FORMAT: Short')&&planApi.includes('FORMAT: Story')&&planApi.includes('FORMAT: Movie'),'Server format-specific generation instructions missing');
  assert.ok(planApi.includes('Act I, Act II and Act III'),'Movie act structure missing');
  const nextApi=fs.readFileSync(new URL('./api/generate-next.js',import.meta.url),'utf8');
  assert.ok(nextApi.includes('Only Episode projects can create a next episode'),'Server next-episode format guard missing');
  assert.ok(htmlSource.includes('id="formatExplainer"'),'Format explainer missing');
  assert.ok(htmlSource.includes('id="storySourceTabs"')&&htmlSource.includes('Use my story'),'Creator-owned story source controls missing');
  assert.ok(htmlSource.includes('id="storyMicBtn"')&&htmlSource.includes('Start speaking'),'Voice story input control missing');
  assert.ok(appSource.includes('SpeechRecognition')&&appSource.includes('webkitSpeechRecognition'),'Browser speech transcription support missing');
  assert.ok(appSource.includes('MediaRecorder')&&appSource.includes('/api/transcribe'),'Cross-browser recorded speech fallback missing');
  assert.ok(htmlSource.includes('id="studioManageBtn"')&&htmlSource.includes('id="studioManageMenu"'),'Consolidated Studio manage menu missing');
  assert.ok(!htmlSource.includes('id="studioGenerateCharacters"')&&!htmlSource.includes('id="studioGenerateStoryboard"'),'Duplicate Studio asset action row should be removed');
  assert.ok(appSource.includes('storySource:state.storySource'),'Story source must be sent to generation API');
  assert.ok(planApi.includes("SOURCE MODE: CREATOR'S OWN STORY")&&planApi.includes('Treat their text as the source of truth'),'Full-story preservation prompt missing');
  assert.ok(planApi.includes('Do not conflate nationality, ethnicity, language or religion'),'Cross-cultural sensitivity rule missing');
  assert.ok(planApi.includes('Never fabricate scripture, ritual requirements, sacred symbols'),'Cultural accuracy guardrail missing');
  assert.ok(htmlSource.includes('id="runtimeLabel"')&&htmlSource.includes('id="unitLabel"'),'Format-aware Studio labels missing');
  assert.ok(htmlSource.includes('class="studio-hero surface"')&&htmlSource.includes('id="studioFormatChip"'),'Polished Studio hero metadata missing');
  assert.ok(htmlSource.includes('class="brand-lockup"')&&cssSource.includes('Fraunces'),'Premium brand typography refresh missing');
  assert.ok(!htmlSource.includes('<span class="status-dot"><i></i> Ready</span>'),'Low-value static Ready status should be removed');
  assert.ok(!htmlSource.includes('No provider names. No prompt engineering required.'),'Low-value provider/prompt footer copy should be removed');
  const ttsApi=fs.readFileSync(new URL('./api/tts.js',import.meta.url),'utf8');
  assert.ok(ttsApi.includes("ELEVENLABS_TTS_MODEL||'eleven_v3'")&&ttsApi.includes("'eleven_multilingual_v2'"),'Expressive Eleven v3 + multilingual fallback missing');
  assert.ok(ttsApi.includes('performanceTags')&&ttsApi.includes('Natural voice generation is temporarily unavailable'),'Context-aware natural TTS/failure behavior missing');
  const dialogueApi=fs.readFileSync(new URL('./api/dialogue.js',import.meta.url),'utf8');
  assert.ok(dialogueApi.includes('/v1/text-to-dialogue')&&dialogueApi.includes("model_id:'eleven_v3'"),'ElevenLabs multi-speaker dialogue endpoint missing');
  assert.ok(appSource.includes('ensureCharacterVoice')&&appSource.includes('ensureNarratorVoice'),'Persistent character/narrator voice assignment missing');
  assert.ok(appSource.includes('openSceneAudioEditor')&&appSource.includes('data-scene-edit'),'Editable scene dialogue/delivery controls missing');
  assert.ok(appSource.includes('sceneAudioDirection')&&appSource.includes('speakerProfile'),'Scene-context performance routing missing');
  assert.ok((appSource.includes("apiPost('/api/dialogue'")||appSource.includes("cachedAudioRequest('/api/dialogue'"))&&appSource.includes('playSceneAudio'),'Natural multi-speaker scene playback missing');
  assert.ok(planApi.includes('DIALOGUE QUALITY RULES')&&planApi.includes('Write for ACTORS'),'Natural dialogue generation rule missing');
  assert.ok(planApi.includes('audioDirection')&&planApi.includes('narrationStyle'),'Audio performance metadata schema missing');
  assert.ok(cssSource.includes('.dialogue-edit-btn'),'Subtle scene dialogue editor styling missing');

  // v1.5.3 creator voice studio: creator overrides, lock state and scene-level performance access.
  assert.ok(appSource.includes('VOICE_PERFORMANCE')&&appSource.includes('VOICE_PACE'),'Voice performance presets missing');
  assert.ok(appSource.includes('Voice Studio')&&appSource.includes('Use & lock')&&appSource.includes('Reset to Auto'),'Creator voice studio controls missing');
  assert.ok(appSource.includes('voiceLocked')&&appSource.includes('voicePerformance')&&appSource.includes('voicePace'),'Persistent voice preference fields missing');
  assert.ok(appSource.includes('sceneVoiceSummary')&&appSource.includes('data-scene-voice'),'Scene voice status/edit entry point missing');
  assert.ok(appSource.includes('Edit performance')&&appSource.includes('Save performance'),'Scene performance editor wording missing');
  assert.ok(cssSource.includes('.voice-studio')&&cssSource.includes('.scene-voice-chip')&&cssSource.includes('.voice-lock-state'),'Voice studio styling missing');

  // v1.5.5 Create polish + first-class narrator voice studio.
  assert.ok(htmlSource.includes('id="narratorVoiceBtn"')&&htmlSource.includes('Narrator voice'),'Narrator voice entry point missing');
  assert.ok(appSource.includes('openNarratorVoicePicker')&&appSource.includes('narratorVoiceDirection'),'Narrator Voice Studio logic missing');
  assert.ok(appSource.includes('narratorVoiceLocked')&&appSource.includes('narratorPerformance')&&appSource.includes('narratorPace'),'Persistent narrator preferences missing');
  assert.ok(appSource.includes('sceneNarratorVoice')&&appSource.includes('Reset to Auto'),'Scene performance narrator access missing');
  assert.ok(cssSource.includes('v1.5.5 — polished Create flow')&&cssSource.includes('.narrator-studio'),'Create/narrator polish styling missing');
  assert.ok(htmlSource.includes('Choose a spark or bring your full story')&&htmlSource.includes('refine recurring cast and identity consistency'),'Create helper-copy cleanup missing');

  // v1.6.1 live Veo 3.1 video stage.
  const videoApi=fs.readFileSync(new URL('./api/video-job.js',import.meta.url),'utf8');
  assert.ok(videoApi.includes("draft:{model:'veo-3.1-lite-generate-preview'")&&videoApi.includes('veo-3.1-fast-generate-preview')&&videoApi.includes('veo-3.1-generate-preview'),'Veo Lite/Fast/Cinematic quality-tier routing missing');
  assert.ok(videoApi.includes('durationSeconds')&&videoApi.includes('personGeneration'),'Veo duration/person-generation controls missing');
  assert.ok(videoApi.includes('durationSeconds:Number(cfg.duration)'),'Veo durationSeconds must be numeric');
  assert.ok(!videoApi.includes('numberOfVideos'),'Initial Veo request must not send unsupported numberOfVideos parameter');
  assert.ok(videoApi.includes("project.format==='Short'?'9:16'")&&videoApi.includes("'16:9'"),'Format-aware video aspect routing missing');
  assert.ok(videoApi.includes('NARRATION / ACTION SHOT')&&videoApi.includes('SPEAKING PERFORMANCE SHOT'),'Narration/dialogue visual-performance separation missing');
  assert.ok(videoApi.includes('hasKnownMinor')&&videoApi.includes("continuitySource:usingFirstFrame?'storyboard-first-frame':'text-continuity'"),'Minor-safe continuity routing missing');
  assert.ok(appSource.includes('Generate video clip')&&appSource.includes('Submitting…')&&appSource.includes('Rendering…')&&appSource.includes('Video rendering timed out'),'Responsive scene video-generation UX missing');
  assert.ok(appSource.includes("format:p.format")&&appSource.includes('culturalTreatment:p.culturalTreatment'),'Video request is missing format/cultural context');
  assert.ok(appSource.includes('videoPollers')&&appSource.includes('resumePendingVideoPolls')&&appSource.includes('attempt<4?6500:Math.min(15000,9000+attempt*250)'),'Background/adaptive video polling missing');
  assert.ok(appSource.includes('if(!scene||scene.videoOperation!==operation)return;')&&!appSource.includes('if(!scene||scene.videoUrl||scene.videoOperation!==operation)return;'),'Replacement-video polling must continue while an older videoUrl exists');
  assert.ok(appSource.includes('videoOperationConfirmed(s)?(art?')&&appSource.includes('Rendering replacement'),'Confirmed replacement renders must hide the stale/broken prior video');
  assert.ok(appSource.includes('Checking saved render…')&&appSource.includes('reconcileSavedVideoOperation')&&appSource.includes('VIDEO_RECOVERY_MAX_AGE_MS'),'Saved video operations must be verified before CineTale presents them as actively rendering');
  assert.ok(appSource.includes('primaryCoverageShot')&&appSource.includes('sceneForVideoShot')&&appSource.includes('videoPrimarySpeaking'),'Dialogue-first primary video-shot routing missing');
  assert.ok(appSource.includes('function sceneVideoMarkup')&&appSource.includes('preload=\"none\"')&&appSource.includes('poster='),'Ready scene videos must lazy-load instead of hammering /api/video-file on every render');
  assert.ok(!appSource.includes('muted playsinline preload=\"metadata\"'),'Library must not preload every generated video asset');
  assert.ok(videoApi.includes('temporary facial-performance guide')&&videoApi.includes('Dialogue timing target'),'Speaking-shot synchronized dialogue guidance missing');
  assert.ok(appSource.includes('videos[i].muted=!(useEmbeddedSyncedAudio&&i===0)')&&appSource.includes('useEmbeddedSyncedAudio&&i===0&&clipIndex===0?1:0')&&!appSource.includes('clipIndex%videos.length'),'Final mix must capture the authoritative synchronized primary audio exactly once and never loop generated clips');


  // v1.9.6 cinematic episode production.
  const productionLib=fs.readFileSync(new URL('./lib/production.js',import.meta.url),'utf8');
  assert.ok(productionLib.includes('buildCoveragePlan')&&productionLib.includes('coverageTargetCount')&&productionLib.includes('estimatedSpokenSeconds'),'Cinematic scene coverage planner missing');
  assert.ok(productionLib.includes('detectContinuityConflicts')&&appSource.includes('Continuity conflict needs review'),'Episode continuity guard missing');
  assert.ok(appSource.includes('ensureCinematicCoverage')&&appSource.includes('coverageClips')&&appSource.includes('atomic-synced-scenes-no-silent-padding'),'Multi-shot cinematic final production missing');
  assert.ok(appSource.includes('mediaAspectClass')&&cssSource.includes('.scene-visual.media-landscape')&&cssSource.includes('.scene-visual.media-portrait'),'Adaptive media containers missing');
  assert.ok(videoApi.includes('spokenLine')&&videoApi.includes('visible mouth, jaw and facial articulation'),'Speaking-shot visual performance prompt missing');
  const generateNextSource=fs.readFileSync(new URL('./api/generate-next.js',import.meta.url),'utf8');assert.ok(generateNextSource.includes('RUNTIME DISCIPLINE')&&generateNextSource.includes('90%-115%'),'Strict next-episode runtime guard missing');


  // v1.9.7 responsive portrait generation and immediate Cast refresh.
  assert.ok(appSource.includes('portraitJobs:new Map()')&&appSource.includes('setPortraitJob'),'Portrait in-progress state tracking missing');
  assert.ok(appSource.includes('showPortraitProgress')&&appSource.includes('elapsed · Portrait generation can take a little longer during provider load'),'Portrait elapsed-time progress feedback missing');
  assert.ok(appSource.includes('deferProjectPersistence')&&appSource.includes('renderAll();requestAnimationFrame'),'Portrait result must render before heavier persistence work');
  assert.ok(cssSource.includes('.portrait-job-overlay')&&cssSource.includes('.portrait-progress'),'Portrait busy-state styling missing');

  // v1.6.6 responsive creator workspace + My Stories library.
  assert.ok(htmlSource.includes('id="saveStoryDraft"')&&htmlSource.includes('Save to My Stories'),'Save-to-My-Stories control missing');
  assert.ok(htmlSource.includes('data-library-tab="stories"')&&htmlSource.includes('data-library-tab="characters"')&&htmlSource.includes('data-library-tab="media"')&&htmlSource.includes('data-library-tab="voices"'),'Library section tabs missing');
  assert.ok(appSource.includes('savedStoriesKey')&&appSource.includes('saveStoryDraftFromCreate')&&appSource.includes('loadSavedStory'),'Saved-story persistence/reuse logic missing');
  assert.ok(appSource.includes("libraryTab:'stories'")&&appSource.includes("tab==='voices'"),'Library tab rendering missing');
  assert.ok(cssSource.includes('v1.6.6 — responsive workspace')&&cssSource.includes('@media(max-width:430px)')&&cssSource.includes('.scene-card{display:grid!important;grid-template-columns:1fr!important'),'Responsive Studio mobile reflow missing');
  assert.ok(cssSource.includes('.library-tabs')&&cssSource.includes('.story-library-card'),'Creator Library styling missing');

  // v1.7.1 auth polish + scene action containment.
  assert.ok(appSource.includes('signInWithGoogle')&&appSource.includes('/auth/v1/authorize?'),'Google OAuth sign-in entry point missing');
  assert.ok(appSource.includes('requestPasswordReset')&&appSource.includes('recover?redirect_to='),'Password reset request flow missing');
  assert.ok(appSource.includes('openPasswordResetModal')&&appSource.includes("method:'PUT',token"),'Recovery password update flow missing');
  assert.ok(appSource.includes('restoreAuthFromUrl')&&appSource.includes('parseAuthHash'),'OAuth callback session restore missing');
  assert.ok(appSource.includes('refreshAuthIfNeeded')&&appSource.includes('grant_type=refresh_token'),'Auth refresh-token persistence missing');
  assert.ok(appSource.includes('authInline')&&appSource.includes('authErrorMessage'),'Inline account success/error feedback missing');
  assert.ok(appSource.includes('togglePasswordVisibility')&&appSource.includes('Continue with Google'),'Auth usability controls missing');
  assert.ok(cssSource.includes('v1.7.1 — account polish')&&cssSource.includes('.google-auth-btn')&&cssSource.includes('.auth-message.success'),'Account polish styling missing');
  assert.ok(cssSource.includes('grid-template-columns:minmax(0,1fr) minmax(190px,280px)'),'Desktop scene action containment missing');
  assert.ok(cssSource.includes('.scene-action-buttons button:nth-child(3){grid-column:1/-1}'),'Tablet/mobile scene control wrap missing');

  // v1.8.0 single-file final video + action typography consistency.
  assert.ok(htmlSource.includes('id="renderFinalVideo"')&&htmlSource.includes('Render full video'),'Final one-file render control missing');
  assert.ok(htmlSource.includes('id="downloadFinalVideo"')&&htmlSource.includes('id="shareFinalVideo"'),'Final download/share controls missing');
  assert.ok(htmlSource.includes('id="finalRenderProgress"')&&htmlSource.includes('id="finalRenderPreview"'),'Final-render progress/preview UI missing');
  assert.ok(appSource.includes('MediaRecorder')&&appSource.includes('captureStream(30)'),'Browser one-file video recorder missing');
  assert.ok(appSource.includes('sceneLipSyncAudioDataUrl')&&appSource.includes("cachedAudioRequest('/api/tts'"),'Approved ElevenLabs voice cache is not integrated with synchronized scene production');
  assert.ok(appSource.includes('createMediaStreamDestination')&&appSource.includes('ambientGain.gain.value=.24'),'Final audio mixing graph missing');
  assert.ok(appSource.includes('indexedDB')&&appSource.includes("createObjectStore('videos')"),'Persistent final-video browser storage missing');
  assert.ok(appSource.includes('navigator.share')&&appSource.includes('new File([asset.blob]'),'Native social/share-sheet final video handoff missing');
  assert.ok(appSource.includes("'video/mp4;codecs=h264,aac'")&&appSource.includes("'video/webm;codecs=vp9,opus'"),'MP4/WebM recording compatibility fallback missing');
  assert.ok(appSource.includes("renderStatus='final-video-ready'")&&appSource.includes("action:'render-final'"),'Final-video workflow state missing');
  assert.ok(cssSource.includes('font-size:14px!important')&&cssSource.includes('font-weight:800!important')&&cssSource.includes('.scene-action-buttons button.primary.small'),'Uniform Generate art / Listen / Generate video typography missing');
  assert.ok(cssSource.includes('.final-render-progress')&&cssSource.includes('.final-render-preview'),'Final-render visual styling missing');
  // v1.8.1 optional scene inclusion + one-click automatic final production.
  assert.ok(htmlSource.includes('id="autoFinalVideo"')&&htmlSource.includes('Create final video automatically')&&htmlSource.includes('id="autoFinalMode"'),'One-click final production UI missing');
  assert.ok(appSource.includes('selectedFinalScenes')&&appSource.includes('data-scene-final-include')&&appSource.includes('setSceneFinalIncluded'),'Per-scene include/skip controls missing');
  assert.ok(appSource.includes('createFinalVideoAutomatically')&&appSource.includes('ensureAutoSceneVideo')&&appSource.includes('waitForAutoVideo'),'Automatic video generation pipeline missing');
  assert.ok(appSource.includes("mode==='fast'?'draft':mode==='cinematic'?'premium':'standard'"),'Automatic final quality routing missing');
  assert.ok(appSource.includes("findIndex(s=>s.finalIncluded!==false&&!s.videoUrl)"),'Manual next-video workflow does not respect skipped scenes');
  assert.ok(cssSource.includes('.auto-final-card')&&cssSource.includes('.scene-final-toggle')&&cssSource.includes('.final-scene-item.skipped'),'Automatic final/skip responsive styling missing');
  assert.ok(htmlSource.includes('id="finalPublishPanel"')&&htmlSource.includes('data-publish-platform="youtube"')&&htmlSource.includes('data-publish-platform="tiktok"'),'Social publish handoff panel missing');
  assert.ok(appSource.includes('publishFinalVideo')&&appSource.includes('youtube.com/upload')&&appSource.includes('tiktok.com/upload'),'Social publish handoff logic missing');
  assert.ok(appSource.includes('acquireAutoFinalLock')&&appSource.includes('releaseAutoFinalLock'),'Duplicate automatic-final protection missing');

  // v1.8.2 resilient final-production orchestration.
  assert.ok(htmlSource.includes('id="cancelAutoFinalVideo"'),'Pause automatic final production control missing');
  assert.ok(appSource.includes('fetchVideoStatus(operation')&&appSource.includes('isTransientStatus'),'Transient video-status retry logic missing');
  assert.ok(appSource.includes('runPool(pollIndices,2'),'Bounded-concurrency final clip polling missing');
  assert.ok(appSource.includes('prepareFinalSceneAsset')&&appSource.includes('playPreparedFinalScene'),'Final media is not preloaded before recording');
  assert.ok(appSource.includes('autoFinalJobPatch')&&appSource.includes('maybeResumeAutoFinal'),'Resumable automatic final-production state missing');
  assert.ok(appSource.includes("status:'paused'")&&appSource.includes("status:'needs-attention'"),'Partial/pause recovery states missing');

  // v1.8.3 quota-aware video routing and provider-limit protection.
  assert.ok(videoApi.includes('veo-3.1-lite-generate-preview')&&videoApi.includes('allowQualityFallback'),'Quota-aware Veo Lite fallback is missing');
  assert.ok(videoApi.includes('retryDelaySeconds')&&videoApi.includes('Math.random()*650')&&videoApi.includes('attempt<4'),'Bounded Veo exponential backoff/jitter is missing');
  assert.ok(appSource.includes("allowQualityFallback:normalizedTier(s.tier)!=='premium'"),'Single-scene video generation does not enable efficient quota fallback');
  assert.ok(appSource.includes('videoRetryAt')&&appSource.includes('Video temporarily limited'),'Single-scene provider cooldown UI is missing');
  assert.ok(videoApi.includes("errorCode:quota?'VIDEO_QUOTA':'VIDEO_REQUEST'"),'Video quota errors are not classified');
  assert.ok(appSource.includes('waitForAutoVideoSubmissionSlot')&&appSource.includes('maxPerWindow=2'),'Automatic production does not pace video submissions');
  assert.ok(appSource.includes('videoQuotaMessage')&&appSource.includes('Completed clips are safe'),'Creator-friendly quota recovery messaging missing');
  assert.ok(appSource.includes("target.videoRoute=d.fallbackFrom?'efficient-fallback':'requested-quality'"),'Efficient fallback usage is not persisted per scene');
  assert.ok(htmlSource.includes('Fast · Efficient')&&htmlSource.includes('paces scene generation for reliable production'),'Quota-aware one-click production copy missing');

  // v1.9.3 safe video framing.
  assert.ok(videoApi.includes('function framingDirection')&&videoApi.includes('Keep every principal face and full head fully inside the frame'),'Video safe-framing prompt missing');
  assert.ok(videoApi.includes('Do not invent a tighter crop than the storyboard'),'Storyboard crop-preservation rule missing');
  assert.ok(appSource.includes('data-scene-framing')&&appSource.includes('function setSceneFraming'),'Per-scene framing control missing');
  assert.ok(appSource.includes("safe:'Safe framing'")&&appSource.includes("close:'Close-up'")&&appSource.includes("wide:'Wide shot'"),'Framing presets incomplete');
  assert.ok(cssSource.includes('.scene-production-controls'),'Framing controls responsive styling missing');

  
  assert.ok(/function\s+finalAssemblyManifest\s*\(/.test(appSource),'Final assembly manifest builder definition missing');
  assert.ok(!appSource.includes('Provider-limit protection · next clip in'),'Backend/provider pacing wording leaked into creator-facing progress');
  assert.ok(appSource.includes('Preparing next scene · starts in'),'Creator-friendly paced generation progress missing');
  assert.ok(htmlSource.includes('id="storyReviewPanel"')&&htmlSource.includes('Approve story & continue'),'Full-story review panel missing');
  assert.ok(appSource.includes('function renderStoryReview')&&appSource.includes('function requireApprovedStory'),'Story approval gate missing');
  assert.ok(appSource.includes("requireApprovedStory('generate video')")&&appSource.includes("requireApprovedStory('generate or preview audio')"),'Paid production actions are not guarded by story approval');
  assert.ok(planApi.includes('FULL STORY REVIEW REQUIREMENT')&&planApi.includes('storyText'),'Story planner does not require a full narrative');
  assert.ok(planApi.includes('scene plan MUST be derived from storyText'),'Story/scene consistency rule missing');
  assert.ok(!htmlSource.includes('protect provider limits'),'Provider-limit backend language leaked into creator-facing HTML');

  // v1.9.4 no-crop media, signed-in workspace sync, profile deletion propagation and uploaded-photo characters.
  assert.ok(cssSource.includes('.character-portrait img{width:100%;height:100%;object-fit:contain'),'Character portraits must display without UI cropping');
  assert.ok(cssSource.includes('.scene-visual img{width:100%;height:100%;object-fit:contain'),'Storyboard art must display without UI cropping');
  assert.ok(cssSource.includes('.scene-visual video{width:100%;height:100%;min-height:220px;display:block;object-fit:contain'),'Video clips must display without UI cropping');
  assert.ok(appSource.includes('SAFE PORTRAIT FRAMING')&&appSource.includes('SAFE STORYBOARD FRAMING'),'Image generation safe-framing prompts are missing');
  assert.ok(videoApi.includes('Avoid unintended edge clipping')&&videoApi.includes('Do not invent a tighter crop than the storyboard'),'Video no-crop prompt rules are missing');
  assert.ok(appSource.includes('supabaseWorkspace')&&appSource.includes('syncWorkspaceAfterAuth')&&appSource.includes('pushCloudWorkspace')&&appSource.includes('scheduleCloudSave'),'Signed-in cloud workspace sync is missing');
  assert.ok(appSource.includes('treat it as authoritative')&&appSource.includes('stale browser copy'),'Cloud profile must prevent deleted projects from being resurrected by stale local data');
  assert.ok(appSource.includes("Project and saved final video deleted from your profile.")&&appSource.includes('deleteProfileWorkspace'),'Profile-aware project deletion is missing');
  assert.ok(htmlSource.includes('id="deleteProfileWorkspaceBtn"'),'Delete-profile-workspace control is missing');
  assert.ok(appSource.includes('Your signed-in cloud profile will not be deleted'),'Local-clear action must not silently delete the cloud profile');
  assert.ok(appSource.includes('portraitReferencePhoto')&&appSource.includes('fileToReferenceDataUrl')&&appSource.includes('referencePhoto'),'User photo character-reference flow is missing');
  assert.ok(appSource.includes('portraitPhotoConsent')&&appSource.includes('portraitMinorConsent')&&appSource.includes('referencePhotoConsent'),'Reference-photo consent/guardian authorization gate is missing');
  assert.ok(htmlSource.includes('id="verifyBackupVisualBtn"')&&appSource.includes('/api/verify-visual-fallback'),'Live backup-visual verification control is missing');
  assert.ok(htmlSource.includes('id="copyCloudSetupBtn"')&&appSource.includes('/SUPABASE_WORKSPACE_SETUP.sql'),'Cloud setup recovery control is missing');
  assert.ok(appSource.includes('normalizedFormat')&&appSource.includes('p.requestedFormat=p.format'),'Creator-selected format invariant is missing');
  assert.ok(appSource.includes('targetSec?`~${formatTime(targetSec)}`'),'Studio runtime no longer uses creator-selected target');
  assert.ok(planApi.includes('A 5-minute request must not quietly become a 3-minute narrative'),'Runtime-fit planning guard is missing');
  assert.ok(planApi.includes('RUNTIME REPAIR PASS')&&planApi.includes('runtimeFit'),'Runtime repair pass is missing');
  assert.ok(planApi.includes('plan.requestedFormat=plan.format')&&planApi.includes('targetRuntimeSec'),'Server-side format/runtime invariants are missing');
  assert.ok(appSource.includes('scale=Math.min(width/vw,height/vh)'),'Final video renderer must preserve the full source frame without center-cropping');
  assert.ok(!cssSource.includes('object-fit:cover'),'Generated media still contains a CSS cover-crop rule');
  assert.ok(appSource.includes('story beat'),'Scene duration copy must distinguish narrative beat duration from provider clip duration');
  const cloudSql=fs.readFileSync(new URL('./SUPABASE_WORKSPACE_SETUP.sql',import.meta.url),'utf8');
  assert.ok(cloudSql.includes('create table if not exists public.cinetale_workspaces')&&cloudSql.includes('auth.uid() = user_id'),'Supabase workspace migration/RLS is missing');
  assert.ok(cloudSql.includes('grant select, insert, update, delete on table public.cinetale_workspaces to authenticated')&&cloudSql.includes('revoke all on table public.cinetale_workspaces from anon'),'Supabase authenticated table privileges are missing');
  assert.ok(htmlSource.includes('id="verifyVoiceBtn"')&&appSource.includes('/api/verify-voice'),'Live voice verification control is missing');
  assert.ok(appSource.includes('function creativeDiversityContext')&&planApi.includes('CREATIVE DIVERSITY / ANTI-REPETITION'),'Recent-project anti-repetition story guard is missing');
  assert.ok(appSource.includes('preferVerifiedBackupVisual')&&appSource.includes('preferBackup:preferVerifiedBackupVisual()'),'Scene/portrait calls must carry visual routing preference');
  assert.ok(aiSource.includes("VISUAL_PRIMARY_PROVIDER")&&aiSource.includes("requestedPrimary!=='gemini'"),'Server-side scene visual routing does not prefer the live-verifiable provider by default');
  const verifyVisualApi=fs.readFileSync(new URL('./api/verify-visual-fallback.js',import.meta.url),'utf8');
  assert.ok(verifyVisualApi.includes("openAIImageRequest")&&verifyVisualApi.includes("from '../lib/ai.js'"),'System Health and real image generation are not sharing the same OpenAI image helper');
  assert.ok(appSource.includes('function openPersonalVoiceStudio')&&appSource.includes('personalVoiceConsent')&&appSource.includes('/api/create-personal-voice'),'Personal voice recording/upload consent workflow is missing');
  assert.ok(appSource.includes('inferCharacterVoicePresentation')&&appSource.includes('voicePresentation')&&appSource.includes('pronouns'),'Smart character voice-presentation inference is missing');
  assert.ok(appSource.includes('applyCharacterVoiceSelection')&&appSource.includes('voiceSelectionUpdatedAt')&&appSource.includes('voiceRevision'),'Manual character voice persistence metadata is missing');
  assert.ok(appSource.includes('It will remain after closing or refreshing.')&&appSource.includes('clearAudioPreviewCache()'),'Locked voice playback persistence/cache invalidation is missing');
  assert.ok(appSource.includes('mergeCharacterVoiceSelections')&&appSource.includes('voiceSelectionStamp'),'Cloud/local merge can overwrite a newer character voice selection');
  assert.ok(appSource.includes('voiceList.dataset.selectedVoiceId')&&appSource.includes('selectedId=list?.dataset.selectedVoiceId'),'Save voice settings does not explicitly recommit the selected voice');
  assert.ok(appSource.includes('void pushCloudWorkspace()'),'Explicit voice changes are not flushed promptly to the signed-in workspace');
  assert.ok(planApi.includes('never infer voice presentation from a name, ethnicity, nationality, or culture alone'),'Voice inference safety rule is missing from story planning');
  assert.ok(planApi.includes('pronouns,voicePresentation'),'Generated character schema does not preserve pronouns/voice presentation');
  assert.ok(appSource.includes('gain.gain.value=1.32')&&appSource.includes('gain.gain.value=1.24')&&appSource.includes('ambientGain.gain.value=.24'),'Voice loudness normalization/mix rebalance is missing');
  assert.ok(cssSource.includes('v1.9.14 — pre-production header balance')&&cssSource.includes('grid-template-columns:minmax(220px,1fr) auto minmax(220px,1fr)'),'Balanced desktop navigation/header polish is missing');


  // v1.9.16 browser-storage regression: successful multi-megabyte image payloads
  // must be moved to IndexedDB before project metadata is persisted. This fixes
  // Firefox/Chromium localStorage QuotaExceededError being mistaken for provider quota.
  assert.ok(appSource.includes("cinetale.visual.assets.v1")&&appSource.includes('saveVisualAsset')&&appSource.includes('loadVisualAssetRecord'),'Generated visual IndexedDB storage is missing');
  assert.ok(appSource.includes('persistableProjects')&&appSource.includes('function stripTransientMedia')&&appSource.includes("/^(?:data:|blob:)/i"),'Generated media is still being serialized into localStorage/cloud metadata');
  assert.ok(appSource.includes("stageVisualAsset(assetKey,d.image)")&&appSource.includes("const stored=await saveVisualAsset(assetKey,d.image)")&&appSource.includes("target._visualPersisting=true"),'Scene/portrait generation does not stage successful imagery immediately and persist it safely through the media store');
  assert.ok(appSource.includes("const refs=await portraitReferenceEntries(p,s)")&&appSource.includes('visualDataUrl(c)'),'IndexedDB-backed character portraits cannot be reused as storyboard identity references');
  // v1.9.17 cinematic workflow polish: show successful images immediately, persist afterward, and keep large no-crop previews.
  assert.ok(appSource.includes('function stageVisualAsset')&&appSource.includes('Storyboard ready · saving safely…'),'Immediate visual staging/progress feedback is missing');
  assert.ok(appSource.includes('function generationProgress')&&appSource.includes('Rendering details…'),'Long-running visual generation progress feedback is missing');
  assert.ok(cssSource.includes('v1.9.17 — cinematic scene preview')&&cssSource.includes('minmax(320px,390px)'),'Large cinematic scene-preview layout is missing');
  // v1.9.26 Projects interaction: restore the proven v1.9.17 native button structure while keeping quota-safe navigation.
  assert.ok(appSource.includes("function safeLocalSet")&&appSource.includes("setView('studio')")&&appSource.includes("queueMicrotask(()=>save())"),'Project opening can still be blocked by localStorage quota or synchronous persistence');
  assert.ok(appSource.includes('class="project-open" type="button" data-project=')&&appSource.includes("projectsGrid.addEventListener('pointerdown'")&&appSource.includes("openProject(opener.dataset.project)"),'Stable project pointerdown wiring is missing');
  assert.ok(appSource.includes('projectNavigation:{locked:false')&&appSource.includes('state.projectNavigation.epoch!==syncEpoch'),'Project navigation race guard is missing');
  assert.ok(htmlSource.includes('/app.js?v=1.9.77'),'App bundle cache-busting version is missing');
  assert.ok(appSource.includes("sceneListEl.addEventListener('pointerdown'"),'Scene video action must use persistent pointer handler');
  assert.ok(appSource.includes("videoOperationConfirmed(scene)?'Rendering…':videoOperationRecovering(scene)?'Checking saved render…'"),'Video operation UX must distinguish verified rendering from unverified saved jobs');
  assert.ok(appSource.includes('Boolean(scene.videoOperation)'),'Video button must disable during an active render job');



  // v1.9.15 explicit client preference also remains supported.
  const pbOpenAI=process.env.OPENAI_API_KEY,pbGemini=process.env.GEMINI_API_KEY;process.env.OPENAI_API_KEY='prefer-backup-key';process.env.GEMINI_API_KEY='primary-key';let preferredCalls=0;
  globalThis.fetch=async (url,opts)=>{preferredCalls++;assert.match(String(url),/api\.openai\.com\/v1\/images\/generations$/);return new Response(JSON.stringify({data:[{b64_json:'UFJFRkVSUkVE'}]}),{status:200,headers:{'content-type':'application/json'}})};
  const preferred=await createImageWithMeta('preferred verified backup','16:9',[],'standard',true);assert.equal(preferred.provider,'openai');assert.equal(preferred.providerRoute,'primary');assert.equal(preferredCalls,1);
  if(pbOpenAI===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=pbOpenAI;if(pbGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=pbGemini;

  // v1.9.14 reusable personal voice creation requires explicit authorization and uses ElevenLabs IVC.
  const pvKey=process.env.ELEVENLABS_API_KEY;process.env.ELEVENLABS_API_KEY='personal-voice-test-key';const {default:personalVoiceHandler}=await import('./api/create-personal-voice.js');let pvFetch=0;
  globalThis.fetch=async (url,opts)=>{pvFetch++;assert.equal(String(url),'https://api.elevenlabs.io/v1/voices/add');assert.equal(opts.headers['xi-api-key'],'personal-voice-test-key');assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('name'),'My Test Voice');assert.ok(opts.body.get('files[]') instanceof Blob);return new Response(JSON.stringify({voice_id:'voice-personal-123',requires_verification:false}),{status:200,headers:{'content-type':'application/json'}})};
  let pvStatus=0,pvPayload=null;const pvRes={status(code){pvStatus=code;return this},json(value){pvPayload=value;return value}};
  await personalVoiceHandler({method:'POST',body:{name:'My Test Voice',audio:'data:audio/webm;base64,QUJDRA==',consentConfirmed:true,authorizationBasis:'self'}},pvRes);assert.equal(pvStatus,200);assert.equal(pvPayload.voiceId,'voice-personal-123');assert.equal(pvFetch,1);
  pvStatus=0;pvPayload=null;await personalVoiceHandler({method:'POST',body:{name:'No Consent',audio:'data:audio/webm;base64,QUJDRA==',consentConfirmed:false,authorizationBasis:'self'}},pvRes);assert.equal(pvStatus,400);assert.equal(pvPayload.code,'VOICE_CONSENT_REQUIRED');
  if(pvKey===undefined)delete process.env.ELEVENLABS_API_KEY;else process.env.ELEVENLABS_API_KEY=pvKey;
  // v1.9.19 video delivery stabilization: browser byte-range requests are honored and lazy rendering prevents request storms.
  const {default:videoFileHandler}=await import('./api/video-file.js');
  const priorVideoKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='video-range-test-key';
  let seenRanges=[];globalThis.fetch=async (url,opts)=>{seenRanges.push(opts.headers.Range||'');return new Response(Buffer.from('VIDEOCHUNK'),{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-9/100','content-length':'10'}})};
  let vfStatus=0,vfBody=null,vfHeaders={};const vfRes={status(code){vfStatus=code;return this},setHeader(k,v){vfHeaders[String(k).toLowerCase()]=String(v)},send(v){vfBody=v;return v},end(v=''){vfBody=v;return v}};
  await videoFileHandler({method:'GET',query:{uri:'https://generativelanguage.googleapis.com/v1beta/files/test:download'},headers:{range:'bytes=0-9'}},vfRes);
  assert.equal(vfStatus,206);assert.ok(seenRanges.includes('bytes=0-9'));assert.equal(vfHeaders['accept-ranges'],'bytes');assert.equal(vfHeaders['content-range'],'bytes 0-9/100');assert.equal(vfHeaders['content-length'],'10');assert.ok(Buffer.isBuffer(vfBody));
  // v1.9.28: sniff real container bytes instead of forcing video/mp4 when upstream returns octet-stream.
  globalThis.fetch=async()=>new Response(Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('WEBMTEST')]),{status:200,headers:{'content-type':'application/octet-stream'}});
  vfStatus=0;vfBody=null;vfHeaders={};await videoFileHandler({method:'GET',query:{uri:'https://generativelanguage.googleapis.com/v1beta/files/test:download'},headers:{}},vfRes);
  assert.equal(vfStatus,200);assert.equal(vfHeaders['content-type'],'video/webm');
  assert.ok(appSource.includes('src="${esc(src)}"')&&!appSource.includes('type="video/mp4"'),'Scene video must let the browser honor the response MIME instead of hard-coding MP4.');
  assert.ok(cssSource.includes('v1.9.28 — polished Projects toolbar')&&cssSource.includes('.project-toolbar label:focus-within'),'Polished Projects search/filter/sort toolbar styling missing.');
  if(priorVideoKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=priorVideoKey;

  // v1.9.26 auth + restored Projects interaction.
  assert.ok(appSource.includes("prompt:'select_account'")&&appSource.includes("new URLSearchParams({provider:'google'"),'Google OAuth must explicitly request the Google account chooser.');
  assert.ok(appSource.includes('function openProject(id)')&&appSource.includes('data-project=')&&appSource.includes("projectsGrid.addEventListener('pointerdown'"),'Projects must use stable grid-level pointerdown navigation wiring.');
  assert.ok(appSource.includes("setView('studio')")&&appSource.includes("queueMicrotask(()=>save())"),'Project opening must navigate before bulk persistence can fail.');
  assert.ok(appSource.includes('function safeLocalSet')&&appSource.includes('QuotaExceededError'),'Local storage quota must not break project navigation.');
  assert.ok(appSource.includes('class="project-open" type="button"'),'Project cover/title/body must use the proven native project-open button.');
  assert.ok(!appSource.includes('project-hitarea')&&!appSource.includes('data-project-open='),'Later overlay/hit-area project interaction must be removed.');
  assert.ok(!appSource.includes('<a class="project-open"'),'Projects must not use anchor wrappers that introduce underlines/link styling.');
  assert.ok(cssSource.includes('.project-open{border:0')&&cssSource.includes('text-decoration:none'),'Project open controls must remain underline-free with visible keyboard focus.');

console.log('CineTale v1.9.77 smoke tests passed: strict Story/Short/Movie/Episode integrity, Google account chooser, restored proven project opening, quota-safe navigation, runtime targeting, no-crop media, auth/cloud sync, consent gates, quota-aware video, final assembly, voice filtering, navigation and DOM integrity.');
} finally {
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originalKey;
  if(originalTextModel===undefined) delete process.env.GEMINI_TEXT_MODEL; else process.env.GEMINI_TEXT_MODEL=originalTextModel;
  if(originalImageModel===undefined) delete process.env.GEMINI_IMAGE_MODEL; else process.env.GEMINI_IMAGE_MODEL=originalImageModel;
  if(originalOpenAIKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=originalOpenAIKey;
}
