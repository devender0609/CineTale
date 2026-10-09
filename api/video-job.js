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
  const common='Maintain stable character identity and deliberate composition across the full clip. Keep every principal face and full head fully inside the frame for the entire shot with generous headroom and side safety margins. Never let a principal face, forehead, chin, hairline or head touch/cross the frame edge. Avoid unintended edge clipping, abrupt push-ins, zoom drift or reframing that moves a principal subject partly off-screen. Keep important hands and story-critical props visible when they are part of the action. When uncertain, frame wider rather than tighter.';
  const modes={
    safe:'Use safe cinematic framing. Prefer a balanced medium-wide composition with approximately 10–15% breathing room around principal heads/faces. Keep every principal character readable in frame with extra safety margin. If two or more principal characters are present, keep all principal faces fully visible unless the scene explicitly calls for a single-character shot. Never crop a principal face at the left/right/top edge.',
    auto:'Respect the scene camera direction, but preserve safe face margins and avoid accidental cropping of principal characters or important props.',
    medium:'Use a stable medium shot, generally waist/chest-up as appropriate. Keep the full head and face comfortably inside frame and avoid pushing subjects against the image edge.',
    close:'Use an intentional close-up or medium close-up. A body may be cropped for composition, but keep the complete face, forehead, chin, and key expression fully visible with breathing room.',
    wide:'Use a wide establishing composition that clearly shows the environment while keeping principal characters fully visible and recognizable.'
  };
  return `${common} ${modes[mode]||modes.safe}`;
}


function compact(value=''){return String(value||'').replace(/\s+/g,' ').trim()}
function coverageNeighbors(scene={},shot={}){
  const plan=Array.isArray(scene.coveragePlan)?scene.coveragePlan.filter(Boolean):[];
  const idx=plan.findIndex(x=>String(x?.id||'')===String(shot?.id||''));
  return {previous:idx>0?plan[idx-1]:null,next:idx>=0&&idx<plan.length-1?plan[idx+1]:null};
}
function storyContinuityPacket(scene={},project={},shot={}){
  const {previous,next}=coverageNeighbors(scene,shot);
  const canon=Array.isArray(project?.worldBible?.canon)?project.worldBible.canon.filter(Boolean).slice(-8):[];
  const cast=(project.characters||[]).map(c=>`${c.name}: appearance ${compact(c.appearance)||'as established'}; wardrobe ${compact(c.wardrobe)||'as established'}; role ${compact(c.role)||'character'}`).join(' | ');
  const focal=compact(shot?.continuityObject);
  return [
    'SCENE CONTINUITY CONTRACT — treat these as hard constraints, not suggestions.',
    cast?`LOCKED CAST: ${cast}.`:'',
    focal?`LOCKED STORY-CRITICAL PROP: ${focal}. Keep the same physical design, material, color, age, orientation, markings and identity in every shot. Do not substitute or redesign it.`:'',
    `LOCKED LOCATION / LIGHTING: remain in the same scene location and preserve established architecture, time of day, light direction, weather/interior conditions and major set dressing unless the story explicitly changes them.`,
    scene.dramaticPurpose?`SCENE DRAMATIC PURPOSE: ${compact(scene.dramaticPurpose)}.`:'',
    scene.characterObjective?`CHARACTER OBJECTIVE: ${compact(scene.characterObjective)}.`:'',
    scene.obstacle?`SCENE RESISTANCE / OBSTACLE: ${compact(scene.obstacle)}.`:'',
    scene.entryState?`ENTRY STATE: ${compact(scene.entryState)}.`:'',
    scene.exitState?`EXIT STATE TO REACH: ${compact(scene.exitState)}.`:'',
    scene.newInformation?`NEW STORY INFORMATION / CHANGE: ${compact(scene.newInformation)}.`:'',
    scene.emotionalTurn?`EMOTIONAL TURN: ${compact(scene.emotionalTurn)}.`:'',
    shot?.storyBeat?`ASSIGNED STORY BEAT: ${compact(shot.storyBeat)}. This beat must visibly happen in this shot and must not be replaced by a generic variation.`:'',
    Array.isArray(scene.continuityLocks)&&scene.continuityLocks.length?`SCENE CONTINUITY LOCKS: ${scene.continuityLocks.map(compact).filter(Boolean).join(' | ')}.`:'',
    previous?`PREVIOUS SHOT STATE: Shot ${previous.order} (${previous.kind||'coverage'}) objective was: ${compact(previous.directorObjective||previous.purpose)}. Its primary action was: ${compact(previous.directorAction||previous.visual)}. Continue AFTER that action; do not replay it.`:'THIS IS THE FIRST SHOT: establish the starting physical state clearly and do not jump ahead to later actions.',
    next?`NEXT SHOT INTENT: Shot ${next.order} (${next.kind||'coverage'}) will handle: ${compact(next.directorObjective||next.purpose)}. Do not steal or pre-play that shot's main action.`:'THIS IS THE LAST SHOT: finish on the intended visual turn without starting a new beat.',
    shot?.directorObjective?`CURRENT SHOT OBJECTIVE: ${compact(shot.directorObjective)}.`:'',
    shot?.directorAction?`CURRENT SHOT ACTION ONLY: ${compact(shot.directorAction)}.`:'',
    shot?.directorAvoid?`DO NOT: ${compact(shot.directorAvoid)}.`:'',
    `ANTI-REPETITION: this shot must add NEW story information or a NEW emotional/visual perspective. Do not create another take of an adjacent shot merely with a different crop.`,
    `ACTION CONTINUITY: preserve who is standing/sitting, what each hand holds, where important props are, and whether a reveal has already happened. A discovered object stays discovered; a closed object stays closed until its designated opening/reveal shot.`,
    canon.length?`SERIES CANON CONTEXT: ${canon.join(' | ')}`:''
  ].filter(Boolean).join(' ');
}


function videoIdentitySafetyPacket(project={}){
  const chars=Array.isArray(project.characters)?project.characters:[];
  const sacred=chars.filter(c=>String(c?.sacredIdentity||'').trim()||/ganesh|ganesha|kartikeya|parvati|shiva|krishna|rama|hanuman|durga|lakshmi|saraswati/i.test(String(c?.name||'')));
  const sacredNames=sacred.map(c=>String(c?.name||'').trim()).filter(Boolean);
  const authorizedRefs=chars.some(c=>Boolean(c?.referencePhoto)&&Boolean(c?.referencePhotoConsent));
  return [
    'IDENTITY SAFETY CONTRACT: every humanlike face in this video must be a wholly original synthetic character design created for this story, not an identifiable real person, actor, celebrity, public figure, politician, influencer, historical photograph subject, or lookalike.',
    'Do not imitate or reproduce the facial likeness, hairstyle-signature, distinctive pose, costume from a famous performance, or other identifying appearance of any known real individual.',
    sacredNames.length?`MYTHOLOGICAL / DEVOTIONAL FICTION: ${sacredNames.join(', ')} are traditional sacred or mythological story identities in this project, not requests to portray any real actor or public figure. Render them as respectful, original devotional-fantasy character designs with invented faces while preserving their canonical symbolic attributes, wardrobe, age presentation and story role.`:'',
    authorizedRefs?'If a creator-authorized personal reference exists, use it only where explicitly supplied and permitted; never substitute a celebrity/public-figure likeness.':'No real-person likeness is requested or required.',
    'REALISTIC STYLE CLARIFICATION: cinematic realism means believable lighting, materials, anatomy, movement and environments. It does NOT mean copying a real human face. Prefer an original cinematic-fantasy face whenever there is any ambiguity.'
  ].filter(Boolean).join(' ');
}
function providerSafeStyle(style=''){
  const raw=compact(style);
  if(!raw)return 'cinematic realistic fantasy with original synthetic character faces';
  return raw
    .replace(/photorealistic\s+live[- ]action/ig,'cinematic realistic fantasy')
    .replace(/live[- ]action\s+photorealistic/ig,'cinematic realistic fantasy')
    .replace(/photo[- ]?realistic/ig,'cinematic realistic')+
    ' — use wholly original synthetic faces and no resemblance to any identifiable real person or celebrity.';
}
function sceneToPrompt(scene={},project={}){
  const shot=scene.coverageShot||null;
  const speakerKey=String(shot?.speaker||'').trim().toLowerCase();
  const speakingCharacter=speakerKey?(project.characters||[]).find(c=>String(c?.name||'').trim().toLowerCase()===speakerKey):null;
  const cast=(project.characters||[]).map(c=>{
    const sacred=c.sacredIdentity?` Sacred identity: ${c.sacredIdentity}.`:'';
    return `${c.name}: ${c.role||'character'}, ${c.age||'age open'}, ${c.appearance||''}, wardrobe ${c.wardrobe||'story appropriate'}.${sacred}`;
  }).join(' | ');
  return [
    project.title?`Production: ${project.title}.`:'',
    project.format?`Format: ${project.format}.`:'',
    project.style?`Visual direction: ${providerSafeStyle(project.style)}.`:'',
    project.worldBible?.storyArchitecture?.dramaticSpine?`STORY DRAMATIC SPINE: ${compact(project.worldBible.storyArchitecture.dramaticSpine)}.`:'',
    project.worldBible?.storyArchitecture?.centralConflict?`CENTRAL CONFLICT: ${compact(project.worldBible.storyArchitecture.centralConflict)}.`:'',
    project.worldBible?.storyArchitecture?.stakes?`STAKES: ${compact(project.worldBible.storyArchitecture.stakes)}.`:'',
    videoIdentitySafetyPacket(project),
    project.culturalTreatment?`Cultural treatment: ${project.culturalTreatment}.`:'',
    project.culturalContext?`Creator cultural/place/tradition context: ${project.culturalContext}. Preserve relevant people, clothing, architecture, objects, environment and customs respectfully; do not stereotype or invent uncertain sacred/historical specifics.`:'',
    project.worldBible?.globalContext?`World context memory: ${compact(JSON.stringify(project.worldBible.globalContext))}. Preserve only story-relevant cultural, belief, language, festival/tradition, time/place and respect constraints. Do not add unsupported ritual or sacred specifics.`:'',
    cast?`Recurring cast continuity: ${cast}`:'',
    `Scene: ${scene.title||'Untitled scene'}.`,
    `STORY-BEAT CONTEXT ONLY — understand this beat, but do not reenact every sentence in every shot: ${scene.visual||scene.purpose||'Cinematic scene'}.`,
    scene.dramaticPurpose?`Why this scene exists: ${scene.dramaticPurpose}.`:'',
    scene.handoff?`Scene handoff: ${scene.handoff}.`:'',
    shot?storyContinuityPacket(scene,project,shot):'',
    shot?`SHOT ${shot.order||''} (${shot.kind||'coverage'}): ${shot.purpose||''}. Execute only this shot's assigned action: ${shot.visual||''}`:(scene.visual||scene.purpose||'Cinematic scene'),
    shot?.camera?`Shot camera: ${shot.camera}.`:(scene.camera?`Camera movement and framing: ${scene.camera}.`:''),
    `Framing safety: ${framingDirection(scene)}`,
    shot?.speaking?`Dialogue timing target: keep the lips naturally closed before speech and begin visible mouth articulation only with the first spoken phoneme. Deliver the complete quoted line once at natural conversational pace, without rushing, truncating, repeating or adding words. Keep the visible articulation tightly matched to that exact sentence.`:'',
    shot?.speaking&&speakingCharacter?`LOCKED SPEAKER IDENTITY: the only speaking face is ${speakingCharacter.name}, ${speakingCharacter.age||'age as defined'}, appearance ${speakingCharacter.appearance||'as established'}, wardrobe ${speakingCharacter.wardrobe||'as established'}. Preserve this exact recurring identity. Do not transfer the line, mouth movement, age, face, hairstyle, glasses, clothing, or identity to another character.`:'',
    scene.sfx?`Ambient sound direction: ${scene.sfx}.`:'',
    scene.music?`Music mood reference: ${scene.music}.`:'',
    'Preserve the storyboard composition, character identity, age presentation, wardrobe, culture, location and visual style. Natural motion and physically coherent movement. No identity swaps. Do not invent a tighter crop than the storyboard unless the selected framing explicitly asks for a close-up. Preserve story-critical props exactly across shots; if a prop has already appeared, it is the same object, not a new interpretation.',
    shot?.speaking?`SPEAKING PERFORMANCE SHOT: ${shot.speaker||'The speaking character'} says this exact line aloud, with no extra words: "${shot.spokenLine||''}". Frame the speaking character as the clear primary face. Whenever practical, keep other characters off-camera during the spoken line; if another character must remain visible, that character's mouth stays naturally closed and does not articulate speech. The visible mouth, jaw and facial articulation of the named speaker must clearly track the spoken words and pauses from beginning to end. Keep the speaker on camera for the full line in a stable medium or medium-close composition with natural eyeline and believable conversational expression. Generate synchronized native dialogue audio only as a temporary facial-performance guide so the mouth movement is driven by the exact sentence. Do not add a second speaker, background speech, ad-libs, humming or vocal reactions. CineTale will mute this guide speech during creator playback and final assembly and replace it with the creator-approved character voice.`:'NARRATION / ACTION SHOT: Do not create visible speaking or dialogue-like lip movement. Use natural environmental performance, reactions and ambient motion only.',
    'No captions, subtitles, logos, watermarks, interface elements or written overlays.'
  ].filter(Boolean).join(' ');
}
function qualityConfig(scene={},project={}){
  const q=['draft','standard','premium'].includes(String(scene.tier||'standard').toLowerCase())?String(scene.tier||'standard').toLowerCase():'standard';
  const defaults={
    draft:{model:'gemini-omni-1.1-flash',resolution:'360p'},
    standard:{model:'gemini-omni-1.1-flash',resolution:'720p'},
    premium:{model:'gemini-omni-1.1-flash',resolution:'1080p'}
  }[q];
  const model=String(process.env[`OMNI_VIDEO_MODEL_${q.toUpperCase()}`]||process.env.OMNI_VIDEO_MODEL||defaults.model).trim();
  const resolution=String(process.env[`OMNI_VIDEO_RESOLUTION_${q.toUpperCase()}`]||process.env.OMNI_VIDEO_RESOLUTION||defaults.resolution).trim().toLowerCase();
  const planned=Number(scene?.coverageShot?.durationSec||scene?.coverageShot?.targetClipSec||6);
  const duration=Math.max(3,Math.min(10,Number.isFinite(planned)&&planned>0?planned:6));
  const aspectRatio=project.format==='Short'?'9:16':(process.env.OMNI_VIDEO_ASPECT_RATIO||process.env.VEO_ASPECT_RATIO||'16:9');
  return {q,model,resolution,duration,aspectRatio};
}

export {sceneToPrompt,qualityConfig,hasKnownMinor,dataImage,framingDirection,videoIdentitySafetyPacket,providerSafeStyle};

function shotMetadata(scene={}){
  const shot=scene.coverageShot||null;
  return {speaking:Boolean(shot?.speaking),speaker:shot?.speaker||'',spokenLine:shot?.spokenLine||'',speechGuide:Boolean(shot?.speaking)};
}

export default async function handler(req,res){
  const runtimeMode=String(process.env.CINETALE_RUNTIME_MODE||'').trim().toLowerCase()||((String(process.env.VERCEL_ENV||'').toLowerCase()&&String(process.env.VERCEL_ENV||'').toLowerCase()!=='production')?'development':'production');
  const paidOverride=String(process.env.CINETALE_ALLOW_PAID_GENERATION||'').trim().toLowerCase();
  const paidAllowed=paidOverride?paidOverride==='true':runtimeMode==='production';
  if(req.method==='POST'&&!paidAllowed)return res.status(423).json({errorCode:'PAID_GENERATION_LOCKED',error:'Paid video generation is locked in this development deployment. Existing provider operations can still be checked and recovered.'});
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
      const firstFrame=dataImage(scene.image);
      const usingFirstFrame=Boolean(firstFrame);
      const targetSeconds=Math.max(3,Math.min(10,Number(cfg.duration)||6));
      const prompt=`${sceneToPrompt(scene,project)} TARGET CLIP LENGTH: approximately ${targetSeconds} seconds. Complete the assigned shot beat within that duration without adding a new story beat.`;
      const input=[];
      if(firstFrame)input.push({type:'image',data:firstFrame.inlineData.data,mime_type:firstFrame.inlineData.mimeType});
      input.push({type:'text',text:prompt});
      const payload={
        model:cfg.model,
        input,
        response_format:{type:'video',delivery:'uri',aspect_ratio:cfg.aspectRatio,resolution:cfg.resolution},
        generation_config:{video_config:{task:usingFirstFrame?'image_to_video':'text_to_video'}},
        background:true,
        store:true
      };
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
        method:'POST',
        headers:{'x-goog-api-key':geminiKey,'content-type':'application/json','Api-Revision':'2026-05-20'},
        body:JSON.stringify(payload)
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        const message=d?.error?.message||`Video service error (${r.status})`;
        const quota=r.status===429||/quota|rate limit|resource exhausted|too many requests/i.test(String(message));
        const retryAfter=Number(r.headers?.get?.('retry-after'))||60;
        return res.status(quota?429:502).json({
          error:quota?'Video generation is temporarily limited by Google. Your shot is safe; CineTale will preserve the request state and let you retry when the provider window clears.':message,
          providerError:message,
          errorCode:quota?'VIDEO_QUOTA':'VIDEO_REQUEST',
          model:cfg.model,
          retryAfterSeconds:quota?retryAfter:undefined
        });
      }
      const interactionId=String(d?.id||'').trim();
      if(!interactionId)return res.status(502).json({error:'The video service did not return a render job id',errorCode:'VIDEO_REQUEST'});
      const operation=`interaction:${interactionId}`;
      return res.status(200).json({mode:'ai',provider:'google-gemini-omni',status:d?.status==='completed'?'queued':'queued',operation,quality:cfg.q,model:cfg.model,resolution:cfg.resolution,durationSeconds:targetSeconds,aspectRatio:cfg.aspectRatio,continuitySource:usingFirstFrame?'storyboard-reference':'text-continuity',...shotMetadata(scene)});
    }catch(e){return res.status(502).json({error:e.message||'Video generation is temporarily unavailable'});}
  }

  const url=process.env.VIDEO_PROVIDER_URL, key=process.env.VIDEO_PROVIDER_KEY;
  if(url&&key){
    try{
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify(body)});
      const data=await r.json();
      return res.status(r.ok?200:502).json({mode:'ai',status:r.ok?'queued':'error',...data});
    }catch(e){return res.status(502).json({error:'Video job service unavailable'});}
  }

  return res.status(200).json({mode:'demo',status:'not_configured',message:'Live video is not enabled on this deployment.'});
}
