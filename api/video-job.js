function sceneToPrompt(scene={},project={}){
  const dialogue=(scene.dialogue||[]).join(' ');
  const cast=(project.characters||[]).map(c=>`${c.name}: ${c.appearance||''}; voice ${c.voice||''}`).join(' | ');
  return [
    project.title?`Series: ${project.title}.`:'' ,
    project.style?`Visual direction: ${project.style}.`:'' ,
    cast?`Recurring cast continuity: ${cast}.`:'' ,
    scene.visual||scene.purpose||scene.title||'Cinematic scene',
    scene.camera?`Camera: ${scene.camera}.`:'',
    scene.music?`Music direction: ${scene.music}.`:'',
    scene.sfx?`Sound effects: ${scene.sfx}.`:'',
    dialogue?`Dialogue: ${dialogue}`:'',
    'Original fictional characters only. Maintain cinematic continuity. No captions or logos.'
  ].filter(Boolean).join(' ');
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const body=req.body||{};
  const scene=body.scene || (body.scenes||[])[0];
  if(!scene) return res.status(400).json({error:'A scene is required'});

  const geminiKey=process.env.GEMINI_API_KEY;
  const enabled=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true';
  if(enabled && geminiKey){
    try{
      const q=['draft','standard','premium'].includes(String(scene.tier||'standard').toLowerCase())?String(scene.tier||'standard').toLowerCase():'standard';
      const model=process.env[`VEO_MODEL_${q.toUpperCase()}`] || process.env.VEO_MODEL || 'veo-3.1-fast-generate-preview';
      const parameters={
        aspectRatio:process.env.VEO_ASPECT_RATIO||'16:9',
        resolution:process.env[`VEO_RESOLUTION_${q.toUpperCase()}`] || process.env.VEO_RESOLUTION || '720p',
        numberOfVideos:1
      };
      const instance={prompt:sceneToPrompt(scene,body.project||{})};
      const m=String(scene.image||'').match(/^data:(image\/[^;]+);base64,(.+)$/);
      if(m) instance.image={inlineData:{mimeType:m[1],data:m[2]}};
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`,{
        method:'POST',
        headers:{'x-goog-api-key':geminiKey,'content-type':'application/json'},
        body:JSON.stringify({instances:[instance],parameters})
      });
      const d=await r.json();
      if(!r.ok) return res.status(502).json({error:d?.error?.message||`Video service error (${r.status})`});
      if(!d.name) return res.status(502).json({error:'Video service did not return an operation'});
      return res.status(200).json({mode:'ai',provider:'video',status:'queued',operation:d.name});
    }catch(e){return res.status(502).json({error:e.message||'Video generation unavailable'});}
  }

  const url=process.env.VIDEO_PROVIDER_URL, key=process.env.VIDEO_PROVIDER_KEY;
  if(url&&key){
    try{
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify(body)});
      const data=await r.json();
      return res.status(r.ok?200:502).json({mode:'ai',status:r.ok?'queued':'error',...data});
    }catch(e){return res.status(502).json({error:'Video job service unavailable'});}
  }

  return res.status(200).json({mode:'demo',status:'not_configured',message:'Live video is off. Set ENABLE_LIVE_VIDEO=true with GEMINI_API_KEY after setting a budget.'});
}
