import {demoProject} from '../lib/demo.js';
import {generateWithOpenAI,generateWithGemini} from '../lib/ai.js';
import {ensureSceneCoverage} from '../lib/production.js';

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
  plan.continuityStrength=input.continuityStrength||plan.continuityStrength||'strict';
  plan.style=input.style||plan.style||'Cinematic realistic';
  plan.visualStylePreset=input.visualStylePreset||plan.visualStylePreset||'cinematic-realistic';
  plan.customVisualStyle=input.customVisualStyle||plan.customVisualStyle||'';
  plan.activeEpisode=plan.activeEpisode||1;
  plan.createdAt=plan.createdAt||new Date().toISOString();
  plan.updatedAt=new Date().toISOString();
  plan.generationMode=mode;
  for(const episode of (plan.episodes||[])){
    episode.storyText=String(episode.storyText||'').trim();
    episode.unitKind=plan.format;
    episode.storyWordCount=wordCount(episode.storyText);
    episode.estimatedNarrativeRuntimeSec=Math.round((episode.storyWordCount/135)*60);
    // Approval is a creator action; never trust a model/provider to pre-approve generated story text.
    episode.storyApproved=false;
    for(const scene of (episode?.scenes||[])){
      scene.dialogue=normalizeDialogueArray(scene.dialogue);
      if(scene.narration && typeof scene.narration!=='string') scene.narration=normalizeDialogueEntry(scene.narration);
      scene.framing=scene.framing||'safe';
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
  const explicit=context?` CREATOR CONTEXT: ${context}. Treat this as authoritative context for names, kinship, clothing, architecture, food, objects, etiquette, celebrations, visual motifs, soundscape, geography and everyday life only where relevant. Do not assume every member of a culture behaves or dresses the same way.`:'';
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

Be sensitive to different cultures, religions, belief systems, folklore traditions, indigenous traditions and historical communities. Do not conflate nationality, ethnicity, language or religion. Avoid stereotypes, caricature, exoticization, flattening a culture into one look, or inventing sacred claims that the creator did not request. For real-world cultural or historical details not supplied by the creator, prefer broadly plausible, non-controversial details over precise invented claims. Never fabricate scripture, ritual requirements, sacred symbols, historical dates, community practices or titles of authority. If a precise cultural, religious, historical or geographic fact is uncertain, do not guess; keep the detail general while preserving the creator's intent. Preserve respectful individual variation in clothing, appearance, family structure and behavior.

For EACH character, also include pronouns when the story context clearly establishes them (for example she/her, he/him, they/them), and set voicePresentation to Feminine, Masculine, Neutral, or an empty string. Use the full character/story context; never infer voice presentation from a name, ethnicity, nationality, or culture alone. If unclear, leave pronouns and voicePresentation empty so the app can remain neutral. Explicit creator instructions override inference.
For EACH character, classify entityType as one of: fictional-person, historical-figure, folklore-figure, mythological-figure, sacred-figure, creature, nonhuman, unknown. Only use sacred-figure when the full context clearly indicates a sacred/religious figure. If sacred-figure, set sacredIdentity to the intended identity/tradition, representationMode to one of symbolic, idol, visible-divine, traditional-mythological, and provide 3-8 concise canonicalVisualCues that help image generation preserve recognizable, reverent identity. The project-level Sacred Figure Representation override is authoritative when it is not Auto. If not sacred, use an empty sacredIdentity and an empty canonicalVisualCues array. Example distinction: “Durga Sharma, a school student” is fictional-person; “Goddess Durga” is sacred-figure. “Mata Parvati” in an Indian Mythology + Devotional story is sacred-figure and must not be described merely as an ordinary woman.

When a parent/companion of a sacred figure is itself a named sacred figure (for example Parvati in a Ganesha story), preserve that sacred identity too. Do not make a deity visually generic just because their narrative role is “mother”, “father”, “friend”, or “mentor”.

Never imitate living artists, celebrities, copyrighted characters, or franchises.

Return ONLY valid JSON with exactly these top-level keys:
title, logline, worldBible, characters, episodes

Schema:
worldBible:{premise,visualLanguage,rules[],canon[]}
characters:[{id,name,role,age,pronouns,voicePresentation,appearance,background,personality,voice,languages,wardrobe,locked,entityType,sacredIdentity,representationMode,canonicalVisualCues[]}]
CHARACTER LANGUAGE RULE: The character.languages field may describe languages the character knows for identity/background realism. It is NOT permission to use those languages in story output. Actual dialogue/narration must obey the selected project language scope and Language direction exactly.
episodes:[{number,title,synopsis,storyText,scenes:[{id,number,title,durationSec,purpose,visual,narration,dialogue[],audioDirection,narrationStyle,music,sfx,camera,tier,act,coveragePlan[]}]}]
INTERNAL STORAGE NOTE: CineTale currently stores the single production unit inside the episodes array for all formats. For Short, Story and Movie, return exactly ONE item with number:1, but do not call it an episode in user-facing title/synopsis text. The UI will present it as the selected format.


FULL STORY REVIEW REQUIREMENT: Every production unit MUST include storyText: a complete, audience-readable narrative that tells the whole selected unit from beginning to ending before production breakdown. It must not be a synopsis, outline, bullet list, scene list, prompt, or production note. It should read like an actual story with coherent prose, natural dialogue when useful, character motivation, transitions, climax, and resolution appropriate to the selected format. For Episode, storyText is the complete first episode narrative with a satisfying mini-arc while preserving only the intended ongoing threads. For Short, Story and Movie, storyText must cover the complete standalone beginning-to-ending narrative. For SOURCE MODE: CREATOR'S OWN STORY, preserve the creator's wording and plot as faithfully as possible while making only the minimum edits needed for coherence and the chosen format. The scene plan MUST be derived from storyText and must not contradict it.

STORY LENGTH GUIDANCE: Use the selected runtime as a storytelling target, not as permission to pad. At a natural spoken/read-aloud pace, aim near 135 words per minute. For 15-90 second Shorts, keep storyText concise (roughly 120-300 words). For 2-3 minute work, roughly 300-500 words. For 5 minutes, roughly 600-900 words. For 8-15 minutes, roughly 900-1600 words. For longer Movie choices, provide a detailed complete narrative/treatment of roughly 1400-2400 words rather than falsely pretending a handful of generated clips equals the full runtime. Prioritize completeness and narrative quality over exact word count. A 5-minute request must not quietly become a 3-minute narrative.

IMPORTANT DATA RULE: dialogue MUST be an array of plain strings formatted like "Character: spoken line". Do not return dialogue objects.


CINEMATIC COVERAGE RULE: Each scene is a narrative beat, not a single frozen clip. Add coveragePlan: an array of shot objects [{id,order,kind,purpose,visual,camera,speaker,spokenLine,speaking,narrationSupport,targetClipSec}]. Plan enough visually distinct shots to keep the selected narrative beat moving: establishing/medium/reaction/detail/over-shoulder/cutaway/reveal coverage as appropriate. For important on-camera dialogue, include a speaking:true shot where the named speaker is clearly visible in a natural conversational composition; spokenLine must contain only that character's line. Narration-support shots should vary scale/angle and must not pretend the narrator is speaking on camera. Do not reuse the same composition repeatedly. Preserve safe margins and identity continuity in every shot.

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

  // Prefer Gemini because CineTale's currently configured primary story key is Gemini.
  if(hasGemini){
    try{
      let plan=await generateWithGemini(prompt);
      plan=await repairIfNeeded(plan,generateWithGemini,'Gemini');
      plan=await diversifyIfNeeded(plan,generateWithGemini,'Gemini');
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
