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

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {text,voiceId,kind='dialogue',direction='',language='',speakerProfile=''}=req.body||{};
  const spoken=cleanText(text);
  if(!spoken) return res.status(400).json({error:'Text required'});
  const key=process.env.ELEVENLABS_API_KEY;
  const requested=String(voiceId||'').trim();
  const narrator=kind==='narration' ? String(process.env.ELEVENLABS_NARRATOR_VOICE_ID||'').trim() : '';
  const id=(requested&&!requested.startsWith('browser-'))?requested:(narrator||String(process.env.ELEVENLABS_DEFAULT_VOICE_ID||'').trim());
  if(!key||!id) return res.status(200).json({mode:'browser',reason:'elevenlabs-not-configured'});
  const primary=String(process.env.ELEVENLABS_TTS_MODEL||'eleven_v3').trim()||'eleven_v3';
  const models=[primary,'eleven_v3','eleven_multilingual_v2'].filter((m,i,a)=>m&&a.indexOf(m)===i);
  const combinedDirection=cleanText([direction,speakerProfile].filter(Boolean).join('. '),800);
  let lastError=null;
  for(const model of models){
    try{
      const buf=await elevenSpeech({key,voiceId:id,text:spoken,model,direction:combinedDirection,kind,language});
      return res.status(200).json({mode:'ai',engine:'elevenlabs',model,audio:`data:audio/mpeg;base64,${buf.toString('base64')}`,voiceId:id,direction:combinedDirection});
    }catch(e){lastError=e;console.warn('[CineTale tts] ElevenLabs model failed; trying fallback',{model,status:e?.status,message:e?.message||String(e)})}
  }
  console.error('[CineTale tts] All ElevenLabs speech attempts failed',{message:lastError?.message||'unknown'});
  return res.status(502).json({error:'Natural voice generation is temporarily unavailable. CineTale did not silently replace it with a robotic browser voice.'});
}
