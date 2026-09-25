function text(v=''){return String(v||'').trim()}
function words(v=''){return text(v).split(/\s+/).filter(Boolean)}
function dialogueParts(entry=''){
  const raw=text(typeof entry==='string'?entry:(entry?.text||entry?.line||entry?.dialogue||entry?.content||entry?.utterance||''));
  const m=raw.match(/^([^:]{1,80}):\s*(.+)$/);return m?{speaker:m[1].trim(),text:m[2].trim()}:{speaker:'',text:raw};
}
export function estimatedSpokenSeconds(scene={}){
  const narration=text(scene.narration);const dialogue=Array.isArray(scene.dialogue)?scene.dialogue:[];
  const count=words(narration).length+dialogue.reduce((n,line)=>n+words(dialogueParts(line).text).length,0);
  return Math.max(0,Math.round((count/135)*60));
}
function shotKinds(){return ['establishing','movement','reaction','detail','over-shoulder','cutaway','wide','reveal','close-reaction']}
function providerClipSeconds(mode='balanced'){return mode==='cinematic'?8:mode==='fast'?4:6}
function estimateLineSeconds(value=''){
  const count=words(value).length;
  if(!count)return 0;
  // Conservative conversational estimate with a short natural pause allowance.
  return Math.max(2.2,Math.min(8,(count/145)*60+.55));
}
function roundTenths(v){return Math.round(Number(v||0)*10)/10}
export function coverageTargetCount(scene={},mode='balanced'){
  const beat=Math.max(1,Number(scene.durationSec)||1),clipSec=providerClipSeconds(mode);
  const dialogue=(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(dialogueParts).filter(x=>x.text);
  const spokenSlots=dialogue.length;
  const base=mode==='fast'?1:Math.ceil(beat/clipSec);
  const floor=mode==='fast'?1:mode==='cinematic'?3:2;
  const cap=mode==='fast'?1:mode==='cinematic'?12:10;
  // Every distinct dialogue turn must have its own planned performance slot. Never alternate
  // speakers mechanically or reuse one speaking shot for multiple character turns.
  return Math.max(floor,Math.min(cap,Math.max(base,spokenSlots||0)));
}
export function buildCoveragePlan(scene={},mode='balanced'){
  const beat=Math.max(1,Number(scene.durationSec)||1),desired=Math.max(1,coverageTargetCount(scene,mode));
  const dialogue=(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(dialogueParts).filter(x=>x.text);
  const clipSec=providerClipSeconds(mode),kinds=shotKinds(),slots=[];
  // Put an establishing/action shot first when there is room, then preserve dialogue order,
  // then add unique coverage. This gives the editor a deterministic story timeline rather
  // than "every other shot speaks" behavior.
  if(desired>dialogue.length)slots.push({speaking:false,kind:'establishing'});
  for(const line of dialogue)slots.push({speaking:true,kind:'speaking-medium',line});
  let ki=0;while(slots.length<desired){slots.push({speaking:false,kind:kinds[(ki++ + (slots.length?1:0))%kinds.length]})}
  // Dialogue performance gets enough planned time for a natural line, within provider limits.
  const requested=slots.map(slot=>slot.speaking?Math.min(clipSec,estimateLineSeconds(slot.line?.text||'')):Math.min(clipSec,2));
  let sum=requested.reduce((a,b)=>a+b,0);
  if(sum>beat&&sum>0){const scale=beat/sum;for(let i=0;i<requested.length;i++)requested[i]=Math.max(.8,requested[i]*scale);sum=requested.reduce((a,b)=>a+b,0)}
  if(sum<beat){
    let remain=beat-sum,guard=0;
    // Fill spare provider duration across the whole shot list. Dialogue shots may include a
    // natural pre/post-performance beat; they do not need to end on the final phoneme.
    while(remain>.01&&guard++<100){const open=requested.map((v,i)=>v<clipSec-.01?i:-1).filter(i=>i>=0);if(!open.length)break;const share=remain/open.length;let used=0;for(const i of open){const add=Math.min(clipSec-requested[i],share);requested[i]+=add;used+=add}if(used<.001)break;remain-=used}
  }
  const total=requested.reduce((a,b)=>a+b,0)||1,scale=beat/total;for(let i=0;i<requested.length;i++)requested[i]*=scale;
  const shots=[];let start=0;
  for(let i=0;i<slots.length;i++){
    const slot=slots[i],duration=i===slots.length-1?Math.max(.5,beat-start):Math.max(.5,requested[i]);
    const end=Math.min(beat,start+duration),speaking=Boolean(slot.speaking),line=slot.line||null,kind=slot.kind;
    const purpose=speaking?`On-camera performance for ${line?.speaker||'the speaking character'}`:(i===0?'Establish geography, mood and action':i===slots.length-1?'Land the story beat with a clear visual turn':'Provide distinct cinematic coverage for the current story beat');
    const visual=speaking?`${line?.speaker||'The speaking character'} is clearly visible in a natural conversational composition. Preserve established identity, wardrobe and environment. No other character appears to speak this line.`:`${text(scene.visual||scene.purpose)||'Cinematic scene coverage'} Use a ${kind.replace(/-/g,' ')} composition that is meaningfully different from adjacent shots.`;
    shots.push({id:`${text(scene.id)||'scene'}-shot-${i+1}`,order:i+1,kind,purpose,visual,camera:speaking?'Stable medium or medium-close performance shot with comfortable headroom, natural eyeline and no unnecessary camera move during dialogue.':`${text(scene.camera)||'Cinematic camera movement'}; vary angle and scale from adjacent shots.`,speaker:speaking?(line?.speaker||''):'',spokenLine:speaking?(line?.text||''):'',speaking,narrationSupport:!speaking,startSec:roundTenths(start),endSec:roundTenths(end),durationSec:roundTenths(end-start),targetClipSec:clipSec});
    start=end;
  }
  return shots;
}
export function ensureSceneCoverage(scene={},mode='balanced'){
  const target=coverageTargetCount(scene,mode),generated=buildCoveragePlan(scene,mode);
  const existing=Array.isArray(scene.coveragePlan)?scene.coveragePlan.filter(Boolean):[];
  // Rebuild stale plans created by the older untimed planner. Preserve a current timed plan only
  // when its scene duration and dialogue still match the deterministic plan shape.
  const timed=existing.length===target&&existing.every(x=>Number.isFinite(Number(x.startSec))&&Number.isFinite(Number(x.endSec))&&Number(x.endSec)>Number(x.startSec));
  if(timed){const last=existing[existing.length-1],beat=Math.max(1,Number(scene.durationSec)||1);if(Math.abs(Number(last.endSec)-beat)<.25)return existing}
  scene.coveragePlan=generated;return generated;
}
const ageWords={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
function parseAge(raw=''){const s=text(raw).toLowerCase();const m=s.match(/\b(\d{1,3})\b/);if(m)return Number(m[1]);const parts=s.replace(/-/g,' ').split(/\s+/),nums=parts.map(x=>ageWords[x]).filter(x=>x!=null);return nums.length?nums.reduce((a,b)=>a+b,0):null}
export function detectContinuityConflicts(project={},episode={}){
  const story=`${text(episode.title)} ${text(episode.synopsis)} ${text(episode.storyText)}`;const warnings=[];
  for(const c of (project.characters||[])){
    const name=text(c.name),firstName=name.split(/\s+/)[0];if(!name||(!story.toLowerCase().includes(name.toLowerCase())&&!story.toLowerCase().includes(firstName.toLowerCase())))continue;const established=parseAge(c.age);if(established!=null){const first=name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[new RegExp(`\\b${first}\\b\\s*(?:,\\s*)?(?:now\\s+)?(?:is\\s+)?(\\d{1,3}|[a-z]+(?:-[a-z]+)?)\\s*[- ]year[- ]old`,'i'),new RegExp(`(\\d{1,3}|[a-z]+(?:-[a-z]+)?)\\s*[- ]year[- ]old\\s+\\b${first}\\b`,'i')];for(const re of patterns){const m=story.match(re);if(m){const proposed=parseAge(m[1]);if(proposed!=null&&proposed!==established)warnings.push({type:'age',character:name,field:'age',established:String(established),proposed:String(proposed),message:`${name}'s age changed from ${established} to ${proposed}.`});break}}}
    const role=text(c.role).toLowerCase();const first=name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(/father/.test(role)&&new RegExp(`\\b(?:uncle|brother|grandfather)\\s+${first}\\b|\\b${first}[^.!?]{0,25}\\b(?:uncle|brother|grandfather)\\b`,'i').test(story))warnings.push({type:'relationship',character:name,field:'role',established:c.role,proposed:'conflicting family relationship',message:`${name}'s established relationship may conflict with the new episode.`});
  }
  for(const item of (episode.continuityChanges||[])){if(item&&item.intentional!==true)warnings.push({type:item.type||'model',character:item.character||'',field:item.field||'',established:item.established||'',proposed:item.proposed||'',message:item.message||`${item.character||'A recurring detail'} may conflict with established continuity.`})}
  const seen=new Set();return warnings.filter(w=>{const k=`${w.type}|${w.character}|${w.field}|${w.proposed}`;if(seen.has(k))return false;seen.add(k);return true});
}
export function coverageSummary(scene={},mode='balanced'){
  const plan=ensureSceneCoverage(scene,mode),speaking=plan.filter(x=>x.speaking).length;return {planned:plan.length,speaking,spokenSeconds:estimatedSpokenSeconds(scene)};
}
