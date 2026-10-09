function cleanText(value,max=5000){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function languageCode(value=''){
  const first=String(value||'').split(/[,;+]/)[0].trim().toLowerCase();
  const map={english:'en',spanish:'es',french:'fr',german:'de',portuguese:'pt',italian:'it',hindi:'hi',urdu:'ur',bengali:'bn',punjabi:'pa',gujarati:'gu',marathi:'mr',tamil:'ta',telugu:'te',kannada:'kn',malayalam:'ml',arabic:'ar',japanese:'ja',korean:'ko','mandarin chinese':'zh',mandarin:'zh',cantonese:'zh',dutch:'nl',polish:'pl',turkish:'tr',russian:'ru',ukrainian:'uk',greek:'el'};
  return map[first]||null;
}
function performanceTags(direction='',kind='dialogue'){
  const d=String(direction||'').toLowerCase();
  // Eleven v3 audio tags are powerful, so use at most ONE only when the creator/story
  // direction clearly asks for it. Generic 'natural/conversational' delivery should remain
  // untagged; repeatedly injecting tags can make adjacent lines sound over-directed.
  if(/whisper/.test(d))return ['whispers'];
  if(/urgent|panic|rushed|breathless/.test(d))return ['urgent'];
  if(/nervous|anxious|uneasy|afraid|fear|fright/.test(d))return ['nervous'];
  if(/sad|grief|somber|sombre|melanchol/.test(d))return ['sad'];
  if(/excited|delighted|joy|happy/.test(d))return ['excited'];
  if(/reflective|nostalg|memory|wistful/.test(d))return ['reflective'];
  if(/tense|suspense|wary/.test(d))return ['tense'];
  if(/quiet|soft|hushed|gentle/.test(d))return ['softly'];
  return [];
}
function expressiveText(text,direction,kind){const tags=performanceTags(direction,kind).map(t=>`[${t}]`).join(' ');return `${tags} ${text}`.trim()}
function speedFor(direction='',kind='dialogue'){
  const d=String(direction||'').toLowerCase();
  if(/urgent|rushed|rapid|breathless/.test(d)) return 1.04;
  if(/slow|reflective|somber|sombre|gentle|hesitant/.test(d)) return .93;
  return kind==='narration'?.96:.98;
}
async function elevenSpeech({key,voiceId,text,model,direction,kind,language}){
  const isV3=model==='eleven_v3';
  const body={text:isV3?expressiveText(text,direction,kind):text,model_id:model};
  const lang=languageCode(language);
  if(isV3&&lang)body.language_code=lang;
  if(!isV3){body.voice_settings={stability:.38,similarity_boost:.78,style:.12,use_speaker_boost:true,speed:speedFor(direction,kind)}}
  const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{
    method:'POST',headers:{'xi-api-key':key,'content-type':'application/json','accept':'audio/mpeg'},body:JSON.stringify(body)
  });
  if(!r.ok){let message=`voice failed (${r.status})`;try{const d=await r.json();message=d?.detail?.message||d?.detail||d?.message||message}catch{}const e=new Error(String(message));e.status=r.status;throw e}
  return Buffer.from(await r.arrayBuffer());
}


function localeForVoiceId(id='',language=''){
  const raw=String(id||'');const providerId=raw.includes(':')?raw.split(':').slice(1).join(':'):raw;
  const m=providerId.match(/^([a-z]{2,3}-[A-Z]{2})-/i);if(m)return m[1].split('-')[0].toLowerCase()+'-'+m[1].split('-')[1].toUpperCase();
  const code=languageCode(language);const defaults={hi:'hi-IN',ml:'ml-IN',ta:'ta-IN',te:'te-IN',kn:'kn-IN',bn:'bn-IN',mr:'mr-IN',pa:'pa-IN',gu:'gu-IN',ur:'ur-IN',ja:'ja-JP',ko:'ko-KR',he:'he-IL',th:'th-TH',vi:'vi-VN'};return defaults[code]||code||'en-US';
}
async function googleSpeech({key,voiceName,text,language}){
  const locale=localeForVoiceId(`google:${voiceName}`,language);
  const r=await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{text},voice:{languageCode:locale,name:voiceName},audioConfig:{audioEncoding:'MP3'}})});
  if(!r.ok){let message=`Google TTS failed (${r.status})`;try{const d=await r.json();message=d?.error?.message||message}catch{}throw new Error(message)}const d=await r.json();if(!d.audioContent)throw new Error('Google TTS returned no audio');return Buffer.from(d.audioContent,'base64');
}
async function azureSpeech({key,region,voiceName,text,language}){
  const locale=localeForVoiceId(`azure:${voiceName}`,language);const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const ssml=`<speak version="1.0" xml:lang="${esc(locale)}"><voice name="${esc(voiceName)}">${esc(text)}</voice></speak>`;
  const r=await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`,{method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3','User-Agent':'CineTale'},body:ssml});
  if(!r.ok)throw new Error(`Azure TTS failed (${r.status})`);return Buffer.from(await r.arrayBuffer());
}


async function murfSpeech({key,model,voiceId,text,language,direction,kind}){
  const locale=localeForVoiceId(`murf:${model}:${voiceId}`,language)||'en-US';
  const pace=speedFor(direction,kind),rate=Math.max(-50,Math.min(50,Math.round((pace-1)*100)));
  if(model==='falcon-2'){
    const r=await fetch('https://global.api.murf.ai/v1/speech/stream',{method:'POST',headers:{'api-key':key,'content-type':'application/json','accept':'audio/mpeg'},body:JSON.stringify({text,voiceId,model:'falcon-2',locale,format:'MP3',rate})});
    if(!r.ok){let message=`Murf Falcon 2 TTS failed (${r.status})`;try{const d=await r.json();message=d?.error?.message||d?.message||message}catch{}const e=new Error(String(message));e.status=r.status;throw e}
    return Buffer.from(await r.arrayBuffer());
  }
  const r=await fetch('https://api.murf.ai/v1/speech/generate',{method:'POST',headers:{'api-key':key,'content-type':'application/json'},body:JSON.stringify({text,voiceId,locale,format:'MP3',modelVersion:'GEN2',encodeAsBase64:true,rate})});
  if(!r.ok){let message=`Murf Gen2 TTS failed (${r.status})`;try{const d=await r.json();message=d?.error?.message||d?.message||message}catch{}const e=new Error(String(message));e.status=r.status;throw e}
  const d=await r.json();if(d?.encodedAudio)return Buffer.from(d.encodedAudio,'base64');
  if(d?.audioFile){const a=await fetch(d.audioFile);if(!a.ok)throw new Error(`Murf generated audio download failed (${a.status})`);return Buffer.from(await a.arrayBuffer())}
  throw new Error('Murf TTS returned no audio');
}

async function sarvamSpeech({key,speaker,text,language,direction,kind}){
  const locale=localeForVoiceId('',language)||'hi-IN';
  const pace=speedFor(direction,kind);
  const r=await fetch('https://api.sarvam.ai/text-to-speech',{method:'POST',headers:{'api-subscription-key':key,'content-type':'application/json'},body:JSON.stringify({text,language_code:locale,model:'bulbul:v3',speaker,pace,output_audio_codec:'mp3'})});
  if(!r.ok){let message=`Sarvam TTS failed (${r.status})`;try{const d=await r.json();message=d?.error?.message||d?.detail||d?.message||message}catch{}const e=new Error(String(message));e.status=r.status;throw e}
  const d=await r.json();const audio=Array.isArray(d?.audios)?d.audios[0]:'';if(!audio)throw new Error('Sarvam TTS returned no audio');
  return Buffer.from(audio,'base64');
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {text,voiceId,kind='dialogue',direction='',language='',speakerProfile=''}=req.body||{};
  const spoken=cleanText(text);if(!spoken)return res.status(400).json({error:'Text required'});
  const requested=String(voiceId||'').trim();if(!requested||requested.startsWith('browser-'))return res.status(409).json({error:'No suitable approved voice is assigned for this line. CineTale did not substitute the environment default voice.'});
  const combinedDirection=cleanText([direction,speakerProfile].filter(Boolean).join('. '),800);
  try{
    if(requested.startsWith('google:')){const key=String(process.env.GOOGLE_CLOUD_TTS_API_KEY||'').trim();if(!key)return res.status(409).json({error:'This Google voice is selected, but Google Cloud TTS is not configured.'});const providerVoiceId=requested.slice(7);const buf=await googleSpeech({key,voiceName:providerVoiceId,text:spoken,language});return res.status(200).json({mode:'ai',engine:'google',audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:requested,direction:combinedDirection});}
    if(requested.startsWith('murf:')){const key=String(process.env.MURF_API_KEY||'').trim();if(!key)return res.status(409).json({error:'This Murf voice is selected, but Murf TTS is not configured.'});const parts=requested.split(':');const model=parts[1]||'gen2',providerVoiceId=parts.slice(2).join(':');if(!providerVoiceId)return res.status(400).json({error:'Invalid Murf voice selection.'});const buf=await murfSpeech({key,model,voiceId:providerVoiceId,text:spoken,language,direction:combinedDirection,kind});return res.status(200).json({mode:'ai',engine:'murf',model,audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:requested,direction:combinedDirection});}
    if(requested.startsWith('sarvam:')){const key=String(process.env.SARVAM_API_KEY||'').trim();if(!key)return res.status(409).json({error:'This Sarvam voice is selected, but Sarvam TTS is not configured.'});const providerVoiceId=requested.slice(7);const buf=await sarvamSpeech({key,speaker:providerVoiceId,text:spoken,language,direction:combinedDirection,kind});return res.status(200).json({mode:'ai',engine:'sarvam',model:'bulbul:v3',audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:requested,direction:combinedDirection});}
    if(requested.startsWith('azure:')){const key=String(process.env.AZURE_SPEECH_KEY||'').trim(),region=String(process.env.AZURE_SPEECH_REGION||'').trim();if(!key||!region)return res.status(409).json({error:'This Azure voice is selected, but Azure Speech is not configured.'});const providerVoiceId=requested.slice(6);const buf=await azureSpeech({key,region,voiceName:providerVoiceId,text:spoken,language});return res.status(200).json({mode:'ai',engine:'azure',audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:requested,direction:combinedDirection});}
    const key=process.env.ELEVENLABS_API_KEY;if(!key)return res.status(409).json({error:'This ElevenLabs voice is selected, but ElevenLabs is not configured.'});
    const id=requested.startsWith('elevenlabs:')?requested.slice(11):requested;const primary=String(process.env.ELEVENLABS_TTS_MODEL||'eleven_v3').trim()||'eleven_v3';const models=[primary,'eleven_v3','eleven_multilingual_v2'].filter((m,i,a)=>m&&a.indexOf(m)===i);let lastError=null;
    for(const model of models){try{const buf=await elevenSpeech({key,voiceId:id,text:spoken,model,direction:combinedDirection,kind,language});return res.status(200).json({mode:'ai',engine:'elevenlabs',model,audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:requested,direction:combinedDirection})}catch(e){lastError=e;console.warn('[CineTale tts] ElevenLabs model failed; trying fallback',{model,status:e?.status,message:e?.message||String(e)})}}
    throw lastError||new Error('ElevenLabs speech failed');
  }catch(e){console.error('[CineTale tts] Selected provider failed',{message:e?.message||String(e)});return res.status(502).json({error:'Natural voice generation is temporarily unavailable for the selected voice. CineTale did not silently switch providers or accents.'});}
}
