import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalFetch=globalThis.fetch;
const originalKey=process.env.GEMINI_API_KEY;
const originalTextModel=process.env.GEMINI_TEXT_MODEL;
const originalImageModel=process.env.GEMINI_IMAGE_MODEL;

try{
  process.env.GEMINI_API_KEY='test-key';
  process.env.GEMINI_TEXT_MODEL='gemini-2.5-flash';
  process.env.GEMINI_IMAGE_MODEL='gemini-3.1-flash-image';

  const {generateWithGemini,createImage}=await import('./lib/ai.js');
  const {normalizePlan}=await import('./api/generate-plan.js');

  const storyCalls=[];
  globalThis.fetch=async (url,opts)=>{
    storyCalls.push(String(url));
    if(String(url).includes('gemini-3.8-flash')){
      const plan={title:'Jaipur Test',logline:'A hidden key opens a family mystery.',characters:[{name:'Asha'}],episodes:[{number:1,title:'The Key',scenes:[{number:1,title:'The Trunk',dialogue:[{speaker:'Asha',text:'This key was hidden on purpose.'}]}]}]};
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

  // Project creation integration: flexible cast size and persisted original idea.
  let planPrompt='';
  globalThis.fetch=async (url,opts)=>{
    if(String(url).includes('gemini-2.5-flash')) return new Response(JSON.stringify({error:{message:'model not found'}}),{status:404,headers:{'content-type':'application/json'}});
    if(String(url).includes('gemini-3.8-flash')){
      const body=JSON.parse(opts.body);planPrompt=body.contents?.[0]?.parts?.[0]?.text||'';
      const plan={title:'Flexible Cast',logline:'Four friends solve a coastal mystery.',characters:[1,2,3,4].map(i=>({name:`C${i}`})),episodes:[{number:1,title:'Pilot',scenes:[{number:1,title:'Start',dialogue:['C1: Go.']}]}]};
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected plan URL: ${url}`);
  };
  const {default:planHandler}=await import('./api/generate-plan.js');
  let planStatus=0,planPayload=null;const planRes={status(code){planStatus=code;return this},json(value){planPayload=value;return value}};
  await planHandler({method:'POST',body:{idea:'Baby Goddess Durga protects a Himalayan village.',castSize:'4',genre:'Mythology + Devotional Story',language:'Hindi',languageScope:'entire-story',culturalTreatment:'reverent-devotional',languageDirection:'Entire story in Hindi; sacred chants may remain Sanskrit',duration:'2–3 minutes'}},planRes);
  assert.equal(planStatus,200);assert.equal(planPayload.plan.characters.length,4);assert.equal(planPayload.plan.castSize,'4');assert.equal(planPayload.plan.idea,'Baby Goddess Durga protects a Himalayan village.');assert.equal(planPayload.plan.languageScope,'entire-story');assert.equal(planPayload.plan.culturalTreatment,'reverent-devotional');assert.match(planPrompt,/Create exactly 4 recurring characters/);assert.match(planPrompt,/LANGUAGE SCOPE: Entire story/);assert.match(planPrompt,/Do not silently switch back to English/);assert.match(planPrompt,/reverent devotional treatment/i);assert.match(planPrompt,/unrelated ordinary person/i);

  // Image quota handling must be a real failure; do not disguise it as preview art.
  globalThis.fetch=async ()=>new Response(JSON.stringify({error:{message:'RESOURCE_EXHAUSTED: quota exceeded'}}),{status:429,headers:{'content-type':'application/json'}});
  const {default:imageHandler}=await import('./api/generate-image.js');
  let imageStatus=0,imagePayload=null;const imageRes={status(code){imageStatus=code;return this},json(value){imagePayload=value;return value}};
  await imageHandler({method:'POST',body:{prompt:'test',label:'Quota test',aspect:'16:9'}},imageRes);
  assert.equal(imageStatus,429);assert.equal(imagePayload.errorCode,'VISUAL_QUOTA');assert.match(imagePayload.error,/Visual generation limit reached/);assert.equal(imagePayload.image,undefined);

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
  await voicesHandler({method:'GET'},voiceRes);assert.equal(voiceStatus,200);assert.equal(voicePayload.mode,'ai');assert.equal(voicePayload.narratorVoiceId,'voice-narrator');assert.equal(voicePayload.voices[0].labels.age,'young');

  const {default:dialogueHandler}=await import('./api/dialogue.js');
  globalThis.fetch=async (url,opts)=>{
    assert.equal(String(url),'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128');
    const body=JSON.parse(opts.body);assert.equal(body.model_id,'eleven_v3');assert.equal(body.language_code,'en');assert.equal(body.inputs.length,2);assert.equal(body.inputs[0].voice_id,'voice-zoya');assert.equal(body.inputs[1].voice_id,'voice-grandpa');assert.match(body.inputs[0].text,/\[softly\]/);assert.match(body.inputs[0].text,/\[nervous\]/);
    return new Response(new Uint8Array([7,8,9]),{status:200,headers:{'content-type':'audio/mpeg'}});
  };
  let diaStatus=0,diaPayload=null;const diaRes={status(code){diaStatus=code;return this},json(value){diaPayload=value;return value}};
  await dialogueHandler({method:'POST',body:{language:'English',turns:[{text:'Grandpa... what is this?',voiceId:'voice-zoya',direction:'quiet and uneasy'},{text:'You found it.',voiceId:'voice-grandpa',direction:'reflective and warm'}]}},diaRes);
  assert.equal(diaStatus,200);assert.equal(diaPayload.mode,'ai');assert.match(diaPayload.audio,/^data:audio\/mpeg;base64,/);
  if(oldTtsKey===undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldTtsKey;
  if(oldDefaultVoice===undefined) delete process.env.ELEVENLABS_DEFAULT_VOICE_ID; else process.env.ELEVENLABS_DEFAULT_VOICE_ID=oldDefaultVoice;
  if(oldTtsModel===undefined) delete process.env.ELEVENLABS_TTS_MODEL; else process.env.ELEVENLABS_TTS_MODEL=oldTtsModel;
  if(oldNarratorVoice===undefined) delete process.env.ELEVENLABS_NARRATOR_VOICE_ID; else process.env.ELEVENLABS_NARRATOR_VOICE_ID=oldNarratorVoice;

  let nextPrompt='', nextRequestBody=null;
  globalThis.fetch=async (url,opts)=>{
    if(String(url).includes('gemini-2.5-flash')) return new Response(JSON.stringify({error:{message:'model not found'}}),{status:404,headers:{'content-type':'application/json'}});
    if(String(url).includes('gemini-3.8-flash')){
      nextRequestBody=JSON.parse(opts.body);nextPrompt=nextRequestBody.contents?.[0]?.parts?.[0]?.text||'';
      const episode={number:2,title:'The Third Tape',synopsis:'The mystery deepens.',scenes:[{number:1,title:'Playback',dialogue:[{speaker:'Kiran',text:'Play it again.'}],visual:'Kiran replays the tape.'}]};
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
  assert.ok(htmlSource.includes('estimated episode runtime'),'Clear runtime label missing');
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
  assert.ok(appSource.includes("get('owner')==='1'"),'Owner mode URL gate missing');
  assert.ok(cssSource.includes('.picker-options'),'Picker styling missing');

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
  assert.ok(planApi.includes('entityType,sacredIdentity,canonicalVisualCues[]'),'Sacred identity metadata schema missing');
  assert.ok(planApi.includes('Mata Parvati')&&planApi.includes('must not be described merely as an ordinary woman'),'Sacred parent-role preservation rule missing');

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
  assert.ok(appSource.includes("apiPost('/api/dialogue'")&&appSource.includes('playSceneAudio'),'Natural multi-speaker scene playback missing');
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
  console.log('CineTale v1.5.5 smoke tests passed: polished Create flow, narrator Voice Studio, natural ElevenLabs audio, persistent character/narrator voices, editable performance direction, cultural/language fidelity, identity continuity, episode safety, media error handling, navigation and DOM integrity.');
} finally {
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originalKey;
  if(originalTextModel===undefined) delete process.env.GEMINI_TEXT_MODEL; else process.env.GEMINI_TEXT_MODEL=originalTextModel;
  if(originalImageModel===undefined) delete process.env.GEMINI_IMAGE_MODEL; else process.env.GEMINI_IMAGE_MODEL=originalImageModel;
}
