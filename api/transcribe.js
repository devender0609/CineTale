function extractBase64(data=''){
  const raw=String(data||'').trim();
  if(!raw) return {mime:'audio/webm',base64:''};
  if(!raw.startsWith('data:')) return {mime:'audio/webm',base64:raw.replace(/\s+/g,'')};
  const comma=raw.indexOf(',');
  if(comma<0) return {mime:'audio/webm',base64:''};
  const meta=raw.slice(5,comma);
  const payload=raw.slice(comma+1).replace(/\s+/g,'');
  const parts=meta.split(';').filter(Boolean);
  const mime=(parts[0]&&parts[0].includes('/'))?parts[0]:'audio/webm';
  const isBase64=parts.some(x=>x.toLowerCase()==='base64');
  if(!isBase64) return {mime,base64:Buffer.from(decodeURIComponent(payload),'utf8').toString('base64')};
  return {mime,base64:payload};
}
function looksLikeBase64(value=''){
  const s=String(value||'').replace(/\s+/g,'');
  return !!s && s.length%4===0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s);
}

async function transcribeWithElevenLabs({key,buf,type}){
  const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':'webm';
  const form=new FormData();
  form.append('file',new Blob([buf],{type}),`story.${ext}`);
  form.append('model_id','scribe_v2');
  form.append('diarize','false');
  form.append('tag_audio_events','false');
  const r=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':key},body:form});
  const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
  if(!r.ok){const e=new Error(data?.detail?.message||data?.message||text.slice(0,240)||`Speech service error (${r.status})`);e.status=r.status;throw e}
  const transcript=String(data?.text||'').trim(); if(!transcript) throw new Error('No speech was detected.');
  return transcript;
}
async function transcribeWithGemini({key,base64,type}){
  const model='gemini-3.8-flash';
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:'Transcribe the spoken words in this audio accurately. Return only the transcript text, with natural punctuation. Do not summarize, translate, explain, or add commentary.'},{inlineData:{mimeType:type,data:base64}}]}]})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data?.error?.message||`Speech service error (${r.status})`);e.status=r.status;throw e}
  const transcript=String(data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'').trim();
  if(!transcript) throw new Error('No speech was detected.');
  return transcript;
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {audio,mimeType}=req.body||{};
  if(!audio) return res.status(400).json({error:'Audio required'});
  const parsed=extractBase64(audio);
  if(!looksLikeBase64(parsed.base64)) return res.status(400).json({error:'Invalid audio recording'});
  const buf=Buffer.from(parsed.base64,'base64');
  if(!buf.length) return res.status(400).json({error:'Empty audio recording'});
  if(buf.length>8*1024*1024) return res.status(413).json({error:'Voice recording is too long. Please record a shorter segment or type the rest.'});
  const type=String(mimeType||parsed.mime||'audio/webm').split(';')[0].trim()||'audio/webm';
  const errors=[];
  if(process.env.ELEVENLABS_API_KEY){
    try{return res.status(200).json({text:await transcribeWithElevenLabs({key:process.env.ELEVENLABS_API_KEY,buf,type}),mode:'ai'})}
    catch(e){errors.push(e);console.error('[CineTale transcribe] primary speech-to-text failed',{status:e?.status,message:e?.message||String(e)})}
  }
  if(process.env.GEMINI_API_KEY){
    try{return res.status(200).json({text:await transcribeWithGemini({key:process.env.GEMINI_API_KEY,base64:parsed.base64,type}),mode:'ai'})}
    catch(e){errors.push(e);console.error('[CineTale transcribe] Gemini speech fallback failed',{status:e?.status,message:e?.message||String(e)})}
  }
  if(!process.env.ELEVENLABS_API_KEY&&!process.env.GEMINI_API_KEY) return res.status(503).json({error:'Voice transcription is not configured yet. You can still type or paste your story.'});
  const quota=errors.some(e=>e?.status===429);
  return res.status(quota?429:502).json({error:quota?'Voice transcription limit reached for now. Please try again later.':'Voice transcription could not be completed. Please try again or type your story.'});
}
