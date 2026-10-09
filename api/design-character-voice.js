function clean(value,max=1000){return String(value||'').trim().slice(0,max)}
function normalizePresentation(value=''){const v=clean(value,40).toLowerCase();return v.includes('femin')?'female':v.includes('masc')?'male':'neutral'}
function normalizeLocale(value=''){const v=clean(value,20);return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(v)?v:''}
function previewText(){
  // Keep provider-facing preview copy neutral. Story, sacred-identity, character-name,
  // and Child-specific context remain inside CineTale and are never forwarded to Voice Design.
  return 'आज की सुबह शांत और उजली है। मैं साफ़, सहज और स्वाभाविक ढंग से बोल रहा हूँ, ताकि हर शब्द स्पष्ट सुनाई दे और भाव गर्मजोशी भरा रहे। इस छोटे से संवाद में गति संतुलित है और स्वर सरल, संयमित तथा प्राकृतिक है।';
}
function voiceDescription(body={}){
  const presentation=normalizePresentation(body.presentation),performance=clean(body.performance,80)||'natural',pace=clean(body.pace,40)||'natural',locale=normalizeLocale(body.locale)||'hi-IN';
  const gender=presentation==='female'?'female':presentation==='male'?'male':'androgynous';
  const language=locale==='hi-IN'?'Native Hindi speaker from India':`Native ${locale} speaker`;
  // This description intentionally follows the provider's documented Voice Design vocabulary.
  // It describes only the controlled Teen fallback. Never pass the protected Child target,
  // a character name, sacred identity, story role, or user free-text character description.
  return [
    `Adolescent ${gender}`,
    language,
    `${performance.toLowerCase()} tone`,
    `${pace.toLowerCase()} pacing`,
    'clear diction',
    'warm natural conversational delivery',
    'cinematic character dialogue',
    'gentle emotional restraint'
  ].join(', ').slice(0,1000);
}
function providerError(detail,status){
  const raw=typeof detail==='string'?detail:(detail?.message||detail?.detail||detail?.error||'');
  const msg=clean(raw,900)||`Voice design failed (${status})`;
  const safety=/safety|guideline|policy|blocked|not follow/i.test(msg);
  return {message:msg,code:safety?'provider_safety_block':'provider_voice_design_error',retryable:!safety,status};
}
async function jsonBody(req){if(req.body&&typeof req.body==='object')return req.body;try{return JSON.parse(req.body||'{}')}catch{return {}}}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=clean(process.env.ELEVENLABS_API_KEY,500);if(!key)return res.status(503).json({error:'Youthful voice design is unavailable because the configured voice service does not support it.'});
  const body=await jsonBody(req),action=clean(body.action,20)||'generate';
  try{
    if(action==='generate'){
      const description=voiceDescription(body),text=previewText();
      const r=await fetch('https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({voice_description:description,model_id:'eleven_multilingual_ttv_v2',text,auto_generate_text:false,guidance_scale:3,should_enhance:false})});
      const d=await r.json().catch(()=>({}));if(!r.ok){const pe=providerError(d?.detail||d?.error||d,r.status);const err=new Error(pe.message);Object.assign(err,pe);throw err;}
      const previews=(d.previews||[]).slice(0,3).map((p,i)=>({id:clean(p.generated_voice_id,200),audio:p.audio_base_64?`data:${clean(p.media_type,80)||'audio/mpeg'};base64,${p.audio_base_64}`:'',duration:Number(p.duration_secs)||0,language:clean(p.language,40),label:`Option ${i+1}`})).filter(x=>x.id&&x.audio);
      if(!previews.length)throw new Error('The voice service did not return usable preview options.');
      return res.status(200).json({ok:true,mode:'controlled-teen-fallback',description,previews,creditsMayBeUsed:true});
    }
    if(action==='save'){
      const generatedVoiceId=clean(body.generatedVoiceId,200);if(!generatedVoiceId)return res.status(400).json({error:'A generated voice preview must be selected first.'});
      const description=clean(body.description,1000)||voiceDescription(body),name=clean(body.voiceName,120)||'CineTale youthful character voice',presentation=normalizePresentation(body.presentation);
      const labels={language:clean(body.language,80)||'Hindi',accent:clean(body.accentDirection,80)||'Indian',gender:presentation,age:'teen',use_case:'characters_animation'};
      const r=await fetch('https://api.elevenlabs.io/v1/text-to-voice',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({voice_name:name,voice_description:description,generated_voice_id:generatedVoiceId,labels})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.detail?.message||d?.detail||d?.error||`Saving designed voice failed (${r.status})`);
      const voiceId=clean(d.voice_id,200);if(!voiceId)throw new Error('The voice service did not return a saved voice ID.');
      return res.status(200).json({ok:true,voiceId,voiceName:clean(d.name,120)||name,provider:'elevenlabs',fallbackAge:'Teen',exactMatch:false,controlledFallback:true});
    }
    return res.status(400).json({error:'Unsupported action'});
  }catch(e){const safety=e?.code==='provider_safety_block';return res.status(safety?409:502).json({error:safety?'The voice provider declined this designed fallback request. CineTale will keep the original voice requirement protected and will not retry automatically.':(e?.message||'Youthful voice design failed.'),code:e?.code||'provider_voice_design_error',retryable:safety?false:(e?.retryable!==false),providerMessage:safety?clean(e?.message,500):undefined})}
}
