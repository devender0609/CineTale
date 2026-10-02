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
function normalizeLanguageName(value=''){
  const raw=String(value||'').trim();if(!raw)return '';
  const low=raw.toLowerCase().replace('_','-');if(LANGUAGE_NAMES[low])return LANGUAGE_NAMES[low];
  const primary=low.split('-')[0];if(LANGUAGE_NAMES[primary])return LANGUAGE_NAMES[primary];
  const aliases={english:'English',hindi:'Hindi',spanish:'Spanish','español':'Spanish',french:'French','français':'French',german:'German','deutsch':'German',italian:'Italian',portuguese:'Portuguese',arabic:'Arabic',mandarin:'Mandarin Chinese','mandarin chinese':'Mandarin Chinese',chinese:'Mandarin Chinese',cantonese:'Cantonese',japanese:'Japanese',korean:'Korean',bengali:'Bengali',punjabi:'Punjabi',gujarati:'Gujarati',marathi:'Marathi',tamil:'Tamil',telugu:'Telugu',kannada:'Kannada',malayalam:'Malayalam',urdu:'Urdu'};
  return aliases[low]||titleCase(raw);
}
function inferAccent(v){
  const labels=v.labels||{};const explicit=firstLabel(labels,['accent','region','locale','accent_region']);if(explicit)return titleCase(explicit);
  const h=textOf(v);const rules=[
    [/\bindian\b|india|hindi|marathi|tamil|telugu|malayalam|bengali|punjabi/,'Indian / South Asian'],
    [/\bbritish\b|england|english uk|uk accent|london/,'British'],[/\bamerican\b|usa|united states|us accent/,'American'],
    [/australian|australia/,'Australian'],[/new zealand|kiwi/,'New Zealand'],[/irish|ireland/,'Irish'],[/scottish|scotland/,'Scottish'],
    [/nigerian|nigeria/,'Nigerian'],[/south african|south africa/,'South African'],[/kenyan|kenya/,'Kenyan'],
    [/mexican|mexico/,'Mexican'],[/argentin|argentina/,'Argentinian'],[/colombian|colombia/,'Colombian'],[/spain|castilian/,'Spain Spanish'],
    [/brazil|brazilian/,'Brazilian Portuguese'],[/portugal|portuguese european/,'European Portuguese'],
    [/french|france/,'French'],[/german|germany/,'German'],[/italian|italy/,'Italian'],[/russian|russia/,'Russian'],
    [/mandarin|mainland china|chinese mainland/,'Mandarin / Mainland China'],[/cantonese|hong kong/,'Cantonese / Hong Kong'],[/singapore/,'Singapore'],
    [/japanese|japan/,'Japanese'],[/korean|korea/,'Korean'],[/arabic|egyptian|gulf|levantine|saudi/,'Arabic'],[/neutral|international|global/,'Neutral / International']
  ];for(const [re,label] of rules)if(re.test(h))return label;return '';
}
function inferAge(v){const labels=v.labels||{};const explicit=firstLabel(labels,['age','age_range']);if(explicit){const h=explicit.toLowerCase();if(/child|kid/.test(h))return 'Child';if(/teen/.test(h))return 'Teen';if(/young/.test(h))return 'Young adult';if(/mature|senior|old/.test(h))return 'Mature';return 'Adult'}const h=textOf(v);if(/child|kid|preteen/.test(h))return 'Child';if(/teen|teenage|adolescent/.test(h))return 'Teen';if(/young adult|youth|20s/.test(h))return 'Young adult';if(/mature|senior|elder|older|60s|70s/.test(h))return 'Mature';return 'Adult'}
function inferPresentation(v){const labels=v.labels||{};const explicit=firstLabel(labels,['gender','sex','voice_gender']);if(explicit){const h=explicit.toLowerCase();if(/female|woman|feminine/.test(h))return 'Feminine';if(/male|man|masculine/.test(h))return 'Masculine';if(/neutral|nonbinary|androgyn/.test(h))return 'Neutral';return titleCase(explicit)}const h=textOf(v);if(/female|woman|girl|feminine/.test(h))return 'Feminine';if(/male|man|boy|masculine/.test(h))return 'Masculine';return 'Neutral'}
function inferUse(v){const labels=v.labels||{};const explicit=firstLabel(labels,['use_case','usecase','use','category']);const h=`${explicit} ${textOf(v)}`.toLowerCase();if(/narrat|audiobook|storytell/.test(h))return 'Narration';if(/documentary|news|educational|informative/.test(h))return 'Documentary / Educational';if(/convers|casual|relatable/.test(h))return 'Conversational';if(/character|animation|game|roleplay/.test(h))return 'Character';if(/commercial|advert|promo/.test(h))return 'Commercial';return 'General'}
function inferLanguage(v){const labels=v.labels||{};const explicit=firstLabel(labels,['language','languages','locale']);if(explicit)return normalizeLanguageName(explicit);const h=textOf(v);const map=[[/hindi/,'Hindi'],[/spanish|español/,'Spanish'],[/french|français/,'French'],[/german|deutsch/,'German'],[/italian/,'Italian'],[/portuguese/,'Portuguese'],[/arabic/,'Arabic'],[/mandarin|chinese/,'Mandarin Chinese'],[/cantonese/,'Cantonese'],[/japanese/,'Japanese'],[/korean/,'Korean'],[/english|american|british|australian|nigerian|indian/,'English']];for(const [re,label] of map)if(re.test(h))return label;return 'Multilingual / unspecified'}
function inferTone(v){const h=textOf(v);const tones=[];const rules=[[/warm|friendly|reassuring/,'Warm'],[/calm|gentle|soothing/,'Calm'],[/bright|energetic|upbeat|lively/,'Energetic'],[/deep|resonant|authoritative/,'Deep / Authoritative'],[/dramatic|cinematic|epic/,'Dramatic'],[/casual|relatable|conversational/,'Conversational'],[/playful|quirky|fun/,'Playful'],[/soft|intimate|whisper/,'Intimate'],[/smooth|articulate|professional/,'Polished']];for(const [re,label] of rules)if(re.test(h))tones.push(label);return tones[0]||'Natural'}
function enrich(v){return {...v,meta:{accent:inferAccent(v),age:inferAge(v),presentation:inferPresentation(v),use:inferUse(v),language:inferLanguage(v),tone:inferTone(v)}}}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const key=process.env.ELEVENLABS_API_KEY;
  if(!key) return res.status(200).json({mode:'browser',voices:demoVoices});
  try{
    const r=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':key}});
    if(!r.ok) throw new Error(`voice list failed (${r.status})`);
    const d=await r.json();
    const voices=(d.voices||[]).map(v=>enrich({voice_id:v.voice_id,name:v.name||'Voice',category:v.category||v.labels?.use_case||v.labels?.description||'Voice',description:v.description||'',labels:v.labels||{},preview_url:v.preview_url||''}));
    const narratorRequested=String(process.env.ELEVENLABS_NARRATOR_VOICE_ID||'').trim();
    const defaultRequested=String(process.env.ELEVENLABS_DEFAULT_VOICE_ID||'').trim();
    const narrator=voices.find(v=>v.voice_id===narratorRequested)||voices.find(v=>/narrat|story|audiobook/i.test(`${v.name} ${v.category} ${JSON.stringify(v.labels)}`))||voices.find(v=>v.voice_id===defaultRequested)||voices[0]||null;
    return res.status(200).json({mode:'ai',voices,narratorVoiceId:narrator?.voice_id||'',narratorVoiceName:narrator?.name||''});
  }catch(e){
    console.error('[CineTale voices] Voice catalog unavailable',{message:e?.message||String(e)});
    return res.status(502).json({error:'Voice catalog is temporarily unavailable.'});
  }
}
