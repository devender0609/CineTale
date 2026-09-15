const demoVoices=[
  {voice_id:'browser-warm',name:'Warm storyteller',category:'Browser preview',labels:{use_case:'narration'}},
  {voice_id:'browser-calm',name:'Calm narrator',category:'Browser preview',labels:{use_case:'narration'}},
  {voice_id:'browser-bright',name:'Bright character',category:'Browser preview',labels:{use_case:'character'}}
];

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const key=process.env.ELEVENLABS_API_KEY;
  if(!key) return res.status(200).json({mode:'browser',voices:demoVoices});
  try{
    const r=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':key}});
    if(!r.ok) throw new Error(`voice list failed (${r.status})`);
    const d=await r.json();
    const voices=(d.voices||[]).map(v=>({voice_id:v.voice_id,name:v.name||'Voice',category:v.category||v.labels?.use_case||v.labels?.description||'Voice',labels:v.labels||{},preview_url:v.preview_url||''}));
    const narratorRequested=String(process.env.ELEVENLABS_NARRATOR_VOICE_ID||'').trim();
    const defaultRequested=String(process.env.ELEVENLABS_DEFAULT_VOICE_ID||'').trim();
    const narrator=voices.find(v=>v.voice_id===narratorRequested)||voices.find(v=>/narrat|story|audiobook/i.test(`${v.name} ${v.category} ${JSON.stringify(v.labels)}`))||voices.find(v=>v.voice_id===defaultRequested)||voices[0]||null;
    return res.status(200).json({mode:'ai',voices,narratorVoiceId:narrator?.voice_id||'',narratorVoiceName:narrator?.name||''});
  }catch(e){
    console.error('[CineTale voices] Voice catalog unavailable',{message:e?.message||String(e)});
    return res.status(502).json({error:'Voice catalog is temporarily unavailable.'});
  }
}
