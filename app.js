const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const storageKey = 'cinetale.clean.projects';
const currentKey = 'cinetale.clean.current';
const themeKey = 'cinetale.clean.theme';
const usageKey = 'cinetale.session.usage';

const state = {
  format:'Episode', controlMode:'Guided', storySource:'idea', speechListening:false, storyInputMethod:'text',
  projects: safeParse(localStorage.getItem(storageKey), []),
  currentId: localStorage.getItem(currentKey) || null,
  theme: localStorage.getItem(themeKey) || 'light',
  editingProjectId:null,
  usage: safeParse(sessionStorage.getItem(usageKey), {visual:0,audio:0,video:0})
};

function safeParse(s,f){try{return JSON.parse(s)||f}catch{return f}}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dialogueText(entry){
  if(typeof entry==='string') return entry;
  if(entry==null) return '';
  if(typeof entry==='number' || typeof entry==='boolean') return String(entry);
  if(typeof entry==='object'){
    const speaker=String(entry.speaker||entry.character||entry.name||'').trim();
    const text=String(entry.text||entry.line||entry.dialogue||entry.content||entry.utterance||'').trim();
    if(speaker&&text)return `${speaker}: ${text}`;
    if(text)return text;
    const values=Object.values(entry).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
    if(values.length)return values.join(': ');
  }
  return '';
}
function dialogueList(value){return (Array.isArray(value)?value:(value==null?[]:[value])).map(dialogueText).filter(Boolean)}
function dialogueParts(entry){
  const raw=dialogueText(entry).trim();
  const m=raw.match(/^([^:]{1,80}):\s*(.+)$/s);
  return m?{speaker:m[1].trim(),text:m[2].trim()}:{speaker:'',text:raw};
}
function normalizeName(value=''){return String(value||'').toLowerCase().replace(/[^a-z0-9\p{L}]+/gu,' ').trim()}
function hashString(value=''){let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
let voiceCatalogCache=null;
let activeAudio=null;
async function voiceCatalog(){
  if(voiceCatalogCache)return voiceCatalogCache;
  const r=await fetch('/api/voices');const d=await r.json();if(!r.ok)throw new Error(d.error||'Voice catalog unavailable.');
  voiceCatalogCache=d;return d;
}
function voiceHaystack(v){return `${v.name||''} ${v.category||''} ${JSON.stringify(v.labels||{})}`.toLowerCase()}
function voiceMatchScore(v,c={}){
  const h=voiceHaystack(v),profile=`${c.age||''} ${c.voice||''} ${c.role||''}`.toLowerCase();let score=0;
  if(/girl|woman|female|mother|grandmother|aunt|sister/.test(profile)&&/female|woman|girl/.test(h))score+=5;
  if(/boy|man|male|father|grandfather|uncle|brother/.test(profile)&&/male|man|boy/.test(h))score+=5;
  const age=Number(String(c.age||'').match(/\d+/)?.[0]||NaN);
  if(Number.isFinite(age)&&age<18&&/young|teen|youth/.test(h))score+=4;
  if(Number.isFinite(age)&&age>=55&&/old|older|mature|senior/.test(h))score+=4;
  if(/warm/.test(profile)&&/warm/.test(h))score+=2;if(/calm/.test(profile)&&/calm/.test(h))score+=2;if(/bright|energetic/.test(profile)&&/bright|energetic/.test(h))score+=2;
  return score;
}
async function ensureCharacterVoice(p,index){
  const c=p?.characters?.[index];if(!c)return null;if(c.voiceId)return {voiceId:c.voiceId,voiceName:c.voiceName||c.voice||'Assigned voice'};
  const d=await voiceCatalog();const all=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));
  if(!all.length)return null;
  const used=new Set((p.characters||[]).filter((_,i)=>i!==index).map(x=>x.voiceId).filter(Boolean));if(p.narratorVoiceId)used.add(p.narratorVoiceId);
  const available=all.filter(v=>!used.has(v.voice_id));const voices=available.length?available:all;
  const ranked=voices.map(v=>({v,score:voiceMatchScore(v,c)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));
  const bestScore=ranked[0]?.score||0;const pool=ranked.filter(x=>x.score===bestScore).map(x=>x.v);const pick=pool[hashString(c.name||index)%pool.length]||ranked[0].v;
  updateProject(x=>{const target=x.characters?.[index];if(target&&!target.voiceId){target.voiceId=pick.voice_id;target.voiceName=pick.name;target.voiceMode='auto';target.voiceLocked=false;target.voicePerformance=target.voicePerformance||'Natural';target.voicePace=target.voicePace||'Natural'}});
  return {voiceId:pick.voice_id,voiceName:pick.name};
}
async function ensureNarratorVoice(p){
  if(p?.narratorVoiceId)return {voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||'Narrator'};
  const d=await voiceCatalog();if(!d?.narratorVoiceId)return null;
  updateProject(x=>{x.narratorVoiceId=d.narratorVoiceId;x.narratorVoiceName=d.narratorVoiceName||'Narrator'});
  return {voiceId:d.narratorVoiceId,voiceName:d.narratorVoiceName||'Narrator'};
}
function sceneAudioDirection(scene={}){
  if(String(scene.audioDirection||'').trim())return String(scene.audioDirection).trim();
  const t=`${scene.title||''} ${scene.visual||''} ${scene.purpose||''}`.toLowerCase();
  if(/fear|dark|locked|buried|mystery|secret|uneasy|suspense/.test(t))return 'quiet, uneasy curiosity; intimate and conversational; restrained, not theatrical';
  if(/run|escape|urgent|chase|danger/.test(t))return 'urgent and breath-aware, but still natural conversation; avoid announcer cadence';
  if(/memory|grand|family|letter|recording|loss|grief/.test(t))return 'reflective and emotionally restrained; natural pauses; intimate, not melodramatic';
  return 'natural conversational delivery with believable pauses and subtext; never read like an announcer';
}
const VOICE_PERFORMANCE={
  Natural:'natural, conversational, believable pauses and subtext; never announcer-like',
  Warm:'warm, intimate and reassuring; relaxed conversational phrasing',
  Calm:'calm, grounded and restrained; measured but not slow or robotic',
  Energetic:'energetic and engaged; lively conversational rhythm without overacting',
  Dramatic:'emotionally present and cinematic, but restrained enough to sound human',
  Mysterious:'quietly intriguing, controlled and intimate; subtle tension rather than theatrical suspense',
  Playful:'light, spontaneous and playful; natural smiles in the voice without cartoon exaggeration',
  Intimate:'close, personal and vulnerable; soft natural pauses and understated emotion'
};
const VOICE_PACE={Natural:'natural pace with varied sentence rhythm',Relaxed:'slightly relaxed pace with comfortable pauses',Quick:'slightly quicker conversational pace without rushing'};
function characterVoiceDirection(c={}){
  const perf=VOICE_PERFORMANCE[c.voicePerformance||'Natural']||VOICE_PERFORMANCE.Natural;
  const pace=VOICE_PACE[c.voicePace||'Natural']||VOICE_PACE.Natural;
  return [perf,pace,c.voice,c.voiceCustomDirection].filter(Boolean).join('. ');
}
function narratorVoiceDirection(p={},scene={}){
  const perf=VOICE_PERFORMANCE[p.narratorPerformance||'Warm']||VOICE_PERFORMANCE.Warm;
  const pace=VOICE_PACE[p.narratorPace||'Natural']||VOICE_PACE.Natural;
  const sceneStyle=String(scene?.narrationStyle||'').trim();
  return [perf,pace,p.narratorCustomDirection,sceneStyle||'restrained storyteller; avoid trailer voice'].filter(Boolean).join('. ');
}
function sceneVoiceCharacterIndex(p,s){
  for(const line of dialogueList(s?.dialogue)){const {speaker}=dialogueParts(line);const idx=characterIndexForSpeaker(p,speaker);if(idx>=0)return idx}
  return -1;
}
function sceneVoiceSummary(p,s){
  const idx=sceneVoiceCharacterIndex(p,s);
  if(idx<0){const perf=p?.narratorPerformance||'Warm';return `${p?.narratorVoiceName||'Narrator'} · ${perf} · ${p?.narratorVoiceLocked?'Voice locked':(p?.narratorVoiceId?'Assigned voice':'Auto voice')}`;}
  const c=p.characters[idx],perf=c.voicePerformance||'Natural';
  return `${c.name} · ${perf} · ${c.voiceLocked?'Voice locked':(c.voiceName?'Assigned voice':'Auto voice')}`;
}
const VISUAL_STYLES={
  'cinematic-realistic':{label:'Cinematic Realistic',prompt:'cinematic photorealistic live-action look, natural skin and fabric texture, believable lighting, filmic color, realistic locations and proportions'},
  '3d-animated':{label:'3D Animated',prompt:'polished feature-animation 3D look, expressive stylized characters, dimensional materials, cinematic lighting, cohesive animated-film art direction'},
  '2d-animated':{label:'2D Animated',prompt:'high-quality 2D animation, clean expressive linework, painted backgrounds, strong silhouettes, consistent animation-model character design'},
  'anime':{label:'Anime',prompt:'original contemporary anime-inspired animation, expressive faces, clean line art, cinematic composition, detailed painted backgrounds, coherent character sheets'},
  'storybook':{label:'Illustrated / Storybook',prompt:'rich storybook illustration, hand-crafted painted textures, expressive editorial composition, elegant shapes and cohesive illustrated character design'},
  'devotional-art':{label:'Devotional Art',prompt:'reverent devotional illustration, luminous sacred atmosphere, graceful traditional symbolism, respectful ceremonial detail, warm spiritual light, no caricature'},
  'sacred-cinematic':{label:'Sacred Cinematic',prompt:'cinematic sacred visual language, reverent mythological atmosphere, luminous spiritual light, culturally grounded ceremonial detail, majestic but respectful composition'},
  'watercolor':{label:'Watercolor',prompt:'expressive watercolor illustration, layered translucent pigment, hand-painted texture, soft edges, elegant story illustration composition'},
  'graphic-novel':{label:'Graphic Novel',prompt:'premium graphic novel art, confident ink linework, cinematic panel composition, sophisticated color, consistent character design'},
  'clay':{label:'Clay / Stop-motion Inspired',prompt:'hand-crafted clay stop-motion inspired look, tactile materials, expressive sculpted characters, miniature cinematic sets and soft studio lighting'},
  'custom':{label:'Custom',prompt:''}
};
const GENRE_PRESETS=[
  'Mystery','Thriller','Suspense','Crime','Detective','Sci-Fi','Fantasy','Adventure','Action','Drama','Family Drama','Romance','Romantic Comedy','Comedy','Dark Comedy','Horror','Supernatural','Psychological','Historical','Period Drama','War','Political Drama','Coming-of-Age','Slice of Life','Family','Kids','Teen','Musical','Sports','Survival','Disaster','Western','Heist','Spy / Espionage','Legal / Courtroom','Medical','Workplace','School / Campus','Road Trip','Travel','Mythology','Sacred Legend','Mythological Adventure','Devotional Story','Folklore','Fairy Tale','Spiritual / Philosophical','Biographical-style','Documentary-style','Mockumentary','Experimental','Anthology','Indian Family Drama','Indian Romance','Indian Comedy','Indian Thriller','Indian Crime','Indian Historical','Indian Mythology','Indian Folklore','Social Drama','Village Drama','Urban India','Partition-era Drama','Royal / Palace Drama','Devotional / Spiritual','Festival Story','Regional Cultural Story'
];
const LANGUAGE_PRESETS=[
  'English','Spanish','French','German','Portuguese','Italian','Arabic','Mandarin Chinese','Japanese','Korean',
  'Hindi','Urdu','Bengali','Punjabi','Gujarati','Marathi','Tamil','Telugu','Kannada','Malayalam','Odia','Assamese','Nepali','Sanskrit','Konkani','Sindhi','Kashmiri','Bhojpuri','Maithili','Rajasthani','Haryanvi','Dogri','Manipuri / Meitei',
  'Dutch','Russian','Ukrainian','Polish','Turkish','Persian / Farsi','Hebrew','Cantonese','Thai','Vietnamese','Indonesian','Malay','Filipino / Tagalog','Swahili','Afrikaans','Greek','Romanian','Czech','Hungarian','Swedish','Norwegian','Danish','Finnish','Catalan','Basque','Irish','Welsh','Icelandic','Serbian','Croatian','Bulgarian','Slovak','Slovenian','Lithuanian','Latvian','Estonian','Georgian','Armenian','Azerbaijani','Kazakh','Uzbek','Pashto','Kurdish','Somali','Amharic','Yoruba','Igbo','Hausa','Zulu','Xhosa'
];

const FORMAT_CONFIG={
  Episode:{title:'Episode',explainer:'Build an ongoing series. Only Episode mode creates Episode 2, 3 and beyond.',ideaHint:'One sentence is enough. CineTale builds the world, recurring cast and first episode around it.',durationHint:'Target episode runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','15–20 minutes','Custom'],defaultDuration:'2–3 minutes',createLabel:'Create episode',unitLabel:'EPISODE',runtimeLabel:'estimated episode runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final episode'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Series memory',sceneTitle:'Scene production',finalName:'episode'},
  Short:{title:'Short',explainer:'One self-contained short-form video. No episodes or continuation controls.',ideaHint:'One sentence is enough. CineTale builds a compact beginning-to-end short around it.',durationHint:'Target finished short runtime.',durations:['15–30 seconds','30–60 seconds','60–90 seconds','2–3 minutes','Custom'],defaultDuration:'30–60 seconds',createLabel:'Create short',unitLabel:'SHORT',runtimeLabel:'estimated short runtime',journey:['Idea','Cast','Scenes','Audio','Video','Final short'],journeySubs:['Ready','If needed','Shots','Preview','Generate','Prepare'],memoryTitle:'Creative notes',sceneTitle:'Short scenes',finalName:'short'},
  Story:{title:'Story',explainer:'One complete standalone story with a real ending. No automatic Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete standalone story around it.',durationHint:'Target finished story runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','10–15 minutes','Custom'],defaultDuration:'5 minutes',createLabel:'Create story',unitLabel:'STORY',runtimeLabel:'estimated story runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final story'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Story memory',sceneTitle:'Story scenes',finalName:'story'},
  Movie:{title:'Movie',explainer:'A standalone movie structure with acts and scenes. It does not create Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete movie arc with acts, cast and key scenes.',durationHint:'Target movie runtime. Longer movies require more production assets.',durations:['10–15 minutes','20–30 minutes','45–60 minutes','90 minutes','Custom'],defaultDuration:'20–30 minutes',createLabel:'Create movie',unitLabel:'MOVIE',runtimeLabel:'estimated movie runtime',journey:['Concept','Cast','Acts & scenes','Audio','Video','Final movie'],journeySubs:['Ready','Portraits','Structure','Preview','Generate','Prepare'],memoryTitle:'Movie continuity',sceneTitle:'Movie scenes',finalName:'movie'}
};
function formatConfig(format=state.format){return FORMAT_CONFIG[format]||FORMAT_CONFIG.Episode}
function applyFormatUI(preserveDuration=false){
  const cfg=formatConfig();
  $$('#formatTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.format===state.format));
  const ex=$('#formatExplainer');if(ex)ex.innerHTML=`<b>${cfg.title}</b><span>${cfg.explainer}</span>`;
  if($('#ideaHint'))$('#ideaHint').textContent=cfg.ideaHint;
  if($('#durationHint'))$('#durationHint').textContent=cfg.durationHint;
  const duration=$('#duration');if(duration){const old=duration.value;duration.innerHTML=cfg.durations.map(v=>`<option>${v}</option>`).join('');duration.value=preserveDuration&&cfg.durations.includes(old)?old:cfg.defaultDuration;}
  if($('#createButton span')&&!state.editingProjectId)$('#createButton span').textContent=cfg.createLabel;
}

const pickerState={genre:['Mystery'],language:['English']};
const ownerMode=new URLSearchParams(location.search).get('owner')==='1';
function styleLabel(key){return VISUAL_STYLES[key]?.label||key||'Cinematic Realistic'}
function stylePromptFromPreset(key,custom=''){return key==='custom'?(String(custom||'').trim()||'creator-defined custom visual style'):(VISUAL_STYLES[key]?.prompt||String(custom||'').trim()||'cinematic realistic')}
function projectStyle(p){if(!p?.visualStylePreset)return String(p?.style||p?.worldBible?.visualLanguage||'cinematic realistic');return stylePromptFromPreset(p.visualStylePreset,p.customVisualStyle||'')}
function characterStyle(p,c){if(!c?.visualStyleOverride||c.visualStyleOverride==='project')return projectStyle(p);return stylePromptFromPreset(c.visualStyleOverride,c.customVisualStyle||'')}
function culturalPrompt(p){const t=p?.culturalTreatment||'auto';const map={auto:'Infer cultural, historical, folklore or sacred context from the full story rather than a name alone. Distinguish an ordinary person from a sacred or mythological figure using the complete prompt and genre.', 'culturally-faithful':'Use culturally faithful details, avoid stereotypes, and preserve geography, clothing, architecture, customs and symbolism only when relevant to the story.', traditional:'Use a traditional treatment grounded in the requested culture and period; avoid generic or unrelated styling.', 'historically-grounded':'Prioritize historically plausible clothing, objects, architecture and social context for the requested time and place.', 'reverent-devotional':'Use a reverent devotional treatment. When a sacred figure is clearly intended, preserve respectful sacred identity, atmosphere and established high-level symbolism without caricature or turning the figure into an unrelated ordinary person.', 'sacred-cinematic':'Use a reverent sacred-cinematic treatment with culturally grounded symbolism and luminous spiritual atmosphere while preserving the figure’s intended sacred identity.', inspired:'Use a respectful inspired reinterpretation while keeping the source culture recognizable and avoiding stereotypes.', 'modern-retelling':'Use a respectful modern retelling; retain the core cultural or mythological identity while updating setting or styling only where the creator intends.'};return map[t]||map.auto}
function isSacredCharacter(p,c){
  const text=[p?.idea,p?.genre,p?.worldBible?.premise,c?.name,c?.role,c?.background,c?.appearance,c?.entityType,c?.sacredIdentity].filter(Boolean).join(' ').toLowerCase();
  if(String(c?.entityType||'').toLowerCase()==='sacred-figure') return true;
  return /(goddess|god\b|deity|divine|sacred|devotional|mytholog|देवी|देवता|भगवान|माता\s+पार्वती|बाल\s+गणेश|गणेश|दुर्गा|लक्ष्मी|सरस्वती|हनुमान|शिव|कृष्ण|राम)/i.test(text);
}
function sacredFigureGuidance(p,c){
  const text=[p?.idea,p?.genre,p?.worldBible?.premise,c?.name,c?.role,c?.background,c?.appearance,c?.entityType,c?.sacredIdentity,(c?.canonicalVisualCues||[]).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const explicitSacred=/(goddess|god\b|deity|divine|sacred|devotional|mytholog|देवी|देवता|भगवान|माता\s+पार्वती|बाल\s+गणेश|गणेश|दुर्गा|लक्ष्मी|सरस्वती|हनुमान|शिव|कृष्ण|राम)/i.test(text);
  if(!explicitSacred) return 'Do not infer a sacred identity from a name alone. Render the character exactly as the story context describes them.';
  const cues=[];
  if(/parvati|पार्वती/.test(text)) cues.push('This character is the Hindu goddess Parvati in a devotional/mythological context, not an ordinary contemporary woman. Preserve a serene divine presence, traditional goddess styling, graceful sari and jewelry, bindi/tilak where appropriate, subtle luminous aura, and Himalayan/Kailash visual context when relevant. Keep the maternal expression dignified and sacred rather than fashion-portrait styling.');
  if(/ganesha|ganesh|गणेश/.test(text)) cues.push('This character is Ganesha in a devotional/mythological context. Preserve the recognizable elephant-headed child/deity identity, traditional ornaments and clothing, warm sacred presence, and culturally appropriate symbolism. Do not humanize the face into an ordinary child.');
  if(/durga|दुर्गा/.test(text)) cues.push('This character is the goddess Durga or a devotional child form when the story says so. Preserve recognizable sacred identity, traditional attire and ornaments, luminous devotional atmosphere, and appropriate high-level Durga symbolism without caricature.');
  if(/lakshmi|लक्ष्मी/.test(text)) cues.push('Preserve the intended sacred identity of goddess Lakshmi with dignified traditional attire, luminous devotional presence and culturally appropriate high-level symbolism; do not reduce her to an ordinary portrait.');
  if(/saraswati|सरस्वती/.test(text)) cues.push('Preserve the intended sacred identity of goddess Saraswati with dignified traditional attire, serene devotional presence and culturally appropriate high-level symbolism; do not reduce her to an ordinary portrait.');
  if(/shiva|शिव/.test(text)) cues.push('Preserve the intended sacred identity of Shiva using respectful, recognizable high-level iconography and devotional atmosphere rather than ordinary contemporary styling.');
  if(/krishna|कृष्ण/.test(text)) cues.push('Preserve the intended sacred identity of Krishna using respectful, recognizable high-level iconography and devotional atmosphere rather than ordinary contemporary styling.');
  if(/hanuman|हनुमान/.test(text)) cues.push('Preserve the intended sacred identity of Hanuman using respectful, recognizable high-level iconography and devotional atmosphere rather than an ordinary human portrait.');
  const modelCues=Array.isArray(c?.canonicalVisualCues)?c.canonicalVisualCues.filter(Boolean).join('; '):String(c?.canonicalVisualCues||'').trim();
  if(modelCues) cues.push(`Creator/story-derived canonical sacred or cultural cues: ${modelCues}.`);
  if(c?.sacredIdentity) cues.push(`Sacred identity from story plan: ${c.sacredIdentity}.`);
  return `${cues.join(' ')} Treat sacred figures reverently and consistently with the creator's requested tradition. Avoid stereotypes, parody, eroticization, random cross-cultural symbols, or invented ritual claims. If the story is an inspired/modern retelling, modernize only what the creator explicitly permits.`;
}
function continuityPrompt(p){const mode=p?.continuityStrength||'strict';if(mode==='flexible')return 'Maintain recognizable character identity and age while allowing broader wardrobe, hair styling and pose variation when the scene calls for it.';if(mode==='balanced')return 'Preserve facial structure, skin tone, hair identity, age presentation and distinguishing traits. Wardrobe and styling may change only when motivated by the scene.';return 'STRICT IDENTITY LOCK: reference portraits are authoritative. Preserve the same facial structure, skin tone, eye shape, nose, jawline, hair identity, age presentation, body proportions and defining traits across every scene. Do not redesign or substitute the character. Wardrobe remains consistent unless the story explicitly changes it.'}
function visualStyleOptions(selected='project',includeProject=true){const values=[...(includeProject?[['project','Use project style']]:[]),...Object.entries(VISUAL_STYLES).map(([k,v])=>[k,v.label])];return values.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('')}
function pickerValues(kind){return kind==='genre'?GENRE_PRESETS:LANGUAGE_PRESETS}
function pickerJoin(kind,values){return kind==='genre'?values.join(' + '):values.join(' + ')}
function syncPicker(kind){const values=pickerState[kind];const hidden=$(`#${kind}`),wrap=$(`#${kind}Selected`),button=$(`#${kind}PickerButton`);if(hidden)hidden.value=pickerJoin(kind,values);if(button)button.textContent=values.length?`Edit ${kind}${values.length>1?'s':''} (${values.length})`:`Choose ${kind}s`;if(wrap)wrap.innerHTML=values.map((v,i)=>`<button type="button" class="selected-pill" data-remove-picker="${kind}" data-index="${i}" aria-label="Remove ${esc(v)}">${esc(v)} <span>×</span></button>`).join('');wrap?.querySelectorAll('[data-remove-picker]').forEach(b=>b.onclick=()=>{const k=b.dataset.removePicker;pickerState[k].splice(Number(b.dataset.index),1);if(!pickerState[k].length)pickerState[k].push(k==='genre'?'Mystery':'English');syncPicker(k)})}
function openMultiPicker(kind){const selected=new Set(pickerState[kind]);const title=kind==='genre'?'Choose genres':'Choose languages';const description=kind==='genre'?'Select one or combine several. Genre never limits cultural setting or language.':'Select every language used in the project. Use Language direction to assign narration and dialogue.';const draw=(query='')=>{const q=query.toLowerCase();const options=pickerValues(kind).filter(x=>!q||x.toLowerCase().includes(q));$('#pickerOptions').innerHTML=options.map(v=>`<label class="picker-option"><input type="checkbox" value="${esc(v)}" ${selected.has(v)?'checked':''}><span>${esc(v)}</span></label>`).join('');$('#pickerOptions').querySelectorAll('input').forEach(cb=>cb.onchange=()=>cb.checked?selected.add(cb.value):selected.delete(cb.value))};$('#modalBody').innerHTML=`<div class="modal-form"><h2>${title}</h2><p>${description}</p><label class="field"><span>Search</span><input id="pickerSearch" placeholder="Search ${kind}s…"></label><div class="picker-options" id="pickerOptions"></div><div class="custom-picker-row"><input id="pickerCustom" placeholder="Add a custom ${kind}, dialect, or label"><button type="button" class="ghost" id="pickerAddCustom">Add custom</button></div><div class="modal-actions"><button type="button" class="ghost" id="pickerCancel">Cancel</button><button type="button" class="primary" id="pickerSave">Use selection</button></div></div>`;$('#modal').classList.remove('hidden');draw();$('#pickerSearch').oninput=e=>draw(e.target.value);$('#pickerAddCustom').onclick=()=>{const v=$('#pickerCustom').value.trim();if(v){selected.add(v);$('#pickerCustom').value='';draw($('#pickerSearch').value)}};$('#pickerCancel').onclick=closeModal;$('#pickerSave').onclick=()=>{const values=[...selected];pickerState[kind]=values.length?values:[kind==='genre'?'Mystery':'English'];syncPicker(kind);closeModal()}}
function hydratePickers(){const g=$('#genre')?.value.trim(),l=$('#language')?.value.trim();if(g)pickerState.genre=g.split(/\s*\+\s*/).filter(Boolean);if(l)pickerState.language=l.split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language')}
function applyOwnerMode(){$$('.owner-only').forEach(el=>{el.style.display=ownerMode?'':'none'});$$('.user-only').forEach(el=>{el.style.display=ownerMode?'none':''});const avatar=$('.avatar-btn');if(avatar){avatar.textContent=ownerMode?'DS':'ME';avatar.title=ownerMode?'Owner settings':'Creator profile & settings'}}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__ctToast);window.__ctToast=setTimeout(()=>el.classList.remove('show'),2600)}
function saveUsage(){sessionStorage.setItem(usageKey,JSON.stringify(state.usage))}
function bumpUsage(kind,n=1){if(!(kind in state.usage))return;state.usage[kind]+=n;saveUsage();renderUsage()}
function renderUsage(){const map={visual:'#usageVisuals',audio:'#usageAudio',video:'#usageVideo'};for(const [k,sel] of Object.entries(map)){const el=$(sel);if(el)el.textContent=`${state.usage[k]||0} this session`}}
function save(){localStorage.setItem(storageKey,JSON.stringify(state.projects));if(state.currentId)localStorage.setItem(currentKey,state.currentId);else localStorage.removeItem(currentKey)}
function current(){return state.projects.find(p=>p.id===state.currentId)||state.projects[0]||null}
function uid(prefix='id'){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`}
function ensureEpisodeIds(p){if(!p)return p;p.episodes=Array.isArray(p.episodes)?p.episodes:[];for(const e of p.episodes)e.id=e.id||uid('ep');if(!p.activeEpisodeId){const byNumber=p.episodes.find(e=>Number(e.number)===Number(p.activeEpisode));p.activeEpisodeId=byNumber?.id||p.episodes.at(-1)?.id||null}return p}
function episodeOf(p){if(!p)return null;ensureEpisodeIds(p);return (p.episodes||[]).find(e=>e.id===p.activeEpisodeId) || (p.episodes||[]).find(e=>Number(e.number)===Number(p.activeEpisode)) || (p.episodes||[]).at(-1) || null}
function formatTime(sec=0){const m=Math.floor(sec/60),s=Math.round(sec%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function updateProject(fn){const p=current();if(!p)return;fn(p);p.updatedAt=new Date().toISOString();save();renderAll()}
function apiPost(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d})}
function applyTheme(){document.documentElement.dataset.theme=state.theme;const dark=state.theme==='dark';$('#themeToggle').textContent=dark?'☾':'☼';$('#themeToggle').setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');const meta=$('#themeColorMeta');if(meta)meta.setAttribute('content',dark?'#0e0d15':'#fbf9ff');localStorage.setItem(themeKey,state.theme)}
function updateNavIndicator(){const nav=$('.nav'),active=$('.nav-item.active'),ind=$('.nav-indicator');if(!nav||!active||!ind)return;const nr=nav.getBoundingClientRect(),ar=active.getBoundingClientRect();ind.style.width=`${ar.width}px`;ind.style.transform=`translateX(${ar.left-nr.left+nav.scrollLeft}px)`}
function setView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('[data-view].nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});renderAll();requestAnimationFrame(updateNavIndicator)}
let __lastScroll=0;addEventListener('scroll',()=>{const top=window.scrollY||0,bar=$('.topbar');if(!bar)return;const goingDown=top>__lastScroll&&top>140;bar.classList.toggle('nav-hidden',goingDown);__lastScroll=top},{passive:true});addEventListener('resize',()=>requestAnimationFrame(updateNavIndicator));

$$('[data-view]').forEach(b=>b.addEventListener('click',e=>{if(b.tagName==='A')e.preventDefault();setView(b.dataset.view)}));
$('#themeToggle').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme()};
$('#settingsTheme').onclick=()=>$('#themeToggle').click();
applyTheme();
hydratePickers();
applyOwnerMode();
applyFormatUI(false);
$('#genrePickerButton').onclick=()=>openMultiPicker('genre');
$('#languagePickerButton').onclick=()=>openMultiPicker('language');

$$('#formatTabs .seg').forEach(b=>b.onclick=()=>{state.format=b.dataset.format;applyFormatUI(false)});
$$('#controlTabs .seg').forEach(b=>b.onclick=()=>{state.controlMode=b.dataset.control;$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x===b));$('#directorFields').classList.toggle('hidden',state.controlMode!=='Director')});
$('#visualStylePreset').addEventListener('change',e=>$('#customStyleWrap').classList.toggle('hidden',e.target.value!=='custom'));
$('#audience').addEventListener('change',e=>$('#customAudience').classList.toggle('hidden',e.target.value!=='Custom'));

const STORY_SOURCE_COPY={
  idea:{label:'Your idea',placeholder:'Describe anything… e.g. A teenage inventor discovers a robot hidden beneath her school.'},
  'full-story':{label:'Your story',placeholder:'Type or paste your story here. CineTale will preserve the plot, names, relationships, culture and meaning while preparing scenes and production assets.'}
};
function applyStorySourceUI(){
  const cfg=STORY_SOURCE_COPY[state.storySource]||STORY_SOURCE_COPY.idea;
  $$('#storySourceTabs .seg').forEach(b=>b.classList.toggle('active',b.dataset.storySource===state.storySource));
  const label=$('#storyInputLabel'), idea=$('#idea'); if(label)label.textContent=cfg.label;if(idea)idea.placeholder=cfg.placeholder;
  if($('#ideaHint')) $('#ideaHint').textContent=state.storySource==='full-story'?'Your words remain the source of truth. CineTale structures them for the selected format instead of replacing your story.':formatConfig().ideaHint;
}
$$('#storySourceTabs .seg').forEach(b=>b.onclick=()=>{state.storySource=b.dataset.storySource||'idea';applyStorySourceUI()});
function speechLangFor(value='English'){
  const first=String(value).split(/\s*\+\s*|,/)[0].trim().toLowerCase();
  const map={english:'en-US',spanish:'es-ES',hindi:'hi-IN',french:'fr-FR',german:'de-DE',italian:'it-IT',portuguese:'pt-BR',arabic:'ar-SA',japanese:'ja-JP',korean:'ko-KR','mandarin chinese':'zh-CN',cantonese:'zh-HK',tamil:'ta-IN',telugu:'te-IN',kannada:'kn-IN',malayalam:'ml-IN',marathi:'mr-IN',bengali:'bn-IN',gujarati:'gu-IN',punjabi:'pa-IN',urdu:'ur-PK'};
  return map[first]||document.documentElement.lang||'en-US';
}
let storyRecognizer=null,storyRecorder=null,storyRecorderStream=null,storyRecorderChunks=[],storyRecordTimer=null;
function appendStoryTranscript(text){
  const clean=String(text||'').trim(); if(!clean)return;
  const box=$('#idea'); const prefix=box.value.trim()?box.value.trim()+' ':''; box.value=(prefix+clean).slice(0,12000); state.storyInputMethod='voice';
}
function resetMicUI(){state.speechListening=false;$('#storyMicBtn')?.classList.remove('listening','recording');if($('#storyMicText'))$('#storyMicText').textContent='Start speaking'}
function stopStorySpeech(){
  try{storyRecognizer?.stop()}catch{}
  storyRecognizer=null;
  if(storyRecorder && storyRecorder.state!=='inactive'){try{storyRecorder.stop()}catch{}}
  if(storyRecorderStream){for(const t of storyRecorderStream.getTracks())t.stop();storyRecorderStream=null}
  if(storyRecordTimer){clearTimeout(storyRecordTimer);storyRecordTimer=null}
  resetMicUI();
}
async function audioBlobToDataUrl(blob){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Could not read audio'));r.readAsDataURL(blob)})}
async function transcribeRecordedStory(blob){
  if(!blob?.size) throw new Error('No voice recording captured.');
  const audio=await audioBlobToDataUrl(blob);
  const d=await apiPost('/api/transcribe',{audio,mimeType:blob.type||'audio/webm',language:$('#language')?.value||'English'});
  if(!d?.text) throw new Error('No speech was detected.');
  appendStoryTranscript(d.text); $('#speechStatus').textContent='Voice transcription added. Review or edit it before creating.';
}
async function startRecordedStorySpeech(){
  if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){toast('Voice input is not available in this browser. You can still type or paste your story.');return}
  try{
    stopStorySpeech(); storyRecorderStream=await navigator.mediaDevices.getUserMedia({audio:true}); storyRecorderChunks=[];
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported?.(x));
    storyRecorder=new MediaRecorder(storyRecorderStream,preferred?{mimeType:preferred}:undefined);
    storyRecorder.ondataavailable=e=>{if(e.data?.size)storyRecorderChunks.push(e.data)};
    storyRecorder.onstart=()=>{state.speechListening=true;state.storyInputMethod='voice';$('#storyMicBtn')?.classList.add('recording');$('#storyMicText').textContent='Stop & transcribe';$('#speechStatus').textContent='Recording… speak naturally, then press Stop & transcribe.'};
    storyRecorder.onerror=()=>{$('#speechStatus').textContent='Voice recording stopped. Check microphone permission or type your story instead.';stopStorySpeech()};
    storyRecorder.onstop=async()=>{const chunks=[...storyRecorderChunks];const mime=storyRecorder?.mimeType||chunks[0]?.type||'audio/webm';if(storyRecorderStream){for(const t of storyRecorderStream.getTracks())t.stop();storyRecorderStream=null}resetMicUI();$('#speechStatus').textContent='Transcribing…';try{await transcribeRecordedStory(new Blob(chunks,{type:mime}))}catch(e){$('#speechStatus').textContent=e.message||'Voice transcription could not be completed.';toast(e.message||'Voice transcription could not be completed.')}};
    storyRecorder.start(500);storyRecordTimer=setTimeout(()=>{if(storyRecorder?.state==='recording')storyRecorder.stop()},90000);
  }catch(e){resetMicUI();$('#speechStatus').textContent='Microphone could not start. Check browser permission or type your story instead.';toast('Microphone could not start. Check browser microphone permission.')}
}
function startStorySpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){startRecordedStorySpeech();return}
  stopStorySpeech();storyRecognizer=new SR();storyRecognizer.lang=speechLangFor($('#language')?.value||'English');storyRecognizer.continuous=true;storyRecognizer.interimResults=true;
  let finalChunk='';storyRecognizer.onstart=()=>{state.speechListening=true;state.storyInputMethod='voice';$('#storyMicBtn')?.classList.add('listening');$('#storyMicText').textContent='Stop speaking';$('#speechStatus').textContent='Listening… speak naturally. Your words will appear in the story box.'};
  storyRecognizer.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalChunk+=t+' ';else interim+=t}if(finalChunk.trim()){appendStoryTranscript(finalChunk);finalChunk=''}$('#speechStatus').textContent=interim?`Listening: ${interim}`:'Listening…'};
  storyRecognizer.onerror=e=>{const code=e?.error||'';storyRecognizer=null;resetMicUI();if(['service-not-allowed','audio-capture','network','language-not-supported'].includes(code)){ $('#speechStatus').textContent='Live recognition is unavailable here. Switching to recorded transcription…'; startRecordedStorySpeech(); return }$('#speechStatus').textContent=`Voice input stopped${code?`: ${code}`:''}. You can keep editing the transcript.`};
  storyRecognizer.onend=()=>{if(state.speechListening){resetMicUI();$('#speechStatus').textContent='Voice input finished. Review or edit the transcript before creating.'}};
  try{storyRecognizer.start()}catch{storyRecognizer=null;resetMicUI();startRecordedStorySpeech()}
}
$('#typeStoryBtn').onclick=()=>{stopStorySpeech();state.storyInputMethod='text';$('#typeStoryBtn').classList.add('active');$('#speakStoryBtn').classList.remove('active');$('#idea').focus();$('#speechStatus').textContent='Type or paste your story directly. Your text remains editable.'};
$('#speakStoryBtn').onclick=()=>{$('#speakStoryBtn').classList.add('active');$('#typeStoryBtn').classList.remove('active');startStorySpeech()};
$('#storyMicBtn').onclick=()=>{if(storyRecorder?.state==='recording'){storyRecorder.stop();return}state.speechListening?stopStorySpeech():startStorySpeech()};
applyStorySourceUI();

function setSelectValue(id,value){const el=$(id);if(!el)return;const found=[...el.options].some(o=>o.value===String(value)||o.textContent===String(value));if(found)el.value=String(value)}
function audienceValue(){const sel=$('#audience');if(!sel)return 'Teen (13–17)';if(sel.value==='Custom')return ($('#customAudience')?.value||'').trim()||'Custom audience';return sel.value}
function applyAudienceValue(value){const v=String(value||'Teen (13–17)').trim();const legacy={'13+':'Teen (13–17)','Kids':'Kids (9–12)','Family':'Family / All ages'}[v]||v;const sel=$('#audience'),custom=$('#customAudience');if(!sel||!custom)return;const found=[...sel.options].some(o=>o.value===legacy);if(found){sel.value=legacy;custom.value=''}else{sel.value='Custom';custom.value=v}custom.classList.toggle('hidden',sel.value!=='Custom')}
function startEditSetup(){const p=current();if(!p){toast('Create a project first.');return}state.editingProjectId=p.id;state.storySource=p.storySource||'idea';applyStorySourceUI();$('#idea').value=p.idea||p.logline||'';pickerState.genre=String(p.genre||'Mystery').split(/\s*\+\s*/).filter(Boolean);pickerState.language=String(p.language||'English').split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language');applyAudienceValue(p.audience||'Teen (13–17)');setSelectValue('#duration',p.duration||'2–3 minutes');setSelectValue('#castSize',p.castSize||'auto');setSelectValue('#visualStylePreset',p.visualStylePreset||'cinematic-realistic');$('#customStyle').value=p.customVisualStyle||'';$('#customStyleWrap').classList.toggle('hidden',$('#visualStylePreset').value!=='custom');setSelectValue('#languageScope',p.languageScope||'entire-story');setSelectValue('#culturalTreatment',p.culturalTreatment||'auto');$('#languageDirection').value=p.languageDirection||'';setSelectValue('#continuityStrength',p.continuityStrength||'strict');state.format=p.format||'Episode';applyFormatUI(false);setSelectValue('#duration',p.duration||formatConfig().defaultDuration);state.controlMode=p.controlMode||'Guided';$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.control===state.controlMode));$('#directorFields').classList.toggle('hidden',state.controlMode!=='Director');$('#editSetupBanner').classList.remove('hidden');$('#saveSetupOnly').classList.remove('hidden');$('#createButton span').textContent=`Rebuild ${formatConfig().title.toLowerCase()}`;setView('create');}
function cancelEditSetup(){state.editingProjectId=null;$('#editSetupBanner').classList.add('hidden');$('#saveSetupOnly').classList.add('hidden');$('#createButton span').textContent=formatConfig().createLabel}
function setupInput(){const visualStylePreset=$('#visualStylePreset').value,customVisualStyle=$('#customStyle').value.trim();return {idea:$('#idea').value.trim(),storySource:state.storySource||'idea',inputMethod:state.storyInputMethod||'text',format:state.format,genre:$('#genre').value.trim(),audience:audienceValue(),duration:$('#duration').value,castSize:$('#castSize').value,style:stylePromptFromPreset(visualStylePreset,customVisualStyle),visualStylePreset,customVisualStyle,language:$('#language').value.trim(),languageScope:$('#languageScope').value,culturalTreatment:$('#culturalTreatment').value,languageDirection:$('#languageDirection').value.trim(),continuityStrength:$('#continuityStrength').value,controlMode:state.controlMode,characterDirection:$('#characterDirection')?.value.trim(),voiceDirection:$('#voiceDirection')?.value.trim(),soundDirection:$('#soundDirection')?.value.trim()}}
const manageBtn=$('#studioManageBtn'),manageMenu=$('#studioManageMenu');
function closeStudioManage(){manageMenu?.classList.add('hidden');manageBtn?.setAttribute('aria-expanded','false')}
if(manageBtn&&manageMenu){manageBtn.onclick=e=>{e.stopPropagation();const opening=manageMenu.classList.contains('hidden');manageMenu.classList.toggle('hidden',!opening);manageBtn.setAttribute('aria-expanded',String(opening))};manageMenu.addEventListener('click',()=>closeStudioManage());document.addEventListener('click',e=>{if(!e.target.closest('.studio-manage-wrap'))closeStudioManage()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeStudioManage()})}
$('#narratorVoiceBtn').onclick=()=>openNarratorVoicePicker();
$('#cancelEditSetup').onclick=cancelEditSetup;$('#editStorySetup').onclick=startEditSetup;$('#saveSetupOnly').onclick=()=>{const p=state.projects.find(x=>x.id===state.editingProjectId);if(!p)return;const input=setupInput();if(input.format!==(p.format||'Episode')){toast('Changing the creation type requires Rebuild so the project structure stays consistent.');return}Object.assign(p,input,{updatedAt:new Date().toISOString()});save();renderAll();cancelEditSetup();setView('studio');toast('Project setup updated. Existing episodes were kept.')}

$('#createForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const idea=$('#idea').value.trim(); if(idea.length<8){toast(state.storySource==='full-story'?'Add a little more of your story.':'Add a little more detail to your idea.');return}
  const btn=$('#createButton'), old=btn.innerHTML; btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> Building ${formatConfig().title.toLowerCase()}…`;
  const input=setupInput();
  const editingId=state.editingProjectId;
  if(editingId&&!confirm('Rebuild this story from the edited setup? Existing story structure and generated assets in this project will be replaced. Use “Save settings only” if you want to keep them.')){btn.disabled=false;btn.innerHTML=old;return}
  try{const d=await apiPost('/api/generate-plan',input);const p=d.plan;const existing=editingId?state.projects.find(x=>x.id===editingId):null;p.id=existing?.id||p.id||uid('ct');p.createdAt=existing?.createdAt||p.createdAt;p.activeEpisode=p.activeEpisode||1;p.episodes=p.episodes||[];ensureEpisodeIds(p);p.activeEpisodeId=p.episodes[0]?.id||null;if(editingId){const idx=state.projects.findIndex(x=>x.id===editingId);state.projects[idx]=p;cancelEditSetup()}else state.projects.unshift(p);state.currentId=p.id;save();renderAll();setView('studio');toast(editingId?`${formatConfig(p.format).title} rebuilt from updated setup.`:(d.mode==='ai'?`${formatConfig(p.format).title} created.`:`${formatConfig(p.format).title} created in demo mode. Add API keys when ready for live generation.`))}catch(err){toast(err.message)}finally{btn.disabled=false;btn.innerHTML=old}
});

function renderProjects(){const grid=$('#projectsGrid');if(!state.projects.length){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">✦</div><h2>No projects yet</h2><p>Start with one idea and CineTale will build your first universe.</p><button class="primary" data-empty-create>Create a project</button></div>`;grid.querySelector('[data-empty-create]')?.addEventListener('click',()=>setView('create'));return}
  grid.innerHTML=state.projects.map((p,i)=>`<button class="project-card surface" data-project="${esc(p.id)}"><div class="project-cover" style="filter:hue-rotate(${(i*37)%150}deg)"></div><div class="project-body"><small>${esc(p.format||'Project')} · ${esc(p.genre||'Open')}</small><h3>${esc(p.title||'Untitled')}</h3><p>${esc(p.logline||'')}</p><div class="project-meta"><span>${p.format==='Episode'?`${(p.episodes||[]).length} episode${(p.episodes||[]).length===1?'':'s'}`:`Standalone ${String(p.format||'project').toLowerCase()}`}</span><span>${p.generationMode==='ai'?'AI':'Demo'}</span></div></div></button>`).join('');
  $$('[data-project]').forEach(b=>b.onclick=()=>{state.currentId=b.dataset.project;save();renderAll();setView('studio')});
}

function renderCharacters(){const p=current(),grid=$('#characterGrid');if(!p){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">◎</div><h2>No cast yet</h2><p>Create a project first, then build or edit its recurring characters.</p><button class="primary" data-create-cast>Start a project</button></div>`;grid.querySelector('[data-create-cast]')?.addEventListener('click',()=>setView('create'));return}
  grid.innerHTML=(p.characters||[]).map((c,i)=>`<article class="character-card surface"><div class="character-portrait">${c.image?`<img src="${c.image}" alt="${esc(c.name)}">`:`<div class="initials">${esc((c.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</div>`}<div class="identity-lock">● ${c.locked!==false?'identity locked':'editable identity'}</div></div><h3>${esc(c.name)}</h3><div class="char-role">${esc(c.role||'Character')} · ${esc(c.age||'Age open')}</div><div class="char-tags"><span>${esc(c.languages||'Language open')}</span><span>${esc(c.background||'Background open')}</span><span>${esc(c.visualStyleOverride&&c.visualStyleOverride!=='project'?styleLabel(c.visualStyleOverride):styleLabel(p.visualStylePreset||'cinematic-realistic'))}</span></div><div class="char-desc">${esc(c.appearance||'Appearance open to creator direction.')}</div><div class="voice-assignment"><span class="voice-state-dot ${c.voiceLocked?'locked':'auto'}"></span><div><small>${c.voiceLocked?'Voice locked':'Voice'}</small><b>${esc(c.voiceName||'Auto on first listen')}</b><em>${esc(c.voicePerformance||'Natural')} · ${esc(c.voicePace||'Natural')} pace</em></div></div><div class="button-row"><button class="ghost" data-edit-character="${i}">Edit</button><button class="ghost" data-voice-character="${i}">Voice studio</button><button class="primary small" data-generate-character="${i}">${c.image?'Regenerate':'Generate portrait'}</button></div></article>`).join('');
  $$('[data-edit-character]').forEach(b=>b.onclick=()=>openCharacterEditor(Number(b.dataset.editCharacter)));
  $$('[data-generate-character]').forEach(b=>b.onclick=()=>generateCharacter(Number(b.dataset.generateCharacter),b));
  $$('[data-voice-character]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.voiceCharacter)));
}

function renderEpisodes(){const p=current(),list=$('#episodesList'),pageTitle=$('#episodesPageTitle'),pageCopy=$('#episodesPageCopy'),newBtn=$('#newEpisodeBtn');if(!p){list.innerHTML=`<div class="empty-state surface"><div class="empty-orb">◫</div><h2>No series yet</h2><p>Create an Episode project first.</p></div>`;return}ensureEpisodeIds(p);const episodic=(p.format||'Episode')==='Episode';if(pageTitle)pageTitle.textContent=episodic?'Episodes':`${p.format||'Project'} structure`;if(pageCopy)pageCopy.textContent=episodic?'Continue the same world while preserving canon and unresolved story threads.':`${p.format||'This format'} is standalone, so CineTale does not create Episode 2 automatically.`;if(newBtn)newBtn.classList.toggle('hidden',!episodic);if(!episodic){list.innerHTML=`<div class="empty-state surface"><div class="empty-orb">✓</div><h2>${esc(p.format||'Project')} is standalone</h2><p>Use Studio to edit the setup, cast, scenes, audio and final production. Episode controls only appear for Episode projects.</p><button class="primary" data-return-studio>Back to Studio</button></div>`;list.querySelector('[data-return-studio]')?.addEventListener('click',()=>setView('studio'));return}
  list.innerHTML=(p.episodes||[]).map((e,i)=>`<article class="episode-row surface"><div class="episode-number">${String(e.number||i+1).padStart(2,'0')}</div><div class="episode-copy"><h3>${esc(e.title)}</h3><p>${esc(e.synopsis||'')}</p></div><div class="episode-actions"><button class="ghost" data-open-episode-id="${esc(e.id)}">Open in Studio</button><button class="ghost" data-rename-episode-id="${esc(e.id)}">Rename</button><button class="ghost" data-duplicate-episode-id="${esc(e.id)}">Duplicate draft</button><button class="ghost danger" data-delete-episode-id="${esc(e.id)}">Delete</button></div></article>`).join('');
  $$('[data-open-episode-id]').forEach(b=>b.onclick=()=>{updateProject(x=>{ensureEpisodeIds(x);x.activeEpisodeId=b.dataset.openEpisodeId;const e=x.episodes.find(v=>v.id===x.activeEpisodeId);x.activeEpisode=e?.number||x.activeEpisode});setView('studio')});
  $$('[data-rename-episode-id]').forEach(b=>b.onclick=()=>renameEpisode(b.dataset.renameEpisodeId));$$('[data-duplicate-episode-id]').forEach(b=>b.onclick=()=>duplicateEpisodeDraft(b.dataset.duplicateEpisodeId));$$('[data-delete-episode-id]').forEach(b=>b.onclick=()=>deleteEpisode(b.dataset.deleteEpisodeId));
}
function assetStats(p){const ep=episodeOf(p);const chars=(p?.characters||[]).filter(c=>c.image).length, scenes=(ep?.scenes||[]).filter(s=>s.image).length;return {chars,scenes,total:chars+scenes,charDone:chars>0&&chars===(p.characters||[]).length,sceneDone:scenes>0&&scenes===(ep?.scenes||[]).length}}
function renderWorkflow(p){const cfg=formatConfig(p?.format||'Episode'),a=assetStats(p),steps=$$('#workflow .workflow-step');steps.forEach(x=>x.classList.remove('done','active'));steps[0]?.classList.add('done');cfg.journey.forEach((label,i)=>{const t=$(`#wf${i+1}Title`),sub=$(`#wf${i+1}Sub`);if(t)t.textContent=label;if(sub)sub.textContent=cfg.journeySubs[i]||''});let next={title:'Review your cast',text:'Generate or review the recurring characters needed for this production.',label:'Review cast',view:'characters'};if(a.charDone){steps[1]?.classList.add('done');next={title:cfg.title==='Movie'?'Build acts & scenes':'Build the storyboard',text:cfg.title==='Movie'?'Visualize the key scenes across the movie structure.':'Turn each scene into a visual frame while identity references are ready.',label:'Create storyboard',action:'storyboard'}}else steps[1]?.classList.add('active');if(a.sceneDone){steps[2]?.classList.add('done');next={title:'Preview audio',text:`Listen through the ${cfg.finalName} before spending on video generation.`,label:'Preview audio',action:'narrate'}}else if(a.charDone)steps[2]?.classList.add('active');if(p.narrationPlayed){steps[3]?.classList.add('done');next={title:'Generate video',text:'Your story, cast and audio preview are ready for scene rendering.',label:'Generate video',action:'video'}}else if(a.sceneDone)steps[3]?.classList.add('active');if(p.videoStatus==='ready'){steps[4]?.classList.add('done');next={title:`Finish your ${cfg.finalName}`,text:`Review generated assets and prepare the final ${cfg.finalName} assembly.`,label:'Review assets',view:'library'}}else if(p.narrationPlayed)steps[4]?.classList.add('active');if(p.renderStatus==='ready'){steps[5]?.classList.add('done');next={title:`${cfg.title} complete`,text:`Your ${cfg.finalName} is assembled and ready to share.`,label:'View library',view:'library'}}const card=$('#nextStepCard');if(card){$('#nextStepTitle').textContent=next.title;$('#nextStepText').textContent=next.text;const b=$('#nextStepAction');b.textContent=next.label;b.dataset.nextView=next.view||'';b.dataset.nextAction=next.action||''}}
function normalizedTier(value){const t=String(value||'standard').toLowerCase();if(t==='fast'||t==='draft'||t==='preview')return 'draft';if(t==='premium'||t==='cinematic'||t==='high')return 'premium';return 'standard'}
function tierLabel(value){return {draft:'Draft preview',standard:'Standard',premium:'Premium / Cinematic'}[normalizedTier(value)]}
function tierHint(value){return {draft:'Faster/cheaper when a draft route is configured.',standard:'Balanced default production quality.',premium:'Highest-fidelity route when a premium model is configured.'}[normalizedTier(value)]}
function setSceneTier(index,value){const p=current(),ep=episodeOf(p);if(!ep?.scenes?.[index])return;updateProject(x=>{const e=episodeOf(x);if(e?.scenes?.[index])e.scenes[index].tier=normalizedTier(value)});toast(`Scene quality set to ${tierLabel(value)}.`)}

function renderStudio(){const p=current();if(!p){$('#studioEmpty').classList.remove('hidden');$('#studioContent').classList.add('hidden');return}$('#studioEmpty').classList.add('hidden');$('#studioContent').classList.remove('hidden');const ep=episodeOf(p),scenes=ep?.scenes||[],stats=assetStats(p),cfg=formatConfig(p.format||'Episode'),episodic=(p.format||'Episode')==='Episode';$('#studioTitle').textContent=p.title||'Untitled';$('#studioCrumbTitle').textContent=p.title||'Current project';$('#studioLogline').textContent=p.logline||'';if($('#studioFormatChip'))$('#studioFormatChip').textContent=cfg.title;if($('#studioAudienceChip'))$('#studioAudienceChip').textContent=p.audience||'Audience open';if($('#studioStyleChip'))$('#studioStyleChip').textContent=styleLabel(p.visualStylePreset||'cinematic-realistic');if($('#studioLanguageChip'))$('#studioLanguageChip').textContent=p.language||'Language open';$('#unitLabel').textContent=cfg.unitLabel;$('#episodeNumber').textContent=episodic?String(ep?.number||1).padStart(2,'0'):'';$('#episodeNumber').classList.toggle('hidden',!episodic);$('#episodeTitle').textContent=ep?.title||'Episode';$('#episodeSynopsis').textContent=ep?.synopsis||'';$('#episodeRuntime').textContent=`~${formatTime(scenes.reduce((a,s)=>a+(Number(s.durationSec)||0),0))}`;$('#runtimeLabel').textContent=cfg.runtimeLabel;$('#assetCount').textContent=`${stats.total} asset${stats.total===1?'':'s'}`;const episodesBtn=$('#studioEpisodesBtn'),nextBtn=$('#continueEpisode'),unitsBlock=$('#studioUnitsBlock');if(episodesBtn)episodesBtn.classList.toggle('hidden',!episodic);if(nextBtn)nextBtn.classList.toggle('hidden',!episodic);if(unitsBlock)unitsBlock.classList.toggle('hidden',!episodic);if($('#studioMemoryTitle'))$('#studioMemoryTitle').textContent=cfg.memoryTitle;if($('#sceneProductionTitle'))$('#sceneProductionTitle').textContent=cfg.sceneTitle;
  ensureEpisodeIds(p);$('#studioEpisodes').innerHTML=episodic?(p.episodes||[]).map(e=>`<div class="studio-episode-row"><button class="episode-chip ${e.id===ep?.id?'active':''}" data-studio-episode-id="${esc(e.id)}">${String(e.number).padStart(2,'0')} · ${esc(e.title)}</button>${(p.episodes||[]).length>1?`<button class="episode-mini-delete" data-studio-delete-id="${esc(e.id)}" aria-label="Delete ${esc(e.title)}">×</button>`:''}</div>`).join(''):'';$$('[data-studio-episode-id]').forEach(b=>b.onclick=()=>updateProject(x=>{ensureEpisodeIds(x);x.activeEpisodeId=b.dataset.studioEpisodeId;const e=x.episodes.find(v=>v.id===x.activeEpisodeId);x.activeEpisode=e?.number||x.activeEpisode}));$$('[data-studio-delete-id]').forEach(b=>b.onclick=()=>deleteEpisode(b.dataset.studioDeleteId));
  $('#canonList').innerHTML=(p.worldBible?.canon||[]).map(x=>`<div class="canon-chip">${esc(x)}</div>`).join('')||`<div class="canon-chip">${episodic?'Canon will build as the series grows.':'Project continuity notes will appear here.'}</div>`;
  $('#sceneList').innerHTML=scenes.map((s,i)=>`<article class="scene-card surface"><div class="scene-visual">${s.videoUrl?`<video src="${esc(s.videoUrl)}" controls playsinline preload="metadata"></video>`:s.image?`<img src="${s.image}" alt="${esc(s.title)}">`:`<div class="scene-placeholder"><b>${String(s.number||i+1).padStart(2,'0')}</b><span>Storyboard pending</span></div>`}<div class="asset-tag">${s.videoUrl?'Video ready':s.videoOperation?'Video processing':s.image?(s.imageMode==='ai'?'Generated art':'Preview art'):'Not generated'}</div></div><div class="scene-copy"><div class="scene-kicker">${p.format==='Movie'&&s.act?`${esc(s.act)} · `:''}SCENE ${String(s.number||i+1).padStart(2,'0')} · ${Number(s.durationSec)||0}s</div><h3>${esc(s.title)}</h3><p>${esc(s.visual||s.purpose||'')}</p><div class="dialogue scene-dialogue-box"><span>${esc(dialogueList(s.dialogue)[0]||dialogueText(s.narration)||'')}</span><button class="dialogue-edit-btn" data-scene-edit="${i}" type="button">Edit performance</button></div><button class="scene-voice-chip" data-scene-voice="${i}" type="button"><span class="scene-voice-icon">🎙</span><span class="scene-voice-copy"><small>Character voice</small><b>${esc(sceneVoiceSummary(p,s))}</b></span><span class="scene-voice-edit">Edit</span></button><div class="scene-meta"><span>🎵 ${esc(s.music||'Open music direction')}</span><span>🔊 ${esc(s.sfx||'Open SFX direction')}</span><span>🎥 ${esc(s.camera||'Open camera direction')}</span></div></div><div class="scene-actions"><div class="scene-action-buttons"><button class="primary small" data-scene-art="${i}">${s.image?'Regenerate art':'Generate art'}</button><button class="ghost" data-scene-listen="${i}">▶ Listen</button><button class="ghost" data-scene-video="${i}">${s.videoUrl?'Regenerate video':s.videoOperation?'Check video':'Generate video'}</button></div><label class="scene-quality-control" title="${esc(tierHint(s.tier))}"><span>Quality</span><select data-scene-tier="${i}"><option value="draft" ${normalizedTier(s.tier)==='draft'?'selected':''}>Draft preview</option><option value="standard" ${normalizedTier(s.tier)==='standard'?'selected':''}>Standard</option><option value="premium" ${normalizedTier(s.tier)==='premium'?'selected':''}>Premium / Cinematic</option></select></label></div></article>`).join('');
  $$('[data-scene-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneArt),b));$$('[data-scene-listen]').forEach(b=>b.onclick=()=>listenScene(Number(b.dataset.sceneListen),b));$$('[data-scene-edit]').forEach(b=>b.onclick=()=>openSceneAudioEditor(Number(b.dataset.sceneEdit)));$$('[data-scene-voice]').forEach(b=>b.onclick=()=>{const p=current(),s=episodeOf(p)?.scenes?.[Number(b.dataset.sceneVoice)],idx=sceneVoiceCharacterIndex(p,s);if(idx>=0)openVoicePicker(idx);else openNarratorVoicePicker()});$$('[data-scene-video]').forEach(b=>b.onclick=()=>requestVideo(Number(b.dataset.sceneVideo),b));$$('[data-scene-tier]').forEach(sel=>sel.onchange=()=>setSceneTier(Number(sel.dataset.sceneTier),sel.value));renderWorkflow(p)
}

function renderLibrary(){const grid=$('#libraryGrid'),all=[];for(const p of state.projects){for(const c of p.characters||[])if(c.image)all.push({kind:'Character',name:c.name,image:c.image});for(const e of p.episodes||[])for(const s of e.scenes||[])if(s.image)all.push({kind:'Storyboard',name:`${p.title} · ${s.title}`,image:s.image})}if(!all.length){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">▣</div><h2>No generated assets yet</h2><p>Create character portraits or storyboard frames and they will appear here.</p></div>`;return}grid.innerHTML=all.map((a,i)=>`<button class="asset-card surface" data-asset="${i}"><div class="asset-thumb"><img src="${a.image}" alt="${esc(a.name)}"></div><div class="asset-info"><small>${a.kind}</small><b>${esc(a.name)}</b></div></button>`).join('');$$('[data-asset]').forEach(b=>b.onclick=()=>openImage(all[Number(b.dataset.asset)]))}
function renderAll(){renderUsage();renderProjects();renderCharacters();renderEpisodes();renderStudio();renderLibrary()}

function characterPrompt(p,c){return `Original character reference portrait for an entertainment project. Cultural treatment: ${culturalPrompt(p)}. Sacred/cultural identity guidance: ${sacredFigureGuidance(p,c)} Character: ${c.name}. Role: ${c.role}. Age/presentation: ${c.age||'creator-defined'}. Appearance: ${c.appearance||'creator-defined'}. Background/culture/origin: ${c.background||'creator-defined'}. Personality: ${c.personality||''}. Wardrobe: ${c.wardrobe||''}. Visual style: ${characterStyle(p,c)}. ${c.locked!==false?continuityPrompt(p):'Character identity may be reinterpreted because Identity Lock is off.'} If a reference portrait is supplied, treat it as the canonical identity source and change rendering style rather than identity. CLEAN PORTRAIT ONLY: no written words, no captions, no arrows, no callout labels, no infographic annotations, no logos, no celebrity resemblance.`}
function portraitReferenceEntries(p,s){const chars=(p?.characters||[]).filter(c=>c.locked!==false&&typeof c.image==='string'&&c.image.startsWith('data:image/'));if(!s)return chars.slice(0,4).map(c=>({name:c.name,image:c.image}));const sceneText=[s.title,s.visual,s.purpose,dialogueText(s.narration),...dialogueList(s.dialogue)].join(' ').toLowerCase();const mentioned=chars.filter(c=>sceneText.includes(String(c.name||'').toLowerCase()));const ordered=mentioned.length?[...mentioned,...chars.filter(c=>!mentioned.includes(c))]:chars;return ordered.slice(0,4).map(c=>({name:c.name,image:c.image}))}
function scenePrompt(p,ep,s,refs=[]){const cast=(p.characters||[]).map(c=>`${c.name}: ${c.appearance||''}; wardrobe: ${c.wardrobe||'continuity wardrobe'}; identity context: ${sacredFigureGuidance(p,c)}${c.visualStyleOverride&&c.visualStyleOverride!=='project'?`; style override ${characterStyle(p,c)}`:''}`).join(' | ');const refManifest=refs.length?` Reference portraits are supplied in this exact order: ${refs.map((r,i)=>`${i+1}) ${r.name}`).join('; ')}. Each reference image belongs to that named character only; never swap identities between characters.`:'';return `Original storyboard frame. Project: ${p.title}. Format: ${p.format||'Episode'}. Production unit: ${ep.title}. Scene: ${s.title}. Visual action: ${s.visual}. Story purpose: ${s.purpose}. Generation quality: ${tierLabel(s.tier)}. ${tierHint(s.tier)} Cast continuity: ${cast}. Project visual style: ${projectStyle(p)}. Cultural treatment: ${culturalPrompt(p)}. ${continuityPrompt(p)}${refManifest} Preserve cultural and geographic details requested by the creator without stereotyping. 16:9 composition. No captions, no written labels, no callout arrows, no infographic annotations, no logos.`}
async function generateCharacter(i,button){const p=current(),c=p?.characters?.[i];if(!c)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generating…'}try{const sacred=isSacredCharacter(p,c);const canReuseReference=c.image&&c.locked!==false&&(!sacred||c.sacredReferenceReady===true);const referenceImages=canReuseReference?[c.image]:[];const d=await apiPost('/api/generate-image',{prompt:characterPrompt(p,c),label:c.name,aspect:'1:1',quality:'standard',referenceImages});if(d.mode==='ai')bumpUsage('visual');updateProject(x=>{x.characters[i].image=d.image;x.characters[i].imageMode=d.mode;if(sacred&&d.mode==='ai')x.characters[i].sacredReferenceReady=true});toast(d.mode==='ai'?(sacred&&!canReuseReference&&c.image?'Sacred portrait refreshed from story context.':'Portrait generated.'):(d.warning||'Preview portrait shown because live visual generation is unavailable.'))}catch(e){toast(e.message)}finally{if(button){button.disabled=false;button.textContent=old||'Generate portrait'}}}
async function generateAllCharacters(button){const p=current();if(!p)return;const old=button?.textContent;if(button)button.disabled=true;for(let i=0;i<(p.characters||[]).length;i++){if(button)button.textContent=`Generating ${i+1}/${p.characters.length}`;await generateCharacter(i,null)}if(button){button.disabled=false;button.textContent=old}toast('Character artwork complete.')}
async function generateScene(i,button){const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Generating…'}try{const refs=portraitReferenceEntries(p,s);const d=await apiPost('/api/generate-image',{prompt:scenePrompt(p,ep,s,refs),label:s.title,aspect:'16:9',quality:normalizedTier(s.tier),referenceImages:refs.map(r=>r.image)});if(d.mode==='ai')bumpUsage('visual');updateProject(x=>{const e=episodeOf(x);e.scenes[i].image=d.image;e.scenes[i].imageMode=d.mode});toast(d.mode==='ai'?'Storyboard generated.':(d.warning||'Preview storyboard shown because live visual generation is unavailable.'))}catch(e){toast(e.message)}finally{if(button){button.disabled=false;button.textContent=old||'Generate art'}}}
async function generateAllScenes(button){const p=current(),ep=episodeOf(p);if(!ep)return;const old=button?.textContent;if(button)button.disabled=true;for(let i=0;i<(ep.scenes||[]).length;i++){if(button)button.textContent=`Scene ${i+1}/${ep.scenes.length}`;await generateScene(i,null)}if(button){button.disabled=false;button.textContent=old}toast('Storyboard complete.')}

function playAudioUrl(url){return new Promise((resolve,reject)=>{if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}const a=new Audio(url);activeAudio=a;a.onended=()=>{if(activeAudio===a)activeAudio=null;resolve()};a.onerror=()=>{if(activeAudio===a)activeAudio=null;reject(new Error('Audio playback failed.'))};a.play().catch(reject)})}
async function speakText(text,voiceId,options={}){
  const spoken=String(text||'').trim();if(!spoken)return;
  try{
    const d=await apiPost('/api/tts',{text:spoken,voiceId,kind:options.kind||'dialogue',direction:options.direction||'',language:options.language||current()?.language||'English',speakerProfile:options.speakerProfile||''});
    if(d.mode==='ai'&&d.audio){bumpUsage('audio');await playAudioUrl(d.audio);return d}
    if(d.mode==='browser'&&'speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(spoken);u.rate=options.kind==='narration'?.94:.98;speechSynthesis.speak(u);return d}
    throw new Error('Natural voice generation is not configured for this project.');
  }catch(e){toast(e.message||'Natural voice preview could not start.');throw e}
}
function characterIndexForSpeaker(p,speaker=''){
  const key=normalizeName(speaker);if(!key)return -1;let i=(p.characters||[]).findIndex(c=>normalizeName(c.name)===key);if(i>=0)return i;
  i=(p.characters||[]).findIndex(c=>normalizeName(c.name).includes(key)||key.includes(normalizeName(c.name)));return i;
}
async function scenePlaybackItems(p,s){
  const items=[];const direction=sceneAudioDirection(s);
  const narration=dialogueText(s.narration).trim();
  if(narration){const nv=await ensureNarratorVoice(p);items.push({text:narration,voiceId:nv?.voiceId,kind:'narration',direction:narratorVoiceDirection(p,s),speakerProfile:['project narrator',p.narratorVoiceName,p.narratorPerformance,p.narratorPace].filter(Boolean).join('. ')})}
  for(const line of dialogueList(s.dialogue)){
    const {speaker,text}=dialogueParts(line);if(!text)continue;const idx=characterIndexForSpeaker(p,speaker);const c=idx>=0?p.characters[idx]:null;const assigned=idx>=0?await ensureCharacterVoice(p,idx):null;
    const characterDirection=c?characterVoiceDirection(c):'';items.push({text,voiceId:assigned?.voiceId,kind:'dialogue',direction:[direction,characterDirection].filter(Boolean).join('. '),speakerProfile:c?[c.name,c.age,c.personality,c.voice,c.voicePerformance,c.voicePace].filter(Boolean).join('. '):speaker});
  }
  return items;
}
async function playSceneAudio(p,s){
  const items=await scenePlaybackItems(p,s);if(!items.length)return false;
  const narration=items.filter(x=>x.kind==='narration'),dialogue=items.filter(x=>x.kind==='dialogue');
  for(const item of narration)await speakText(item.text,item.voiceId,{...item,language:p.language});
  if(dialogue.length>=2&&dialogue.every(x=>x.voiceId&&!String(x.voiceId).startsWith('browser-'))){
    try{const d=await apiPost('/api/dialogue',{language:p.language,turns:dialogue.map(x=>({text:x.text,voiceId:x.voiceId,direction:x.direction}))});if(d.mode==='ai'&&d.audio){bumpUsage('audio');await playAudioUrl(d.audio);return true}}catch(e){console.warn('[CineTale audio] Natural dialogue endpoint unavailable; falling back to expressive per-line TTS',{message:e?.message||String(e)})}
  }
  for(const item of dialogue)await speakText(item.text,item.voiceId,{...item,language:p.language});
  return true;
}
async function listenScene(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Playing…'}
  try{if(!await playSceneAudio(p,s)){toast('This scene has no spoken audio yet.');return}updateProject(x=>x.narrationPlayed=true)}catch{}finally{if(button){button.disabled=false;button.textContent=old||'▶ Listen'}}
}
async function narrateEpisode(){
  const p=current(),ep=episodeOf(p);if(!ep)return;
  try{for(const s of (ep.scenes||[]))await playSceneAudio(p,s);updateProject(x=>x.narrationPlayed=true);toast(`${formatConfig(p.format||'Episode').title} audio preview complete.`)}catch{}
}
function openSceneAudioEditor(index){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[index];if(!s)return;
  const lines=dialogueList(s.dialogue).join('\n');
  const speakerIndexes=[...new Set(dialogueList(s.dialogue).map(line=>characterIndexForSpeaker(p,dialogueParts(line).speaker)).filter(idx=>idx>=0))];
  const speakerButtons=speakerIndexes.map(idx=>`<button type="button" class="scene-speaker-voice" data-edit-scene-speaker="${idx}">Voice · ${esc(p.characters[idx].name)}</button>`).join('');
  const audioVoiceButtons=`<div class="scene-speaker-voices"><button type="button" class="scene-speaker-voice narrator" id="sceneNarratorVoice">Narrator voice</button>${speakerButtons}</div>`;
  $('#modalBody').innerHTML=`<form class="modal-form" id="sceneAudioForm"><h2>Edit performance</h2><p>Adjust the words, who speaks them, and how the moment should feel. Voice identity stays consistent unless you deliberately change it in Voice Studio.</p>${audioVoiceButtons}<label class="field"><span>Narration</span><textarea id="sceneNarration" placeholder="Optional narration">${esc(dialogueText(s.narration)||'')}</textarea></label><label class="field"><span>Dialogue · one speaker line per row</span><textarea id="sceneDialogue" rows="6" placeholder="Zoya: What is this?">${esc(lines)}</textarea></label><label class="field"><span>Scene performance direction</span><input id="sceneAudioDirection" value="${esc(s.audioDirection||sceneAudioDirection(s))}" placeholder="Quiet, uneasy curiosity; intimate, conversational"></label><label class="field"><span>Narrator style</span><input id="sceneNarrationStyle" value="${esc(s.narrationStyle||'warm, restrained storyteller; natural pacing')}" placeholder="Warm, restrained storyteller"></label><div class="modal-actions"><button type="button" class="ghost" id="sceneAudioCancel">Cancel</button><button type="button" class="ghost" id="sceneAudioPreview">Preview</button><button class="primary" type="submit">Save performance</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#sceneAudioCancel').onclick=closeModal;$('#sceneNarratorVoice').onclick=()=>openNarratorVoicePicker();$$('[data-edit-scene-speaker]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.editSceneSpeaker)));
  $('#sceneAudioForm').onsubmit=e=>{e.preventDefault();const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);updateProject(x=>{const target=episodeOf(x)?.scenes?.[index];if(!target)return;target.narration=$('#sceneNarration').value.trim();target.dialogue=dialogue;target.audioDirection=$('#sceneAudioDirection').value.trim();target.narrationStyle=$('#sceneNarrationStyle').value.trim()});closeModal();toast('Scene dialogue and delivery saved.')};
  $('#sceneAudioPreview').onclick=async()=>{const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const temp={...s,narration:$('#sceneNarration').value.trim(),dialogue,audioDirection:$('#sceneAudioDirection').value.trim(),narrationStyle:$('#sceneNarrationStyle').value.trim()};try{for(const item of await scenePlaybackItems(p,temp))await speakText(item.text,item.voiceId,{...item,language:p.language})}catch{}};
}
async function pollVideo(i,operation,button){
  for(let attempt=0;attempt<45;attempt++){
    if(button)button.textContent=`Rendering… ${attempt+1}`;
    await new Promise(r=>setTimeout(r,8000));
    const r=await fetch(`/api/video-status?operation=${encodeURIComponent(operation)}`);
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Video status failed');
    if(d.status==='ready'){
      updateProject(x=>{const e=episodeOf(x);e.scenes[i].videoUrl=d.videoUrl;e.scenes[i].videoOperation=null;x.videoStatus='ready'});
      toast('Scene video is ready.');return;
    }
    if(d.status==='error')throw new Error(d.error||'Video generation failed');
  }
  toast('Video is still processing. Use Check video again in a moment.');
}
async function requestVideo(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s)return;
  const old=button.textContent;button.disabled=true;
  try{
    if(s.videoOperation && !s.videoUrl){await pollVideo(i,s.videoOperation,button);return}
    button.textContent='Starting video…';
    const d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,project:{title:p.title,style:p.style,characters:p.characters,worldBible:p.worldBible},scene:s});
    if(d.status==='not_configured'){toast('Live video is off. Add the video API key and enable the spending guard in Vercel.');return}
    if(d.operation){bumpUsage('video');updateProject(x=>{const e=episodeOf(x);e.scenes[i].videoOperation=d.operation});await pollVideo(i,d.operation,button);return}
    if(d.videoUrl){bumpUsage('video');updateProject(x=>{const e=episodeOf(x);e.scenes[i].videoUrl=d.videoUrl;x.videoStatus='ready'});toast('Scene video is ready.');return}
    toast('Video job submitted.');
  }catch(e){toast(e.message||'Video generation failed')}finally{button.disabled=false;button.textContent=old}
}

function episodeLockKey(projectId){return `cinetale.episode.lock.${projectId}`}
function acquireEpisodeLock(projectId){const key=episodeLockKey(projectId),now=Date.now();try{const old=safeParse(localStorage.getItem(key),null);if(old&&now-Number(old.ts||0)<120000)return null;const token=uid('lock');localStorage.setItem(key,JSON.stringify({token,ts:now}));return token}catch{return uid('lock')}}
function releaseEpisodeLock(projectId,token){try{const key=episodeLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(!old||old.token===token)localStorage.removeItem(key)}catch{}}
function setEpisodeCreateButtons(busy,label='Create next episode'){for(const b of [$('#newEpisodeBtn'),$('#continueEpisode')].filter(Boolean)){b.disabled=busy;b.textContent=busy?'Creating next episode…':(b.id==='newEpisodeBtn'?'+ Create next episode':'Create next episode')}}
async function createNextEpisode(){const p=current();if(!p){toast('Create a project first.');return}if((p.format||'Episode')!=='Episode'){toast(`${p.format||'This project'} is standalone. Only Episode projects create a next episode.`);return}if(state.episodeCreating){toast('The next episode is already being created.');return}const lock=acquireEpisodeLock(p.id);if(!lock){toast('The next episode is already being created in this browser.');return}state.episodeCreating=true;setEpisodeCreateButtons(true);const requestId=uid('next');try{const snapshot=structuredClone(p);const d=await apiPost('/api/generate-next',{project:snapshot,requestId});updateProject(x=>{ensureEpisodeIds(x);const ep=d.episode;ep.id=ep.id||`ep_${requestId}`;if(x.episodes.some(e=>e.id===ep.id))return;x.episodes.push(ep);x.activeEpisode=ep.number;x.activeEpisodeId=ep.id;x.worldBible=x.worldBible||{};x.worldBible.canon=x.worldBible.canon||[];x.worldBible.canon.push(`Episode ${ep.number}: ${ep.synopsis}`)});toast(`Episode ${d.episode.number} created.`)}catch(e){toast(e.message||'Could not create the next episode.')}finally{state.episodeCreating=false;releaseEpisodeLock(p.id,lock);setEpisodeCreateButtons(false)}}
function renameEpisode(id){const p=current();if(!p)return;ensureEpisodeIds(p);const ep=p.episodes.find(e=>e.id===id);if(!ep)return;const name=prompt('Rename episode',ep.title||`Episode ${ep.number}`);if(name==null)return;const title=name.trim();if(!title){toast('Episode title cannot be blank.');return}updateProject(x=>{ensureEpisodeIds(x);const target=x.episodes.find(e=>e.id===id);if(target)target.title=title});toast('Episode renamed.')}
function duplicateEpisodeDraft(id){const p=current();if(!p)return;ensureEpisodeIds(p);const source=p.episodes.find(e=>e.id===id);if(!source)return;const n=Math.max(0,...p.episodes.map(e=>Number(e.number)||0))+1;const copy=structuredClone(source);copy.id=uid('ep');copy.number=n;copy.title=`${source.title||`Episode ${source.number}`} — Draft copy`;copy.scenes=(copy.scenes||[]).map((s,i)=>({...s,id:uid('scene'),number:i+1,image:null,imageMode:null,videoUrl:null,videoOperation:null}));updateProject(x=>{ensureEpisodeIds(x);x.episodes.push(copy);x.activeEpisodeId=copy.id;x.activeEpisode=copy.number});toast(`Draft copy created as Episode ${n}.`)}
function deleteEpisode(id){const p=current();if(!p)return;ensureEpisodeIds(p);const ep=p.episodes.find(e=>e.id===id);if(!ep)return;if(p.episodes.length<=1){toast('Keep at least one episode in the project.');return}if(!confirm(`Delete Episode ${ep.number}: ${ep.title}? This removes its saved scene assets from this browser.`))return;updateProject(x=>{ensureEpisodeIds(x);x.episodes=x.episodes.filter(e=>e.id!==id);if(x.activeEpisodeId===id){const next=x.episodes.at(-1);x.activeEpisodeId=next?.id||null;x.activeEpisode=next?.number||1}x.worldBible=x.worldBible||{};x.worldBible.canon=(x.worldBible.canon||[]).filter(c=>!String(c).startsWith(`Episode ${ep.number}: ${ep.synopsis}`))});toast('Episode deleted.')}
$('#newEpisodeBtn').onclick=()=>createNextEpisode();$('#continueEpisode').onclick=()=>createNextEpisode();
async function generateNextMissingVideo(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const i=(ep.scenes||[]).findIndex(s=>!s.videoUrl);if(i<0){toast(`All scene videos in this ${formatConfig(p.format||'Episode').finalName} are ready.`);return}const sceneButton=document.querySelector(`[data-scene-video="${i}"]`);if(sceneButton)await requestVideo(i,sceneButton);else toast('Open the scene and generate its video.')}
$('#nextStepAction').onclick=e=>{const b=e.currentTarget;if(b.dataset.nextView){setView(b.dataset.nextView);return}if(b.dataset.nextAction==='storyboard'){generateAllScenes(b);return}if(b.dataset.nextAction==='narrate'){narrateEpisode();return}if(b.dataset.nextAction==='video'){generateNextMissingVideo();return}};
$('#generateAllPortraits').onclick=e=>generateAllCharacters(e.currentTarget);


async function openNarratorVoicePicker(){
  const p=current();if(!p){toast('Create a project first.');return}
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Narrator Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];const perf=p.narratorPerformance||'Warm',pace=p.narratorPace||'Natural';
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio narrator-studio"><div class="voice-studio-head"><div><small>NARRATOR VOICE</small><h2>${esc(p.title||'Project narrator')}</h2><p>Choose one narrator for the whole project, then shape performance without changing that voice identity.</p></div><div class="voice-lock-state ${p.narratorVoiceLocked?'locked':'auto'}">${p.narratorVoiceLocked?'● Narrator locked':'◇ Auto narrator'}</div></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="narratorPerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="narratorPace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Custom narration direction · optional</span><input id="narratorCustomDirection" value="${esc(p.narratorCustomDirection||'')}" placeholder="e.g. intimate, warm, restrained, never trailer-like"></label><label class="field"><span>Preview line</span><input id="narratorPreviewLine" value="${esc(p.narratorPreviewLine||'Some stories begin with a door. This one begins with a sound behind it.')}" /></label><div class="voice-current narrator-current"><span>Current narrator</span><b>${esc(p.narratorVoiceName||d.narratorVoiceName||'Auto — CineTale chooses on first listen')}</b><small>${p.narratorVoiceLocked?'This narrator stays fixed across the entire project.':'Auto can choose a suitable project narrator on first listen.'}</small></div><div class="voice-list">${voices.map((v,vi)=>`<div class="voice-option-row ${p.narratorVoiceId===v.voice_id?'selected':''}"><div class="voice-option-main"><span class="voice-orb narrator-orb">${esc((v.name||'N').trim().slice(0,1).toUpperCase())}</span><div class="voice-option-copy"><div class="voice-option-title"><b>${esc(v.name)}</b>${(v.voice_id===d.narratorVoiceId||vi===0)&&!p.narratorVoiceLocked?'<span class="voice-recommended">Suggested</span>':''}${p.narratorVoiceId===v.voice_id?'<span class="voice-selected-badge">Selected</span>':''}</div><small>${esc(v.category||'Voice')} · Preview as narrator</small></div></div><div class="voice-option-actions"><button type="button" class="ghost tiny narrator-preview-btn" data-preview-narrator="${esc(v.voice_id)}">▶ Preview</button><button type="button" class="ghost tiny narrator-lock-btn" data-use-narrator="${esc(v.voice_id)}" data-narrator-name="${esc(v.name)}">Use & lock</button></div></div>`).join('')}</div><div class="modal-actions split"><button type="button" class="ghost" id="narratorAuto">Reset to Auto</button><div><button type="button" class="ghost" id="narratorCancel">Close</button><button type="button" class="primary" id="narratorSaveSettings">Save narrator settings</button></div></div></div>`;
    const previewOptions=()=>({kind:'narration',direction:[VOICE_PERFORMANCE[$('#narratorPerformance').value]||VOICE_PERFORMANCE.Warm,VOICE_PACE[$('#narratorPace').value]||VOICE_PACE.Natural,$('#narratorCustomDirection').value.trim(),'restrained storyteller; avoid trailer voice'].filter(Boolean).join('. '),language:p.language,speakerProfile:'project narrator'});
    $('#narratorCancel').onclick=closeModal;
    $('#narratorSaveSettings').onclick=()=>{updateProject(x=>{x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator performance settings saved.')};
    $('#narratorAuto').onclick=()=>{updateProject(x=>{x.narratorVoiceId='';x.narratorVoiceName='';x.narratorVoiceLocked=false;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator reset to Auto.')};
    $$('[data-preview-narrator]').forEach(b=>b.onclick=async()=>{const old=b.textContent;b.disabled=true;b.textContent='Playing…';try{await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',b.dataset.previewNarrator,previewOptions())}catch{}finally{b.disabled=false;b.textContent=old}});
    $$('[data-use-narrator]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useNarrator,name=b.dataset.narratorName;updateProject(x=>{x.narratorVoiceId=id;x.narratorVoiceName=name;x.narratorVoiceLocked=true;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});try{await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',id,previewOptions())}catch{}closeModal();toast(`${name} locked as project narrator.`)});
  }catch(e){toast('Narrator voice catalog could not be loaded.');}
}

async function openVoicePicker(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];
    const perf=c.voicePerformance||'Natural',pace=c.voicePace||'Natural';
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio"><div class="voice-studio-head"><div><small>CHARACTER VOICE</small><h2>${esc(c.name)}</h2><p>CineTale can choose automatically, or you can preview and lock a voice. Performance settings shape delivery without changing the character's voice identity.</p></div><div class="voice-lock-state ${c.voiceLocked?'locked':'auto'}">${c.voiceLocked?'● Voice locked':'◇ Auto voice'}</div></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="voicePerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="voicePace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Custom delivery direction · optional</span><input id="voiceCustomDirection" value="${esc(c.voiceCustomDirection||'')}" placeholder="e.g. slightly breathless, understated, dry humor"></label><label class="field"><span>Preview line</span><input id="voicePreviewLine" value="${esc(c.voicePreviewLine||`Hi... I'm ${c.name}.`)}"></label><div class="voice-current"><span>Current voice</span><b>${esc(c.voiceName||'Auto — CineTale chooses on first listen')}</b><small>${c.voiceLocked?'This voice stays fixed across scenes and future episodes.':'CineTale has not been explicitly locked to a creator-approved voice.'}</small></div><div class="voice-list">${voices.map((v,vi)=>`<div class="voice-option-row ${c.voiceId===v.voice_id?'selected':''}"><div class="voice-option-main"><span class="voice-orb">${esc((v.name||'V').trim().slice(0,1).toUpperCase())}</span><div class="voice-option-copy"><div class="voice-option-title"><b>${esc(v.name)}</b>${vi===0&&!c.voiceLocked?'<span class="voice-recommended">Suggested</span>':''}${c.voiceId===v.voice_id?'<span class="voice-selected-badge">Selected</span>':''}</div><small>${esc(v.category||'Voice')} · Preview before locking</small></div></div><div class="voice-option-actions"><button type="button" class="ghost tiny voice-preview-btn" data-preview-voice="${esc(v.voice_id)}">▶ Preview</button><button type="button" class="ghost tiny voice-lock-btn" data-use-voice="${esc(v.voice_id)}" data-voice-name="${esc(v.name)}">Use & lock</button></div></div>`).join('')}</div><div class="modal-actions split"><button type="button" class="ghost" id="voiceAuto">Reset to Auto</button><div><button type="button" class="ghost" id="voiceCancel">Close</button><button type="button" class="primary" id="voiceSaveSettings">Save voice settings</button></div></div></div>`;
    const previewOptions=()=>({kind:'dialogue',direction:[VOICE_PERFORMANCE[$('#voicePerformance').value]||VOICE_PERFORMANCE.Natural,VOICE_PACE[$('#voicePace').value]||VOICE_PACE.Natural,$('#voiceCustomDirection').value.trim()].filter(Boolean).join('. '),language:p.language,speakerProfile:[c.age,c.personality,c.voice].filter(Boolean).join('. ')});
    $('#voiceCancel').onclick=closeModal;
    $('#voiceSaveSettings').onclick=()=>{updateProject(x=>{const t=x.characters[index];t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});closeModal();toast('Voice performance settings saved.')};
    $('#voiceAuto').onclick=()=>{updateProject(x=>{const t=x.characters[index];t.voiceId='';t.voiceName='';t.voiceMode='auto';t.voiceLocked=false;t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});closeModal();toast(`${c.name} reset to Auto voice.`)};
    $$('[data-preview-voice]').forEach(b=>b.onclick=async()=>{const old=b.textContent;b.disabled=true;b.textContent='Playing…';try{await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,b.dataset.previewVoice,previewOptions())}catch{}finally{b.disabled=false;b.textContent=old}});
    $$('[data-use-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useVoice,name=b.dataset.voiceName;updateProject(x=>{const t=x.characters[index];t.voiceId=id;t.voiceName=name;t.voiceMode='custom';t.voiceLocked=true;t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});try{await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,id,previewOptions())}catch{}closeModal();toast(`${name} locked to ${c.name}.`) });
  }catch(e){toast('Voice catalog could not be loaded.');}
}

function openCharacterEditor(index=null){
  const p=current();if(!p){toast('Create a project first.');return}
  const c=index===null?{name:'',role:'',age:'',appearance:'',background:'',personality:'',voice:'',voicePerformance:'Natural',voicePace:'Natural',voiceCustomDirection:'',voiceLocked:false,voiceMode:'auto',languages:'',wardrobe:'',locked:true,visualStyleOverride:'project',customVisualStyle:''}:structuredClone(p.characters[index]);
  c.visualStyleOverride=c.visualStyleOverride||'project';
  $('#modalBody').innerHTML=`<form class="modal-form" id="characterForm"><h2>${index===null?'Add character':'Edit character'}</h2><p>Describe the character naturally. Identity Lock preserves who the character is while visual style can follow the project or use an override.</p><div class="field-grid two"><label class="field"><span>Name</span><input id="cfName" value="${esc(c.name)}" required></label><label class="field"><span>Role</span><input id="cfRole" value="${esc(c.role)}" placeholder="Lead, ally, narrator…"></label></div><div class="field-grid two"><label class="field"><span>Age / presentation</span><input id="cfAge" value="${esc(c.age)}" placeholder="Any age or fictional presentation"></label><label class="field"><span>Language(s)</span><input id="cfLanguages" value="${esc(c.languages)}" placeholder="Any language, dialect, mix"></label></div><label class="field"><span>Appearance</span><textarea id="cfAppearance" placeholder="Describe anything…">${esc(c.appearance)}</textarea></label><label class="field"><span>Culture / background / origin</span><input id="cfBackground" value="${esc(c.background)}" placeholder="Optional; any culture, ethnicity, nationality, fictional origin…"></label><div class="field-grid two"><label class="field"><span>Visual style override</span><select id="cfVisualStyle">${visualStyleOptions(c.visualStyleOverride,true)}</select><small>Use project style for a consistent production, or deliberately give this character another rendering style.</small></label><label class="field ${c.visualStyleOverride==='custom'?'':'hidden'}" id="cfCustomStyleWrap"><span>Custom character style</span><input id="cfCustomStyle" value="${esc(c.customVisualStyle||'')}" placeholder="Describe any visual treatment"></label></div><label class="field"><span>Personality</span><input id="cfPersonality" value="${esc(c.personality)}"></label><label class="field"><span>Voice direction</span><input id="cfVoice" value="${esc(c.voice)}" placeholder="Accent, tone, age impression, pace, texture…"></label><label class="field"><span>Wardrobe / continuity</span><input id="cfWardrobe" value="${esc(c.wardrobe)}"></label><div class="identity-note"><b>Identity Lock</b><span>When regenerating this character, CineTale can reuse the current portrait as a reference so style changes preserve the same person.</span></div><div class="modal-actions"><button type="button" class="ghost" id="characterCancel">Cancel</button><button class="primary" type="submit">Save character</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#characterCancel').onclick=closeModal;
  $('#cfVisualStyle').onchange=e=>$('#cfCustomStyleWrap').classList.toggle('hidden',e.target.value!=='custom');
  $('#characterForm').onsubmit=e=>{e.preventDefault();const item={...c,id:c.id||uid('c'),name:$('#cfName').value.trim(),role:$('#cfRole').value.trim(),age:$('#cfAge').value.trim(),languages:$('#cfLanguages').value.trim(),appearance:$('#cfAppearance').value.trim(),background:$('#cfBackground').value.trim(),visualStyleOverride:$('#cfVisualStyle').value,customVisualStyle:$('#cfCustomStyle').value.trim(),personality:$('#cfPersonality').value.trim(),voice:$('#cfVoice').value.trim(),wardrobe:$('#cfWardrobe').value.trim(),locked:true};updateProject(p=>{p.characters=p.characters||[];if(index===null)p.characters.push(item);else p.characters[index]=item});closeModal();toast('Character saved.')}
}
$('#addCharacterBtn').onclick=()=>openCharacterEditor(null);
function openImage(a){$('#modalBody').innerHTML=`<img class="preview-image" src="${a.image}" alt="${esc(a.name)}"><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">${esc(a.kind)}</p>`;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

$('#exportProject').onclick=()=>{const p=current();if(!p)return;const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(p.title||'cinetale-project').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('#clearLibraryBtn').onclick=()=>{if(!confirm('Clear all CineTale projects saved in this browser?'))return;state.projects=[];state.currentId=null;save();renderAll();toast('Local CineTale data cleared.')};
$('#healthCheckBtn').onclick=async()=>{try{const r=await fetch('/api/health');const d=await r.json();const labels={story:'Story intelligence',image:'Visual generation',voice:'Voice generation',video:'Video generation'};$('#healthResult').innerHTML=Object.entries(d.services||{}).map(([k,v])=>`${v?'●':'○'} ${labels[k]}: <b>${v?'configured':'demo / not configured'}</b>`).join('<br>')}catch{$('#healthResult').textContent='System check unavailable.'}};
$('#ownerCheckBtn').onclick=async()=>{try{const r=await fetch('/api/owner',{headers:{'x-owner-code':$('#ownerCode').value}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unauthorized');$('#ownerResult').textContent=JSON.stringify(d,null,2);$('#ownerResult').classList.remove('hidden')}catch(e){toast(e.message)}};

for(const p of state.projects){ensureEpisodeIds(p);p.languageScope=p.languageScope||'entire-story';p.culturalTreatment=p.culturalTreatment||'auto';p.narratorPerformance=p.narratorPerformance||'Warm';p.narratorPace=p.narratorPace||'Natural';if(p.narratorVoiceLocked==null)p.narratorVoiceLocked=false;for(const c of p.characters||[]){c.voicePerformance=c.voicePerformance||'Natural';c.voicePace=c.voicePace||'Natural';c.voiceMode=c.voiceMode||(c.voiceId?'auto':'auto');if(c.voiceLocked==null)c.voiceLocked=false}}save();
renderAll();
requestAnimationFrame(updateNavIndicator);
