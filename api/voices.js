const demoVoices=[
  {voice_id:'browser-warm',name:'Warm storyteller',category:'Browser preview',labels:{use_case:'narration'},meta:{accent:'Neutral / International',age:'Adult',presentation:'Neutral',use:'Narration',language:'English'}},
  {voice_id:'browser-calm',name:'Calm narrator',category:'Browser preview',labels:{use_case:'narration'},meta:{accent:'Neutral / International',age:'Mature',presentation:'Neutral',use:'Narration',language:'English'}},
  {voice_id:'browser-bright',name:'Bright character',category:'Browser preview',labels:{use_case:'character'},meta:{accent:'Neutral / International',age:'Young adult',presentation:'Neutral',use:'Character',language:'English'}}
];

function textOf(v){return `${v?.name||''} ${v?.category||''} ${v?.description||''} ${JSON.stringify(v?.labels||{})}`.toLowerCase()}
function firstLabel(labels={},keys=[]){for(const k of keys){const v=labels?.[k];if(v!=null&&String(v).trim())return String(v).trim()}return ''}
function titleCase(s=''){return String(s).replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim()}
const LANGUAGE_NAMES={
  en:'English',hi:'Hindi',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ar:'Arabic',
  zh:'Mandarin Chinese','zh-cn':'Mandarin Chinese','zh-tw':'Mandarin Chinese',yue:'Cantonese',ja:'Japanese',ko:'Korean',
  bn:'Bengali',pa:'Punjabi',gu:'Gujarati',mr:'Marathi',ta:'Tamil',te:'Telugu',kn:'Kannada',ml:'Malayalam',ur:'Urdu',
  ne:'Nepali',sa:'Sanskrit',od:'Odia',or:'Odia',as:'Assamese',th:'Thai',vi:'Vietnamese',id:'Indonesian',ms:'Malay',
  fil:'Filipino / Tagalog',tl:'Filipino / Tagalog',sw:'Swahili',ru:'Russian',pl:'Polish',tr:'Turkish',fa:'Persian / Farsi',he:'Hebrew'
};

const LOCALE_HINTS={
  Hindi:'hi-IN',Malayalam:'ml-IN',Tamil:'ta-IN',Telugu:'te-IN',Kannada:'kn-IN',Bengali:'bn-IN',Marathi:'mr-IN',Punjabi:'pa-IN',Gujarati:'gu-IN',Urdu:'ur-IN',Odia:'or-IN',
  Japanese:'ja-JP',Korean:'ko-KR',Hebrew:'he-IL',Thai:'th-TH',Vietnamese:'vi-VN',Indonesian:'id-ID',Turkish:'tr-TR',Polish:'pl-PL',German:'de-DE',Italian:'it-IT'
};
function localeFromVerified(item={}){
  const raw=String(item.locale||item.language||'').trim().replace('_','-');
  return /^[a-z]{2,3}-[A-Z]{2}$/i.test(raw)?raw:'';
}
function normalizeLocale(value=''){const raw=String(value||'').trim().replace('_','-');if(!raw)return '';const m=raw.match(/^([a-z]{2,3})(?:-([a-z]{2}))?$/i);if(!m)return '';return m[2]?`${m[1].toLowerCase()}-${m[2].toUpperCase()}`:m[1].toLowerCase()}

function normalizeLanguageName(value=''){
  const raw=String(value||'').trim();if(!raw)return '';
  const low=raw.toLowerCase().replace('_','-');if(LANGUAGE_NAMES[low])return LANGUAGE_NAMES[low];
  const primary=low.split('-')[0];if(LANGUAGE_NAMES[primary])return LANGUAGE_NAMES[primary];
  const aliases={english:'English',hindi:'Hindi',spanish:'Spanish','español':'Spanish',french:'French','français':'French',german:'German','deutsch':'German',italian:'Italian',portuguese:'Portuguese',arabic:'Arabic',mandarin:'Mandarin Chinese','mandarin chinese':'Mandarin Chinese',chinese:'Mandarin Chinese',cantonese:'Cantonese',japanese:'Japanese',korean:'Korean',bengali:'Bengali',punjabi:'Punjabi',gujarati:'Gujarati',marathi:'Marathi',tamil:'Tamil',telugu:'Telugu',kannada:'Kannada',malayalam:'Malayalam',urdu:'Urdu'};
  if(aliases[low])return aliases[low];
  if(/^[a-z]{2,3}$/.test(primary)){try{const dn=new Intl.DisplayNames(['en'],{type:'language'}),name=dn.of(primary);if(name&&name.toLowerCase()!==primary)return name}catch{}}
  return titleCase(raw);
}
function inferAccent(v){
  const labels=v.labels||{};
  // Accent/region is demographic-adjacent direction. Never infer it from a voice name,
  // language, ethnicity, religion, culture, or geographic story context. Only provider-declared
  // accent metadata (or verified-language accent metadata handled in enrich()) is trusted.
  const explicit=firstLabel(labels,['accent','region','accent_region']);
  return explicit?titleCase(explicit):'';
}
function inferAge(v){const labels=v.labels||{};const explicit=firstLabel(labels,['age','age_range']);if(explicit){const h=explicit.toLowerCase();if(/child|kid/.test(h))return 'Child';if(/teen/.test(h))return 'Teen';if(/young/.test(h))return 'Young adult';if(/mature|senior|old/.test(h))return 'Mature';return 'Adult'}const h=textOf(v);if(/child|kid|preteen/.test(h))return 'Child';if(/teen|teenage|adolescent/.test(h))return 'Teen';if(/young adult|youth|20s/.test(h))return 'Young adult';if(/mature|senior|elder|older|60s|70s/.test(h))return 'Mature';return 'Adult'}
function inferPresentation(v){const labels=v.labels||{};const explicit=firstLabel(labels,['gender','sex','voice_gender']);if(explicit){const h=explicit.toLowerCase();if(/female|woman|feminine/.test(h))return 'Feminine';if(/male|man|masculine/.test(h))return 'Masculine';if(/neutral|nonbinary|androgyn/.test(h))return 'Neutral';return titleCase(explicit)}const h=textOf(v);if(/female|woman|girl|feminine/.test(h))return 'Feminine';if(/male|man|boy|masculine/.test(h))return 'Masculine';return 'Neutral'}
function inferUse(v){const labels=v.labels||{};const explicit=firstLabel(labels,['use_case','usecase','use','category']);const h=`${explicit} ${textOf(v)}`.toLowerCase();if(/narrat|audiobook|storytell/.test(h))return 'Narration';if(/documentary|news|educational|informative/.test(h))return 'Documentary / Educational';if(/convers|casual|relatable/.test(h))return 'Conversational';if(/character|animation|game|roleplay/.test(h))return 'Character';if(/commercial|advert|promo/.test(h))return 'Commercial';return 'General'}
function inferLanguage(v){
  const labels=v.labels||{};
  // Do not manufacture language support from an accent, country label, name, or description.
  // A language used for strict matching must come from verified_languages or an explicit
  // provider language/languages label. Unknown capability stays unknown.
  const explicit=firstLabel(labels,['language','languages']);
  return explicit?normalizeLanguageName(explicit):'Multilingual / unspecified';
}
function inferTone(v){const h=textOf(v);const tones=[];const rules=[[/warm|friendly|reassuring/,'Warm'],[/calm|gentle|soothing/,'Calm'],[/bright|energetic|upbeat|lively/,'Energetic'],[/deep|resonant|authoritative/,'Deep / Authoritative'],[/dramatic|cinematic|epic/,'Dramatic'],[/casual|relatable|conversational/,'Conversational'],[/playful|quirky|fun/,'Playful'],[/soft|intimate|whisper/,'Intimate'],[/smooth|articulate|professional/,'Polished']];for(const [re,label] of rules)if(re.test(h))tones.push(label);return tones[0]||'Natural'}
function verifiedLanguageMetadata(v){
  const items=Array.isArray(v?.verified_languages)?v.verified_languages:[];
  const languages=[...new Set(items.map(x=>normalizeLanguageName(x?.language||x?.locale||'')).filter(Boolean))];
  const accents=[...new Set(items.map(x=>titleCase(x?.accent||'')).filter(Boolean))];
  const locales=[...new Set(items.map(localeFromVerified).map(normalizeLocale).filter(Boolean))];
  return {languages,accents,locales};
}
function enrich(v){
  const verified=verifiedLanguageMetadata(v),labels=v.labels||{};
  const declaredRaw=firstLabel(labels,['language','languages']);
  const declaredLanguages=declaredRaw?String(declaredRaw).split(/[,;+|]/).map(normalizeLanguageName).filter(Boolean):[];
  const declaredAccent=firstLabel(labels,['accent','region','accent_region']);
  const inferredLanguage=inferLanguage(v);
  const languages=[...new Set([...verified.languages,...declaredLanguages])];
  const strictLanguages=[...new Set([...verified.languages,...declaredLanguages])];
  const displayLanguages=languages.length?languages:(inferredLanguage&&inferredLanguage!=='Multilingual / unspecified'?[inferredLanguage]:[]);
  return {...v,meta:{
    accent:verified.accents[0]||(declaredAccent?titleCase(declaredAccent):''),
    accentSource:verified.accents.length?'verified':(declaredAccent?'declared':'unknown'),
    age:inferAge(v),ageVerified:false,ageSource:'inferred-provider-description',presentation:inferPresentation(v),use:inferUse(v),
    language:displayLanguages[0]||'Multilingual / unspecified',
    languages:displayLanguages,strictLanguages,verifiedLanguages:verified.languages,declaredLanguages,verifiedAccents:verified.accents,locales:verified.locales||[],locale:(verified.locales||[])[0]||'',provider:v.provider||'elevenlabs',providerVoiceId:v.providerVoiceId||v.voice_id,
    languageSource:verified.languages.length?'verified':(declaredLanguages.length?'declared':'unknown'),
    tone:inferTone(v)
  }}
}

async function elevenVoices(){
  const key=process.env.ELEVENLABS_API_KEY;if(!key)return [];
  const r=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':key}});if(!r.ok)throw new Error(`ElevenLabs voice list failed (${r.status})`);
  const d=await r.json();return (d.voices||[]).map(v=>enrich({voice_id:v.voice_id,providerVoiceId:v.voice_id,provider:'elevenlabs',name:v.name||'Voice',category:v.category||v.labels?.use_case||v.labels?.description||'Voice',description:v.description||'',labels:v.labels||{},preview_url:v.preview_url||'',verified_languages:Array.isArray(v.verified_languages)?v.verified_languages:[]}));
}
async function googleVoices(){
  const key=String(process.env.GOOGLE_CLOUD_TTS_API_KEY||'').trim();if(!key)return [];
  const r=await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(key)}`);if(!r.ok)throw new Error(`Google Cloud TTS voice list failed (${r.status})`);
  const d=await r.json();return (d.voices||[]).map(v=>{const codes=(v.languageCodes||[]).map(normalizeLocale).filter(Boolean),langs=[...new Set(codes.map(normalizeLanguageName).filter(Boolean))],gender=String(v.ssmlGender||'').toLowerCase();return {voice_id:`google:${v.name}`,providerVoiceId:v.name,provider:'google',name:`${v.name} · Google`,category:'Google Cloud TTS',labels:{language:langs.join(','),gender:gender==='female'?'Feminine':gender==='male'?'Masculine':'Neutral',locale:codes[0]||''},meta:{provider:'google',providerVoiceId:v.name,accent:'',accentSource:'locale',age:'Adult',ageVerified:false,ageSource:'provider-model-default',presentation:gender==='female'?'Feminine':gender==='male'?'Masculine':'Neutral',use:'General',language:langs[0]||'',languages:langs,strictLanguages:langs,verifiedLanguages:langs,declaredLanguages:[],languageSource:'verified',tone:'Natural',locales:codes,locale:codes[0]||''}}});
}
async function azureVoices(){
  const key=String(process.env.AZURE_SPEECH_KEY||'').trim(),region=String(process.env.AZURE_SPEECH_REGION||'').trim();if(!key||!region)return [];
  const r=await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/voices/list`,{headers:{'Ocp-Apim-Subscription-Key':key}});if(!r.ok)throw new Error(`Azure Speech voice list failed (${r.status})`);
  const d=await r.json();return (Array.isArray(d)?d:[]).map(v=>{const locale=normalizeLocale(v.Locale||''),lang=normalizeLanguageName(locale),gender=String(v.Gender||'').toLowerCase();return {voice_id:`azure:${v.ShortName}`,providerVoiceId:v.ShortName,provider:'azure',name:`${v.LocalName||v.DisplayName||v.ShortName} · Azure`,category:'Azure Speech',labels:{language:lang,gender:gender==='female'?'Feminine':gender==='male'?'Masculine':'Neutral',locale},meta:{provider:'azure',providerVoiceId:v.ShortName,accent:'',accentSource:'locale',age:'Adult',ageVerified:false,ageSource:'provider-model-default',presentation:gender==='female'?'Feminine':gender==='male'?'Masculine':'Neutral',use:'General',language:lang,languages:lang?[lang]:[],strictLanguages:lang?[lang]:[],verifiedLanguages:lang?[lang]:[],declaredLanguages:[],languageSource:'verified',tone:'Natural',locales:locale?[locale]:[],locale}}});
}


function murfAgeFromDescription(value=''){
  const raw=String(value||'').trim();const h=raw.toLowerCase();
  if(!h)return {age:'Unverified',verified:false};
  if(/\b(kid|child|children|pre[- ]?teen)\b/.test(h))return {age:'Child',verified:true};
  if(/\b(teen|teenager|adolescent)\b/.test(h))return {age:'Teen',verified:true};
  if(/\b(young adult|young-adult|youth)\b/.test(h))return {age:'Young adult',verified:true};
  if(/\b(middle[- ]?aged|middle aged|adult)\b/.test(h))return {age:'Adult',verified:true};
  if(/\b(mature|senior|elder|older)\b/.test(h))return {age:'Mature',verified:true};
  return {age:'Unverified',verified:false};
}
async function murfVoicesForModel(model){
  const key=String(process.env.MURF_API_KEY||'').trim();if(!key)return [];
  const r=await fetch(`https://api.murf.ai/v1/speech/voices?model=${encodeURIComponent(model)}`,{headers:{'api-key':key}});
  if(!r.ok)throw new Error(`Murf voice list failed for ${model} (${r.status})`);
  const d=await r.json();const rows=Array.isArray(d)?d:[];
  return rows.map(v=>{
    const supported=v?.supportedLocales&&typeof v.supportedLocales==='object'?Object.keys(v.supportedLocales):[];
    const base=normalizeLocale(v?.locale||'');const locales=[...new Set([base,...supported.map(normalizeLocale)].filter(Boolean))];
    const langs=[...new Set(locales.map(normalizeLanguageName).filter(Boolean))];
    const gender=String(v?.gender||'').toLowerCase(),presentation=gender==='female'?'Feminine':gender==='male'?'Masculine':gender==='nonbinary'?'Neutral':'Neutral';
    const ageInfo=murfAgeFromDescription(v?.description||'');
    const voiceId=String(v?.voiceId||'').trim();if(!voiceId)return null;
    const styles=[...new Set([...(Array.isArray(v?.availableStyles)?v.availableStyles:[]),...Object.values(v?.supportedLocales||{}).flatMap(x=>Array.isArray(x?.availableStyles)?x.availableStyles:[])].filter(Boolean))];
    const tone=styles.find(x=>/calm|conversational|storytelling|inspirational|promo|sad|angry|furious/i.test(String(x)))||'Natural';
    const baseLanguage=normalizeLanguageName(base);
    const localeDetails=Object.fromEntries(Object.entries(v?.supportedLocales||{}).map(([locale,info])=>[normalizeLocale(locale),String(info?.detail||'')]).filter(([locale])=>Boolean(locale)));
    return {voice_id:`murf:${model}:${voiceId}`,providerVoiceId:voiceId,provider:'murf',name:`${v?.displayName||voiceId} · Murf`,category:`Murf ${model}`,description:String(v?.description||''),labels:{language:langs.join(','),gender:presentation,locale:base||locales[0]||'',age:ageInfo.age,use_case:styles.join(',')},meta:{provider:'murf',providerVoiceId:voiceId,accent:String(v?.accent||''),accentSource:v?.accent?'provider':'locale',age:ageInfo.age,ageVerified:ageInfo.verified,ageSource:ageInfo.verified?'provider-description':'unverified',presentation,use:'General',language:baseLanguage||langs[0]||'',baseLanguage:baseLanguage||'',baseLocale:base||'',languages:langs,strictLanguages:langs,verifiedLanguages:langs,declaredLanguages:[],languageSource:'provider-catalog',tone,locales,locale:base||locales[0]||'',localeDetails,model,styles}};
  }).filter(Boolean);
}
async function murfVoices(){
  const key=String(process.env.MURF_API_KEY||'').trim();if(!key)return [];
  const results=await Promise.allSettled(['falcon-2','gen2'].map(murfVoicesForModel));
  const voices=results.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  if(!voices.length){const failure=results.find(x=>x.status==='rejected');throw failure?.reason||new Error('Murf voice catalog unavailable')}
  // The same Murf speaker can be exposed by more than one model. Keep one creator-facing row per
  // speaker, preferring Falcon 2 when available because it is Murf's current streaming model.
  const bySpeaker=new Map();
  for(const voice of voices){
    const key=String(voice.providerVoiceId||voice.voice_id||'');if(!key)continue;
    const prior=bySpeaker.get(key);if(!prior||String(voice.meta?.model||'')==='falcon-2')bySpeaker.set(key,voice);
  }
  return [...bySpeaker.values()];
}

const SARVAM_V3_MALE=['shubh','aditya','rahul','rohan','amit','dev','ratan','varun','manan','sumit','kabir','aayan','ashutosh','advait','anand','tarun','sunny','mani','gokul','vijay','mohit','rehan','soham'];
const SARVAM_V3_FEMALE=['ritu','priya','neha','pooja','simran','kavya','ishita','shreya','roopa','tanya','shruti','suhani','kavitha','rupali'];
const SARVAM_LANGUAGES=['hi-IN','bn-IN','ta-IN','te-IN','gu-IN','kn-IN','ml-IN','mr-IN','pa-IN','od-IN','en-IN'];
function sarvamVoices(){
  const key=String(process.env.SARVAM_API_KEY||'').trim();if(!key)return [];
  const make=(speaker,presentation)=>{
    const langs=[...new Set(SARVAM_LANGUAGES.map(normalizeLanguageName).filter(Boolean))];
    return {voice_id:`sarvam:${speaker}`,providerVoiceId:speaker,provider:'sarvam',name:`${titleCase(speaker)} · Sarvam`,category:'Sarvam Bulbul v3',labels:{language:langs.join(','),gender:presentation,locale:'hi-IN'},meta:{provider:'sarvam',providerVoiceId:speaker,accent:'Indian',accentSource:'provider',age:'Unverified',presentation,use:'General',language:'Hindi',languages:langs,strictLanguages:langs,verifiedLanguages:langs,declaredLanguages:[],languageSource:'provider-model',tone:'Natural',locales:SARVAM_LANGUAGES.map(normalizeLocale),locale:'hi-IN',ageVerified:false,model:'bulbul:v3'}};
  };
  return [...SARVAM_V3_MALE.map(x=>make(x,'Masculine')),...SARVAM_V3_FEMALE.map(x=>make(x,'Feminine'))];
}
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const providers=[];const voices=[];const errors=[];
  for(const [name,loader] of [['elevenlabs',elevenVoices],['google',googleVoices],['azure',azureVoices],['sarvam',sarvamVoices],['murf',murfVoices]]){try{const rows=await loader();if(rows.length){providers.push(name);voices.push(...rows)}}catch(e){errors.push({provider:name,message:e?.message||String(e)});console.warn('[CineTale voices] provider catalog unavailable',{provider:name,message:e?.message||String(e)})}}
  if(!voices.length){if(!process.env.ELEVENLABS_API_KEY&&!process.env.GOOGLE_CLOUD_TTS_API_KEY&&!process.env.AZURE_SPEECH_KEY&&!process.env.SARVAM_API_KEY&&!process.env.MURF_API_KEY)return res.status(200).json({mode:'browser',providers:['browser'],voices:demoVoices});return res.status(502).json({error:'Voice catalogs are temporarily unavailable.',providerErrors:errors.map(x=>x.provider)})}
  const providerCapabilities=Object.fromEntries(providers.map(provider=>{
    const rows=voices.filter(v=>v.provider===provider),verifiedAgeRows=rows.filter(v=>Boolean(v?.meta?.ageVerified)),verifiedYouthRows=verifiedAgeRows.filter(v=>['Child','Teen'].includes(String(v?.meta?.age||''))),locales=[...new Set(rows.flatMap(v=>Array.isArray(v?.meta?.locales)?v.meta.locales:[]).filter(Boolean))],languages=[...new Set(rows.flatMap(v=>Array.isArray(v?.meta?.strictLanguages)?v.meta.strictLanguages:[]).filter(Boolean))],models=[...new Set(rows.map(v=>v?.meta?.model).filter(Boolean))];
    return [provider,{provider,totalVoices:rows.length,verifiedAgeVoices:verifiedAgeRows.length,verifiedYouthVoices:verifiedYouthRows.length,verifiedLanguages:languages.length,verifiedLocales:locales.length,previewSamples:rows.filter(v=>Boolean(String(v?.preview_url||v?.previewUrl||'').trim())).length,models,metadata:{age:verifiedAgeRows.length?'verified-on-some-voices':'not-verified',language:languages.length?'provider-verified-or-declared':'unknown',locale:locales.length?'provider-catalog':'unknown'}}];
  }));
  const narratorRequested=String(process.env.ELEVENLABS_NARRATOR_VOICE_ID||'').trim(),defaultRequested=String(process.env.ELEVENLABS_DEFAULT_VOICE_ID||'').trim();
  const narrator=voices.find(v=>v.provider==='elevenlabs'&&v.providerVoiceId===narratorRequested)||voices.find(v=>/narrat|story|audiobook/i.test(`${v.name} ${v.category} ${JSON.stringify(v.labels)}`))||voices.find(v=>v.provider==='elevenlabs'&&v.providerVoiceId===defaultRequested)||voices[0]||null;
  return res.status(200).json({mode:'ai',providers,voices,providerCapabilities,narratorVoiceId:narrator?.voice_id||'',narratorVoiceName:narrator?.name||'',providerErrors:errors.map(x=>x.provider)});
}
