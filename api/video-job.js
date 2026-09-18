function ageNumber(value=''){
  const m=String(value).match(/\b(\d{1,3})\b/);
  return m?Number(m[1]):null;
}
function hasKnownMinor(project={}){
  return (project.characters||[]).some(c=>{const n=ageNumber(c.age);return n!=null&&n<18});
}
function dataImage(value){
  const m=String(value||'').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  return m?{inlineData:{mimeType:m[1],data:m[2]}}:null;
}

function framingDirection(scene={}){
  const mode=String(scene.framing||'safe').toLowerCase();
  const common='Maintain stable character identity and deliberate composition across the full clip. Keep important faces fully inside the frame with comfortable headroom and side margins. Never accidentally cut through eyes, forehead, chin, or the center of a face. Avoid unintended edge clipping, abrupt push-ins, or zoom drift. Keep important hands and story-critical props visible when they are part of the action.';
  const modes={
    safe:'Use safe cinematic framing. Prefer a balanced medium or medium-wide composition. Keep every principal character readable in frame with extra safety margin around faces and heads. If two principal characters are present, keep both visually legible unless the scene explicitly calls for a single-character shot.',
    auto:'Respect the scene camera direction, but preserve safe face margins and avoid accidental cropping of principal characters or important props.',
    medium:'Use a stable medium shot, generally waist/chest-up as appropriate. Keep the full head and face comfortably inside frame and avoid pushing subjects against the image edge.',
    close:'Use an intentional close-up or medium close-up. A body may be cropped for composition, but keep the complete face, forehead, chin, and key expression fully visible with breathing room.',
    wide:'Use a wide establishing composition that clearly shows the environment while keeping principal characters fully visible and recognizable.'
  };
  return `${common} ${modes[mode]||modes.safe}`;
}

function sceneToPrompt(scene={},project={}){
  const cast=(project.characters||[]).map(c=>{
    const sacred=c.sacredIdentity?` Sacred identity: ${c.sacredIdentity}.`:'';
    return `${c.name}: ${c.role||'character'}, ${c.age||'age open'}, ${c.appearance||''}, wardrobe ${c.wardrobe||'story appropriate'}.${sacred}`;
  }).join(' | ');
  return [
    project.title?`Production: ${project.title}.`:'',
    project.format?`Format: ${project.format}.`:'',
    project.style?`Visual direction: ${project.style}.`:'',
    project.culturalTreatment?`Cultural treatment: ${project.culturalTreatment}.`:'',
    cast?`Recurring cast continuity: ${cast}`:'',
    `Scene: ${scene.title||'Untitled scene'}.`,
    scene.visual||scene.purpose||'Cinematic scene',
    scene.camera?`Camera movement and framing: ${scene.camera}.`:'',
    `Framing safety: ${framingDirection(scene)}`,
    scene.sfx?`Ambient sound direction: ${scene.sfx}.`:'',
    scene.music?`Music mood reference: ${scene.music}.`:'',
    'Preserve the storyboard composition, character identity, age presentation, wardrobe, culture, location and visual style. Natural motion and physically coherent movement. No identity swaps. Do not invent a tighter crop than the storyboard unless the selected framing explicitly asks for a close-up.',
    'Do not generate spoken dialogue or narration. Use environmental/ambient sound only because CineTale adds the approved character and narrator voices separately.',
    'No captions, subtitles, logos, watermarks, interface elements or written overlays.'
  ].filter(Boolean).join(' ');
}
function qualityConfig(scene={},project={}){
  const q=['draft','standard','premium'].includes(String(scene.tier||'standard').toLowerCase())?String(scene.tier||'standard').toLowerCase():'standard';
  const defaults={
    draft:{model:'veo-3.1-lite-generate-preview',resolution:'720p',duration:'4'},
    standard:{model:'veo-3.1-fast-generate-preview',resolution:'720p',duration:'6'},
    premium:{model:'veo-3.1-generate-preview',resolution:'1080p',duration:'8'}
  }[q];
  const model=process.env[`VEO_MODEL_${q.toUpperCase()}`]||process.env.VEO_MODEL||defaults.model;
  const resolution=process.env[`VEO_RESOLUTION_${q.toUpperCase()}`]||process.env.VEO_RESOLUTION||defaults.resolution;
  let duration=String(process.env[`VEO_DURATION_${q.toUpperCase()}`]||process.env.VEO_DURATION_SECONDS||defaults.duration);
  if(!['4','6','8'].includes(duration)) duration=defaults.duration;
  if(['1080p','4k'].includes(resolution)) duration='8';
  const aspectRatio=project.format==='Short'?'9:16':(process.env.VEO_ASPECT_RATIO||'16:9');
  return {q,model,resolution,duration,aspectRatio};
}

export {sceneToPrompt,qualityConfig,hasKnownMinor,dataImage,framingDirection};

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const body=req.body||{};
  const scene=body.scene || (body.scenes||[])[0];
  const project=body.project||{};
  if(!scene) return res.status(400).json({error:'A scene is required'});

  const geminiKey=process.env.GEMINI_API_KEY;
  const enabled=String(process.env.ENABLE_LIVE_VIDEO||'false').toLowerCase()==='true';
  if(enabled && geminiKey){
    try{
      const cfg=qualityConfig(scene,project);
      const parameters={aspectRatio:cfg.aspectRatio,resolution:cfg.resolution,durationSeconds:Number(cfg.duration)};
      const instance={prompt:sceneToPrompt(scene,project)};
      // Veo image-to-video currently restricts person generation to adults. To avoid rejecting
      // stories with minors, only use the storyboard as a first-frame reference when the known cast is adult-only.
      const firstFrame=dataImage(scene.image);
      const usingFirstFrame=Boolean(firstFrame && !hasKnownMinor(project));
      if(usingFirstFrame){instance.image=firstFrame;parameters.personGeneration='allow_adult';}
      else parameters.personGeneration='allow_all';

      const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const retryDelaySeconds=(r,d)=>{
        const header=Number(r?.headers?.get?.('retry-after'));
        if(Number.isFinite(header)&&header>0)return Math.min(300,Math.ceil(header));
        const details=Array.isArray(d?.error?.details)?d.error.details:[];
        for(const item of details){
          const raw=String(item?.retryDelay||item?.retry_delay||'');
          const m=raw.match(/([0-9]+(?:\.[0-9]+)?)s/i);
          if(m)return Math.min(300,Math.ceil(Number(m[1])));
        }
        const text=String(d?.error?.message||'');
        const m=text.match(/(?:retry|try again)(?:\s+in| after)?\s+([0-9]+(?:\.[0-9]+)?)\s*(?:s|sec|second)/i);
        return m?Math.min(300,Math.ceil(Number(m[1]))):0;
      };
      const transient=(r,d)=>r.status===408||r.status===425||r.status===429||r.status>=500||/quota|rate limit|resource exhausted|too many requests|temporar(?:y|ily)|unavailable/i.test(String(d?.error?.message||''));
      const callVeoOnce=async(model,resolution=cfg.resolution,duration=cfg.duration)=>{
        const requestParameters={...parameters,resolution,durationSeconds:Number(duration)};
        if(['1080p','4k'].includes(resolution))requestParameters.durationSeconds=8;
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`,{
          method:'POST',
          headers:{'x-goog-api-key':geminiKey,'content-type':'application/json'},
          body:JSON.stringify({instances:[instance],parameters:requestParameters})
        });
        const d=await r.json().catch(()=>({}));
        return {r,d,model,resolution,duration:Number(requestParameters.durationSeconds),retryAfterSeconds:retryDelaySeconds(r,d)};
      };
      const callVeo=async(model,resolution=cfg.resolution,duration=cfg.duration)=>{
        let last;
        for(let attempt=0;attempt<4;attempt++){
          last=await callVeoOnce(model,resolution,duration);
          if(last.r.ok||!transient(last.r,last.d))return last;
          // Respect a short provider Retry-After inside this request; long cooldowns are returned to the client.
          const providerWait=Number(last.retryAfterSeconds)||0;
          if(providerWait>12)return last;
          const backoff=Math.min(8000,(1000*(2**attempt))+Math.floor(Math.random()*650));
          await sleep(Math.max(backoff,providerWait*1000));
        }
        return last;
      };
      let result=await callVeo(cfg.model);
      const rawError=String(result.d?.error?.message||'');
      const quotaLike=result.r.status===429||/quota|rate limit|resource exhausted|too many requests/i.test(rawError);
      const allowFallback=Boolean(body.allowQualityFallback);
      let fallbackFrom=null;
      if(!result.r.ok&&quotaLike&&allowFallback&&cfg.model!=='veo-3.1-lite-generate-preview'){
        fallbackFrom=cfg.model;
        result=await callVeo('veo-3.1-lite-generate-preview','720p',cfg.q==='standard'?'6':'4');
        if(result.r.ok&&result.d?.name)return res.status(200).json({mode:'ai',provider:'video',status:'queued',operation:result.d.name,quality:cfg.q,model:result.model,fallbackFrom,resolution:result.resolution,durationSeconds:result.duration,aspectRatio:cfg.aspectRatio,continuitySource:usingFirstFrame?'storyboard-first-frame':'text-continuity'});
      }
      if(!result.r.ok){
        const message=result.d?.error?.message||`Video service error (${result.r.status})`;
        const quota=result.r.status===429||/quota|rate limit|resource exhausted|too many requests/i.test(String(message));
        const retryAfterSeconds=Number(result.retryAfterSeconds)||60;
        return res.status(quota?429:502).json({
          error:quota?'Video generation is temporarily limited by Google. Your scene is safe; CineTale will let you retry when the provider window clears.':message,
          providerError:message,
          errorCode:quota?'VIDEO_QUOTA':'VIDEO_REQUEST',
          model:result.model,
          fallbackFrom,
          retryAfterSeconds:quota?retryAfterSeconds:undefined
        });
      }
      if(!result.d.name) return res.status(502).json({error:'Video service did not return an operation',errorCode:'VIDEO_REQUEST'});
      return res.status(200).json({mode:'ai',provider:'video',status:'queued',operation:result.d.name,quality:cfg.q,model:result.model,resolution:result.resolution,durationSeconds:result.duration,aspectRatio:cfg.aspectRatio,continuitySource:usingFirstFrame?'storyboard-first-frame':'text-continuity'});
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

  return res.status(200).json({mode:'demo',status:'not_configured',message:'Live video is off. Set ENABLE_LIVE_VIDEO=true in Vercel. CineTale will use the existing GEMINI_API_KEY for Veo.'});
}
