function text(v=''){return String(v||'').trim()}
function words(v=''){return text(v).split(/\s+/).filter(Boolean)}
function dialogueParts(entry=''){
  if(entry&&typeof entry==='object'){
    const explicitSpeaker=text(entry.speaker||entry.character||entry.name||entry.who||'');
    const raw=text(entry.text||entry.line||entry.dialogue||entry.content||entry.utterance||'');
    const m=raw.match(/^([^:]{1,80}):\s*(.+)$/s);
    if(explicitSpeaker)return {speaker:explicitSpeaker,text:m?m[2].trim():raw};
    return m?{speaker:m[1].trim(),text:m[2].trim()}:{speaker:'',text:raw};
  }
  const raw=text(entry);
  const m=raw.match(/^([^:]{1,80}):\s*(.+)$/s);
  return m?{speaker:m[1].trim(),text:m[2].trim()}:{speaker:'',text:raw};
}
export function estimatedSpokenSeconds(scene={}){
  const narration=text(scene.narration);const dialogue=Array.isArray(scene.dialogue)?scene.dialogue:[];
  const count=words(narration).length+dialogue.reduce((n,line)=>n+words(dialogueParts(line).text).length,0);
  return Math.max(0,Math.round((count/135)*60));
}
const STORY_TO_SHOT_DIRECTOR_REV='v1.10.49-story-to-shot-director';

const PRODUCTION_LOGIC_GATE_REV='v1.12.4-system-integrity';
function logicNorm(value=''){return text(value).replace(/\s+/g,' ').replace(/[“”"'‘’]/g,'').trim().toLowerCase()}
function dialogueTurns(scene={}){
  return (Array.isArray(scene.dialogue)?scene.dialogue:[]).map((entry,index)=>{
    const parts=dialogueParts(entry);const characterId=entry&&typeof entry==='object'?text(entry.characterId||entry.character_id||entry.speakerId||entry.speaker_id):'';
    return {index,speaker:text(parts.speaker),spokenLine:text(parts.text),characterId};
  }).filter(x=>x.spokenLine);
}
export function coverageLogicAudit(scene={},shots=null){
  const plan=Array.isArray(shots)?shots:(Array.isArray(scene.coveragePlan)?scene.coveragePlan:[]),turns=dialogueTurns(scene),issues=[];
  const ids=new Set(),orders=new Set(),speaking=[];let lastEnd=-Infinity;
  plan.forEach((shot,index)=>{
    const id=text(shot?.id),order=Number(shot?.order)||index+1,isSpeaking=Boolean(shot?.speaking||text(shot?.spokenLine));
    if(id){if(ids.has(id))issues.push({code:'duplicate-shot-id',shotIndex:index,message:`Shot ${order} duplicates another shot ID.`});ids.add(id)}
    if(orders.has(order))issues.push({code:'duplicate-shot-order',shotIndex:index,message:`Shot order ${order} is duplicated.`});orders.add(order);
    if(isSpeaking)speaking.push({shot,index});
    else if(text(shot?.speaker)||text(shot?.spokenLine))issues.push({code:'visual-shot-has-dialogue',shotIndex:index,message:`Visual Shot ${order} contains dialogue ownership metadata.`});
    const start=Number(shot?.startSec),end=Number(shot?.endSec);
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start){if(start+0.02<lastEnd)issues.push({code:'timeline-overlap',shotIndex:index,message:`Shot ${order} overlaps the previous shot timeline.`});lastEnd=end}
  });
  if(speaking.length!==turns.length)issues.push({code:'dialogue-count-mismatch',message:`The scene has ${turns.length} dialogue turn${turns.length===1?'':'s'} but ${speaking.length} speaking shot${speaking.length===1?'':'s'}.`});
  const count=Math.min(speaking.length,turns.length);
  for(let i=0;i<count;i++){
    const {shot,index}=speaking[i],turn=turns[i],order=Number(shot?.order)||index+1;
    const nested=turn.spokenLine.match(/^([^:]{1,80}):\s*(.+)$/s);
    if(nested&&logicNorm(nested[1])!==logicNorm(turn.speaker))issues.push({code:'nested-speaker-conflict',shotIndex:index,dialogueIndex:i,expectedSpeaker:turn.speaker,actualSpeaker:text(nested[1]),message:`Dialogue turn ${i+1} is assigned to ${turn.speaker||'one character'} but the line itself is labeled as ${text(nested[1])}.`});
    if(logicNorm(shot?.speaker)!==logicNorm(turn.speaker))issues.push({code:'speaker-mismatch',shotIndex:index,dialogueIndex:i,expectedSpeaker:turn.speaker,actualSpeaker:text(shot?.speaker),message:`Shot ${order} is assigned to ${text(shot?.speaker)||'an unknown speaker'} but dialogue turn ${i+1} belongs to ${turn.speaker||'another character'}.`});
    if(logicNorm(shot?.spokenLine)!==logicNorm(turn.spokenLine))issues.push({code:'spoken-line-mismatch',shotIndex:index,dialogueIndex:i,expectedSpeaker:turn.speaker,expectedLine:turn.spokenLine,actualLine:text(shot?.spokenLine),message:`Shot ${order} does not contain the authoritative dialogue line for ${turn.speaker||'the speaker'}.`});
  }
  const visualFingerprints=new Map();
  plan.forEach((shot,index)=>{if(shot?.speaking)return;const fp=logicNorm(shot?.storyBeat||shot?.displayText||shot?.visual||shot?.purpose);if(!fp)return;if(visualFingerprints.has(fp))issues.push({code:'duplicate-visual-beat',shotIndex:index,message:`Shot ${Number(shot?.order)||index+1} repeats the same visual story beat as an earlier shot.`});else visualFingerprints.set(fp,index)});
  return {ok:issues.length===0,revision:PRODUCTION_LOGIC_GATE_REV,issues,dialogueTurns:turns.length,speakingShots:speaking.length};
}
function applyAuthoritativeDialogueOwnership(scene={},shots=[]){
  const turns=dialogueTurns(scene);let speakingIndex=0;
  return shots.map(shot=>{
    if(!Boolean(shot?.speaking||text(shot?.spokenLine)))return {...shot,speaking:false,speaker:'',spokenLine:''};
    const turn=turns[speakingIndex++];if(!turn)return {...shot};
    return {...shot,speaking:true,speaker:turn.speaker,spokenLine:turn.spokenLine,dialogueTurnIndex:turn.index,dialogueCharacterId:turn.characterId||'',logicGateRevision:PRODUCTION_LOGIC_GATE_REV};
  });
}

function normalizeCoverageIdentity(scene={},shots=[]){
  const sceneId=text(scene.id)||'scene',seen=new Set();
  return shots.map((shot,index)=>{let id=text(shot?.id)||`${sceneId}-shot-${index+1}`;if(seen.has(id))id=`${sceneId}-shot-${index+1}`;while(seen.has(id))id=`${id}-r`;seen.add(id);return {...shot,id,order:index+1}});
}
function repairDuplicateVisualBeats(scene={},shots=[]){
  const progression=(Array.isArray(scene.visualProgression)?scene.visualProgression:[]).map(text).filter(Boolean),used=new Set();
  return shots.map((shot,index)=>{
    if(shot?.speaking)return shot;
    let beat=text(shot?.storyBeat||shot?.displayText||shot?.visual||shot?.purpose),fp=logicNorm(beat);
    if(fp&&!used.has(fp)){used.add(fp);return shot}
    const candidates=[progression[index],...progression,text(shot?.directorAction),text(shot?.purpose),text(scene.visual),text(scene.exitState)].filter(Boolean);
    const replacement=candidates.find(x=>!used.has(logicNorm(x)))||`${beat||'Visual story beat'} — shot ${index+1}`;
    used.add(logicNorm(replacement));
    return {...shot,storyBeat:replacement,displayText:replacement,visual:replacement,logicGateRevision:PRODUCTION_LOGIC_GATE_REV};
  });
}
export function repairCoverageLogic(scene={},shots=null,mode='balanced'){
  const original=Array.isArray(shots)?shots:(Array.isArray(scene.coveragePlan)?scene.coveragePlan:[]),before=coverageLogicAudit(scene,original);
  if(before.ok)return {changed:false,repaired:original,before,after:before,autoFixed:[],unresolved:[]};
  if(sceneHasProducedCoverageMedia(scene))return {changed:false,repaired:original,before,after:before,autoFixed:[],unresolved:before.issues};
  const codes=new Set(before.issues.map(x=>x.code)),autoFixed=[];
  // An authoritative dialogue list can safely repair shot ownership before any media exists.
  let repaired=normalizeCoverageIdentity(scene,original);
  if(codes.has('dialogue-count-mismatch')){
    repaired=buildCoveragePlan(scene,mode);autoFixed.push('dialogue-count-mismatch');
  }else{
    repaired=applyAuthoritativeDialogueOwnership(scene,repaired);
    if(codes.has('speaker-mismatch'))autoFixed.push('speaker-mismatch');
    if(codes.has('spoken-line-mismatch'))autoFixed.push('spoken-line-mismatch');
    if(codes.has('visual-shot-has-dialogue'))autoFixed.push('visual-shot-has-dialogue');
  }
  if(codes.has('duplicate-shot-id')||codes.has('duplicate-shot-order')){repaired=normalizeCoverageIdentity(scene,repaired);autoFixed.push('shot-identity-order')}
  if(codes.has('timeline-overlap')){repaired=timeCoveragePlan(scene,repaired,mode);autoFixed.push('timeline-overlap')}
  if(codes.has('duplicate-visual-beat')){repaired=repairDuplicateVisualBeats(scene,repaired);autoFixed.push('duplicate-visual-beat')}
  repaired=timeCoveragePlan(scene,repaired,mode).map(x=>({...x,logicGateRevision:PRODUCTION_LOGIC_GATE_REV}));
  const after=coverageLogicAudit(scene,repaired);
  return {changed:JSON.stringify(original)!==JSON.stringify(repaired),repaired,before,after,autoFixed,unresolved:after.issues};
}

function shotKinds(){return ['establishing','movement','reaction','detail','over-shoulder','cutaway','wide','reveal','close-reaction']}
function sentenceParts(value=''){
  return text(value).replace(/\s+/g,' ').split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
}
function focalObjectHint(scene={}){
  const source=`${text(scene.title)} ${text(scene.visual)} ${text(scene.purpose)} ${(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(x=>dialogueParts(x).text).join(' ')}`;
  const patterns=[
    /\b(?:the|a|an|this|that|her|his|their)\s+((?:old|antique|vintage|framed|tarnished|sealed|hidden|small|large|black-and-white|silver|gold|wooden|metal|paper|leather|ceramic|glass)\s+){0,3}(photograph|photo|portrait|picture|frame|key|pendant|letter|note|journal|book|box|trunk|locket|ring|document|map|cassette|recording|toy|object|clue)\b/i,
    /\b(photograph|photo|portrait|picture|frame|key|pendant|letter|note|journal|book|box|trunk|locket|ring|document|map|cassette|recording|clue)\b/i
  ];
  for(const re of patterns){const m=source.match(re);if(m)return text(m[0]).replace(/^(?:the|a|an|this|that|her|his|their)\s+/i,'')}
  return '';
}
function sceneActionContext(scene={}){
  const parts=sentenceParts(scene.visual||scene.purpose||'');
  const progression=(Array.isArray(scene.visualProgression)?scene.visualProgression:[]).map(text).filter(Boolean);
  return {
    opening:progression[0]||parts[0]||text(scene.entryState),
    middle:progression.length>2?progression.slice(1,-1).join(' '):(progression[1]||parts.length>2?parts.slice(1,-1).join(' '):(parts[1]||'')),
    ending:progression.at(-1)||parts.at(-1)||text(scene.exitState),
    progression,
    focalObject:focalObjectHint(scene),
    dramaticPurpose:text(scene.dramaticPurpose||scene.purpose),
    characterObjective:text(scene.characterObjective),
    obstacle:text(scene.obstacle),
    newInformation:text(scene.newInformation),
    emotionalTurn:text(scene.emotionalTurn),
    entryState:text(scene.entryState),
    exitState:text(scene.exitState),
    handoff:text(scene.handoff),
    continuityLocks:(Array.isArray(scene.continuityLocks)?scene.continuityLocks:[]).map(text).filter(Boolean)
  };
}
function inferBeatKind(beat='',index=0,total=1){
  const b=text(beat).toLowerCase();
  if(index===0)return 'establishing';
  if(/react|realiz|fear|smile|stun|shock|hesitat|emotion|expression|breath/.test(b))return 'reaction';
  if(/reveal|discover|notice|find|recogniz|clue|detail|close|letter|photo|photograph|key|object/.test(b))return index===total-1?'detail':'reveal';
  if(/look|watch|see|point of view|over shoulder/.test(b))return 'over-shoulder';
  return index===total-1?'movement':'movement';
}
function shotDirectorBrief(scene={},kind='',index=0,total=1,speaking=false,beatText=''){
  const ctx=sceneActionContext(scene),object=ctx.focalObject||'the story-critical prop',assignedBeat=text(beatText);
  if(speaking)return {
    objective:`Advance the story through this exact spoken exchange${ctx.dramaticPurpose?` in service of: ${ctx.dramaticPurpose}`:''}. Preserve the physical state established by the previous shot and do not replay discovery or reveal actions that belong to other shots.`,
    action:`The named speaker performs only the quoted line and a small natural action that supports it. ${ctx.characterObjective?`Character objective: ${ctx.characterObjective}.`:''} ${ctx.emotionalTurn?`Emotional direction: ${ctx.emotionalTurn}.`:''} Do not introduce a new reveal, new prop, or unrelated business during the dialogue.`,
    avoid:'Do not turn this into an establishing shot, prop insert, repeated discovery, or alternate version of another shot.'
  };
  if(index===0||kind==='establishing')return {
    objective:assignedBeat?`Establish this concrete opening event: ${assignedBeat}`:(ctx.opening?`Establish the scene through this opening event: ${ctx.opening}`:'Establish the scene geography and immediate story state.'),
    action:`Show the scene geography, principal characters and spatial relationships while making the opening event visibly happen. Hold back later reveals. ${assignedBeat?`Concrete opening event: ${assignedBeat}.`:(ctx.opening?`Opening story state: ${ctx.opening}.`:'')}`,
    avoid:`Do not perform the central discovery/reveal, do not present ${object} to camera, and do not repeat the later detail shot.`
  };
  if(kind==='movement')return {
    objective:assignedBeat?`Advance the scene through this concrete action: ${assignedBeat}`:(ctx.middle||ctx.ending?`Advance the scene through this story action: ${ctx.middle||ctx.ending}`:'Advance the scene with one specific, visible action that changes the physical state.'),
    action:`Show one clear transitional action with beginning, middle and end that advances the story while preserving the previous shot's physical state. ${assignedBeat?`Concrete action: ${assignedBeat}.`:(ctx.middle||ctx.ending?`Story action: ${ctx.middle||ctx.ending}.`:'')}`,
    avoid:`Do not stop to pose with ${object}, do not replay the establishing composition, and do not become a reaction close-up.`
  };
  if(kind==='reaction'||kind==='close-reaction')return {
    objective:'Show the emotional consequence of what was just discovered or said.',
    action:`Prioritize face, eyes, breath, posture and a believable reaction. ${assignedBeat?`The reaction is caused by this story beat: ${assignedBeat}.`:''} ${ctx.emotionalTurn?`Land this emotional change: ${ctx.emotionalTurn}.`:''} Keep object handling secondary and minimal.`,
    avoid:`Do not repeat the discovery action, do not lift ${object} toward camera, and do not become an insert/detail shot.`
  };
  if(kind==='detail'||index===total-1)return {
    objective:'Deliver one precise story detail that changes what the viewer understands.',
    action:`${assignedBeat?`Deliver this assigned story beat: ${assignedBeat}. `:''}Isolate ${object} or the single most important visual clue in a true insert/close detail when appropriate. Preserve its exact design, orientation and identifying features from earlier shots. ${ctx.newInformation?`The viewer should leave understanding: ${ctx.newInformation}.`:''}`,
    avoid:'Do not widen back out to a generic medium shot, do not repeat character performance, and do not redesign the focal prop.'
  };
  if(kind==='over-shoulder')return {objective:'Clarify point of view and relationship between character and story information.',action:`Use a genuine over-shoulder composition focused on what the character is seeing or handling.`,avoid:'Do not duplicate the same frontal composition used in adjacent shots.'};
  if(kind==='cutaway')return {objective:'Add non-redundant contextual information that supports the beat.',action:'Show a meaningful environment/object cutaway that has not already been shown as the main action.',avoid:'Do not repeat the lead character doing the same action again.'};
  if(kind==='reveal')return {objective:'Reveal new information exactly once.',action:`Stage the reveal so the viewer clearly notices ${object} or the new story information for the first time.`,avoid:'Do not replay a reveal that has already happened in an earlier shot.'};
  return {objective:'Add new cinematic information rather than another take of the same action.',action:'Choose a clearly different scale, angle and action beat that advances continuity.',avoid:'Do not repeat the previous shot action or composition.'};
}
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
  const cap=mode==='fast'?30:mode==='cinematic'?24:24;
  // Every distinct dialogue turn must have its own planned performance slot. Never alternate
  // speakers mechanically or reuse one speaking shot for multiple character turns.
  const requiredStorySlots=spokenSlots+1;
  return Math.max(floor,Math.min(cap,Math.max(base,requiredStorySlots)));
}
export function buildCoveragePlan(scene={},mode='balanced'){
  const beat=Math.max(1,Number(scene.durationSec)||1),desired=Math.max(1,coverageTargetCount(scene,mode));
  const dialogue=(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(dialogueParts).filter(x=>x.text);
  const clipSec=providerClipSeconds(mode),kinds=shotKinds(),slots=[];
  const progression=(Array.isArray(scene.visualProgression)?scene.visualProgression:[]).map(text).filter(Boolean);
  const visualSlotCount=Math.max(0,desired-dialogue.length);
  const visualBeats=[];
  for(let i=0;i<visualSlotCount;i++){
    if(progression.length){const idx=visualSlotCount===1?0:Math.round(i*(progression.length-1)/Math.max(1,visualSlotCount-1));visualBeats.push(progression[Math.min(progression.length-1,idx)]);}
    else visualBeats.push('');
  }
  // Put an establishing/action shot first when there is room, then preserve dialogue order,
  // then add unique coverage. Story-intelligent scenes supply distinct visual beats; those
  // beats are assigned deterministically so coverage is about narrative progression, not crops.
  let vb=0;if(desired>dialogue.length){const beat=visualBeats[vb++]||'';slots.push({speaking:false,kind:inferBeatKind(beat,0,visualSlotCount),beat})}
  for(const line of dialogue)slots.push({speaking:true,kind:'speaking-medium',line});
  let ki=0;while(slots.length<desired){const beat=visualBeats[vb++]||'';slots.push({speaking:false,kind:beat?inferBeatKind(beat,vb-1,visualSlotCount):kinds[(ki++ + (slots.length?1:0))%kinds.length],beat})}
  // Dialogue performance gets enough planned time for a natural line, within provider limits.
  const narrationSeconds=Math.min(clipSec,Math.max(2,estimateLineSeconds(text(scene.narration))));
  const requested=slots.map((slot,i)=>slot.speaking?Math.min(clipSec,estimateLineSeconds(slot.line?.text||'')):Math.min(clipSec,i===0&&text(scene.narration)?narrationSeconds:2));
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
    const director=shotDirectorBrief(scene,kind,i,slots.length,speaking,slot.beat||'');
    const purpose=speaking?`On-camera performance for ${line?.speaker||'the speaking character'}`:director.objective;
    const visual=speaking?`${line?.speaker||'The speaking character'} is clearly visible in a natural conversational composition. Preserve established identity, wardrobe and environment. No other character appears to speak this line. ${director.action}`:`${director.action}`;
    shots.push({id:`${text(scene.id)||'scene'}-shot-${i+1}`,order:i+1,kind,purpose,visual,camera:speaking?'Stable medium or medium-close performance shot with comfortable headroom, natural eyeline and no unnecessary camera move during dialogue.':`${text(scene.camera)||'Cinematic camera movement'}; make scale, angle and action purpose visibly different from adjacent shots.`,speaker:speaking?(line?.speaker||''):'',spokenLine:speaking?(line?.text||''):'',speaking,narrationSupport:!speaking,directorObjective:director.objective,directorAction:director.action,directorAvoid:director.avoid,storyBeat:slot.beat||'',sceneDramaticPurpose:text(scene.dramaticPurpose||scene.purpose),storyInformation:text(scene.newInformation),emotionalTurn:text(scene.emotionalTurn),continuityLocks:(Array.isArray(scene.continuityLocks)?scene.continuityLocks:[]).map(text).filter(Boolean),continuityObject:sceneActionContext(scene).focalObject,plannerRevision:STORY_TO_SHOT_DIRECTOR_REV,displayText:text(slot.beat||visual||purpose),startSec:roundTenths(start),endSec:roundTenths(end),durationSec:roundTenths(end-start),targetClipSec:clipSec});
    start=end;
  }
  return applyAuthoritativeDialogueOwnership(scene,shots).map(x=>({...x,logicGateRevision:PRODUCTION_LOGIC_GATE_REV}));
}
function sceneHasProducedCoverageMedia(scene={}){
  if(Array.isArray(scene.coverageClips)&&scene.coverageClips.some(x=>x&&(x.url||x.videoUrl||x.storagePath||x.videoStoragePath||x.status||x.ready)))return true;
  return Boolean(scene.videoUrl||scene.videoStoragePath||scene.lipSyncVideoUrl||scene.lipSyncStoragePath||scene.videoStatus==='ready'||scene.lipSyncStatus==='ready');
}
function genericCoveragePlaceholder(value=''){
  const v=text(value).toLowerCase();
  return !v||/orient the viewer before the story beat advances|advance physical action from the prior shot to the next story state|add new cinematic information rather than another take of the same action|show one clear transitional action with beginning, middle and end/.test(v);
}
function modelCoverageLooksDirected(existing=[],scene={}){
  if(!Array.isArray(existing)||existing.length<2)return false;
  const dialogue=(Array.isArray(scene.dialogue)?scene.dialogue:[]).map(dialogueParts).filter(x=>x.text);
  const speaking=existing.filter(x=>Boolean(x?.speaking||text(x?.spokenLine))).length;
  if(speaking!==dialogue.length)return false;
  const concrete=existing.filter(x=>!genericCoveragePlaceholder(x?.visual||x?.purpose||x?.storyBeat)).length;
  return concrete>=Math.max(2,Math.ceil(existing.length*.7));
}
function timeCoveragePlan(scene={},shots=[],mode='balanced'){
  const beat=Math.max(1,Number(scene.durationSec)||1),clipSec=providerClipSeconds(mode),requested=shots.map((shot,i)=>{
    if(shot.speaking)return Math.min(clipSec,Math.max(2.2,estimateLineSeconds(shot.spokenLine||'')));
    const requestedTarget=Number(shot.targetClipSec)||0;
    return Math.min(clipSec,Math.max(1.8,requestedTarget||((i===0&&text(scene.narration))?estimateLineSeconds(text(scene.narration)):clipSec*.8)));
  });
  let sum=requested.reduce((a,b)=>a+b,0)||1;
  if(sum>beat){const scale=beat/sum;for(let i=0;i<requested.length;i++)requested[i]=Math.max(.8,requested[i]*scale);}
  else if(sum<beat){let remain=beat-sum,guard=0;while(remain>.01&&guard++<100){const open=requested.map((v,i)=>v<clipSec-.01?i:-1).filter(i=>i>=0);if(!open.length)break;const share=remain/open.length;let used=0;for(const i of open){const add=Math.min(clipSec-requested[i],share);requested[i]+=add;used+=add}if(used<.001)break;remain-=used}}
  sum=requested.reduce((a,b)=>a+b,0)||1;const scale=beat/sum;let start=0;
  return shots.map((shot,i)=>{const duration=i===shots.length-1?Math.max(.5,beat-start):Math.max(.5,requested[i]*scale),end=Math.min(beat,start+duration),out={...shot,startSec:roundTenths(start),endSec:roundTenths(end),durationSec:roundTenths(end-start),targetClipSec:clipSec};start=end;return out});
}
function compileModelCoverage(scene={},existing=[],mode='balanced'){
  const total=existing.length;
  const shots=existing.map((raw,i)=>{
    const speaking=Boolean(raw?.speaking||text(raw?.spokenLine));
    const line=speaking?dialogueParts(`${text(raw?.speaker)}${raw?.speaker?': ':''}${text(raw?.spokenLine)}`):{speaker:'',text:''};
    const storyBeat=text(raw?.storyBeat||raw?.visual||raw?.purpose);
    const kind=text(raw?.kind)||inferBeatKind(storyBeat,i,total);
    const director=shotDirectorBrief(scene,kind,i,total,speaking,storyBeat);
    return {...raw,id:text(raw?.id)||`${text(scene.id)||'scene'}-shot-${i+1}`,order:i+1,kind,speaking,speaker:speaking?text(raw?.speaker||line.speaker):'',spokenLine:speaking?text(raw?.spokenLine||line.text):'',narrationSupport:raw?.narrationSupport!==false&&!speaking,purpose:text(raw?.purpose)||director.objective,visual:text(raw?.visual)||storyBeat||director.action,camera:text(raw?.camera)||(speaking?'Stable medium or medium-close performance shot with comfortable headroom and natural eyeline.':`${text(scene.camera)||'Cinematic camera movement'}; make the narrative action and composition distinct from adjacent shots.`),directorObjective:director.objective,directorAction:director.action,directorAvoid:director.avoid,storyBeat,sceneDramaticPurpose:text(scene.dramaticPurpose||scene.purpose),storyInformation:text(scene.newInformation),emotionalTurn:text(scene.emotionalTurn),continuityLocks:(Array.isArray(scene.continuityLocks)?scene.continuityLocks:[]).map(text).filter(Boolean),continuityObject:sceneActionContext(scene).focalObject,plannerRevision:STORY_TO_SHOT_DIRECTOR_REV};
  });
  return timeCoveragePlan(scene,applyAuthoritativeDialogueOwnership(scene,shots),mode).map(x=>({...x,logicGateRevision:PRODUCTION_LOGIC_GATE_REV}));
}
export function ensureSceneCoverage(scene={},mode='balanced'){
  const target=coverageTargetCount(scene,mode),generated=buildCoveragePlan(scene,mode);
  const existing=Array.isArray(scene.coveragePlan)?scene.coveragePlan.filter(Boolean):[];
  const produced=sceneHasProducedCoverageMedia(scene);
  const timed=existing.length>0&&existing.every(x=>Number.isFinite(Number(x.startSec))&&Number.isFinite(Number(x.endSec))&&Number(x.endSec)>Number(x.startSec));
  const last=existing[existing.length-1],beat=Math.max(1,Number(scene.durationSec)||1),durationMatches=timed&&Math.abs(Number(last?.endSec)-beat)<.25;
  const current=durationMatches&&existing.every(x=>x.plannerRevision===STORY_TO_SHOT_DIRECTOR_REV);
  const audit=coverageLogicAudit(scene,existing);
  if(current&&audit.ok)return existing;
  // Fresh plans self-heal deterministic production-logic defects before any generation credit can be spent.
  if(current&&!audit.ok&&!produced){
    const repair=repairCoverageLogic(scene,existing,mode);
    if(repair.changed){scene.coveragePlan=repair.repaired;scene.productionLogicAutoFixedAt=new Date().toISOString();scene.productionLogicAutoFixedCodes=repair.autoFixed;}
    if(repair.after.ok)return scene.coveragePlan||repair.repaired;
    if(modelCoverageLooksDirected(existing,scene)){scene.coveragePlan=compileModelCoverage(scene,existing,mode);return scene.coveragePlan}
  }
  // Never reshuffle a shot plan after paid/generated media exists. Media identity and shot order win.
  if(produced&&durationMatches)return existing;
  // Fresh AI plans are authoritative when they contain concrete filmable shot actions. Compile
  // them with CineTale timing/director metadata instead of replacing them with generic coverage.
  if(!produced&&modelCoverageLooksDirected(existing,scene)){
    scene.coveragePlan=compileModelCoverage(scene,existing,mode);return scene.coveragePlan;
  }
  // Migrate older template plans before any media is generated. Rich scene visualProgression is
  // preserved as the visible story beat, so the UI and provider prompts describe what happens.
  scene.coveragePlan=generated.map((shot,i)=>({...shot,plannerRevision:STORY_TO_SHOT_DIRECTOR_REV,logicGateRevision:PRODUCTION_LOGIC_GATE_REV,storyBeat:text(shot.storyBeat)||(Array.isArray(scene.visualProgression)?text(scene.visualProgression[i]||scene.visualProgression.at(-1)):''),displayText:text(shot.storyBeat||shot.visual||shot.purpose)}));
  return scene.coveragePlan;
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
