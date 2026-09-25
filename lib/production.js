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
function shotKinds(){return ['establishing','medium','reaction','detail','over-shoulder','cutaway','movement','reveal','wide','close-reaction']}
export function coverageTargetCount(scene={},mode='balanced'){
  const beat=Math.max(1,Number(scene.durationSec)||1),spoken=estimatedSpokenSeconds(scene);
  // A final episode may never fill runtime by looping the same generated clip. Plan enough
  // distinct source coverage for the actual story beat instead. Fast intentionally spends only
  // one clip; Balanced/Cinematic target roughly one unique source per provider clip duration.
  const clipSec=mode==='cinematic'?8:6;
  const base=mode==='fast'?1:Math.ceil(Math.max(beat/clipSec,spoken/(mode==='cinematic'?7:9)));
  const floor=mode==='fast'?1:mode==='cinematic'?3:2;const cap=mode==='fast'?1:mode==='cinematic'?10:8;
  return Math.max(floor,Math.min(cap,base||floor));
}
export function buildCoveragePlan(scene={},mode='balanced'){
  const desired=Math.max(1,coverageTargetCount(scene,mode));
  const dialogue=(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(dialogueParts).filter(x=>x.text);
  const kinds=shotKinds(),shots=[];let d=0;
  for(let i=0;i<desired;i++){
    const line=dialogue.length?dialogue[d%dialogue.length]:null;const speaking=Boolean(line&&i%2===1);if(speaking)d++;
    const kind=speaking?'speaking-medium':kinds[i%kinds.length];
    const purpose=speaking?`On-camera performance for ${line.speaker||'the speaking character'}`:(i===0?'Establish geography and action':i===desired-1?'Land the beat with a clear visual turn':'Provide cinematic coverage so narration never sits on a frozen frame');
    const visual=speaking?`${line.speaker||'The character'} is clearly visible in a natural speaking composition while the scene action continues. Preserve the exact established identity and environment.`:`${text(scene.visual||scene.purpose)||'Cinematic scene coverage'} Emphasize a ${kind.replace(/-/g,' ')} composition with a meaningfully different angle from adjacent shots.`;
    shots.push({id:`${text(scene.id)||'scene'}-shot-${i+1}`,order:i+1,kind,purpose,visual,camera:speaking?'Stable medium/medium-close speaking shot with comfortable headroom and natural conversational eyeline.':`${text(scene.camera)||'Cinematic camera movement'}; vary angle/scale from the prior shot.`,speaker:speaking?(line?.speaker||''):'',spokenLine:speaking?(line?.text||''):'',speaking,narrationSupport:!speaking,targetClipSec:mode==='cinematic'?8:mode==='fast'?4:6});
  }
  return shots;
}
export function ensureSceneCoverage(scene={},mode='balanced'){
  const existing=Array.isArray(scene.coveragePlan)?scene.coveragePlan.filter(Boolean):[];
  const target=coverageTargetCount(scene,mode);if(existing.length>=target)return existing;
  const generated=buildCoveragePlan(scene,mode);scene.coveragePlan=generated;return generated;
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
