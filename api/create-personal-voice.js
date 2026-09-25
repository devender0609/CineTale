function parseDataUrl(raw=''){
  const m=String(raw||'').match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!m)return null;
  return {mime:m[1],base64:m[2].replace(/\s+/g,'')};
}
function extensionFor(mime='audio/webm'){
  if(/mpeg|mp3/i.test(mime))return 'mp3';
  if(/wav/i.test(mime))return 'wav';
  if(/mp4|m4a/i.test(mime))return 'm4a';
  if(/ogg/i.test(mime))return 'ogg';
  return 'webm';
}
async function errorMessage(r){
  try{const d=await r.json();return d?.detail?.message||d?.detail||d?.error?.message||d?.message||`ElevenLabs voice creation failed (${r.status})`}catch{return `ElevenLabs voice creation failed (${r.status})`}
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=String(process.env.ELEVENLABS_API_KEY||'').trim();
  if(!key)return res.status(503).json({error:'Personal voice creation requires ElevenLabs configuration.',code:'VOICE_NOT_CONFIGURED'});
  const {name='My CineTale Voice',audio,consentConfirmed=false,authorizationBasis='',minorAuthorization=false,removeBackgroundNoise=false}=req.body||{};
  if(consentConfirmed!==true)return res.status(400).json({error:'Voice authorization must be confirmed before creating a reusable personal voice.',code:'VOICE_CONSENT_REQUIRED'});
  const basis=String(authorizationBasis||'').trim();
  if(!['self','authorized-adult','authorized-minor'].includes(basis))return res.status(400).json({error:'Choose who owns this voice before continuing.',code:'VOICE_AUTHORIZATION_REQUIRED'});
  if(basis==='authorized-minor'&&minorAuthorization!==true)return res.status(400).json({error:'Parent/guardian or other lawful authorization is required for a minor’s voice.',code:'MINOR_VOICE_AUTH_REQUIRED'});
  const parsed=parseDataUrl(audio);
  if(!parsed)return res.status(400).json({error:'A valid recorded or uploaded audio sample is required.',code:'VOICE_SAMPLE_REQUIRED'});
  let bytes;
  try{bytes=Buffer.from(parsed.base64,'base64')}catch{return res.status(400).json({error:'The voice sample could not be decoded.',code:'VOICE_SAMPLE_INVALID'})}
  if(!bytes.length)return res.status(400).json({error:'The voice sample is empty.',code:'VOICE_SAMPLE_EMPTY'});
  if(bytes.length>20*1024*1024)return res.status(413).json({error:'Voice sample is too large. Use a recording under 20 MB.',code:'VOICE_SAMPLE_TOO_LARGE'});
  const form=new FormData();
  form.append('name',String(name||'My CineTale Voice').slice(0,80));
  form.append('description','Reusable personal voice created from CineTale after explicit user authorization.');
  form.append('remove_background_noise',removeBackgroundNoise?'true':'false');
  form.append('files[]',new Blob([bytes],{type:parsed.mime}),`cinetale-voice.${extensionFor(parsed.mime)}`);
  try{
    const r=await fetch('https://api.elevenlabs.io/v1/voices/add',{method:'POST',headers:{'xi-api-key':key},body:form});
    if(!r.ok){
      const message=await errorMessage(r);
      const permission=r.status===401||r.status===403||/permission|voice.*write|not authorized|scope/i.test(String(message));
      return res.status(permission?403:(r.status===422?422:502)).json({error:permission?'Your ElevenLabs key can generate speech but does not currently have permission to create reusable voices. Enable voice-write/voice-cloning access in ElevenLabs, then retry.':String(message),code:permission?'VOICE_WRITE_PERMISSION':'VOICE_CREATE_FAILED'});
    }
    const d=await r.json();
    return res.status(200).json({ok:true,voiceId:d.voice_id||'',requiresVerification:Boolean(d.requires_verification),createdAt:new Date().toISOString(),authorizationBasis:basis});
  }catch(e){
    console.error('[CineTale personal voice] creation failed',{message:e?.message||String(e)});
    return res.status(502).json({error:'Personal voice creation could not reach ElevenLabs. Your recording was not saved by CineTale.',code:'VOICE_PROVIDER_UNAVAILABLE'});
  }
}
