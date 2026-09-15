import {demoProject} from '../lib/demo.js';
import {generateWithOpenAI,generateWithGemini} from '../lib/ai.js';

function isUsablePlan(plan){
  if(!plan || typeof plan!=='object') return false;
  if(!String(plan.title||'').trim()) return false;
  if(!String(plan.logline||'').trim()) return false;
  if(!Array.isArray(plan.characters) || plan.characters.length<1) return false;
  if(!Array.isArray(plan.episodes) || plan.episodes.length<1) return false;
  const first=plan.episodes[0];
  if(!first || !Array.isArray(first.scenes) || first.scenes.length<1) return false;
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
  plan.format=input.format||plan.format||'Episode';
  plan.genre=input.genre||plan.genre||'Open';
  plan.audience=input.audience||plan.audience||'General';
  plan.duration=input.duration||plan.duration||'2–3 minutes';
  plan.controlMode=input.controlMode||'Guided';
  plan.language=input.language||'English';
  plan.languageScope=input.languageScope||plan.languageScope||'entire-story';
  plan.culturalTreatment=input.culturalTreatment||plan.culturalTreatment||'auto';
  plan.languageDirection=input.languageDirection||plan.languageDirection||'';
  plan.continuityStrength=input.continuityStrength||plan.continuityStrength||'strict';
  plan.style=input.style||plan.style||'Cinematic realistic';
  plan.visualStylePreset=input.visualStylePreset||plan.visualStylePreset||'cinematic-realistic';
  plan.customVisualStyle=input.customVisualStyle||plan.customVisualStyle||'';
  plan.activeEpisode=plan.activeEpisode||1;
  plan.createdAt=plan.createdAt||new Date().toISOString();
  plan.updatedAt=new Date().toISOString();
  plan.generationMode=mode;
  for(const episode of (plan.episodes||[])){
    for(const scene of (episode?.scenes||[])){
      scene.dialogue=normalizeDialogueArray(scene.dialogue);
      if(scene.narration && typeof scene.narration!=='string') scene.narration=normalizeDialogueEntry(scene.narration);
    }
  }
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

function audienceInstruction(input={}){
  const audience=String(input.audience||'Teen (13–17)').trim();
  return `AUDIENCE: ${audience}. Adapt vocabulary, emotional intensity, fear/violence, romance, humor, pacing and thematic complexity to this audience while preserving the creator's core premise. Do not infantilize older audiences or make younger-audience content needlessly intense.`;
}

function sourceInstruction(input={}){
  if(String(input.storySource||'idea')==='full-story') return `SOURCE MODE: CREATOR'S OWN STORY. The creator has supplied their story, not merely a premise. Treat their text as the source of truth. Preserve core plot, character names, relationships, setting, culture, religion/belief context, chronology, themes and intended ending. Do not replace it with a different AI-invented story. Your job is to adapt it into the selected production format, scenes and reusable production metadata. Infer only details needed for production, and never invent a culturally or religiously specific ritual, doctrine, sacred claim, historical fact or identity when the creator did not provide it. When uncertain, remain general rather than fabricating specificity.`;
  return `SOURCE MODE: IDEA. Develop the creator's idea into an original production while preserving every explicit fact, relationship, cultural cue, belief context and constraint they supplied.`;
}

function culturalInstruction(input){
  const treatment=String(input.culturalTreatment||'auto');
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
  return `CULTURAL / SACRED INTERPRETATION: ${map[treatment]||map.auto}`;
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

CRITICAL: The title, world, characters, episode synopsis, every scene, dialogue, locations, props and canon MUST be specific to the creator's input. Do not reuse generic school-robot-demo material unless the creator actually asks for it. Preserve requested geography, culture, time period, relationships, language and visual direction without stereotyping. Treat the creator's genre value as an open-ended genre/tone instruction, including hybrids. Treat language as an open-ended language/dialect/multilingual instruction.

${languageInstruction(input)}

${audienceInstruction(input)}

${culturalInstruction(input)}

${sourceInstruction(input)}

Be sensitive to different cultures, religions, belief systems, folklore traditions, indigenous traditions and historical communities. Do not conflate nationality, ethnicity, language or religion. Avoid stereotypes, caricature, exoticization, flattening a culture into one look, or inventing sacred claims that the creator did not request. For real-world cultural or historical details not supplied by the creator, prefer broadly plausible, non-controversial details over precise invented claims. Never fabricate scripture, ritual requirements, sacred symbols, historical dates, community practices or titles of authority. If a precise cultural, religious, historical or geographic fact is uncertain, do not guess; keep the detail general while preserving the creator's intent. Preserve respectful individual variation in clothing, appearance, family structure and behavior.

For EACH character, classify entityType as one of: fictional-person, historical-figure, folklore-figure, mythological-figure, sacred-figure, creature, nonhuman, unknown. Only use sacred-figure when the full context clearly indicates a sacred/religious figure. If sacred-figure, set sacredIdentity to the intended identity/tradition and provide 3-8 concise canonicalVisualCues that help image generation preserve recognizable, reverent identity. If not sacred, use an empty sacredIdentity and an empty canonicalVisualCues array. Example distinction: “Durga Sharma, a school student” is fictional-person; “Goddess Durga” is sacred-figure. “Mata Parvati” in an Indian Mythology + Devotional story is sacred-figure and must not be described merely as an ordinary woman.

When a parent/companion of a sacred figure is itself a named sacred figure (for example Parvati in a Ganesha story), preserve that sacred identity too. Do not make a deity visually generic just because their narrative role is “mother”, “father”, “friend”, or “mentor”.

Never imitate living artists, celebrities, copyrighted characters, or franchises.

Return ONLY valid JSON with exactly these top-level keys:
title, logline, worldBible, characters, episodes

Schema:
worldBible:{premise,visualLanguage,rules[],canon[]}
characters:[{id,name,role,age,appearance,background,personality,voice,languages,wardrobe,locked,entityType,sacredIdentity,canonicalVisualCues[]}]
CHARACTER LANGUAGE RULE: The character.languages field may describe languages the character knows for identity/background realism. It is NOT permission to use those languages in story output. Actual dialogue/narration must obey the selected project language scope and Language direction exactly.
episodes:[{number,title,synopsis,scenes:[{id,number,title,durationSec,purpose,visual,narration,dialogue[],audioDirection,narrationStyle,music,sfx,camera,tier,act}]}]
INTERNAL STORAGE NOTE: CineTale currently stores the single production unit inside the episodes array for all formats. For Short, Story and Movie, return exactly ONE item with number:1, but do not call it an episode in user-facing title/synopsis text. The UI will present it as the selected format.

IMPORTANT DATA RULE: dialogue MUST be an array of plain strings formatted like "Character: spoken line". Do not return dialogue objects.

DIALOGUE QUALITY RULES: Write for ACTORS, not for a synopsis reader. Spoken lines must sound like believable conversation for the character's age, relationship, culture, situation and personality. Prefer concise, natural phrasing, subtext, interruptions and incomplete thoughts when appropriate. Do not make characters explain facts they both already know. Avoid stiff exposition, announcer-style wording, repeated names, or complete formal sentences unless the character intentionally speaks that way. Use contractions/colloquial rhythm where natural in the selected language, without stereotyping dialects or accents. Keep stage directions OUT of the spoken line itself.

AUDIO PERFORMANCE RULES: For every scene, add audioDirection: one concise performance note describing the emotional delivery and conversational energy for dialogue in that scene (for example: "quiet, uneasy curiosity; intimate and conversational, not theatrical"). Add narrationStyle: one concise note for narration (for example: "warm, restrained storyteller; reflective, medium-slow pace"). These are performance directions, not spoken text. They must respect culture, age and context without caricaturing accents.

${autoCastInstruction(input)} Create exactly ${formatCfg.sceneCount} scenes for the ${formatCfg.format}. The scenes must form a coherent structure specific to the creator's idea, not a template. Keep recurring character identity descriptions specific enough for visual continuity. ${formatCfg.format==='Movie'?'Distribute the scenes meaningfully across Act I, Act II and Act III.':''}

CREATOR INPUT:
${JSON.stringify(input)}`;

  const hasGemini=Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAI=Boolean(process.env.OPENAI_API_KEY);
  const errors=[];

  // Prefer Gemini because CineTale's currently configured primary story key is Gemini.
  if(hasGemini){
    try{
      const plan=await generateWithGemini(prompt);
      if(isUsablePlan(plan)) return res.status(200).json({plan:normalizePlan(plan,input,'ai'),mode:'ai',engine:'primary'});
      errors.push('Gemini returned an incomplete story plan.');
    }catch(e){
      console.error('[CineTale generate-plan] Gemini story generation failed', {message:e?.message||String(e)});
      errors.push(`Gemini: ${e?.message||'story generation failed'}`);
    }
  }

  if(hasOpenAI){
    try{
      const plan=await generateWithOpenAI(prompt);
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
