import {demoNextEpisode} from '../lib/demo.js';
import {generateWithOpenAI,generateWithGemini} from '../lib/ai.js';
import {ensureSceneCoverage,detectContinuityConflicts} from '../lib/production.js';

function dialogueEntry(entry){
  if(typeof entry==='string') return entry.trim();
  if(entry==null) return '';
  if(typeof entry==='number'||typeof entry==='boolean') return String(entry);
  if(typeof entry==='object'){
    const speaker=String(entry.speaker||entry.character||entry.name||'').trim();
    const text=String(entry.text||entry.line||entry.dialogue||entry.content||entry.utterance||'').trim();
    if(speaker&&text) return `${speaker}: ${text}`;
    if(text) return text;
    const values=Object.values(entry).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
    if(values.length) return values.join(': ');
  }
  return '';
}
function cleanText(value=''){return String(value||'').replace(/\s+/g,' ').trim();}
function cleanArray(value,max=12){const arr=Array.isArray(value)?value:(value==null?[]:[value]);return [...new Set(arr.map(cleanText).filter(Boolean))].slice(0,max);}
function normalizeSceneIntelligence(scene={},index=0,total=1){
  scene.dramaticPurpose=cleanText(scene.dramaticPurpose||scene.purpose||'Advance the story through a meaningful change.');
  scene.characterObjective=cleanText(scene.characterObjective||'The focal character pursues a concrete objective.');
  scene.obstacle=cleanText(scene.obstacle||'Meaningful resistance complicates the objective.');
  scene.newInformation=cleanText(scene.newInformation||'The scene changes what the audience or characters understand.');
  scene.emotionalTurn=cleanText(scene.emotionalTurn||'The emotional state changes by the end of the scene.');
  scene.entryState=cleanText(scene.entryState||'Preserve the physical, emotional, and knowledge state inherited from the prior scene.');
  scene.exitState=cleanText(scene.exitState||`End in a changed state that motivates ${index===total-1?'the episode ending':'the next scene'}.`);
  scene.handoff=cleanText(scene.handoff||`Carry consequences and continuity into ${index===total-1?'the continuing series':'the next scene'}.`);
  scene.storyQuestion=cleanText(scene.storyQuestion||'What changes here, and why must the viewer see it now?');
  scene.continuityLocks=cleanArray(scene.continuityLocks,16);
  scene.visualProgression=cleanArray(scene.visualProgression,10);
  if(!scene.visualProgression.length)scene.visualProgression=cleanArray([scene.entryState,scene.visual,scene.newInformation,scene.emotionalTurn,scene.exitState],6);
  scene.scoreIntent=cleanText(scene.scoreIntent||scene.music||'Support the scene turn without overpowering dialogue.');
  scene.storyIntelligenceVersion='v1.10.49';
}
function normalizeEpisode(episode,n){
  if(!episode||typeof episode!=='object') return null;
  episode.number=n;
  episode.id=episode.id||null;
  episode.storyText=String(episode.storyText||'').trim();
  episode.storyApproved=false;
  episode.scenes=Array.isArray(episode.scenes)?episode.scenes:[];
  for(let sceneIndex=0;sceneIndex<episode.scenes.length;sceneIndex++){
    const s=episode.scenes[sceneIndex];
    const arr=Array.isArray(s.dialogue)?s.dialogue:(s.dialogue==null?[]:[s.dialogue]);
    s.dialogue=arr.map(dialogueEntry).filter(Boolean);
    if(s.narration&&typeof s.narration!=='string') s.narration=dialogueEntry(s.narration);
    s.framing=s.framing||'safe';normalizeSceneIntelligence(s,sceneIndex,episode.scenes.length);ensureSceneCoverage(s,'balanced');s.coverageClips=Array.isArray(s.coverageClips)?s.coverageClips:[];
  }
  return episode;
}
function usable(episode){return Boolean(episode&&String(episode.title||'').trim()&&String(episode.storyText||'').trim().length>=180&&Array.isArray(episode.scenes)&&episode.scenes.length>0)}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const project=req.body?.project; if(!project) return res.status(400).json({error:'Project required'});
  if(String(project.format||'Episode')!=='Episode') return res.status(400).json({error:'Only Episode projects can create a next episode.'});
  const requestId=String(req.body?.requestId||'').trim();
  const numbers=(project.episodes||[]).map(e=>Number(e?.number)||0);
  const n=Math.max(0,...numbers)+1;
  const context={
    title:project.title,logline:project.logline,genre:project.genre,audience:project.audience,
    language:project.language,languageScope:project.languageScope,culturalTreatment:project.culturalTreatment,culturalContext:project.culturalContext,languageDirection:project.languageDirection,regionCommunity:project.regionCommunity||project.worldBible?.globalContext?.regionCommunity||'',beliefContext:project.beliefContext||project.worldBible?.globalContext?.beliefContext||'',traditionContext:project.traditionContext||project.worldBible?.globalContext?.traditionContext||'',eraPlace:project.eraPlace||project.worldBible?.globalContext?.eraPlace||'',culturalGrounding:project.culturalGrounding||project.worldBible?.globalContext?.grounding||'grounded',languageBehavior:project.languageBehavior||project.worldBible?.globalContext?.languageBehavior||'natural',productionProfile:project.productionProfile||'balanced',
    visualStylePreset:project.visualStylePreset,style:project.style,continuityStrength:project.continuityStrength,
    worldBible:project.worldBible,
    globalStoryRule:'Preserve worldBible.globalContext across episodes. Do not silently change culture, belief context, language behavior, festival/tradition, time/place, family/social context, or respect guardrails. If the next episode intentionally changes one of these, make the change explicit in continuityWarnings.',
    characters:(project.characters||[]).map(c=>({id:c.id,name:c.name,role:c.role,age:c.age,pronouns:c.pronouns,voicePresentation:c.voicePresentation,appearance:c.appearance,background:c.background,personality:c.personality,languages:c.languages,wardrobe:c.wardrobe,voice:c.voice,voiceIntent:c.voiceIntent,locked:c.locked,entityType:c.entityType,sacredIdentity:c.sacredIdentity,canonicalVisualCues:c.canonicalVisualCues})),
    episodes:(project.episodes||[]).map(e=>({number:e.number,title:e.title,synopsis:e.synopsis,storyText:e.storyText||'',scenes:(e.scenes||[]).map(s=>({title:s.title,purpose:s.purpose,dramaticPurpose:s.dramaticPurpose,newInformation:s.newInformation,emotionalTurn:s.emotionalTurn,exitState:s.exitState,handoff:s.handoff,dialogue:s.dialogue}))}))
  };
  const targetSec=Number(project.targetRuntimeSec)||0;const targetWords=targetSec?Math.max(100,Math.round(targetSec/60*135)):0;
  const prompt=`You are continuing an ORIGINAL CineTale series. Create Episode ${n}. Preserve canon, unresolved threads, geography, culture, relationships, genre, language scope/direction, cultural or sacred treatment, visual identity descriptions, and recurring character personalities. Character background may include languages they plausibly know, but actual episode dialogue/narration must obey the project's selected output language and Language direction; never introduce an inferred local language into spoken output unless the creator selected or assigned it. Respect sacred, mythological, historical and cultural context established by the creator without stereotyping or flattening it. Preserve each character's entityType, sacredIdentity, canonicalVisualCues and recurring voiceIntent when present. Character baseline voice performance must remain specific to that character and established canon; scene audioDirection may vary emotion for the current scene without silently changing the recurring voice identity. A named deity who is a parent, ally or mentor remains a deity; do not normalize them into an ordinary person. Do not reset or replace established characters. Do not copy existing franchises. Dialogue MUST be an array of plain strings formatted like "Character: spoken line". Write spoken lines for actors: concise, conversational, age/relationship-appropriate, and driven by subtext rather than plot exposition. Characters must not explain facts they both already know. Avoid announcer-style wording, repeated names, or stiff complete sentences unless intentionally in character. Add audioDirection to every scene with a concise natural performance note for dialogue, and narrationStyle with a concise narrator performance note; these are directions, not spoken text, and must never caricature culture or accent. RUNTIME DISCIPLINE: The creator-selected episode target is ${targetSec?`${targetSec} seconds (about ${targetWords} words at 135 wpm)`:'the existing project runtime'}. Keep storyText within roughly 90%-115% of that target unless the creator explicitly changes runtime. Do not quietly make the next episode materially longer than Episode 1. Before the production breakdown, write storyText: the complete audience-readable Episode ${n} narrative with a satisfying mini-arc, natural transitions, character motivation, useful dialogue, and a clear end to this episode while preserving intentional ongoing threads. storyText must not be a synopsis or scene list, and the 5 production scenes must faithfully derive from it. CONTINUITY SELF-CHECK: Include continuityChanges:[] unless this episode intentionally changes an established recurring detail. If a change is genuinely intentional, add {type,character,field,established,proposed,reason,intentional:true}. Never silently change age, family relationship, locked appearance, voice/language identity, or established canon.
STORY INTELLIGENCE: Continue the causal dramatic spine rather than merely adding events. Every scene must have a concrete characterObjective, obstacle/resistance, dramaticPurpose, newInformation/change, emotionalTurn, entryState, exitState, handoff, storyQuestion, continuityLocks[], and a visualProgression[] of 2-8 DISTINCT filmable actions/reveals/reactions. No scene may merely restate information or repeat the previous scene's action. Preserve who knows what, who holds what, wardrobe, important props, injuries, geography, time-of-day, and unresolved setup/payoff. The episode must escalate or meaningfully transform the existing story while honoring canon.
CINEMATIC COVERAGE: Each scene must include a concrete story-directed coveragePlan derived from visualProgression and dramaticPurpose. Every non-speaking shot must name the specific physical action, clue, reveal, reaction, or state change visible in that shot; generic wording such as 'advance action', 'movement shot', or 'orient the viewer' is forbidden. Important on-camera dialogue needs a speaking:true shot with speaker and spokenLine placed at the correct story moment; narration-support shots must not fake on-screen speech. Adjacent shots must not repeat the same action with a different crop. User-facing shot purpose/visual text must follow the project's selected story language scope.
Return ONLY JSON for one episode: {number:${n},title,synopsis,storyText,continuityChanges:[],scenes:[{id,number,title,durationSec,purpose,dramaticPurpose,characterObjective,obstacle,newInformation,emotionalTurn,entryState,exitState,handoff,storyQuestion,continuityLocks[],visualProgression[],visual,narration,dialogue[],audioDirection,narrationStyle,music,scoreIntent,sfx,camera,tier,coveragePlan:[]}]}. Create exactly 5 coherent scenes that advance the existing story. Project context: ${JSON.stringify(context)}`;
  const hasGemini=Boolean(process.env.GEMINI_API_KEY),hasOpenAI=Boolean(process.env.OPENAI_API_KEY);
  const errors=[];
  if(hasGemini){try{const ep=normalizeEpisode(await generateWithGemini(prompt),n);if(usable(ep)){ep.id=ep.id||`ep_${requestId||Date.now()}`;const continuityWarnings=detectContinuityConflicts(project,ep);return res.status(200).json({episode:ep,mode:'ai',continuityWarnings});}errors.push('Gemini returned an incomplete episode.')}catch(e){console.error('[CineTale generate-next] Gemini failed',{message:e?.message||String(e)});errors.push(e?.message||'Gemini failed')}}
  if(hasOpenAI){try{const ep=normalizeEpisode(await generateWithOpenAI(prompt),n);if(usable(ep)){ep.id=ep.id||`ep_${requestId||Date.now()}`;const continuityWarnings=detectContinuityConflicts(project,ep);return res.status(200).json({episode:ep,mode:'ai',continuityWarnings});}errors.push('OpenAI returned an incomplete episode.')}catch(e){console.error('[CineTale generate-next] OpenAI failed',{message:e?.message||String(e)});errors.push(e?.message||'OpenAI failed')}}
  if(!hasGemini&&!hasOpenAI){const ep=normalizeEpisode(demoNextEpisode(project),n);ep.id=ep.id||`ep_${requestId||Date.now()}`;return res.status(200).json({episode:ep,mode:'demo',continuityWarnings:detectContinuityConflicts(project,ep)});}
  console.error('[CineTale generate-next] All configured story providers failed',{errors});
  return res.status(502).json({error:'Could not continue the live series. CineTale did not substitute demo content. Check the latest /api/generate-next Vercel log and try again.'});
}
