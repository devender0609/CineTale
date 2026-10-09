import {demoProject} from '../lib/demo.js';
import {generateWithOpenAI,generateWithGemini} from '../lib/ai.js';
import {ensureSceneCoverage,coverageLogicAudit} from '../lib/production.js';

const VALID_FORMATS=new Set(['Episode','Short','Story','Movie']);
function normalizeFormat(value='Episode'){
  const v=String(value||'').trim();
  return VALID_FORMATS.has(v)?v:'Episode';
}
function targetRuntimeSeconds(value=''){
  const raw=String(value||'').trim().toLowerCase();
  const range=raw.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(seconds?|minutes?)/);
  if(range){const avg=(Number(range[1])+Number(range[2]))/2;return Math.round(avg*(range[3].startsWith('minute')?60:1));}
  const single=raw.match(/(\d+(?:\.\d+)?)\s*(seconds?|minutes?)/);
  return single?Math.round(Number(single[1])*(single[2].startsWith('minute')?60:1)):0;
}
function wordCount(text=''){return String(text||'').trim().split(/\s+/).filter(Boolean).length;}
function runtimeWordRange(input={}){
  const sec=targetRuntimeSeconds(input.duration);
  if(!sec) return null;
  const target=Math.max(80,Math.round((sec/60)*135));
  const episodic=String(input.format||'Episode')==='Episode';
  const minFactor=episodic?.90:.85, maxFactor=episodic?1.15:1.20;
  return {target,min:Math.max(70,Math.round(target*minFactor)),max:Math.round(target*maxFactor)};
}
function normalizeNarrativeBeatDurations(plan,input={}){
  const unit=plan?.episodes?.[0],scenes=unit?.scenes;
  const target=targetRuntimeSeconds(input.duration);
  if(!target||!Array.isArray(scenes)||!scenes.length)return;
  const raw=scenes.map(s=>Math.max(1,Number(s.durationSec)||1));
  const total=raw.reduce((a,b)=>a+b,0)||scenes.length;
  let allocated=0;
  scenes.forEach((scene,index)=>{
    const seconds=index===scenes.length-1?Math.max(1,target-allocated):Math.max(1,Math.round(target*(raw[index]/total)));
    scene.durationSec=seconds;allocated+=seconds;
  });
}
function runtimeFit(plan,input={}){
  const range=runtimeWordRange(input),unit=plan?.episodes?.[0];
  if(!range||!unit)return {ok:true,count:wordCount(unit?.storyText),range};
  const count=wordCount(unit.storyText);
  return {ok:count>=range.min&&count<=range.max,count,range};
}

function isUsablePlan(plan){
  if(!plan || typeof plan!=='object') return false;
  if(!String(plan.title||'').trim()) return false;
  if(!String(plan.logline||'').trim()) return false;
  if(!Array.isArray(plan.characters) || plan.characters.length<1) return false;
  if(!Array.isArray(plan.episodes) || plan.episodes.length<1) return false;
  const first=plan.episodes[0];
  if(!first || !Array.isArray(first.scenes) || first.scenes.length<1) return false;
  if(!String(first.storyText||'').trim() || String(first.storyText||'').trim().length<180) return false;
  return true;
}


function normalizeDialogueEntry(entry){
  if(typeof entry==='string') return entry.trim();
  if(entry==null) return '';
  if(typeof entry==='number' || typeof entry==='boolean') return String(entry);
  if(typeof entry==='object'){
    const speaker=String(entry.speaker||entry.character||entry.name||'').trim();
    const text=String(entry.text||entry.line||entry.dialogue||entry.content||entry.utterance||'').trim();
    if(speaker && text) return `${speaker}: ${text}`;
    if(text) return text;
    const values=Object.values(entry).filter(v=>typeof v==='string' && v.trim()).map(v=>v.trim());
    if(values.length) return values.join(': ');
  }
  return '';
}

function normalizeDialogueArray(value){
  const arr=Array.isArray(value)?value:(value==null?[]:[value]);
  return arr.map(normalizeDialogueEntry).filter(Boolean);
}

function cleanText(value=''){return String(value||'').replace(/\s+/g,' ').trim();}
function cleanStringArray(value,max=12){
  const arr=Array.isArray(value)?value:(value==null?[]:[value]);
  return [...new Set(arr.map(cleanText).filter(Boolean))].slice(0,max);
}
function normalizeSceneIntelligence(scene={},index=0,total=1){
  scene.dramaticPurpose=cleanText(scene.dramaticPurpose||scene.purpose||'Advance the story through a specific change in situation, knowledge, relationship, or emotion.');
  scene.characterObjective=cleanText(scene.characterObjective||'The focal character pursues a concrete scene-level objective that can be shown through action.');
  scene.obstacle=cleanText(scene.obstacle||'A meaningful resistance, uncertainty, consequence, or competing objective complicates the scene.');
  scene.newInformation=cleanText(scene.newInformation||scene.reveal||'The scene leaves the audience with a new piece of information, decision, consequence, or changed understanding.');
  scene.emotionalTurn=cleanText(scene.emotionalTurn||'The emotional state changes by the end of the scene rather than remaining flat.');
  scene.entryState=cleanText(scene.entryState||`Enter from the previous story state${index?'; preserve what characters already know and hold':''}.`);
  scene.exitState=cleanText(scene.exitState||`End in a changed state that justifies ${index===total-1?'the resolution or final image':'the next scene'}.`);
  scene.handoff=cleanText(scene.handoff||`Carry the scene's changed information, emotion, and physical continuity into ${index===total-1?'the ending':'the next beat'}.`);
  scene.storyQuestion=cleanText(scene.storyQuestion||'What changes here, and why does the viewer need to see this scene now?');
  scene.continuityLocks=cleanStringArray(scene.continuityLocks,16);
  scene.visualProgression=cleanStringArray(scene.visualProgression,10);
  if(!scene.visualProgression.length){
    const fallback=[scene.entryState,scene.visual,scene.newInformation,scene.emotionalTurn,scene.exitState].map(cleanText).filter(Boolean);
    scene.visualProgression=[...new Set(fallback)].slice(0,6);
  }
  scene.scoreIntent=cleanText(scene.scoreIntent||scene.music||'Support the emotional turn without overpowering dialogue; allow silence when stronger.');
  scene.storyIntelligenceVersion='v1.10.49';
  return scene;
}
function normalizeStoryArchitecture(plan={}){
  plan.worldBible=plan.worldBible&&typeof plan.worldBible==='object'?plan.worldBible:{};
  const a=plan.worldBible.storyArchitecture&&typeof plan.worldBible.storyArchitecture==='object'?plan.worldBible.storyArchitecture:{};
  plan.worldBible.storyArchitecture={
    dramaticSpine:cleanText(a.dramaticSpine||plan.logline||plan.worldBible.premise||''),
    protagonistGoal:cleanText(a.protagonistGoal||''),
    stakes:cleanText(a.stakes||''),
    centralConflict:cleanText(a.centralConflict||''),
    theme:cleanText(a.theme||''),
    midpointTurn:cleanText(a.midpointTurn||''),
    climax:cleanText(a.climax||''),
    resolution:cleanText(a.resolution||''),
    openThreads:cleanStringArray(a.openThreads,10)
  };
}
function meaningfulCulturalUncertainty(value=''){
  const t=cleanText(value);
  if(!t)return '';
  // Uncertainty notes are for real-world cultural/historical claims that matter to respectful accuracy,
  // not for harmless invented story canon such as a fictional family business, address, or registry.
  if(/commercial registry|company registry|business registry|trading firm|fictional company|fictional business|exact business|exact company/i.test(t))return '';
  return t;
}
function normalizeGlobalContext(plan={},input={}){
  plan.worldBible=plan.worldBible&&typeof plan.worldBible==='object'?plan.worldBible:{};
  const g=plan.worldBible.globalContext&&typeof plan.worldBible.globalContext==='object'?plan.worldBible.globalContext:{};
  const explicitBelief=cleanText(input.beliefContext||'');
  // Belief/religion is sensitive identity context. Never promote a model inference into durable world memory
  // unless the creator explicitly supplied it. Traditions/festivals may still be stored separately.
  const uncertainty=cleanStringArray(g.uncertaintyNotes,20).map(meaningfulCulturalUncertainty).filter(Boolean);
  plan.worldBible.globalContext={
    regionCommunity:cleanText(input.regionCommunity||g.regionCommunity||''),
    beliefContext:explicitBelief,
    traditionContext:cleanText(input.traditionContext||g.traditionContext||''),
    eraPlace:cleanText(input.eraPlace||g.eraPlace||''),
    grounding:cleanText(input.culturalGrounding||g.grounding||'grounded'),
    languageBehavior:cleanText(input.languageBehavior||g.languageBehavior||'natural'),
    languages:cleanStringArray(g.languages?.length?g.languages:String(input.language||'').split(/\s*\+\s*|,/).filter(Boolean),16),
    familySocialContext:cleanStringArray(g.familySocialContext,16),
    customsPractices:cleanStringArray(g.customsPractices,20),
    festivalsCelebrations:cleanStringArray(g.festivalsCelebrations,20),
    materialCulture:cleanStringArray(g.materialCulture,20),
    soundMusicContext:cleanStringArray(g.soundMusicContext,20),
    groundedFacts:cleanStringArray(g.groundedFacts,24),
    respectGuardrails:cleanStringArray(g.respectGuardrails,20),
    uncertaintyNotes:uncertainty
  };
  plan.worldBible.storyCanon=cleanStringArray(plan.worldBible.storyCanon?.length?plan.worldBible.storyCanon:plan.worldBible.canon,40);
  plan.worldBible.canon=[...plan.worldBible.storyCanon];
}
function shotProductionRoute(profile,scene={},shot={},index=0){
  const text=`${scene.title||''} ${scene.dramaticPurpose||''} ${shot.kind||''} ${shot.purpose||''} ${shot.visual||''}`.toLowerCase();
  const speaking=Boolean(shot.speaking||cleanText(shot.spokenLine));
  const critical=/climax|reveal|resolution|turning point|confront|discovery|unlock|opens|emotional payoff|final/i.test(text);
  const movement=/run|walk|open|close|turn|enter|leave|cross|lift|drop|fall|race|chase|dance|fight|move|approach|unlock|push|pull/i.test(text);
  if(profile==='cinematic') return speaking||critical?'premium-video':(movement||index%2===1?'standard-video':'economy-video');
  if(profile==='economy') return speaking?'economy-video':(critical&&movement?'economy-video':'animated-art');
  // Balanced: preserve video for visible performance, important reveals, and some meaningful motion;
  // use animated art for ordinary coverage so a 2–3 minute episode is not automatically 2–3 minutes of paid video.
  if(speaking)return 'standard-video';
  if(critical)return 'standard-video';
  if(movement&&index%2===1)return 'economy-video';
  return 'animated-art';
}
function applyProductionProfile(plan={},input={}){
  const profile=['economy','balanced','cinematic'].includes(String(input.productionProfile||'').toLowerCase())?String(input.productionProfile).toLowerCase():'balanced';
  plan.productionProfile=profile;
  for(const ep of plan.episodes||[]){for(const scene of ep.scenes||[]){
    const speaking=normalizeDialogueArray(scene.dialogue).length>0;
    if(profile==='economy') scene.tier='draft';
    else if(profile==='cinematic') scene.tier=(speaking||/climax|reveal|resolution|final/i.test(`${scene.title||''} ${scene.dramaticPurpose||''}`))?'premium':'standard';
    else scene.tier=speaking?'standard':(String(scene.tier||'').toLowerCase()==='premium'?'standard':'draft');
    const coverage=Array.isArray(scene.coveragePlan)?scene.coveragePlan:[];
    coverage.forEach((shot,index)=>{shot.productionRoute=shotProductionRoute(profile,scene,shot,index);shot.productionRouteReason=shot.productionRoute==='animated-art'?'Story beat can be covered with approved art + editorial motion':shot.speaking?'Visible speaking/performance beat':/premium/.test(shot.productionRoute)?'Story-critical cinematic beat':'Meaningful motion beat';});
    scene.productionRouting={profile,defaultTier:scene.tier,reason:speaking?'Speaking/performance beat':'Visual/narration beat',paidGenerationExplicitOnly:true,reuseDurableAssets:true,hybridRouting:true};
  }}
}
function normalizedFingerprint(value=''){return cleanText(value).toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0900-\u097f]+/g,' ').split(/\s+/).filter(w=>w.length>3).slice(0,30);}
function lexicalOverlap(a='',b=''){const A=new Set(normalizedFingerprint(a)),B=new Set(normalizedFingerprint(b));if(!A.size||!B.size)return 0;let n=0;for(const w of A)if(B.has(w))n++;return n/Math.min(A.size,B.size);}
function storyQualityIssues(plan,input={}){
  const issues=[],ep=plan?.episodes?.[0],scenes=Array.isArray(ep?.scenes)?ep.scenes:[];
  const architecture=plan?.worldBible?.storyArchitecture||{};
  if(String(input.storySource||'idea')==='idea'){
    for(const key of ['dramaticSpine','protagonistGoal','stakes','centralConflict','climax','resolution'])if(!cleanText(architecture[key]))issues.push(`story architecture missing ${key}`);
  }
  scenes.forEach((scene,i)=>{
    for(const key of ['dramaticPurpose','characterObjective','obstacle','newInformation','emotionalTurn','entryState','exitState','handoff'])if(!cleanText(scene?.[key]))issues.push(`scene ${i+1} missing ${key}`);
    if(!Array.isArray(scene?.visualProgression)||scene.visualProgression.filter(Boolean).length<2)issues.push(`scene ${i+1} needs a multi-step visual progression`);
    if(Array.isArray(scene?.visualProgression)){for(let j=1;j<scene.visualProgression.length;j++)if(lexicalOverlap(scene.visualProgression[j-1],scene.visualProgression[j])>.82)issues.push(`scene ${i+1} repeats adjacent visual actions`);}
    const coverage=Array.isArray(scene?.coveragePlan)?scene.coveragePlan.filter(Boolean):[];
    if(coverage.length){
      const generic=coverage.filter(shot=>/orient the viewer before the story beat advances|advance physical action from the prior shot to the next story state|add new cinematic information rather than another take of the same action/i.test(`${cleanText(shot?.purpose)} ${cleanText(shot?.visual)}`));
      if(generic.length)issues.push(`scene ${i+1} coverage contains generic placeholder shot direction`);
      for(let j=1;j<coverage.length;j++)if(lexicalOverlap(`${coverage[j-1]?.purpose||''} ${coverage[j-1]?.visual||''}`,`${coverage[j]?.purpose||''} ${coverage[j]?.visual||''}`)>.78)issues.push(`scene ${i+1} repeats adjacent shot actions`);
      const speaking=coverage.filter(shot=>shot?.speaking||cleanText(shot?.spokenLine)).length,dialogueTurns=normalizeDialogueArray(scene?.dialogue).length;
      if(speaking!==dialogueTurns)issues.push(`scene ${i+1} speaking-shot count does not exactly match dialogue turns`);
      const logicAudit=coverageLogicAudit(scene,coverage);for(const issue of logicAudit.issues){if(['speaker-mismatch','spoken-line-mismatch','nested-speaker-conflict','dialogue-count-mismatch','visual-shot-has-dialogue','duplicate-shot-id','duplicate-shot-order'].includes(issue.code))issues.push(`scene ${i+1} production logic: ${issue.message}`)}
    }else issues.push(`scene ${i+1} missing explicit story-directed coveragePlan`);
    if(i>0&&lexicalOverlap(scene?.visual,scenes[i-1]?.visual)>.78)issues.push(`scenes ${i} and ${i+1} are visually repetitive`);
  });
  const lines=scenes.flatMap(s=>normalizeDialogueArray(s?.dialogue).map(x=>cleanText(x).toLowerCase())).filter(Boolean);
  const seen=new Set();for(const line of lines){if(seen.has(line))issues.push('repeated dialogue line');seen.add(line)}
  return [...new Set(issues)].slice(0,24);
}

export function normalizePlan(plan,input,mode){
  plan.id=plan.id||`ct_${Date.now()}`;
  plan.idea=input.idea||plan.idea||plan.logline||'';
  plan.storySource=input.storySource||plan.storySource||'idea';
  plan.inputMethod=input.inputMethod||plan.inputMethod||'text';
  plan.castSize=input.castSize||plan.castSize||'auto';
  plan.format=normalizeFormat(input.format||plan.format||'Episode');
  plan.requestedFormat=plan.format;
  plan.genre=input.genre||plan.genre||'Open';
  plan.audience=input.audience||plan.audience||'General';
  plan.duration=input.duration||plan.duration||'2–3 minutes';
  plan.targetRuntimeSec=targetRuntimeSeconds(plan.duration);
  plan.controlMode=input.controlMode||'Guided';
  plan.language=input.language||'English';
  plan.languageScope=input.languageScope||plan.languageScope||'entire-story';
  plan.culturalTreatment=input.culturalTreatment||plan.culturalTreatment||'auto';
  plan.sacredRepresentation=input.sacredRepresentation||plan.sacredRepresentation||'auto';
  plan.languageDirection=input.languageDirection||plan.languageDirection||'';
  plan.culturalContext=input.culturalContext||plan.culturalContext||'';
  plan.regionCommunity=input.regionCommunity||plan.regionCommunity||'';
  plan.beliefContext=input.beliefContext||plan.beliefContext||'';
  plan.traditionContext=input.traditionContext||plan.traditionContext||'';
  plan.eraPlace=input.eraPlace||plan.eraPlace||'';
  plan.culturalGrounding=input.culturalGrounding||plan.culturalGrounding||'grounded';
  plan.languageBehavior=input.languageBehavior||plan.languageBehavior||'natural';
  plan.productionProfile=input.productionProfile||plan.productionProfile||'balanced';
  plan.continuityStrength=input.continuityStrength||plan.continuityStrength||'strict';
  plan.style=input.style||plan.style||'Cinematic realistic';
  plan.visualStylePreset=input.visualStylePreset||plan.visualStylePreset||'cinematic-realistic';
  plan.customVisualStyle=input.customVisualStyle||plan.customVisualStyle||'';
  plan.activeEpisode=plan.activeEpisode||1;
  plan.createdAt=plan.createdAt||new Date().toISOString();
  plan.updatedAt=new Date().toISOString();
  plan.generationMode=mode;
  normalizeStoryArchitecture(plan);
  normalizeGlobalContext(plan,input);
  applyProductionProfile(plan,input);
  for(const episode of (plan.episodes||[])){
    episode.storyText=String(episode.storyText||'').trim();
    episode.unitKind=plan.format;
    episode.storyWordCount=wordCount(episode.storyText);
    episode.estimatedNarrativeRuntimeSec=Math.round((episode.storyWordCount/135)*60);
    // Approval is a creator action; never trust a model/provider to pre-approve generated story text.
    episode.storyApproved=false;
    const scenes=episode?.scenes||[];
    for(let sceneIndex=0;sceneIndex<scenes.length;sceneIndex++){
      const scene=scenes[sceneIndex];
      scene.dialogue=normalizeDialogueArray(scene.dialogue);
      if(scene.narration && typeof scene.narration!=='string') scene.narration=normalizeDialogueEntry(scene.narration);
      scene.framing=scene.framing||'safe';
      normalizeSceneIntelligence(scene,sceneIndex,scenes.length);
      ensureSceneCoverage(scene,'balanced');
      scene.coverageClips=Array.isArray(scene.coverageClips)?scene.coverageClips:[];
    }
  }
  normalizeNarrativeBeatDurations(plan,input);
  return plan;
}


function languageInstruction(input){
  const languages=String(input.language||'English');
  const scope=String(input.languageScope||'entire-story');
  const direction=String(input.languageDirection||'').trim();
  if(scope==='dialogue-only') return `LANGUAGE SCOPE: Dialogue only. Keep production-facing structural text readable, but all spoken dialogue must follow ${languages}${direction?` and this direction: ${direction}`:''}.`;
  if(scope==='narration-dialogue') return `LANGUAGE SCOPE: Narration + dialogue. Narration and all spoken dialogue must follow ${languages}${direction?` and this direction: ${direction}`:''}; titles and production metadata may remain in the primary project language.`;
  if(scope==='custom-multilingual') return `LANGUAGE SCOPE: Custom multilingual. Follow this language assignment exactly: ${direction||`Use ${languages} naturally and consistently.`}`;
  return `LANGUAGE SCOPE: Entire story. Generate title, logline, premise, character-facing descriptions, episode title/synopsis, scene titles/descriptions, narration and dialogue in ${languages}${direction?`. Also follow: ${direction}`:''}. Do not silently switch back to English unless English is selected or the creator explicitly requests it. Characters may plausibly know other local languages as background identity, but that MUST NOT change the story output language or spoken dialogue unless the creator selected those languages or explicitly assigned them in Language direction.`;
}


function diversityInstruction(input={}){
  if(String(input.storySource||'idea')!=='idea')return '';
  const recent=Array.isArray(input.diversityContext)?input.diversityContext.slice(0,12):[];
  if(!recent.length)return `CREATIVE DIVERSITY: Treat this as a fresh original project. Avoid defaulting to the same familiar names, schools, inherited houses, mysterious photographs, missing relatives, hidden rooms, secret diaries, or other stock premises unless the creator explicitly asks for them. Vary names, relationships, setting, era, social context, conflict structure, imagery and emotional arc to fit the actual idea.`;
  const compact=recent.map(x=>({title:String(x?.title||'').slice(0,90),characters:(x?.characters||[]).slice(0,8),world:String(x?.world||'').slice(0,180),logline:String(x?.logline||'').slice(0,180),episodeTitles:(x?.episodeTitles||[]).slice(0,4),storySignature:String(x?.storySignature||'').slice(0,320)}));
  return `CREATIVE DIVERSITY / ANTI-REPETITION: This is a NEW project, not a continuation. The creator's recent CineTale projects are provided below only as a negative-reference set. Do not recycle their character names, title patterns, family relationships, settings, central reveals, props, mystery devices, scene order, or emotional beats unless the creator explicitly requests that similarity. Choose names organically from the new story's own cultural/geographic context; do not keep defaulting to the same names across projects. Make the premise-specific creative choices feel genuinely fresh rather than randomly swapping names in a template. Recent projects to avoid echoing: ${JSON.stringify(compact)}`;
}

function diversityWords(text=''){
  const stop=new Set(['about','after','again','against','along','also','among','around','because','before','being','between','could','family','first','from','have','into','just','more','most','other','over','same','story','their','there','these','they','this','through','under','very','when','where','while','with','would','young']);
  return String(text||'').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0900-\u097f]+/g,' ').split(/\s+/).filter(w=>w.length>=4&&!stop.has(w));
}
function diversityPhrases(text='',excluded=new Set()){
  const words=diversityWords(text).filter(w=>!excluded.has(w)),out=new Set();
  for(let i=0;i+2<words.length;i++)out.add(words.slice(i,i+3).join(' '));
  return out;
}
function diversityConflict(plan,input={}){
  if(String(input.storySource||'idea')!=='idea')return [];
  const recent=Array.isArray(input.diversityContext)?input.diversityContext:[];if(!recent.length)return [];
  const oldNames=new Set(recent.flatMap(x=>x?.characters||[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
  const conflicts=[];
  for(const c of (plan?.characters||[])){const n=String(c?.name||'').trim().toLowerCase();if(n&&oldNames.has(n))conflicts.push(`reused character name: ${c.name}`)}
  const oldTitles=new Set(recent.flatMap(x=>[x?.title,...(x?.episodeTitles||[])]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
  for(const t of [plan?.title,plan?.episodes?.[0]?.title]){const n=String(t||'').trim().toLowerCase();if(n&&oldTitles.has(n))conflicts.push(`reused title: ${t}`)}

  // Catch near-duplicate premises/plot devices, not just identical names. Words the
  // creator explicitly supplied in the new idea are excluded so CineTale never
  // "diversifies away" from the requested premise.
  const ideaWords=new Set(diversityWords(input.idea||''));
  const ep=plan?.episodes?.[0]||{};
  const candidateText=[plan?.title,plan?.logline,plan?.worldBible?.premise,ep?.title,ep?.synopsis,String(ep?.storyText||'').slice(0,1500)].filter(Boolean).join(' ');
  const candidatePhrases=diversityPhrases(candidateText,ideaWords);
  for(const old of recent){
    const oldText=[old?.title,old?.logline,old?.world,old?.storySignature,...(old?.episodeTitles||[])].filter(Boolean).join(' ');
    const oldPhrases=diversityPhrases(oldText,ideaWords);
    let overlap=0;
    for(const phrase of oldPhrases){if(candidatePhrases.has(phrase)&&++overlap>=2)break}
    if(overlap>=2){conflicts.push(`near-duplicate recent premise or plot phrasing: ${old?.title||'recent project'}`);break}
  }
  return conflicts;
}

function audienceInstruction(input={}){
  const audience=String(input.audience||'Teen (13–17)').trim();
  return `AUDIENCE: ${audience}. Adapt vocabulary, emotional intensity, fear/violence, romance, humor, pacing and thematic complexity to this audience while preserving the creator's core premise. Do not infantilize older audiences or make younger-audience content needlessly intense.`;
}

function sourceInstruction(input={}){
  if(String(input.storySource||'idea')==='full-story') return `SOURCE MODE: CREATOR'S OWN STORY. The creator has supplied their story, not merely a premise. Treat their text as the source of truth. Preserve core plot, character names, relationships, setting, culture, religion/belief context, chronology, themes and intended ending. Do not replace it with a different AI-invented story. Your job is to adapt it into the selected production format, scenes and reusable production metadata. Infer only details needed for production, and never invent a culturally or religiously specific ritual, doctrine, sacred claim, historical fact or identity when the creator did not provide it. When uncertain, remain general rather than fabricating specificity.`;
  return `SOURCE MODE: IDEA. Develop the creator's idea into an original production while preserving every explicit fact, relationship, cultural cue, belief context and constraint they supplied.`;
}

function sacredRepresentationInstruction(input={}){
  const mode=String(input.sacredRepresentation||'auto');
  const map={
    auto:'Infer from the full creator text whether a sacred figure is symbolic/unseen, represented through an icon or idol, or appears visibly as a divine/mythological character. Do not turn ordinary people into deities and do not reduce an explicitly embodied deity to a generic human.',
    symbolic:'Keep sacred figures symbolic, unseen, visionary, or indirectly present unless the creator explicitly states otherwise.',
    idol:'Represent sacred figures primarily through a reverently depicted icon, murti, statue, painting, shrine image, or other story-appropriate sacred representation rather than as embodied speaking characters.',
    'visible-divine':'Sacred figures that belong in the cast should appear as visible divine characters with recognizable, respectful tradition-appropriate identity. Do not humanize them into ordinary people merely because their narrative role is parent, child, mentor, or companion.',
    'traditional-mythological':'Use a traditional mythological depiction for sacred/mythological figures, preserving recognizable established high-level iconographic cues and devotional dignity without random cross-cultural mixing.'
  };
  return `SACRED FIGURE REPRESENTATION: ${map[mode]||map.auto}`;
}

function culturalInstruction(input){
  const treatment=String(input.culturalTreatment||'auto');
  const context=String(input.culturalContext||'').trim();
  const map={
    auto:'Infer whether named people are ordinary fictional characters, historical figures, folklore figures, mythological figures, or sacred/religious figures from the FULL creator prompt and genre—not from a name alone. A normal person named Durga is not automatically the goddess Durga; a prompt explicitly asking for Goddess Durga or a devotional child form should be treated as sacred/mythological.',
    'culturally-faithful':'Use culturally faithful, geographically appropriate details without stereotypes. Preserve relevant customs, clothing, architecture, language, and symbolism while allowing individual variation.',
    traditional:'Use a traditional treatment grounded in the requested culture and period; avoid generic or unrelated styling.',
    'historically-grounded':'Prioritize historically plausible clothing, objects, architecture, social context and terminology for the requested place/time.',
    'reverent-devotional':'Use a reverent devotional treatment. When the creator clearly requests a sacred figure, preserve that sacred identity and respectful high-level iconography/atmosphere; do not reduce the figure to an unrelated ordinary person or caricature.',
    'sacred-cinematic':'Use a reverent sacred-cinematic treatment with culturally grounded symbolism and spiritual atmosphere while preserving the intended sacred/mythological identity.',
    inspired:'Use a respectful inspired reinterpretation while keeping the source culture or tradition recognizable and avoiding stereotypes.',
    'modern-retelling':'Use a respectful modern retelling; keep the core cultural/mythological identity and only modernize elements the creator intends.'
  };
  const extra=[input.regionCommunity&&`REGION / COMMUNITY: ${input.regionCommunity}`,input.beliefContext&&`BELIEF CONTEXT: ${input.beliefContext}`,input.traditionContext&&`TRADITION / OCCASION: ${input.traditionContext}`,input.eraPlace&&`TIME & PLACE: ${input.eraPlace}`,input.culturalGrounding&&`GROUNDING LEVEL: ${input.culturalGrounding}`,input.languageBehavior&&`LANGUAGE BEHAVIOR: ${input.languageBehavior}`].filter(Boolean).join(' · ');
  const explicit=(context||extra)?` CREATOR CONTEXT: ${[context,extra].filter(Boolean).join(' · ')}. Treat this as authoritative context for names, kinship, clothing, architecture, food, objects, etiquette, celebrations, visual motifs, soundscape, geography and everyday life only where relevant. Do not assume every member of a culture behaves or dresses the same way.`:'';
  return `CULTURAL / SACRED INTERPRETATION: ${map[treatment]||map.auto}${explicit}`;
}


function formatInstruction(input={}){
  const format=String(input.format||'Episode');
  const map={
    Episode:{sceneCount:5,text:'FORMAT: Episode. Create Episode 1 of an ongoing series. Give it a satisfying mini-arc while preserving meaningful unresolved threads that can continue naturally. Episode mode alone may set up later episodes.'},
    Short:{sceneCount:3,text:'FORMAT: Short. Create ONE self-contained short-form story with a clear hook, turn and ending. Do NOT label it Episode 1, do NOT set up Episode 2, and do NOT add a cliffhanger solely to force continuation. Keep the cast lean.'},
    Story:{sceneCount:5,text:'FORMAT: Story. Create ONE complete standalone story with a real beginning, development and satisfying ending. Do NOT label it Episode 1 and do NOT imply an automatic sequel or Episode 2 unless the creator explicitly asks for an open ending.'},
    Movie:{sceneCount:8,text:'FORMAT: Movie. Create ONE standalone movie structure, not a series episode. Organize the scenes across Act I, Act II and Act III. Each scene must include an act field using Act I, Act II or Act III. The movie must have a complete dramatic arc and ending; do not create Episode 2.'}
  };
  const cfg=map[format]||map.Episode;
  return {...cfg,format};
}
function autoCastInstruction(input={}){
  if(String(input.castSize||'auto')!=='auto') return `Create exactly ${Math.max(2,Math.min(8,Number(input.castSize)||3))} recurring characters.`;
  const format=String(input.format||'Episode');
  if(format==='Short') return 'Create only 1-3 named recurring/main characters if the short genuinely needs them. Incidental people can appear in scenes without becoming permanent cast.';
  if(format==='Movie') return 'Create 3-6 principal recurring characters, choosing only the people or beings the movie genuinely needs. Incidental/background people may appear without becoming permanent cast.';
  return 'Create 2-5 recurring MAIN characters, choosing only the persistent cast the story genuinely needs. Do not promote incidental shopkeepers, passersby, villagers, classmates, crowds, or one-scene helpers into recurring characters unless they matter to the core plot.';
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const input=req.body||{};
  const idea=String(input.idea||'').trim();
  if(idea.length<8) return res.status(400).json({error:'Please add a little more detail to your story idea.'});

  const formatCfg=formatInstruction(input);
  const prompt=`You are CineTale's story director. Create a completely ORIGINAL entertainment project from the CREATOR INPUT below.

${formatCfg.text}

RUNTIME TARGET: The creator selected ${String(input.duration||'the default runtime')}. Treat this as the target NARRATIVE runtime. The complete storyText should fit that target at a natural spoken/read-aloud pace, and the sum of scene durationSec values should approximately cover that same narrative target. These durationSec values are narrative beat targets, not promises that one provider-generated video clip lasts that long.

CRITICAL: The title, world, characters, episode synopsis, every scene, dialogue, locations, props and canon MUST be specific to the creator's input. Do not reuse generic school-robot-demo material unless the creator actually asks for it. Preserve requested geography, culture, time period, relationships, language and visual direction without stereotyping. Treat the creator's genre value as an open-ended genre/tone instruction, including hybrids. Treat language as an open-ended language, dialect, script, indigenous/community language, signed-language production direction, or multilingual instruction. Never reject a project merely because its language is not in a preset list. Preserve native scripts and creator spelling. Provider speech support may vary, but story planning must remain language-agnostic.

${languageInstruction(input)}

${audienceInstruction(input)}

${culturalInstruction(input)}

${sacredRepresentationInstruction(input)}

${sourceInstruction(input)}

${diversityInstruction(input)}

CREATIVE INTELLIGENCE RULE: When the creator leaves a field unclear, infer the most coherent choice from the entire project context: format, premise, genre mix, audience, geography, era, selected languages, cultural treatment, sacred-figure representation, cast, visual style and continuity settings. Prefer choices that make the story, images, voices and characters mutually consistent. Explicit creator instructions always override inference. Never use uncertainty as a reason to fall back to generic Western/English defaults. For culturally, religiously, historically or linguistically sensitive specifics that cannot be supported from the creator's text/context, remain broad and respectful instead of inventing facts.

GLOBAL CULTURAL INTELLIGENCE CONTRACT: Treat culture, religion/belief, language, region, migration/diaspora, family structure, historical period, festival/celebration, food, clothing, architecture, etiquette, music, names, kinship and sacred practice as connected story-world context—not decorative tokens. Support any culture, faith, mixed-faith or secular context and any language/community-language the creator requests. Do not collapse countries, regions, religions or communities into stereotypes; do not assume one household represents an entire community; and do not infer religion, ethnicity, nationality, caste, tribe, sexuality or political identity from a name or appearance alone. Mixed cultures, diaspora identities, multilingual households and code-switching are valid. When a tradition has regional or denominational variation, preserve the creator's specified version; otherwise stay broad. Never invent scripture, mandatory ritual, sacred quotation, legal rule, historical date or community-wide claim. If a precise fact is uncertain, put a short note in worldBible.globalContext.uncertaintyNotes instead of guessing.

WORLD MEMORY REQUIREMENT: worldBible.globalContext must capture reusable context for future episodes: regionCommunity, beliefContext, traditionContext, eraPlace, grounding, languageBehavior, languages[], familySocialContext[], customsPractices[], festivalsCelebrations[], materialCulture[], soundMusicContext[], groundedFacts[], respectGuardrails[], uncertaintyNotes[]. Keep entries concise, relevant to THIS story and reusable across later episodes. Do not fill arrays with generic trivia. IMPORTANT: beliefContext MUST be an empty string unless the creator explicitly supplied a belief/religion context. A festival, region, language, surname, family custom, shrine, food, or appearance is not permission to infer the household's religion, secularity, caste, ethnicity, or personal belief. Put invented plot/world facts in worldBible.storyCanon[], not groundedFacts[]. groundedFacts[] is only for broad real-world context that the creator supplied or that can be stated without controversial specificity. Do not create an uncertainty note merely because a fictional family business, building, object, or invented historical backstory has no real-world registry.

PRODUCTION ECONOMY CONTRACT: The creator selected productionProfile=${String(input.productionProfile||'balanced')}. Story planning must never trigger video generation. Plan a HYBRID episode rather than assuming every story beat requires paid video. Each coveragePlan shot must include productionRoute using one of animated-art, economy-video, standard-video, premium-video. Use animated-art for ordinary establishing/detail/reaction/supporting coverage that can be communicated with strong approved art plus editorial motion; reserve video for visible dialogue/performance, meaningful physical action, important reveals, climax/resolution, or shots where motion itself carries story information. Existing durable generated assets must be reused unless the creator explicitly changes the underlying story/identity/shot contract.

STORY INTELLIGENCE / DRAMATIC DESIGN: Before designing scenes or shots, internally solve the story as a dramatist. Build a causal dramatic spine rather than a list of events. The protagonist or focal character must want something concrete; meaningful resistance must make that pursuit difficult; stakes must matter; revelations/choices/consequences must change what happens next; the climax must resolve the central dramatic question through character action rather than coincidence. Use setup/payoff, escalation, reversals, emotional turns, callbacks, subtext and visual storytelling when appropriate to the selected genre and runtime. Every scene must earn its place: if removing a scene would not change plot, character, stakes, knowledge, relationship, tone, or setup/payoff, redesign or remove it. Avoid repetitive scenes that merely restate information or show the same action from another camera angle. Do not use generic mystery props, inherited-house secrets, photographs, diaries, hidden rooms, school demos, or missing-relative devices unless they genuinely arise from the creator's idea.

STORY-TO-CINEMA RULE: Design the narrative so it can be filmed coherently. Each scene must have a clear entry state, character objective, obstacle/resistance, dramatic purpose, new information/change, emotional turn, exit state, and handoff into the next scene. Also provide a visualProgression array containing 2-8 DISTINCT physical/visual beats in story order. These are actions/reveals/reactions, not camera labels. Do not write 'wide shot / medium shot / close-up' as the progression. The progression should describe what actually happens and changes on screen. Important props, wardrobe, injuries, weather, time-of-day, geography, who holds what, and what each character knows must be captured in continuityLocks when relevant.

SCENE-TO-SHOT DIRECTOR RULE (SCENE-TO-SHOT RULE): coveragePlan is a FIRST-CLASS creative output and must be derived directly from the scene's visualProgression, dramaticPurpose, characterObjective, newInformation, emotionalTurn, entryState and exitState. Do NOT use placeholder descriptions such as 'Orient the viewer before the story beat advances' or 'Advance physical action from the prior shot to the next story state.' Every non-speaking shot's purpose and visual must name the CONCRETE story event visible in that shot: who acts, what changes, what clue/reaction/reveal occurs, and what physical state is handed to the next shot. Every speaking shot must be placed at the correct point in the action and must contain exactly one dialogue turn owned by the named speaker. The coveragePlan speaker MUST exactly match the speaker prefix in the scene dialogue turn. spokenLine MUST contain only the words spoken, never another speaker label or a nested 'Name:' prefix. Never assign one character's line to another character. Adjacent shots must not repeat the same action with only a different crop. If a story-critical prop appears, preserve the exact same prop identity/design across all shots. If a reveal happened earlier, later shots must treat it as already known. End each scene on a visual/emotional state that naturally motivates the next scene. For Entire-story language scope, user-facing coveragePlan purpose and visual text must be written in the selected story language; internal camera terminology may remain concise production language when needed.

Be sensitive to different cultures, religions, belief systems, folklore traditions, indigenous traditions and historical communities. Do not conflate nationality, ethnicity, language or religion. Avoid stereotypes, caricature, exoticization, flattening a culture into one look, or inventing sacred claims that the creator did not request. For real-world cultural or historical details not supplied by the creator, prefer broadly plausible, non-controversial details over precise invented claims. Never fabricate scripture, ritual requirements, sacred symbols, historical dates, community practices or titles of authority. If a precise cultural, religious, historical or geographic fact is uncertain, do not guess; keep the detail general while preserving the creator's intent. Preserve respectful individual variation in clothing, appearance, family structure and behavior.

For EACH character, also provide canonicalName and aliases[]. canonicalName is the stable production identity label for that character; aliases[] should contain only genuine names, titles, transliterations, or nicknames that ACTUALLY appear in this story or are explicitly established by the creator. These fields are used to bind dialogue, shots, voices, lip-sync, and future episodes to one stable character identity across languages. Do not invent unrelated nicknames. CRITICAL IDENTITY RULE: every production-facing dialogue speaker and coveragePlan.speaker must use canonicalName exactly, even when prose/storyText uses a genuine nickname. If storyText calls Ananya "Anu", aliases[] must contain "Anu", but scene dialogue speaker labels and shot speaker fields must still use the canonical name "Ananya" (or the chosen canonical production label).
For EACH character, also include pronouns when the story context clearly establishes them (for example she/her, he/him, they/them), and set voicePresentation to Feminine, Masculine, Neutral, or an empty string. Use the full character/story context; never infer voice presentation from a name, ethnicity, nationality, or culture alone. If unclear, leave pronouns and voicePresentation empty so the app can remain neutral. Explicit creator instructions override inference.
For EACH recurring character, also create voiceIntent from the actual creator request, character age/personality/role, relationships, and dramatic behavior. voiceIntent must contain performanceHints (0-4 concise values such as Warm, Calm, Confident, Focused, Energetic, Playful, Gentle, Dramatic, Intimate, Mysterious, Natural), pace (Natural, Relaxed, or Quick), and delivery (one short actor-direction phrase). Do NOT give every character the same tone. Do NOT derive voice performance, accent, gender/presentation, or language from religion, ethnicity, nationality, sacred identity, name, or appearance. Explicit creator voice direction outranks all inference. Scene emotion belongs in scene audioDirection; voiceIntent describes the recurring baseline identity/performance.
For EACH character, classify entityType as one of: fictional-person, historical-figure, folklore-figure, mythological-figure, sacred-figure, creature, nonhuman, unknown. Only use sacred-figure when the full context clearly indicates a sacred/religious figure. If sacred-figure, set sacredIdentity to the intended identity/tradition, representationMode to one of symbolic, idol, visible-divine, traditional-mythological, and provide 3-8 concise canonicalVisualCues that help image generation preserve recognizable, reverent identity. The project-level Sacred Figure Representation override is authoritative when it is not Auto. If not sacred, use an empty sacredIdentity and an empty canonicalVisualCues array. Example distinction: “Durga Sharma, a school student” is fictional-person; “Goddess Durga” is sacred-figure. “Mata Parvati” in an Indian Mythology + Devotional story is sacred-figure and must not be described merely as an ordinary woman.

When a parent/companion of a sacred figure is itself a named sacred figure (for example Parvati in a Ganesha story), preserve that sacred identity too. Do not make a deity visually generic just because their narrative role is “mother”, “father”, “friend”, or “mentor”.

Never imitate living artists, celebrities, copyrighted characters, or franchises.

Return ONLY valid JSON with exactly these top-level keys:
title, logline, worldBible, characters, episodes

Schema:
worldBible:{premise,visualLanguage,rules[],canon[],storyCanon[],globalContext:{regionCommunity,beliefContext,traditionContext,eraPlace,grounding,languageBehavior,languages[],familySocialContext[],customsPractices[],festivalsCelebrations[],materialCulture[],soundMusicContext[],groundedFacts[],respectGuardrails[],uncertaintyNotes[]},storyArchitecture:{dramaticSpine,protagonistGoal,stakes,centralConflict,theme,midpointTurn,climax,resolution,openThreads[]}}
characters:[{id,name,canonicalName,aliases[],role,age,pronouns,voicePresentation,appearance,background,personality,voice,voiceIntent:{performanceHints[],pace,delivery},languages,wardrobe,locked,entityType,sacredIdentity,representationMode,canonicalVisualCues[] }]
CHARACTER LANGUAGE RULE: The character.languages field may describe languages the character knows for identity/background realism. It is NOT permission to use those languages in story output. Actual dialogue/narration must obey the selected project language scope and Language direction exactly.
episodes:[{number,title,synopsis,storyText,scenes:[{id,number,title,durationSec,purpose,dramaticPurpose,characterObjective,obstacle,newInformation,emotionalTurn,entryState,exitState,handoff,storyQuestion,continuityLocks[],visualProgression[],visual,narration,dialogue[],audioDirection,narrationStyle,music,scoreIntent,sfx,camera,tier,act,coveragePlan[]}]}]
INTERNAL STORAGE NOTE: CineTale currently stores the single production unit inside the episodes array for all formats. For Short, Story and Movie, return exactly ONE item with number:1, but do not call it an episode in user-facing title/synopsis text. The UI will present it as the selected format.


FULL STORY REVIEW REQUIREMENT: Every production unit MUST include storyText: a complete, audience-readable narrative that tells the whole selected unit from beginning to ending before production breakdown. It must not be a synopsis, outline, bullet list, scene list, prompt, or production note. It should read like an actual story with coherent prose, natural dialogue when useful, character motivation, transitions, climax, and resolution appropriate to the selected format. For Episode, storyText is the complete first episode narrative with a satisfying mini-arc while preserving only the intended ongoing threads. For Short, Story and Movie, storyText must cover the complete standalone beginning-to-ending narrative. For SOURCE MODE: CREATOR'S OWN STORY, preserve the creator's wording and plot as faithfully as possible while making only the minimum edits needed for coherence and the chosen format. The scene plan MUST be derived from storyText and must not contradict it.

STORY LENGTH GUIDANCE: Use the selected runtime as a storytelling target, not as permission to pad. At a natural spoken/read-aloud pace, aim near 135 words per minute. For 15-90 second Shorts, keep storyText concise (roughly 120-300 words). For 2-3 minute work, roughly 300-500 words. For 5 minutes, roughly 600-900 words. For 8-15 minutes, roughly 900-1600 words. For longer Movie choices, provide a detailed complete narrative/treatment of roughly 1400-2400 words rather than falsely pretending a handful of generated clips equals the full runtime. Prioritize completeness and narrative quality over exact word count. A 5-minute request must not quietly become a 3-minute narrative.

IMPORTANT DATA RULE: dialogue MUST be an array of plain strings formatted like "Character: spoken line". Do not return dialogue objects.


CINEMATIC COVERAGE RULE: Each scene is a narrative beat, not a single frozen clip. Add coveragePlan: an array of shot objects [{id,order,kind,purpose,visual,camera,speaker,spokenLine,speaking,narrationSupport,targetClipSec,productionRoute}]. Treat coveragePlan as the actual director's shooting plan, not a template. Derive every shot from visualProgression and dramaticPurpose. The purpose/visual fields must describe a concrete, filmable story event, not generic movement or camera coverage. Examples of acceptable specificity: 'The eternal lamp gutters and dies as blue frost crawls across the altar'; 'Kartikeya stops mid-play and turns toward the darkened shrine'; 'Ganesha kneels beside the blue hoofprints and traces the glowing trail toward the cave.' Examples that are FORBIDDEN: 'Advance physical action', 'Orient the viewer', 'Movement shot', 'Provide distinct coverage'. Plan enough visually distinct shots to keep the selected narrative beat moving. For important on-camera dialogue, include a speaking:true shot where the named speaker is clearly visible in a natural conversational composition; spokenLine must contain only that character's words (never a speaker label or nested 'Name:' prefix), the shot speaker must exactly match the authoritative scene dialogue speaker, and the shot must occur at the correct story moment. Narration-support shots must not fake on-screen speech. Do not repeat the same action, reveal, pose, prop presentation, or composition in adjacent shots. Preserve safe margins, identity continuity, continuityLocks, and the scene's entry/exit physical state in every shot. When LANGUAGE SCOPE is Entire story, write user-facing purpose and visual fields in the selected story language.

DIALOGUE QUALITY RULES: Write for ACTORS, not for a synopsis reader. Spoken lines must sound like believable conversation for the character's age, relationship, culture, situation and personality. Prefer concise, natural phrasing, subtext, interruptions and incomplete thoughts when appropriate. Do not make characters explain facts they both already know. Avoid stiff exposition, announcer-style wording, repeated names, or complete formal sentences unless the character intentionally speaks that way. Use contractions/colloquial rhythm where natural in the selected language, without stereotyping dialects or accents. Keep stage directions OUT of the spoken line itself.

AUDIO PERFORMANCE RULES: For every scene, add audioDirection: one concise performance note describing the emotional delivery and conversational energy for dialogue in that scene (for example: "quiet, uneasy curiosity; intimate and conversational, not theatrical"). Add narrationStyle: one concise note for narration (for example: "warm, restrained storyteller; reflective, medium-slow pace"). These are performance directions, not spoken text. They must respect culture, age and context without caricaturing accents. Do not infer a person's accent merely from ethnicity, appearance, religion or name. Accent/regional delivery may be inferred only from explicit language, upbringing/location, creator direction, or clearly established story context; otherwise use a neutral/natural delivery appropriate to the selected language.

${autoCastInstruction(input)} Create exactly ${formatCfg.sceneCount} scenes for the ${formatCfg.format}. The scenes must form a coherent structure specific to the creator's idea, not a template. Keep recurring character identity descriptions specific enough for visual continuity. ${formatCfg.format==='Movie'?'Distribute the scenes meaningfully across Act I, Act II and Act III.':''}

CREATOR INPUT:
${JSON.stringify(input)}`;

  const hasGemini=Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI=Boolean(process.env.OPENAI_API_KEY);
  const errors=[];
  const repairIfNeeded=async(plan,generate,label)=>{
    if(!isUsablePlan(plan) || String(input.storySource||'idea')==='full-story') return plan;
    const fit=runtimeFit(plan,input);
    if(fit.ok) return plan;
    const repairPrompt=`${prompt}

RUNTIME REPAIR PASS: The prior JSON plan is structurally usable but its complete storyText is ${fit.count} words. The selected runtime is ${String(input.duration||'')}; target approximately ${fit.range?.target||'the requested'} words, with an acceptable range of ${fit.range?.min||'appropriate'}-${fit.range?.max||'appropriate'} words. Preserve the same core premise, characters, culture, ending and format, but rewrite the complete plan so storyText genuinely fits the selected runtime and all scenes are derived from that expanded/condensed story. For Story/Short/Movie, never call the unit Episode 1 in user-facing text. Return ONLY the complete corrected JSON object.

PRIOR PLAN:
${JSON.stringify(plan)}`;
    try{const repaired=await generate(repairPrompt);if(isUsablePlan(repaired)){const repairedFit=runtimeFit(repaired,input);if(repairedFit.ok || Math.abs(repairedFit.count-(fit.range?.target||repairedFit.count))<Math.abs(fit.count-(fit.range?.target||fit.count)))return repaired;}}
    catch(e){console.warn(`[CineTale generate-plan] ${label} runtime repair failed`,{message:e?.message||String(e)});}
    return plan;
  };

  const diversifyIfNeeded=async(plan,generate,label)=>{
    const conflicts=diversityConflict(plan,input);
    if(!conflicts.length)return plan;
    const diversityRepair=`${prompt}

DIVERSITY REPAIR PASS: The prior plan conflicts with recent-project diversity rules: ${conflicts.join('; ')}. Recreate the plan while preserving the creator's explicit idea and constraints, but choose fresh names/titles and avoid recent-project plot devices or relationship patterns. This must be substantive creative variation, not a superficial rename. Return ONLY the complete corrected JSON object.

PRIOR PLAN:
${JSON.stringify(plan)}`;
    try{const repaired=await generate(diversityRepair);if(isUsablePlan(repaired)&&!diversityConflict(repaired,input).length)return repaired}catch(e){console.warn(`[CineTale generate-plan] ${label} diversity repair failed`,{message:e?.message||String(e)})}
    return plan;
  };

  const qualityRepairIfNeeded=async(plan,generate,label)=>{
    if(!isUsablePlan(plan))return plan;
    const issues=storyQualityIssues(plan,input);
    if(!issues.length)return plan;
    const ownStory=String(input.storySource||'idea')==='full-story';
    const sourceRepairRule=ownStory?"SOURCE MODE IS CREATOR'S OWN STORY: do not replace or substantially rewrite the creator's storyText; preserve it as the source of truth and improve production intelligence/scene design around it.":"You may rewrite weak connective prose/dialogue when needed to make the story dramatically stronger, while preserving the creator's premise and constraints.";
    const qualityRepair=`${prompt}

STORY QUALITY / CINEMATIC REPAIR PASS: The prior plan is structurally usable but still has these story-direction weaknesses: ${issues.join('; ')}. Improve the COMPLETE JSON plan before production. Strengthen causality, character objectives, resistance, stakes, new information, emotional turns, setup/payoff, and scene-to-scene handoffs. Make every visualProgression a sequence of distinct filmable actions/reveals/reactions rather than camera-size labels or repetitions. Rewrite every weak coveragePlan so each shot names a concrete filmable story event from visualProgression, places dialogue at the correct story moment, and never uses generic placeholder wording. Ensure coveragePlan follows those actions instead of generating alternate versions of the same beat. Preserve the selected user-facing story language in shot purpose/visual text. Preserve all explicit creator facts, culture, language, relationships, ending intent, character identities, and continuity. ${sourceRepairRule} Return ONLY the complete corrected JSON object.

PRIOR PLAN:
${JSON.stringify(plan)}`;
    try{
      const repaired=await generate(qualityRepair);
      if(isUsablePlan(repaired)){
        const before=issues.length,after=storyQualityIssues(repaired,input).length;
        if(after<before)return repaired;
      }
    }catch(e){console.warn(`[CineTale generate-plan] ${label} story-quality repair failed`,{message:e?.message||String(e)})}
    return plan;
  };

  // Prefer Gemini because CineTale's currently configured primary story key is Gemini.
  if(hasGemini){
    try{
      let plan=await generateWithGemini(prompt);
      plan=await repairIfNeeded(plan,generateWithGemini,'Gemini');
      plan=await diversifyIfNeeded(plan,generateWithGemini,'Gemini');
      plan=await qualityRepairIfNeeded(plan,generateWithGemini,'Gemini');
      if(isUsablePlan(plan)) return res.status(200).json({plan:normalizePlan(plan,input,'ai'),mode:'ai',engine:'primary'});
      errors.push('Gemini returned an incomplete story plan.');
    }catch(e){
      console.error('[CineTale generate-plan] Gemini story generation failed', {message:e?.message||String(e)});
      errors.push(`Gemini: ${e?.message||'story generation failed'}`);
    }
  }

  if(hasOpenAI){
    try{
      let plan=await generateWithOpenAI(prompt);
      plan=await repairIfNeeded(plan,generateWithOpenAI,'OpenAI');
      plan=await diversifyIfNeeded(plan,generateWithOpenAI,'OpenAI');
      plan=await qualityRepairIfNeeded(plan,generateWithOpenAI,'OpenAI');
      if(isUsablePlan(plan)) return res.status(200).json({plan:normalizePlan(plan,input,'ai'),mode:'ai',engine:'fallback'});
      errors.push('OpenAI returned an incomplete story plan.');
    }catch(e){
      console.error('[CineTale generate-plan] OpenAI story generation failed', {message:e?.message||String(e)});
      errors.push(`OpenAI: ${e?.message||'story generation failed'}`);
    }
  }

  // Demo is only allowed when no live story provider is configured at all.
  if(!hasGemini && !hasOpenAI){
    const plan=normalizePlan(demoProject(input),input,'demo');
    return res.status(200).json({plan,mode:'demo'});
  }

  console.error('[CineTale generate-plan] All configured story providers failed', {errors});
  return res.status(502).json({
    error:'Live story generation failed. CineTale did not substitute demo content. Please check the latest /api/generate-plan Vercel log and try again.'
  });
}
