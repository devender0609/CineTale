function clean(value,max=2500){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function languageCode(value=''){
  const first=String(value||'').split(/[,;+]/)[0].trim().toLowerCase();
  const map={english:'en',spanish:'es',french:'fr',german:'de',portuguese:'pt',italian:'it',hindi:'hi',urdu:'ur',bengali:'bn',punjabi:'pa',gujarati:'gu',marathi:'mr',tamil:'ta',telugu:'te',kannada:'kn',malayalam:'ml',arabic:'ar',japanese:'ja',korean:'ko','mandarin chinese':'zh',mandarin:'zh',cantonese:'zh',dutch:'nl',polish:'pl',turkish:'tr',russian:'ru',ukrainian:'uk',greek:'el',hebrew:'he',persian:'fa',farsi:'fa',nepali:'ne',assamese:'as',odia:'or',sinhala:'si',thai:'th',vietnamese:'vi',indonesian:'id',malay:'ms',swahili:'sw',czech:'cs',romanian:'ro',hungarian:'hu',swedish:'sv',danish:'da',finnish:'fi',norwegian:'no',bulgarian:'bg',croatian:'hr',serbian:'sr',slovak:'sk',slovenian:'sl',lithuanian:'lt',latvian:'lv',estonian:'et',georgian:'ka',armenian:'hy',azerbaijani:'az',kazakh:'kk',uzbek:'uz',somali:'so',amharic:'am',yoruba:'yo',igbo:'ig',hausa:'ha',zulu:'zu',xhosa:'xh'};
  return map[first]||null;
}
function tags(direction=''){
  const d=String(direction||'').toLowerCase(),out=[];const add=x=>{if(!out.includes(x)&&out.length<2)out.push(x)};
  if(/whisper/.test(d))add('whispers');else if(/quiet|soft|hushed|gentle/.test(d))add('softly');
  if(/nervous|anxious|uneasy|afraid|fear/.test(d))add('nervous');else if(/curious|wonder/.test(d))add('curious');else if(/sad|grief|somber|sombre/.test(d))add('sad');else if(/urgent|panic|rushed|breathless/.test(d))add('urgent');else if(/reflective|nostalg|wistful/.test(d))add('reflective');else if(/tense|suspense/.test(d))add('tense');else if(/warm|comfort/.test(d))add('warmly');
  if(!out.length)add('conversational');return out;
}
function directedText(text,direction){return `${tags(direction).map(t=>`[${t}]`).join(' ')} ${text}`.trim()}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=process.env.ELEVENLABS_API_KEY;if(!key)return res.status(503).json({error:'Natural dialogue requires ElevenLabs configuration.'});
  const turns=(Array.isArray(req.body?.turns)?req.body.turns:[]).map(t=>({text:clean(t?.text,1800),voiceId:clean(t?.voiceId,200),direction:clean(t?.direction,600)})).filter(t=>t.text&&t.voiceId&&!t.voiceId.startsWith('browser-'));
  if(turns.length<2)return res.status(400).json({error:'At least two voiced dialogue turns are required.'});
  const total=turns.reduce((n,t)=>n+t.text.length,0);if(total>2000)return res.status(400).json({error:'Scene dialogue is too long for one natural conversation preview.'});
  const body={inputs:turns.map(t=>({text:directedText(t.text,t.direction),voice_id:t.voiceId})),model_id:'eleven_v3'};const lang=languageCode(req.body?.language);if(lang)body.language_code=lang;
  try{
    const r=await fetch('https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json','accept':'audio/mpeg'},body:JSON.stringify(body)});
    if(!r.ok){let message=`dialogue failed (${r.status})`;try{const d=await r.json();message=d?.detail?.message||d?.detail||d?.message||message}catch{}throw new Error(String(message))}
    const buf=Buffer.from(await r.arrayBuffer());return res.status(200).json({mode:'ai',engine:'elevenlabs',model:'eleven_v3',audio:`data:audio/mpeg;base64,${buf.toString('base64')}`});
  }catch(e){console.error('[CineTale dialogue] ElevenLabs dialogue generation failed',{message:e?.message||String(e)});return res.status(502).json({error:'Natural multi-character dialogue is temporarily unavailable.'})}
}
