function clean(v,max=200){return String(v||'').trim().slice(0,max)}
async function listVoices(key){
  const r=await fetch('https://api.elevenlabs.io/v2/voices?page_size=20',{headers:{'xi-api-key':key}});
  if(!r.ok){const e=new Error(`ElevenLabs voice catalog failed (${r.status}).`);e.status=r.status;throw e}
  const d=await r.json();return Array.isArray(d.voices)?d.voices:[];
}
async function synthesize(key,voiceId,model){
  const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{
    method:'POST',headers:{'xi-api-key':key,'content-type':'application/json','accept':'audio/mpeg'},
    body:JSON.stringify({text:'CineTale voice check.',model_id:model})
  });
  if(!r.ok){let msg=`ElevenLabs speech check failed (${r.status}).`;try{const d=await r.json();msg=d?.detail?.message||d?.detail||d?.message||msg}catch{}const e=new Error(String(msg));e.status=r.status;throw e}
  const buf=Buffer.from(await r.arrayBuffer());if(buf.length<100)throw new Error('ElevenLabs returned an empty audio response.');return buf.length;
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=clean(process.env.ELEVENLABS_API_KEY,500);
  if(!key)return res.status(503).json({ok:false,error:'ElevenLabs is not configured.'});
  try{
    const voices=await listVoices(key);
    if(!voices.length)return res.status(502).json({ok:false,error:'ElevenLabs is reachable, but no usable voices were returned.'});
    const preferred=[clean(process.env.ELEVENLABS_NARRATOR_VOICE_ID),clean(process.env.ELEVENLABS_DEFAULT_VOICE_ID)].filter(Boolean);
    const voice=voices.find(v=>preferred.includes(v.voice_id))||voices[0];
    const primary=clean(process.env.ELEVENLABS_TTS_MODEL)||'eleven_v3';
    const models=[primary,'eleven_v3','eleven_multilingual_v2'].filter((m,i,a)=>m&&a.indexOf(m)===i);
    let last=null;
    for(const model of models){try{const bytes=await synthesize(key,voice.voice_id,model);return res.status(200).json({ok:true,provider:'elevenlabs',model,voiceId:voice.voice_id,voiceName:voice.name||'Voice',bytes,verifiedAt:new Date().toISOString()})}catch(e){last=e}}
    return res.status(last?.status||502).json({ok:false,error:last?.message||'ElevenLabs live speech verification failed.'});
  }catch(e){return res.status(e?.status||502).json({ok:false,error:e?.message||'ElevenLabs live verification failed.'})}
}
