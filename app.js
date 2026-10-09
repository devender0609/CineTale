import {ensureSceneCoverage,coverageTargetCount,coverageSummary,coverageLogicAudit,repairCoverageLogic} from './lib/production.js';
const APP_VERSION = '1.12.64';
const VOICE_LOCK_AUDIT_TIMEOUT_MS=8000;
const SCENE_EDIT_PIPELINE_REV = 'v1.10.41-auto-editorial-flow';
const LIP_SYNC_PIPELINE_REV = 'v1.9.89-end-to-end-speaking-clip';
const VIDEO_PRODUCTION_PIPELINE_REV = 'v1.9.86-character-shot-contract';
const SHOT_DIRECTOR_PIPELINE_REV = 'v1.10.49-story-to-shot-director';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const storageKey = 'cinetale.clean.projects';
const currentKey = 'cinetale.clean.current';
const themeKey = 'cinetale.clean.theme';
const usageKey = 'cinetale.session.usage';
const savedStoriesKey = 'cinetale.clean.savedStories';
const authSessionKey = 'cinetale.auth.session';
const visualVerificationKey = 'cinetale.session.visualVerification';
const voiceVerificationKey = 'cinetale.session.voiceVerification';
const projectRecoveryKey = 'cinetale.project.recovery.v1';
const voiceAssignmentLedgerKey = 'cinetale.voice.assignments.v1';

const state = {
  format:'Episode', controlMode:'Guided', storySource:'idea', speechListening:false, storyInputMethod:'text',
  projects: safeParse(localStorage.getItem(storageKey), []),
  currentId: localStorage.getItem(currentKey) || null,
  theme: localStorage.getItem(themeKey) || 'light',
  editingProjectId:null,
  usage: safeParse(sessionStorage.getItem(usageKey), {visual:0,audio:0,video:0}),
  savedStories: safeParse(localStorage.getItem(savedStoriesKey), []),
  libraryTab:'stories',
  projectSearch:'', projectStatusFilter:'active', projectSort:'updated',
  authConfig:null, authSession:safeParse(localStorage.getItem(authSessionKey), null), runtimeConfig:{mode:'production',paidGenerationAllowed:true,reason:''},
  autoFinalRunning:false, finalRenderRunning:false, finalRenderProjectId:null, autoFinalCancelRequested:false, autoFinalPauseReason:'', autoFinalResumeScheduled:new Set(), autoVideoSubmissionTimes:[],
  cloudSync:{status:'local',loading:false,applying:false,timer:null,lastError:'',lastSyncedAt:null},
  portraitJobs:new Map(),
  visualCooldownUntil:0, lastVisualErrorCode:'',
  providerHealth:{visual:{status:'unknown',route:'',lastSuccessAt:null,lastErrorAt:null,lastMessage:''}},
  backupVisualVerification:safeParse(sessionStorage.getItem(visualVerificationKey),{status:'unknown',model:'',verifiedAt:null,lastError:''}),
  voiceVerification:safeParse(sessionStorage.getItem(voiceVerificationKey),{status:'unknown',model:'',voiceName:'',verifiedAt:null,lastError:''}),
  ownerAccess:{resolved:false,isOwner:false,configured:false,source:''},
  autoVoiceWarmupScheduled:new Set(),
  voiceLockAuditScheduled:new Set(),
  voiceResolutionContext:null,
  voiceResolutionNavigation:{epoch:0,pending:false},
  // Requested inspection stage is intentionally independent from production eligibility.
  // A creator may inspect Final Assembly while paid production remains gated upstream.
  studioInspectionStage:null,
  projectNavigation:{locked:false,id:null,epoch:0,unlockTimer:null}
};

function safeParse(s,f){try{return JSON.parse(s)||f}catch{return f}}
function voiceAssignmentLedger(){return safeParse(localStorage.getItem(voiceAssignmentLedgerKey),{entries:{}})||{entries:{}}}
function voiceAssignmentLedgerEntryKey(project={},character={},index=0){const pid=String(project?.id||'').trim(),cid=String(character?.id||'').trim(),name=String(character?.name||'').trim().toLowerCase();return `${pid}::${cid||`index-${index}`}::${name}`}
function voiceAssignmentSnapshot(character={}){const out={};for(const key of ['voiceId','voiceName','voiceMode','voiceLocked','voiceSelectionUpdatedAt','voiceRevision','voicePerformance','voicePerformanceMode','voicePace','voicePaceMode','voiceAccentDirection','voiceCustomDirection','voicePreviewLine','voiceConsent','voiceAutoDecision','voiceLockReview','voiceManualOverride','voiceFallback'])if(key in character)out[key]=structuredClone(character[key]);return out}
function persistVoiceAssignmentLedger(project={},character={},index=0){if(!project?.id||!character?.voiceId||!character?.voiceLocked)return false;try{const store=voiceAssignmentLedger();store.entries=store.entries||{};const key=voiceAssignmentLedgerEntryKey(project,character,index);store.entries[key]={projectId:project.id,characterId:character.id||'',characterName:character.name||'',index,updatedAt:character.voiceSelectionUpdatedAt||new Date().toISOString(),voice:voiceAssignmentSnapshot(character)};localStorage.setItem(voiceAssignmentLedgerKey,JSON.stringify(store));return true}catch(err){console.warn('[CineTale voice] Durable voice-assignment ledger unavailable',err);return false}}
function applyVoiceAssignmentLedger(projects=[]){let changed=false;const entries=Object.values(voiceAssignmentLedger().entries||{});for(const entry of entries){const p=(projects||[]).find(x=>String(x?.id||'')===String(entry.projectId||''));if(!p||!Array.isArray(p.characters))continue;const c=p.characters.find(x=>entry.characterId&&String(x?.id||'')===String(entry.characterId))||p.characters.find(x=>String(x?.name||'').trim().toLowerCase()===String(entry.characterName||'').trim().toLowerCase())||p.characters[Number(entry.index)];if(!c||!entry.voice?.voiceId)continue;const ledgerTime=new Date(entry.updatedAt||0).getTime()||0,currentTime=new Date(c.voiceSelectionUpdatedAt||0).getTime()||0;if(ledgerTime<currentTime)continue;for(const [key,value] of Object.entries(entry.voice||{}))c[key]=structuredClone(value);changed=true}return changed}
applyVoiceAssignmentLedger(state.projects);
function authUser(){return state.authSession?.user||null}
function authDisplayName(){const u=authUser();if(!u)return '';return String(u.user_metadata?.display_name||u.email?.split('@')[0]||'Creator').trim()}
function authInitials(){const n=authDisplayName();return (n||'ME').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'ME'}
async function loadAuthConfig(){try{const r=await fetch('/api/auth-config');state.authConfig=await r.json()}catch{state.authConfig={configured:false,requireAuth:false}}try{const rr=await fetch('/api/runtime-config',{cache:'no-store'});if(rr.ok)state.runtimeConfig=await rr.json()}catch{}await restoreAuthFromUrl();await refreshAuthIfNeeded();await syncWorkspaceAfterAuth();await resolveOwnerAccess();renderAccountState();applyOwnerMode()}
function saveAuthSession(session){state.authSession=session||null;if(session)localStorage.setItem(authSessionKey,JSON.stringify(session));else localStorage.removeItem(authSessionKey);if(!session)state.ownerAccess={resolved:true,isOwner:false,configured:state.ownerAccess?.configured||false,source:''};renderAccountState();queueMicrotask(()=>applyOwnerMode())}
function authErrorMessage(err){const raw=String(err?.message||err||'Account request failed.').trim();if(/invalid login credentials/i.test(raw))return 'Email or password is incorrect.';if(/email not confirmed/i.test(raw))return 'Please confirm your email before signing in.';if(/user already registered|already been registered/i.test(raw))return 'An account already exists for this email. Try signing in instead.';if(/password.*weak|password.*short|least 8/i.test(raw))return 'Use a stronger password with at least 8 characters.';if(/rate limit|too many requests/i.test(raw))return 'Too many account attempts. Please wait a little and try again.';return raw}
function authInline(message='',kind='error'){const box=$('#authMessage');if(!box)return;box.textContent=message;box.className=`auth-message ${kind}`;box.classList.toggle('hidden',!message)}
function parseAuthHash(){const h=new URLSearchParams(location.hash.replace(/^#/,''));if(!h.get('access_token'))return null;return {access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:Number(h.get('expires_in')||0),expires_at:Math.floor(Date.now()/1000)+Number(h.get('expires_in')||0),token_type:h.get('token_type')||'bearer',type:h.get('type')||'',user:null}}
async function restoreAuthFromUrl(){const partial=parseAuthHash();if(!partial||!state.authConfig?.configured)return;try{const d=await supabaseAuth('user',{method:'GET',token:partial.access_token});partial.user=d;saveAuthSession(partial);history.replaceState({},document.title,location.pathname+location.search);if(partial.type==='recovery')setTimeout(()=>openPasswordResetModal(),0);else toast(`Signed in as ${authDisplayName()}.`)}catch(e){console.warn('[CineTale auth] OAuth callback could not be restored',e)}}
let authRefreshInFlight=null;
async function refreshAuthIfNeeded({force=false}={}){const s=state.authSession;if(!s?.refresh_token||!state.authConfig?.configured)return Boolean(s?.access_token);const now=Math.floor(Date.now()/1000);if(!force&&Number(s.expires_at||0)>now+120)return true;if(authRefreshInFlight)return authRefreshInFlight;authRefreshInFlight=(async()=>{try{const d=await supabaseAuth('token?grant_type=refresh_token',{body:{refresh_token:s.refresh_token}});saveAuthSession(d);if(state.cloudSync.status==='auth-required')state.cloudSync.status='syncing';return true}catch(err){state.cloudSync.lastError=err?.message||'Session refresh failed.';if([400,401,403].includes(Number(err?.status))){state.cloudSync.status='auth-required';saveAuthSession(null)}else state.cloudSync.status='auth-refresh-pending';renderAccountState();return false}})().finally(()=>{authRefreshInFlight=null});return authRefreshInFlight}
async function ensureFreshAuthForProtectedWork(){if(!state.authConfig?.configured)return true;if(!state.authSession?.access_token)return false;return refreshAuthIfNeeded()}
function productionAuthUnavailable(){return state.authConfig?.configured&&['auth-required'].includes(String(state.cloudSync.status||''))}
function triggerProductionAuthPause(projectId){if(!productionAuthUnavailable())return false;state.autoFinalCancelRequested=true;state.autoFinalPauseReason='auth';autoFinalJobPatch(projectId,{status:'auth-required',stage:'Sign in to continue recovery · existing paid jobs and completed media are preserved',lastError:'CineTale paused before more provider work because the creator session needs to be restored.'});return true}
function renderAccountState(){const u=authUser(),configured=Boolean(state.authConfig?.configured);const text=$('#accountButtonText'),dot=$('#accountDot'),avatar=$('#avatarButton'),badge=$('#accountBadge'),summary=$('#accountSummary'),copy=$('#accountSettingsCopy'),signIn=$('#settingsAccountBtn'),signOut=$('#settingsSignOutBtn'),deleteProfile=$('#deleteProfileWorkspaceBtn');if(text)text.textContent=u?authDisplayName():(configured?'Sign in':'Guest');if(dot)dot.classList.toggle('signed-in',Boolean(u));if(avatar)avatar.textContent=authInitials();if(badge)badge.textContent=u?'Signed in':'Guest';if(summary)summary.innerHTML=u?`<b>${esc(authDisplayName())}</b><span>${esc(u.email||'Creator account')}</span>`:`<b>Guest workspace</b><span>Your projects are stored in this browser.</span>`;if(copy)copy.textContent=u?(state.cloudSync.status==='synced'?'Signed in · workspace synced to your profile.':state.cloudSync.status==='unavailable'?'Signed in · browser save active; cloud workspace table is not configured yet.':'Signed in · CineTale is syncing your workspace.'):'Continue as a guest or sign in to your creator profile.';if(signIn){signIn.textContent=u?'Account details':'Sign in / create account';signIn.classList.toggle('ghost',Boolean(u));signIn.classList.toggle('primary',!u)}if(signOut)signOut.classList.toggle('hidden',!u);if(deleteProfile)deleteProfile.classList.toggle('hidden',!u)}
async function supabaseAuth(path,{method='POST',body,token}={}){const c=state.authConfig;if(!c?.configured)throw new Error('Cloud sign-in is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.');const base=String(c.url||'').replace(/\/+$/,'');const r=await fetch(`${base}/auth/v1/${path}`,{method,headers:{apikey:c.anonKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(d.msg||d.message||d.error_description||d.error||'Account request failed.');err.status=r.status;err.details=d;throw err}return d}

async function supabaseWorkspace(path,{method='GET',body,prefer}={}){
  const attempt=async()=>{const c=state.authConfig,token=state.authSession?.access_token;if(!c?.configured||!token)throw Object.assign(new Error('Cloud workspace requires sign-in.'),{status:401});const base=String(c.url||'').replace(/\/+$/,'');const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:c.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let d=null;try{d=text?JSON.parse(text):null}catch{d=text}if(!r.ok){const err=new Error(d?.message||d?.details||d?.hint||`Cloud workspace request failed (${r.status}).`);err.status=r.status;err.details=d;throw err}return d};
  await ensureFreshAuthForProtectedWork();try{return await attempt()}catch(err){if(![401,403].includes(Number(err?.status)))throw err;const refreshed=await refreshAuthIfNeeded({force:true});if(refreshed)return attempt();state.cloudSync.status='auth-required';state.cloudSync.lastError='Sign in again to continue cloud recovery. Browser-saved production state remains preserved.';renderAccountState();throw err}
}
function cloudPayload(){return {schemaVersion:2,projects:persistableProjects(),savedStories:state.savedStories||[],currentId:state.currentId||null}}
function voiceSelectionStamp(c={}){return new Date(c.voiceSelectionUpdatedAt||0).getTime()||0}
function mergeCharacterVoiceSelections(base={},other={}){
  const b=structuredClone(base||{}),others=Array.isArray(other?.characters)?other.characters:[];
  if(!Array.isArray(b.characters))return b;
  b.characters=b.characters.map((c,i)=>{
    const alt=others.find(x=>x?.id&&c?.id&&x.id===c.id)||others.find(x=>normalizeName(x?.name)===normalizeName(c?.name))||others[i];
    if(!alt||voiceSelectionStamp(alt)<=voiceSelectionStamp(c))return c;
    for(const key of ['voiceId','voiceName','voiceMode','voiceLocked','voiceSelectionUpdatedAt','voiceRevision','voicePerformance','voicePerformanceMode','voicePace','voicePaceMode','voiceAccentDirection','voiceCustomDirection','voicePreviewLine','voiceConsent','voiceAutoDecision','voiceLockReview','voiceManualOverride','voiceFallback']){
      if(key in alt)c[key]=structuredClone(alt[key]);
    }
    return c;
  });
  return b;
}
function projectRecoveryStore(){return safeParse(localStorage.getItem(projectRecoveryKey),{projects:{}})||{projects:{}}}
function writeProjectRecoveryStore(store){try{localStorage.setItem(projectRecoveryKey,JSON.stringify(store))}catch(e){console.warn('[CineTale recovery] Snapshot save unavailable',e)}}
function captureProjectRecoverySnapshot(project={}){
  if(!project?.id)return false;const episodes=(project.episodes||[]).filter(ep=>Array.isArray(ep.scenes)&&ep.scenes.length);if(!episodes.length)return false;
  const store=projectRecoveryStore();store.projects=store.projects||{};const list=Array.isArray(store.projects[project.id])?store.projects[project.id]:[];
  const payload=stripTransientMedia(structuredClone({at:new Date().toISOString(),updatedAt:project.updatedAt||project.createdAt||'',title:project.title||'',episodes}));
  list.unshift(payload);store.projects[project.id]=list.slice(0,5);writeProjectRecoveryStore(store);return true;
}
function episodeRecoverySnapshots(project={},episode={}){
  const store=projectRecoveryStore(),list=store.projects?.[project.id]||[],out=[];
  for(const snap of list)for(const ep of snap.episodes||[]){const sameId=episode?.id&&ep?.id&&String(ep.id)===String(episode.id),sameNumber=Number(ep?.number)===Number(episode?.number),sameTitle=episode?.title&&ep?.title&&String(ep.title)===String(episode.title);if(sameId||sameNumber||sameTitle)out.push(ep)}
  return out.sort((a,b)=>(b.scenes?.length||0)-(a.scenes?.length||0));
}
function mediaBearingSceneScore(scene={}){let n=0;if(scene.videoLocalMediaKey||scene.videoStoragePath||scene.videoUrl)n+=4;if(scene.lipSyncLocalMediaKey||scene.lipSyncStoragePath||scene.lipSyncVideoUrl)n+=5;n+=(scene.coverageClips||[]).filter(x=>x.videoLocalMediaKey||x.videoStoragePath||x.videoUrl).length*2;return n}
function mergeSceneProductionState(base={},other={}){
  const out=structuredClone(base||{});if(!other)return out;
  const keys=['image','imageAssetKey','imageMode','videoUrl','videoOperation','videoQueuedAt','videoError','videoPlaybackError','videoLocalMediaKey','videoStoragePath','videoMediaPersistedAt','videoMediaOwnership','videoMediaExpired','videoCloudMissing','videoDurableVerifiedAt','videoDurationSec','videoPrimaryShotId','videoPrimarySpeaking','videoPrimarySpeaker','videoPrimarySpokenLine','videoPrimaryStartSec','videoPrimaryEndSec','videoPrimaryPlannedDurationSec','videoProductionContract','videoSpeechGuide','lipSyncVideoUrl','lipSyncRemoteVideoUrl','lipSyncStoragePath','lipSyncLocalMediaKey','lipSyncProvider','lipSyncGenerationId','lipSyncSourceVideoUrl','lipSyncGeneratedAt','lipSyncSignature','lipSyncAudioSignature','lipSyncAudioDigest','lipSyncRequestDigest','lipSyncProductionContract','lipSyncOperation','lipSyncStatusUrl','lipSyncResponseUrl','lipSyncModel','lipSyncStatus','lipSyncValidated','lipSyncProviderStatus','lipSyncEmbeddedAudioVerified','lipSyncProviderAudioAuthoritative','lipSyncMediaPersistedAt','lipSyncMediaOwnership','lipSyncDurableVerifiedAt','coverageClips','coveragePlan','shotTimelineVersion'];
  if(mediaBearingSceneScore(other)>mediaBearingSceneScore(out))for(const key of keys)if(other[key]!==undefined&&other[key]!==null&&other[key]!==''&&(!(Array.isArray(other[key]))||other[key].length))out[key]=structuredClone(other[key]);
  return out;
}
function mergeProjectProductionState(base={},other={}){
  const out=structuredClone(base||{});if(!other||String(out.id||'')!==String(other.id||''))return out;out.episodes=Array.isArray(out.episodes)?out.episodes:[];
  for(const oldEp of other.episodes||[]){let ep=out.episodes.find(x=>x?.id&&oldEp?.id&&String(x.id)===String(oldEp.id))||out.episodes.find(x=>Number(x?.number)===Number(oldEp?.number));if(!ep)continue;const oldScenes=Array.isArray(oldEp.scenes)?oldEp.scenes:[];if(!Array.isArray(ep.scenes)||(!ep.scenes.length&&oldScenes.length)){ep.scenes=structuredClone(oldScenes);continue}ep.scenes=ep.scenes.map((scene,i)=>{const old=oldScenes.find(x=>x?.id&&scene?.id&&String(x.id)===String(scene.id))||oldScenes.find(x=>Number(x?.number)===Number(scene?.number))||oldScenes[i];return old?mergeSceneProductionState(scene,old):scene})}
  if(!out.finalAssembly&&other.finalAssembly)out.finalAssembly=structuredClone(other.finalAssembly);if(!out.finalVideoMeta&&other.finalVideoMeta)out.finalVideoMeta=structuredClone(other.finalVideoMeta);return mergeCharacterVoiceSelections(out,other)
}
function mergeWorkspace(local,cloud){
  const byId=new Map();for(const p of [...(cloud.projects||[]),...(local.projects||[])]){const prev=byId.get(p.id);if(!prev){byId.set(p.id,p);continue}const pTime=new Date(p.updatedAt||p.createdAt||0),prevTime=new Date(prev.updatedAt||prev.createdAt||0);const newer=pTime>=prevTime?p:prev,older=pTime>=prevTime?prev:p;byId.set(p.id,mergeCharacterVoiceSelections(newer,older))}
  const stories=new Map();for(const x of [...(cloud.savedStories||[]),...(local.savedStories||[])]){const k=x.id||`${x.title||''}:${x.createdAt||''}`;const prev=stories.get(k);if(!prev||new Date(x.updatedAt||x.createdAt||0)>=new Date(prev.updatedAt||prev.createdAt||0))stories.set(k,x)}
  const projects=[...byId.values()].sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
  const currentId=(local.currentId&&byId.has(local.currentId)?local.currentId:(cloud.currentId&&byId.has(cloud.currentId)?cloud.currentId:projects[0]?.id||null));
  return {projects,savedStories:[...stories.values()],currentId};
}
function cloudUnavailable(err){return err?.status===404||/relation .*cinetale_workspaces.* does not exist|could not find the table|schema cache/i.test(String(err?.message||''))}
function cloudPermissionError(err){return err?.status===401||err?.status===403||/permission denied|insufficient privilege|row-level security|violates row-level security/i.test(String(err?.message||''))}
async function syncWorkspaceAfterAuth(){
  if(!authUser()||!state.authConfig?.configured)return;
  if(state.cloudSync.loading)return;state.cloudSync.loading=true;state.cloudSync.status='syncing';renderAccountState();
  try{
    const syncEpoch=state.projectNavigation.epoch;
    const uid=authUser().id;const rows=await supabaseWorkspace(`cinetale_workspaces?user_id=eq.${encodeURIComponent(uid)}&select=payload,updated_at&limit=1`);
    const local=cloudPayload();const cloud=Array.isArray(rows)&&rows[0]?.payload?rows[0].payload:null;
    // Cloud profile: treat it as authoritative for project existence so a stale browser copy cannot resurrect deleted projects; never let a newer sparse/empty project copy
    // erase richer production state for the SAME project that is still present in this browser.
    // This preserves deletion semantics while protecting generated scene/video work.
    for(const lp of local.projects||[])captureProjectRecoverySnapshot(lp);
    const localById=new Map((local.projects||[]).map(p=>[String(p.id||''),p]));
    const resolved=cloud?{projects:(Array.isArray(cloud.projects)?cloud.projects:[]).map(cp=>mergeProjectProductionState(cp,localById.get(String(cp.id||'')))),savedStories:Array.isArray(cloud.savedStories)?cloud.savedStories:[],currentId:cloud.currentId||null}:local;
    const selectedBeforeSync=state.currentId;
    state.cloudSync.applying=true;state.projects=resolved.projects;applyVoiceAssignmentLedger(state.projects);state.savedStories=resolved.savedStories;
    const navigationActive=state.projectNavigation.locked||state.projectNavigation.epoch!==syncEpoch;
    const preferredId=navigationActive?state.projectNavigation.id:selectedBeforeSync;
    state.currentId=preferredId&&resolved.projects.some(p=>p.id===preferredId)?preferredId:(resolved.currentId&&resolved.projects.some(p=>p.id===resolved.currentId)?resolved.currentId:(resolved.projects[0]?.id||null));
    localStorage.setItem(storageKey,JSON.stringify(persistableProjects()));localStorage.setItem(savedStoriesKey,JSON.stringify(state.savedStories));if(state.currentId)localStorage.setItem(currentKey,state.currentId);else localStorage.removeItem(currentKey);state.cloudSync.applying=false;
    await pushCloudWorkspace();
    for(const project of state.projects||[]){if(project?.autoFinalJob?.status==='auth-required'){project.autoFinalJob={...project.autoFinalJob,status:'paused',stage:'Session restored · resume production to continue preserved provider jobs safely',updatedAt:new Date().toISOString()}}}
    localStorage.setItem(storageKey,JSON.stringify(persistableProjects()));
    // A project navigation already owns the UI; do not replace its live target mid-click.
    if(!state.projectNavigation.locked)renderAll();else{renderAccountState();renderStudio()}
  }catch(err){state.cloudSync.applying=false;if(cloudUnavailable(err)){state.cloudSync.status='unavailable';state.cloudSync.lastError='Cloud workspace table not configured.';console.warn('[CineTale cloud] Optional cloud workspace table is not configured.',err)}else{state.cloudSync.status='error';state.cloudSync.lastError=err.message||String(err);console.warn('[CineTale cloud] Workspace sync failed',err)}}finally{state.cloudSync.loading=false;renderAccountState()}
}
async function pushCloudWorkspace(){
  if(state.cloudSync.applying||!authUser()||!state.authConfig?.configured||state.cloudSync.status==='unavailable')return;
  try{await supabaseWorkspace('cinetale_workspaces?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:authUser().id,payload:cloudPayload(),updated_at:new Date().toISOString()}});state.cloudSync.status='synced';state.cloudSync.lastError='';state.cloudSync.lastSyncedAt=new Date().toISOString();renderAccountState()}catch(err){if(cloudUnavailable(err)){state.cloudSync.status='unavailable';state.cloudSync.lastError='Cloud workspace table not configured.'}else if([401,403].includes(Number(err?.status))){state.cloudSync.status='auth-required';state.cloudSync.lastError='Sign in again to continue cloud recovery. Browser-saved production state remains preserved.'}else{state.cloudSync.status='error';state.cloudSync.lastError=err.message||String(err)}console.warn('[CineTale cloud] Save failed',err);renderAccountState()}
}
function scheduleCloudSave(){if(state.cloudSync.applying||!authUser()||!state.authConfig?.configured||state.cloudSync.status==='unavailable')return;clearTimeout(state.cloudSync.timer);state.cloudSync.status='syncing';state.cloudSync.timer=setTimeout(()=>pushCloudWorkspace(),700)}
async function fileToReferenceDataUrl(file){
  if(!file?.type?.startsWith('image/'))throw new Error('Choose an image file.');if(file.size>15*1024*1024)throw new Error('Choose a photo smaller than 15 MB.');
  const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read that photo.'));r.readAsDataURL(file)});
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('That image could not be opened.'));i.src=raw});
  const max=768,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);return canvas.toDataURL('image/jpeg',.84)
}
function signInWithGoogle(){const c=state.authConfig;if(!c?.configured){openAccountModal('signin');authInline('Cloud sign-in is not configured yet.','error');return}const base=String(c.oauthUrl||c.url||'').replace(/\/+$/,'');const redirect=location.origin+location.pathname;const params=new URLSearchParams({provider:'google',redirect_to:redirect,prompt:'select_account'});location.assign(`${base}/auth/v1/authorize?${params.toString()}`)}
async function requestPasswordReset(email){const clean=String(email||'').trim();if(!clean)throw new Error('Enter your email first.');const redirect=location.origin+location.pathname;await supabaseAuth(`recover?redirect_to=${encodeURIComponent(redirect)}`,{body:{email:clean}})}
function openPasswordResetModal(){const token=state.authSession?.access_token;if(!token)return;$('#modalBody').innerHTML=`<form class="modal-form account-form" id="passwordResetForm"><span class="kicker">ACCOUNT SECURITY</span><h2>Choose a new password</h2><p>Use at least 8 characters. Your new password will replace the previous one.</p><label class="field password-field"><span>New password</span><div class="password-wrap"><input id="newAuthPassword" type="password" minlength="8" required placeholder="At least 8 characters"><button class="password-toggle" type="button" id="newPasswordToggle" aria-label="Show password">Show</button></div></label><div id="authMessage" class="auth-message hidden" role="alert"></div><button class="primary large" type="submit">Update password</button></form>`;$('#modal').classList.remove('hidden');$('#newPasswordToggle').onclick=()=>togglePasswordVisibility('#newAuthPassword','#newPasswordToggle');$('#passwordResetForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent='Updating…';try{await supabaseAuth('user',{method:'PUT',token,body:{password:$('#newAuthPassword').value}});authInline('Password updated. You can continue using CineTale.','success');setTimeout(closeModal,900)}catch(err){authInline(authErrorMessage(err),'error')}finally{b.disabled=false;b.textContent='Update password'}}}
function togglePasswordVisibility(inputSelector,buttonSelector){const input=$(inputSelector),button=$(buttonSelector);if(!input||!button)return;const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show';button.setAttribute('aria-label',show?'Hide password':'Show password')}
function openAccountModal(mode='signin'){
  const u=authUser();
  if(u){const syncCopy=state.cloudSync.status==='synced'?'Your projects and saved stories are synced to this profile, with browser autosave kept as a safety copy.':state.cloudSync.status==='unavailable'?'Your account is connected. Browser autosave is active, but the optional cloud workspace table is not configured on this Supabase project yet.':'Your account is connected. CineTale is syncing your workspace.';$('#modalBody').innerHTML=`<div class="account-modal-head"><span class="kicker">CREATOR ACCOUNT</span><h2>${esc(authDisplayName())}</h2><p>${esc(u.email||'Signed in')}</p></div><div class="account-modal-note"><b>${state.cloudSync.status==='synced'?'Cloud workspace synced':'Account connected'}</b><span>${esc(syncCopy)}</span></div><div class="modal-actions"><button type="button" class="ghost" id="accountModalClose">Close</button><button type="button" class="ghost danger" id="accountModalSignOut">Sign out</button></div>`;$('#modal').classList.remove('hidden');$('#accountModalClose').onclick=closeModal;$('#accountModalSignOut').onclick=signOutAccount;return}
  const configured=Boolean(state.authConfig?.configured);
  $('#modalBody').innerHTML=`<form class="modal-form account-form" id="accountForm"><span class="kicker">CREATOR ACCOUNT</span><h2>${mode==='signup'?'Create your CineTale account':'Welcome back'}</h2><p>${configured?'Use email and password or continue securely with Google.':'Cloud sign-in is not configured on this deployment yet. You can keep using CineTale as a guest.'}</p>${configured?`<button class="google-auth-btn" type="button" id="googleAuthBtn"><span class="google-g">G</span><span>Continue with Google</span></button><div class="auth-divider"><span>or</span></div>`:''}${mode==='signup'?`<label class="field"><span>Display name</span><input id="authName" autocomplete="name" placeholder="Creator name"></label>`:''}<label class="field"><span>Email</span><input id="authEmail" type="email" autocomplete="email" required placeholder="you@example.com"></label><label class="field password-field"><span>Password</span><div class="password-wrap"><input id="authPassword" type="password" autocomplete="${mode==='signup'?'new-password':'current-password'}" minlength="8" required placeholder="At least 8 characters"><button class="password-toggle" type="button" id="authPasswordToggle" aria-label="Show password">Show</button></div></label>${mode==='signin'?`<div class="auth-help-row"><button type="button" class="text-button" id="forgotPasswordBtn">Forgot password?</button></div>`:''}<div id="authMessage" class="auth-message hidden" role="alert"></div><button class="primary large" type="submit" ${configured?'':'disabled'}>${mode==='signup'?'Create account':'Sign in'}</button><div class="account-switch">${mode==='signup'?'Already have an account?':'New to CineTale?'} <button type="button" class="text-button" id="authSwitch">${mode==='signup'?'Sign in':'Create account'}</button></div>${!configured?`<div class="account-modal-note"><b>Guest mode is ready now.</b><span>To activate accounts, add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel.</span></div>`:''}<div class="modal-actions"><button type="button" class="ghost" id="authGuest">Continue as guest</button></div></form>`;
  $('#modal').classList.remove('hidden');
  $('#authSwitch').onclick=()=>openAccountModal(mode==='signup'?'signin':'signup');
  $('#authGuest').onclick=closeModal;
  $('#authPasswordToggle').onclick=()=>togglePasswordVisibility('#authPassword','#authPasswordToggle');
  if($('#googleAuthBtn'))$('#googleAuthBtn').onclick=signInWithGoogle;
  if($('#forgotPasswordBtn'))$('#forgotPasswordBtn').onclick=async()=>{const email=$('#authEmail').value.trim();authInline('', 'error');try{await requestPasswordReset(email);authInline('Password reset email sent. Check your inbox.','success')}catch(err){authInline(authErrorMessage(err),'error')}};
  $('#accountForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPassword').value;const submit=e.submitter;authInline('', 'error');submit.disabled=true;submit.textContent=mode==='signup'?'Creating…':'Signing in…';try{let d;if(mode==='signup'){d=await supabaseAuth('signup',{body:{email,password,data:{display_name:$('#authName')?.value.trim()||email.split('@')[0]}}});if(!d.access_token){authInline('Account created. Check your email to confirm your address, then sign in.','success');submit.textContent='Account created';return}}else d=await supabaseAuth('token?grant_type=password',{body:{email,password}});saveAuthSession(d);await syncWorkspaceAfterAuth();await resolveOwnerAccess();applyOwnerMode();closeModal();toast(`Signed in as ${authDisplayName()}.`)}catch(err){authInline(authErrorMessage(err),'error')}finally{submit.disabled=false;if(submit.textContent!=='Account created')submit.textContent=mode==='signup'?'Create account':'Sign in'}}
}
async function signOutAccount(){const token=state.authSession?.access_token;try{if(token&&state.authConfig?.configured)await supabaseAuth('logout',{token})}catch{}saveAuthSession(null);closeModal();toast('Signed out. Your browser-local workspace is still available.')}
async function deleteProfileWorkspace(){if(!authUser()){toast('Sign in first.');return}if(!confirm('Delete every CineTale project, saved story, and account-saved final video from this profile and this browser? This cannot be undone unless you exported a backup. Your sign-in account will remain active.'))return;try{const finalPaths=state.projects.flatMap(projectFinalVideoCloudPaths);if(finalPaths.length)await deleteFinalVideoCloudPaths(finalPaths);if(state.cloudSync.status!=='unavailable')await supabaseWorkspace(`cinetale_workspaces?user_id=eq.${encodeURIComponent(authUser().id)}`,{method:'DELETE',prefer:'return=minimal'});state.projects=[];state.savedStories=[];state.currentId=null;state.cloudSync.applying=true;localStorage.removeItem(storageKey);localStorage.removeItem(savedStoriesKey);localStorage.removeItem(currentKey);state.cloudSync.applying=false;state.cloudSync.status=state.cloudSync.status==='unavailable'?'unavailable':'synced';renderAll();renderAccountState();toast('Profile workspace and saved final videos deleted.')}catch(err){toast(err.message||'Could not delete the profile workspace.')}}
function exportWorkspace(){const payload={product:'CineTale Studio',version:APP_VERSION,exportedAt:new Date().toISOString(),projects:persistableProjects(),savedStories:state.savedStories};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`cinetale-workspace-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Workspace backup exported.')}
async function importWorkspaceFile(file){if(!file)return;let d;try{d=JSON.parse(await file.text())}catch{toast('That file is not a valid CineTale JSON backup.');return}if(!Array.isArray(d.projects)||!Array.isArray(d.savedStories)){toast('This backup does not contain the expected CineTale workspace data.');return}if(!confirm(`Import ${d.projects.length} projects and ${d.savedStories.length} saved stories? This will replace the current browser workspace.`))return;state.projects=d.projects;applyVoiceAssignmentLedger(state.projects);state.savedStories=d.savedStories;state.currentId=state.projects[0]?.id||null;save();renderAll();toast('Workspace backup imported.')}
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
function dialogueEntries(value){return Array.isArray(value)?value:(value==null?[]:[value])}
function dialogueList(value){return dialogueEntries(value).map(dialogueText).filter(Boolean)}
function dialogueParts(entry){
  const raw=dialogueText(entry).trim();
  const m=raw.match(/^([^:]{1,80}):\s*(.+)$/s);
  return m?{speaker:m[1].trim(),text:m[2].trim()}:{speaker:'',text:raw};
}
function normalizeName(value=''){return String(value||'').toLowerCase().normalize('NFKC').replace(/[^a-z0-9\p{L}\p{M}]+/gu,' ').replace(/\s+/g,' ').trim()}
const IDENTITY_TITLE_WORDS=new Set(['mr','mrs','ms','miss','dr','prof','sir','lady','lord','goddess','god','baby','bal','devi','mata','shri','sri','bhagwan','भगवान','देवी','माता','श्री','बाल','कुमार','कुमारी']);
const IDENTITY_GENERIC_ROLE_WORDS=new Set(['mother','father','mom','mum','dad','brother','sister','son','daughter','child','माँ','मां','पिता','भाई','बहन','पुत्र','पुत्री']);
const SACRED_IDENTITY_ALIAS_FAMILIES=[
  ['ganesha','ganesh','lord ganesha','bal ganesha','बाल गणेश','गणेश','विनायक','vinayaka','ganapati','गणपति'],
  ['kartikeya','lord kartikeya','bal kartikeya','बाल कार्तिकेय','कार्तिकेय','skanda','स्कंद','murugan','मुरुगन','subrahmanya','subramanya'],
  ['parvati','goddess parvati','mata parvati','माता पार्वती','पार्वती','uma','उमा','gauri','गौरी'],
  ['shiva','lord shiva','भगवान शिव','शिव','mahadev','महादेव'],
  ['krishna','lord krishna','कृष्ण','श्री कृष्ण','गोपाल','gopal'],
  ['rama','ram','lord rama','राम','श्री राम'],
  ['sita','सीता','mata sita','माता सीता'],
  ['lakshmi','लक्ष्मी','goddess lakshmi','माता लक्ष्मी'],
  ['saraswati','सरस्वती','goddess saraswati','माता सरस्वती'],
  ['durga','दुर्गा','goddess durga','माता दुर्गा'],
  ['hanuman','हनुमान','lord hanuman','बजरंगबली'],
  ['vishnu','विष्णु','lord vishnu','भगवान विष्णु']
].map(f=>f.map(normalizeName));
function stripIdentityTitles(value=''){let out=normalizeName(value),last='';const title=/^(mr|mrs|ms|miss|dr|prof|sir|lady|lord|goddess|god|baby|bal|devi|mata|shri|sri|bhagwan|भगवान|देवी|माता|श्री|बाल|कुमार|कुमारी)(?:\s+|$)/u;while(out&&out!==last){last=out;out=out.replace(title,'').trim()}return out}
function identityEditDistance(a='',b=''){const x=Array.from(String(a||'')),y=Array.from(String(b||''));if(!x.length)return y.length;if(!y.length)return x.length;let prev=Array.from({length:y.length+1},(_,i)=>i),curr=new Array(y.length+1);for(let i=1;i<=x.length;i++){curr[0]=i;for(let j=1;j<=y.length;j++)curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));[prev,curr]=[curr,prev]}return prev[y.length]}
function normalizeSpeakerAlias(value=''){return stripIdentityTitles(String(value||'').replace(/\([^)]*\)/g,' ').replace(/[“”"'`]/g,' '))}
function identityAliasParts(value=''){const raw=String(value||'').trim();if(!raw)return [];return raw.split(/[\n,;|/]+/).map(x=>x.replace(/\([^)]*\)/g,' ').trim()).filter(Boolean)}
function characterIdentityAliases(character={}){
  const values=[character.name,character.displayName,character.canonicalName,character.role,character.sacredIdentity,character.canonicalIdentity,character.sacredFigure,character.mythologicalIdentity,character.originName];
  if(Array.isArray(character.aliases))values.push(...character.aliases);else values.push(...identityAliasParts(character.aliases));
  const raw=values.flatMap(identityAliasParts).filter(Boolean),norms=new Set();
  for(const value of raw){const full=normalizeName(value),stripped=normalizeSpeakerAlias(value);if(full)norms.add(full);if(stripped)norms.add(stripped)}
  for(const family of SACRED_IDENTITY_ALIAS_FAMILIES){if(family.some(alias=>norms.has(alias)))for(const alias of family)norms.add(alias)}
  return [...norms];
}
function speakerIdentityKeys(value=''){const full=normalizeName(value),stripped=normalizeSpeakerAlias(value),keys=new Set([full,stripped].filter(Boolean));const tokens=(stripped||full).split(/\s+/).filter(Boolean);if(tokens.length>1){for(const t of tokens)if(!IDENTITY_TITLE_WORDS.has(t)&&!IDENTITY_GENERIC_ROLE_WORDS.has(t))keys.add(t)}for(const family of SACRED_IDENTITY_ALIAS_FAMILIES){if(family.some(alias=>keys.has(alias)))for(const alias of family)keys.add(alias)}return [...keys]}
function ensureCharacterIdentityIds(p){if(!p)return p;p.characters=Array.isArray(p.characters)?p.characters:[];for(const c of p.characters)c.id=c.id||uid('c');return p}
function identityProfileScore(keys=[],aliases=[]){let score=0;for(const key of keys){if(!key)continue;for(const alias of aliases){if(!alias)continue;if(alias===key)score=Math.max(score,100);else if(key.length>=3&&(alias.includes(key)||key.includes(alias)))score=Math.max(score,65);else{const compactKey=key.replace(/\s+/g,''),compactAlias=alias.replace(/\s+/g,'');const minLen=Math.min(Array.from(compactKey).length,Array.from(compactAlias).length),maxLen=Math.max(Array.from(compactKey).length,Array.from(compactAlias).length);if(minLen>=5&&maxLen-minLen<=1&&identityEditDistance(compactKey,compactAlias)<=1)score=Math.max(score,90)}const kt=new Set(key.split(/\s+/).filter(Boolean)),at=new Set(alias.split(/\s+/).filter(Boolean));let overlap=0;for(const t of kt)if(t.length>=2&&at.has(t)&&!IDENTITY_TITLE_WORDS.has(t)&&!IDENTITY_GENERIC_ROLE_WORDS.has(t))overlap++;if(overlap)score=Math.max(score,20+overlap*15)}}return score}
function resolveCharacterIdentity(p,{speaker='',characterId=''}={}){
  ensureCharacterIdentityIds(p);const chars=p?.characters||[],keys=speakerIdentityKeys(speaker),stable=characterIndexById(p,characterId);
  if(stable>=0)return {status:'resolved',index:stable,character:chars[stable],reason:'stable-id'};
  if(!keys.length)return {status:'missing',index:-1,character:null,reason:'empty-speaker'};
  const profiles=chars.map((c,index)=>({index,c,aliases:characterIdentityAliases(c)})),scored=profiles.map(x=>({...x,score:identityProfileScore(keys,x.aliases)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(scored.length&&scored[0].score>=65&&(scored.length===1||scored[0].score>scored[1].score))return {status:'resolved',index:scored[0].index,character:scored[0].c,reason:stable>=0?'speaker-overrode-stale-id':'scored-alias'};
  if(scored.length>1&&scored[0].score>=65&&scored[1]?.score===scored[0].score)return {status:'ambiguous',index:-1,character:null,reason:'alias-score-collision',candidates:scored.filter(x=>x.score===scored[0].score).map(x=>x.index)};
  const meaningful=keys.filter(k=>k.length>=2&&!IDENTITY_TITLE_WORDS.has(k)&&!IDENTITY_GENERIC_ROLE_WORDS.has(k));const hits=profiles.filter(x=>x.aliases.some(a=>meaningful.some(k=>a.split(/\s+/).includes(k))));if(hits.length===1)return {status:'resolved',index:hits[0].index,character:hits[0].c,reason:'unique-token'};if(hits.length>1)return {status:'ambiguous',index:-1,character:null,reason:'token-collision',candidates:hits.map(x=>x.index)};
  return {status:'missing',index:-1,character:null,reason:stable>=0?'stale-id-speaker-mismatch':'no-match'};
}
function resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker='',shotSpeaker='',fallbackSpeakers=[],characterIds=[]}={}){
  ensureCharacterIdentityIds(p);
  const diagnostics=[];
  const dialogueValue=String(dialogueSpeaker||'').trim(),shotValue=String(shotSpeaker||'').trim();
  const dialogueMatch=dialogueValue?resolveCharacterIdentity(p,{speaker:dialogueValue}):{status:'missing',index:-1,character:null,reason:'empty-dialogue-speaker'};
  const shotMatch=shotValue?resolveCharacterIdentity(p,{speaker:shotValue}):{status:'missing',index:-1,character:null,reason:'empty-shot-speaker'};
  if(dialogueValue)diagnostics.push({kind:'dialogue-speaker',value:dialogueValue,status:dialogueMatch.status,reason:dialogueMatch.reason,index:dialogueMatch.index});
  if(shotValue)diagnostics.push({kind:'shot-speaker',value:shotValue,status:shotMatch.status,reason:shotMatch.reason,index:shotMatch.index});
  // Current story dialogue is authoritative when it resolves uniquely. If it does not, the
  // current shot owner is the next authority. Old persisted IDs are fallback evidence only.
  if(dialogueMatch.status==='resolved')return {...dialogueMatch,reason:'authoritative-dialogue-speaker',diagnostics};
  if(shotMatch.status==='resolved')return {...shotMatch,reason:'authoritative-shot-speaker',diagnostics};
  const fallback=(fallbackSpeakers||[]).map(x=>String(x||'').trim()).filter(Boolean);
  const consensus=resolveCharacterIdentityConsensus(p,{characterIds,speakerHints:fallback});
  const all=[...diagnostics,...(consensus.diagnostics||[])];
  // If a current label is ambiguous and no other current label resolves it, never let a stale
  // persisted ID silently choose a different person.
  if(dialogueMatch.status==='ambiguous'||shotMatch.status==='ambiguous'){
    if(consensus.status==='resolved'){
      const currentCandidates=[...(dialogueMatch.candidates||[]),...(shotMatch.candidates||[])];
      if(currentCandidates.length&&!currentCandidates.includes(consensus.index))return {status:'ambiguous',index:-1,character:null,reason:'current-label-conflicts-with-persisted-id',candidates:[...new Set([...currentCandidates,consensus.index])],diagnostics:all};
    }
  }
  return {...consensus,diagnostics:all};
}
function resolveCharacterIdentityConsensus(p,{characterIds=[],speakerHints=[]}={}){
  ensureCharacterIdentityIds(p);const chars=p?.characters||[],stableHits=[],nameHits=[],diagnostics=[];
  for(const rawId of characterIds){const id=String(rawId||'').trim();if(!id)continue;const idx=characterIndexById(p,id);if(idx>=0)stableHits.push(idx);else diagnostics.push({kind:'stale-id',value:id})}
  const stableUnique=[...new Set(stableHits)];if(stableUnique.length>1)return {status:'ambiguous',index:-1,character:null,reason:'conflicting-stable-ids',candidates:stableUnique,diagnostics};
  for(const raw of speakerHints){const hint=String(raw||'').trim();if(!hint)continue;const m=resolveCharacterIdentity(p,{speaker:hint});diagnostics.push({kind:'speaker-hint',value:hint,status:m.status,reason:m.reason,index:m.index});if(m.status==='resolved')nameHits.push(m.index)}
  const nameUnique=[...new Set(nameHits)];
  if(stableUnique.length===1){const idx=stableUnique[0];if(nameUnique.some(x=>x!==idx))return {status:'ambiguous',index:-1,character:null,reason:'stable-id-speaker-conflict',candidates:[idx,...nameUnique.filter(x=>x!==idx)],diagnostics};return {status:'resolved',index:idx,character:chars[idx],reason:'stable-id-consensus',diagnostics}}
  if(nameUnique.length===1)return {status:'resolved',index:nameUnique[0],character:chars[nameUnique[0]],reason:nameHits.length>1?'speaker-consensus':'speaker-fallback',diagnostics};
  if(nameUnique.length>1)return {status:'ambiguous',index:-1,character:null,reason:'speaker-hint-conflict',candidates:nameUnique,diagnostics};
  return {status:'missing',index:-1,character:null,reason:diagnostics.some(x=>x.kind==='stale-id')?'stale-id-no-name-match':'no-consensus-match',diagnostics};
}
function embeddedDialogueCharacterId(entry){return entry&&typeof entry==='object'?String(entry.characterId||entry.character_id||entry.speakerId||entry.speaker_id||'').trim():''}
function characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1}
function sceneDialogueBindingAt(scene,index){const b=Array.isArray(scene?.dialogueBindings)?scene.dialogueBindings[index]:null;return b&&typeof b==='object'?b:null}
function sceneAtIdentity(episode,index,sceneId=''){const scenes=episode?.scenes||[];const wanted=String(sceneId||'').trim();if(wanted)return scenes.find(x=>String(x?.id||'')===wanted)||null;return scenes[index]||null}
function resolveDialogueCharacterIndex(p,scene,entry,lineIndex=-1){
  ensureCharacterIdentityIds(p);
  const embeddedId=embeddedDialogueCharacterId(entry),binding=lineIndex>=0?sceneDialogueBindingAt(scene,lineIndex):null;
  const stableId=embeddedId||String(binding?.characterId||'').trim(),{speaker}=dialogueParts(entry);
  const match=resolveCharacterIdentity(p,{speaker,characterId:stableId});return match.status==='resolved'?match.index:-1;
}
function bindSceneDialogueCharacters(p,scene,{preserveExisting=true}={}){
  if(!p||!scene)return scene;ensureCharacterIdentityIds(p);
  const entries=dialogueEntries(scene.dialogue),previous=Array.isArray(scene.dialogueBindings)?scene.dialogueBindings:[];
  scene.dialogueBindings=entries.map((entry,i)=>{
    const {speaker}=dialogueParts(entry),embeddedId=embeddedDialogueCharacterId(entry),prev=previous[i];
    const match=speaker?resolveCharacterIdentityAuthoritative(p,{dialogueSpeaker:speaker,fallbackSpeakers:[prev?.sourceSpeaker,prev?.speakerLabel],characterIds:[embeddedId,preserveExisting?prev?.characterId:'']}):resolveCharacterIdentityConsensus(p,{characterIds:[embeddedId,preserveExisting?prev?.characterId:''],speakerHints:[prev?.sourceSpeaker,prev?.speakerLabel]});
    const characterId=match.status==='resolved'?String(match.character?.id||''):'',canonicalName=match.status==='resolved'?String(match.character?.name||speaker):speaker;
    const unchanged=prev&&String(prev.characterId||'')===characterId&&normalizeSpeakerAlias(prev.sourceSpeaker||prev.speakerLabel||'')===normalizeSpeakerAlias(speaker||'');
    return {characterId,speakerLabel:canonicalName||speaker||prev?.speakerLabel||'',sourceSpeaker:speaker||prev?.sourceSpeaker||'',resolution:match.status==='resolved'?match.reason:match.status,resolutionReason:match.reason,boundAt:unchanged&&prev.boundAt?prev.boundAt:new Date().toISOString()};
  });
  return scene;
}
function shotIdentityHints(shot={},entry={},binding={}){
  const parts=dialogueParts(entry);return {
    characterIds:[binding?.characterId,shot.dialogueCharacterId,shot.characterId,shot.character_id,shot.speakerId,shot.speaker_id,embeddedDialogueCharacterId(entry)],
    speakerHints:[parts.speaker,shot.speaker,shot.character,shot.characterName,shot.displaySpeaker,shot.who,binding?.sourceSpeaker,binding?.speakerLabel]
  };
}
function reconcileSceneIdentityOwnership(project={},scene={},mode='balanced'){
  if(!project||!scene)return {changed:false,unresolved:[]};ensureCharacterIdentityIds(project);bindSceneDialogueCharacters(project,scene,{preserveExisting:true});
  const entries=dialogueEntries(scene.dialogue),plan=ensureSceneCoverage(scene,mode),unresolved=[],next=plan.map(x=>({...x}));let speakingOrdinal=0,changed=false;
  for(let i=0;i<next.length;i++){const shot=next[i];if(!shot?.speaking)continue;const turnIndex=Number.isInteger(Number(shot.dialogueTurnIndex))?Number(shot.dialogueTurnIndex):speakingOrdinal;const entry=entries[turnIndex]??entries[speakingOrdinal];const parts=dialogueParts(entry),binding=sceneDialogueBindingAt(scene,turnIndex);speakingOrdinal++;
    const hints=shotIdentityHints(shot,entry,binding);
    const match=resolveCharacterIdentityAuthoritative(project,{dialogueSpeaker:parts.speaker,shotSpeaker:shot.speaker||shot.character||shot.characterName,fallbackSpeakers:hints.speakerHints,characterIds:hints.characterIds});
    if(match.status!=='resolved'){unresolved.push({shotId:shot.id,order:shot.order,speaker:parts.speaker||shot.speaker,status:match.status,reason:match.reason,diagnostics:match.diagnostics||[]});continue}
    const canonicalName=String(match.character?.name||parts.speaker||shot.speaker),canonicalId=String(match.character?.id||''),line=String(parts.text||shot.spokenLine||'').trim();
    const updated={...shot,speaking:true,speaker:canonicalName,spokenLine:line,dialogueTurnIndex:turnIndex,dialogueCharacterId:canonicalId,identityResolution:match.reason,logicGateRevision:'v1.11.0-persisted-identity-reconciliation'};
    if(JSON.stringify(updated)!==JSON.stringify(shot))changed=true;next[i]=updated;
  }
  if(changed&&!sceneHasAnyProducedShotMedia(scene))scene.coveragePlan=next;
  return {changed,unresolved,plan:changed&&!sceneHasAnyProducedShotMedia(scene)?next:plan};
}
function rewriteDialogueSpeaker(entry,canonicalSpeaker=''){const speaker=String(canonicalSpeaker||'').trim();if(!speaker)return entry;if(entry&&typeof entry==='object'&&!Array.isArray(entry)){const next={...entry};if('speaker' in next||!('speakerName' in next))next.speaker=speaker;if('speakerName' in next)next.speakerName=speaker;return next}const parts=dialogueParts(entry);return parts.speaker?`${speaker}: ${parts.text}`:entry}
function canonicalizeUngeneratedSceneDialogueSpeakers(project={},scene={}){if(!project||!scene||sceneHasAnyProducedShotMedia(scene))return false;const entries=dialogueEntries(scene.dialogue);if(!entries.length)return false;let changed=false;const updated=entries.map((entry,i)=>{const parts=dialogueParts(entry),binding=sceneDialogueBindingAt(scene,i);if(!parts.speaker||!binding?.characterId)return entry;const idx=characterIndexById(project,binding.characterId),c=idx>=0?project.characters?.[idx]:null;const canonical=String(c?.name||'').trim();if(!canonical||normalizeSpeakerAlias(parts.speaker)===normalizeSpeakerAlias(canonical))return entry;const repaired=rewriteDialogueSpeaker(entry,canonical);if(JSON.stringify(repaired)!==JSON.stringify(entry))changed=true;return repaired});if(changed)scene.dialogue=updated;return changed}
function recoverSceneDialogueIdentityBindings(project={},scene={}){
  if(!project||!scene)return {changed:false,unresolved:[]};ensureCharacterIdentityIds(project);
  const entries=dialogueEntries(scene.dialogue),plan=Array.isArray(scene.coveragePlan)?scene.coveragePlan:[],speakingShots=plan.filter(x=>x?.speaking||String(x?.spokenLine||'').trim()),previous=Array.isArray(scene.dialogueBindings)?scene.dialogueBindings:[];
  const next=[],unresolved=[];let changed=false;
  for(let i=0;i<entries.length;i++){
    const entry=entries[i],parts=dialogueParts(entry),prior=previous[i]||{},shot=speakingShots[i]||null,speakerHints=[parts.speaker,shot?.speaker,shot?.character,shot?.characterName,prior.sourceSpeaker,prior.speakerLabel].filter(Boolean);
    const match=resolveCharacterIdentityAuthoritative(project,{dialogueSpeaker:parts.speaker,shotSpeaker:shot?.speaker||shot?.character||shot?.characterName,fallbackSpeakers:speakerHints,characterIds:[embeddedDialogueCharacterId(entry),prior.characterId,shot?.dialogueCharacterId,shot?.characterId]});
    if(match.status==='resolved'){const binding={characterId:String(match.character?.id||''),speakerLabel:String(match.character?.name||parts.speaker||shot?.speaker||''),sourceSpeaker:parts.speaker||shot?.speaker||'',resolution:`migration-${match.reason}`,boundAt:prior.boundAt||new Date().toISOString()};next.push(binding);if(String(prior.characterId||'')!==binding.characterId||normalizeSpeakerAlias(prior.speakerLabel||'')!==normalizeSpeakerAlias(binding.speakerLabel||''))changed=true}
    else{next.push({...prior,characterId:'',speakerLabel:parts.speaker||shot?.speaker||prior.speakerLabel||'',sourceSpeaker:parts.speaker||prior.sourceSpeaker||'',resolution:match.status,resolutionReason:match.reason});unresolved.push({dialogueIndex:i,speaker:parts.speaker||shot?.speaker||'',status:match.status,reason:match.reason});if(prior.characterId)changed=true}
  }
  scene.dialogueBindings=next;
  const dialogueCanonicalized=canonicalizeUngeneratedSceneDialogueSpeakers(project,scene);if(dialogueCanonicalized){changed=true;bindSceneDialogueCharacters(project,scene,{preserveExisting:true})}
  if(plan.length&&!sceneHasAnyProducedShotMedia(scene)){let ordinal=0;scene.coveragePlan=plan.map(shot=>{if(!shot?.speaking&&!String(shot?.spokenLine||'').trim())return shot;const turn=entries[ordinal],binding=next[ordinal],parts=dialogueParts(turn),turnIndex=ordinal++;if(!binding?.characterId)return shot;const c=project.characters?.[characterIndexById(project,binding.characterId)];if(!c)return shot;const updated={...shot,speaking:true,speaker:c.name||parts.speaker||shot.speaker,spokenLine:parts.text||shot.spokenLine||'',dialogueTurnIndex:turnIndex,dialogueCharacterId:c.id,identityResolution:'project-load-migration',logicGateRevision:'v1.12.1-system-integrity'};if(JSON.stringify(updated)!==JSON.stringify(shot))changed=true;return updated})}
  scene.identityMigrationRevision='v1.11.0';scene.identityMigrationUnresolved=unresolved;return {changed,unresolved};
}
function migratePersistedProjectIdentityReferences(p){if(!p)return {changed:false,unresolved:[]};ensureCharacterIdentityIds(p);let changed=false;const unresolved=[];for(const c of p.characters||[]){const before=JSON.stringify([c.canonicalName,c.aliases]);c.canonicalName=c.canonicalName||c.name||'';c.aliases=Array.isArray(c.aliases)?[...new Set(c.aliases.filter(Boolean))]:identityAliasParts(c.aliases);if(before!==JSON.stringify([c.canonicalName,c.aliases]))changed=true}for(const ep of p.episodes||[])for(const scene of ep.scenes||[]){const r=recoverSceneDialogueIdentityBindings(p,scene);if(r.changed)changed=true;if(r.unresolved.length)unresolved.push(...r.unresolved.map(x=>({...x,episodeId:ep.id||ep.number,sceneId:scene.id||scene.number,sceneTitle:scene.title||''})))}p.identityMigrationRevision='v1.11.0';p.identityMigrationUnresolved=unresolved.slice(0,50);return {changed,unresolved}}
function normalizeProjectIdentityBindings(p){
  if(!p)return p;
  ensureEpisodeIds(p);ensureCharacterIdentityIds(p);
  migratePersistedProjectIdentityReferences(p);
  const unresolved=[];
  for(const ep of p.episodes||[])for(const scene of ep.scenes||[]){
    bindSceneDialogueCharacters(p,scene,{preserveExisting:true});
    recoverSceneDialogueIdentityBindings(p,scene);
    if(!sceneHasAnyProducedShotMedia(scene)){
      let plan=ensureSceneCoverage(scene,'balanced');
      const repaired=repairCoverageLogic(scene,plan,'balanced');
      if(repaired.changed)scene.coveragePlan=repaired.repaired;
      reconcileSceneIdentityOwnership(p,scene,'balanced');
      // One more binding pass after deterministic shot repair makes project-load migration
      // idempotent and prevents stale dialogue/shot metadata from surviving into production.
      recoverSceneDialogueIdentityBindings(p,scene);
      reconcileSceneIdentityOwnership(p,scene,'balanced');
    }
    normalizeSceneMediaReferences(scene);
    const audit=sceneProductionLogicAudit(p,scene,'balanced');
    if(!audit.ok)unresolved.push(...audit.issues.map(issue=>({episodeId:ep.id||ep.number,sceneId:scene.id||scene.number,sceneTitle:scene.title||'',code:issue.code,message:issue.message})));
  }
  p.identityGraphRevision='v1.11.0';
  p.identityGraphCheckedAt=new Date().toISOString();
  p.identityMigrationUnresolved=unresolved.slice(0,50);
  return p;
}
function hashString(value=''){let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
let voiceCatalogCache=null;
const audioPreviewCache=new Map();
const voiceAuditionCache=new Map();
const audioRequestInFlight=new Map();
let activeAudio=null;
let previewAudioContext=null;
const finalVideoAssets=new Map();
const sceneMediaRuntimeUrls=new Map();
const sceneMediaHydrationInFlight=new Map();
const sceneMediaPersistInFlight=new Map();
const sceneMediaDbName='cinetale.scene.media.v1';
const finalVideoDbName='cinetale.final.video.v1';
const finalVideoRestoreFailures=new Set();
const finalVideoRestoreInFlight=new Set();
let finalRenderProgressState={at:0,percent:null,text:''};
const visualAssetDbName='cinetale.visual.assets.v1';
const visualAssetUrls=new Map();
const visualAssetLoads=new Map();
const visualAssetMissing=new Set();


function openSceneMediaDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){resolve(null);return}const req=indexedDB.open(sceneMediaDbName,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('media'))db.createObjectStore('media')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveSceneMediaBlob(key,blob){if(!key||!blob?.size)return false;const db=await openSceneMediaDb();if(!db)return false;await new Promise((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put({blob,updatedAt:new Date().toISOString()},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return true}
async function loadSceneMediaBlob(key){if(!key)return null;const db=await openSceneMediaDb();if(!db)return null;const value=await new Promise((resolve,reject)=>{const tx=db.transaction('media','readonly');const req=tx.objectStore('media').get(key);req.onsuccess=()=>resolve(req.result?.blob||null);req.onerror=()=>reject(req.error)});db.close();return value}
async function listSceneMediaRecords(){const db=await openSceneMediaDb();if(!db)return [];const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('media','readonly'),store=tx.objectStore('media'),req=store.openCursor(),out=[];req.onsuccess=()=>{const cur=req.result;if(!cur){resolve(out);return}out.push({key:String(cur.key||''),updatedAt:cur.value?.updatedAt||'',size:Number(cur.value?.blob?.size)||0,type:String(cur.value?.blob?.type||'')});cur.continue()};req.onerror=()=>reject(req.error)});db.close();return rows}
function parseSceneMediaRecordKey(key=''){const parts=String(key).split(':');if(parts.length<5)return null;return {projectId:parts[0],episodeId:parts[1],sceneId:parts[2],kind:parts[3],tail:parts.slice(4).join(':')}}
const episodeMediaRecoveryInFlight=new Set();
function recoverySceneMetadata(project={},episode={}){
  const assembly=(project.finalAssembly?.episodeId===episode.id||Number(project.finalAssembly?.episodeNumber)===Number(episode.number))?project.finalAssembly?.scenes:[];
  if(Array.isArray(assembly)&&assembly.length)return assembly.map((x,i)=>({sceneId:String(x.sceneId||''),sceneNumber:Number(x.number||x.sceneNumber)||i+1,title:String(x.title||''),durationSec:Number(x.durationSec||x.narrativeBeatSec)||0,shotIds:Array.isArray(x.shotIds)?x.shotIds:[]}));
  const validation=project.finalVideoMeta?.timelineValidation?.scenes;if(Array.isArray(validation)&&validation.length)return validation.map((x,i)=>({sceneId:String(x.sceneId||''),sceneNumber:Number(x.sceneNumber)||i+1,title:String(x.title||''),durationSec:Number(x.durationSec)||0,shotIds:Array.isArray(x.shotIds)?x.shotIds:[]}));
  return [];
}
async function recoverEmptyEpisodeProduction(projectId,episodeId){
  const token=`${projectId}:${episodeId}`;if(episodeMediaRecoveryInFlight.has(token))return false;episodeMediaRecoveryInFlight.add(token);
  try{let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId);if(!p||!ep||(ep.scenes||[]).length)return false;
    const snapshot=episodeRecoverySnapshots(p,ep)[0];if(snapshot?.scenes?.length){ep.scenes=structuredClone(snapshot.scenes);ep.productionRecoveredAt=new Date().toISOString();ep.productionRecoverySource='browser-snapshot';save();if(current()?.id===projectId)renderStudio();toast(`Recovered ${ep.scenes.length} saved scenes from the browser safety snapshot.`);return true}
    const records=(await listSceneMediaRecords()).map(r=>({...r,parsed:parseSceneMediaRecordKey(r.key)})).filter(r=>r.parsed&&r.parsed.projectId===String(projectId)&&r.parsed.episodeId===String(episodeId));if(!records.length)return false;
    const meta=recoverySceneMetadata(p,ep);if(!meta.length){ep.orphanedMediaRecovery={count:records.length,detectedAt:new Date().toISOString()};save();if(current()?.id===projectId)renderStudio();return false}
    const groups=new Map();for(const r of records){const id=r.parsed.sceneId;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r)}
    const groupIds=[...groups.keys()].sort((a,b)=>{const na=Number(String(a).match(/(\d+)(?!.*\d)/)?.[1]||0),nb=Number(String(b).match(/(\d+)(?!.*\d)/)?.[1]||0);return na-nb||String(a).localeCompare(String(b))});
    const scenes=[];for(let i=0;i<meta.length;i++){const m=meta[i],sceneId=m.sceneId&&groups.has(m.sceneId)?m.sceneId:groupIds[i];if(!sceneId)continue;const rows=groups.get(sceneId)||[],latest=kind=>rows.filter(r=>r.parsed.kind===kind).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0];const source=latest('source'),sync=latest('sync');const preview=source||sync;if(!preview)continue;const scene={id:sceneId,number:m.sceneNumber||i+1,title:m.title||`Recovered scene ${i+1}`,durationSec:m.durationSec||0,visual:'',purpose:'',dialogue:[],narration:'',finalIncluded:true,recoveredProductionMetadata:true,recoveryNeedsStoryBinding:true,videoUrl:`local-recovered://${sceneId}/preview`,videoLocalMediaKey:preview.key,videoMediaPersistedAt:preview.updatedAt||new Date().toISOString(),videoMediaOwnership:'browser-recovered',videoMediaExpired:false,videoCloudMissing:false,coverageClips:[]};if(sync){scene.lipSyncVideoUrl=`local-recovered://${sceneId}/sync`;scene.lipSyncLocalMediaKey=sync.key;scene.lipSyncMediaPersistedAt=sync.updatedAt||new Date().toISOString();scene.lipSyncMediaOwnership='browser-recovered';scene.lipSyncStatus='recovered-unverified';scene.lipSyncValidated=false;scene.lipSyncProviderAudioAuthoritative=false}scenes.push(scene)}
    if(!scenes.length)return false;ep.scenes=scenes;ep.productionRecoveredAt=new Date().toISOString();ep.productionRecoverySource='indexeddb+production-manifest';save();for(let i=0;i<ep.scenes.length;i++)hydrateSceneMedia(projectId,episodeId,i,'source').catch(()=>{});if(current()?.id===projectId)renderStudio();toast(`Recovered ${scenes.length} saved scene clips. CineTale will not regenerate them until their story bindings are reviewed.`);return true
  }catch(e){console.warn('[CineTale recovery] Episode media recovery failed',e);return false}finally{episodeMediaRecoveryInFlight.delete(token)}
}
function sceneMediaRecordKey(project={},episode={},scene={},kind='source',shotId='primary'){return [project?.id||'project',episode?.id||episode?.number||'episode',scene?.id||scene?.number||'scene',kind,shotId||'primary'].map(v=>String(v).replace(/[^a-z0-9._-]+/gi,'-')).join(':')}
function sceneMediaRuntimeKey(scene={},kind='source'){const local=kind==='sync'?scene.lipSyncLocalMediaKey:scene.videoLocalMediaKey;const storage=kind==='sync'?scene.lipSyncStoragePath:scene.videoStoragePath;return String(local||storage||'')}
function sceneMediaRuntimeUrl(scene={},kind='source'){const key=sceneMediaRuntimeKey(scene,kind),url=key?sceneMediaRuntimeUrls.get(key)||'':'';return canonicalMediaUrl(url)}
function sceneSourceMediaHydrationPending(scene={}){return Boolean(scene?.videoUrl&&!scene.videoMediaExpired&&(scene.videoStoragePath||scene.videoLocalMediaKey)&&!sceneMediaRuntimeUrl(scene,'source'))}
function sceneSyncMediaHydrationPending(scene={}){return Boolean(scene?.lipSyncVideoUrl&&(scene.lipSyncStoragePath||scene.lipSyncLocalMediaKey)&&!sceneMediaRuntimeUrl(scene,'sync'))}
function sceneMediaDecodeShieldMarkup(art='',title='Scene video'){return `<div class="scene-media-decode-shield" data-scene-media-shield="1" role="status" aria-live="polite" aria-label="Restoring saved video">${art?`<img src="${esc(art)}" alt="">`:'<div class="scene-media-decode-blank"></div>'}<div class="scene-media-restore-status" data-scene-media-restore-status><span class="scene-media-spinner" aria-hidden="true"></span><b>Opening saved video…</b><small>CineTale is loading the preserved asset. No new video will be generated.</small><button class="scene-media-retry ghost small" type="button" data-scene-media-retry hidden>Retry restore</button></div></div>`}
function setSceneMediaRuntimeUrl(key,blob){if(!key||!blob?.size)return '';const old=sceneMediaRuntimeUrls.get(key);if(old&&String(old).startsWith('blob:')){try{URL.revokeObjectURL(old)}catch{}}const url=URL.createObjectURL(blob);sceneMediaRuntimeUrls.set(key,url);return url}
async function playableVideoBlob(blob){if(!blob?.size||(!String(blob.type||'').startsWith('video/')&&blob.size<1024))return false;const url=URL.createObjectURL(blob);try{return await new Promise(resolve=>{const v=document.createElement('video');v.preload='metadata';v.muted=true;let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);v.removeAttribute('src');try{v.load()}catch{}resolve(Boolean(ok))};v.addEventListener('loadedmetadata',()=>finish(Number.isFinite(v.duration)&&v.duration>0),{once:true});v.addEventListener('error',()=>finish(false),{once:true});const timer=setTimeout(()=>finish(false),9000);v.src=url;try{v.load()}catch{finish(false)}})}finally{URL.revokeObjectURL(url)}}
async function normalizeVideoBlobForPlayback(blob){if(!blob?.size)return blob;const type=String(blob.type||'').toLowerCase();if(type==='video/mp4')return blob;try{const head=new Uint8Array(await blob.slice(0,64).arrayBuffer());const ascii=String.fromCharCode(...head);if(ascii.includes('ftyp'))return new Blob([blob],{type:'video/mp4'})}catch{}return blob}
function openVisualAssetDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){resolve(null);return}const req=indexedDB.open(visualAssetDbName,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dataUrlToBlob(dataUrl=''){const m=String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);if(!m)throw new Error('Invalid generated image payload.');const mime=m[1]||'application/octet-stream',raw=m[2]?atob(m[3]):decodeURIComponent(m[3]);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Could not read visual asset.'));r.readAsDataURL(blob)})}
async function saveVisualAsset(key,image){if(!key||!image)return {key:'',src:image||''};if(/^https?:/i.test(image))return {key:'',src:image};let blob;if(/^data:/i.test(image))blob=dataUrlToBlob(image);else if(/^blob:/i.test(image)){const r=await fetch(image);blob=await r.blob()}else return {key:'',src:image};const db=await openVisualAssetDb();if(!db)throw new Error('This browser cannot store generated media locally.');await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({blob,updatedAt:new Date().toISOString()},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();const old=visualAssetUrls.get(key);if(old)URL.revokeObjectURL(old);const src=URL.createObjectURL(blob);visualAssetUrls.set(key,src);visualAssetMissing.delete(key);return {key,src}}
function stageVisualAsset(key,image){if(!key||!image)return {key:'',src:image||''};if(/^https?:/i.test(image))return {key:'',src:image};let blob;if(/^data:/i.test(image))blob=dataUrlToBlob(image);else return {key:'',src:image};const old=visualAssetUrls.get(key);if(old&&old!==image&&String(old).startsWith('blob:')){try{URL.revokeObjectURL(old)}catch{}}const src=URL.createObjectURL(blob);visualAssetUrls.set(key,src);visualAssetMissing.delete(key);return {key,src}}
function generationProgress(button,labels=['Creating…','Rendering details…','Finishing…']){if(!button)return()=>{};const start=Date.now();button.disabled=true;const paint=()=>{const sec=Math.max(0,Math.floor((Date.now()-start)/1000));const label=sec>=28?(labels[2]||labels.at(-1)):sec>=10?(labels[1]||labels[0]):labels[0];button.textContent=`${label} ${sec}s`};paint();const timer=setInterval(paint,1000);return()=>clearInterval(timer)}
async function loadVisualAssetRecord(key){if(!key)return null;const db=await openVisualAssetDb();if(!db)return null;const value=await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readonly');const req=tx.objectStore('assets').get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();return value}
function queueVisualAssetHydration(item){const key=item?.imageAssetKey;if(!key||visualAssetUrls.has(key)||visualAssetLoads.has(key))return;const job=(async()=>{try{const rec=await loadVisualAssetRecord(key);if(!rec?.blob){visualAssetMissing.add(key);renderAll();return}visualAssetMissing.delete(key);const src=URL.createObjectURL(rec.blob);visualAssetUrls.set(key,src);if(item&&(!item.image||String(item.image).startsWith('blob:')))item.image=src;renderAll()}catch(err){console.warn('[CineTale visual assets] Could not hydrate visual',key,err)}finally{visualAssetLoads.delete(key)}})();visualAssetLoads.set(key,job)}
function visualSrc(item){if(!item)return '';const direct=String(item.image||'');if(direct&&(!direct.startsWith('blob:')||[...visualAssetUrls.values()].includes(direct)))return direct;const key=item.imageAssetKey;if(key&&visualAssetUrls.has(key)){item.image=visualAssetUrls.get(key);return item.image}if(key)queueVisualAssetHydration(item);return ''}
function hasVisual(item){const src=visualSrc(item),key=item?.imageAssetKey;return Boolean(src||(key&&!visualAssetMissing.has(key)))}
async function visualDataUrl(item){if(!item)return '';const direct=String(item.image||'');if(/^data:image\//i.test(direct))return direct;if(item.imageAssetKey){const rec=await loadVisualAssetRecord(item.imageAssetKey);if(rec?.blob)return await blobToDataUrl(rec.blob)}if(/^blob:/i.test(direct)){try{const r=await fetch(direct);return await blobToDataUrl(await r.blob())}catch{return ''}}return /^https?:/i.test(direct)?direct:''}
function stripTransientMedia(value){if(Array.isArray(value))return value.map(stripTransientMedia);if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value)){if(typeof v==='string'&&/^(?:data:|blob:)/i.test(v)&&(k==='image'||k==='video'||k==='audio'||k==='referencePhoto'||k.endsWith('Url')||k.endsWith('URL')))value[k]='';else if(v&&typeof v==='object')stripTransientMedia(v)}return value}return value}
function persistableProjects(projects=state.projects){const clone=typeof structuredClone==='function'?structuredClone(projects):JSON.parse(JSON.stringify(projects));return stripTransientMedia(clone)}

async function voiceCatalog(){
  if(voiceCatalogCache)return voiceCatalogCache;
  const r=await fetch('/api/voices');const d=await r.json();if(!r.ok)throw new Error(d.error||'Voice catalog unavailable.');
  voiceCatalogCache=d;return d;
}
function voiceHaystack(v){return `${v.name||''} ${v.category||''} ${JSON.stringify(v.labels||{})}`.toLowerCase()}
function characterContextText(p,c={}){
  const name=String(c.name||'').trim();
  const direct=[c.pronouns,c.gender,c.voicePresentation,c.age,c.voice,c.role,c.appearance,c.personality,c.background].filter(Boolean).join(' ');
  if(!name||!p)return direct.toLowerCase();
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`\\b${escaped}\\b`,'gi');
  const sources=[...(p.episodes||[]).map(e=>e.storyText||''),...(p.episodes||[]).flatMap(e=>(e.scenes||[]).map(s=>[s.visual,s.purpose,s.narration,...dialogueList(s.dialogue)].filter(Boolean).join(' ')))];
  const nearby=[];for(const src0 of sources){const src=String(src0||'');for(const m of src.matchAll(re)){const start=Math.max(0,(m.index||0)-120),end=Math.min(src.length,(m.index||0)+name.length+240);nearby.push(src.slice(start,end));if(nearby.length>=12)break}if(nearby.length>=12)break}
  return `${direct} ${nearby.join(' ')}`.toLowerCase();
}
function inferCharacterVoicePresentation(p,c={}){return explicitCharacterVoicePresentation(c)}
function voiceMatchScore(v,c={},p=null){
  const profile=`${c.voice||''} ${c.personality||''} ${c.characterType||''} ${c.type||''}`.toLowerCase(),m=voiceMetadata(v);let score=0;
  const langs=characterRequiredVoiceLanguages(p||{},c),age=characterTargetVoiceAge(c),wanted=explicitCharacterVoicePresentation(c),actual=m.gender,archetype=characterVoiceArchetype(c);
  if(langs.length){if(langs.every(x=>voiceLanguageMatches(m,x,true))){score+=220;if(langs.includes(voiceLanguageName(m.baseLanguage||m.language)))score+=28}else score-=400}
  const locale=projectVoiceLocale(p||{});if(locale){if(voiceLocaleMatches(m,locale)){score+=130;if(normalizeVoiceLocale(m.baseLocale||m.locale)===normalizeVoiceLocale(locale))score+=22}else if((m.locales||[]).length)score-=170}
  if(archetype==='human'&&age){if(normalizeVoiceAge(m.age)===age)score+=90;else if(voiceAgeHardCompatible(age,m.age))score+=35;else score-=180}
  if(wanted){if(actual===wanted)score+=45;else if(actual==='Neutral')score+=6;else if(actual)score-=60}
  // Accent is considered only when the creator explicitly directs it. Never derive accent from
  // religion, culture, ethnicity, name, background, location, appearance, or sacred identity.
  const accentHint=String(c.voiceAccentDirection||'').toLowerCase();if(accentHint&&m.accent&&accentHint.includes(String(m.accent).toLowerCase()))score+=18;
  const toneHints=characterVoiceToneHints(p||{},c);if(toneHints.some(x=>String(m.tone||'').toLowerCase().includes(x.toLowerCase())))score+=5;
  if(/warm/.test(profile)&&/warm/.test(String(m.tone).toLowerCase()))score+=4;if(/calm|gentle/.test(profile)&&/calm|gentle/.test(String(m.tone).toLowerCase()))score+=4;if(/bright|energetic|playful/.test(profile)&&/bright|energetic|playful/.test(String(m.tone).toLowerCase()))score+=4;
  return score;
}
function voiceAutoIntent(c={},p={}){
  return characterVoiceRequirement(p,c);
}
function voiceAutoDecision(v,c={},p={}){
  const m=voiceMetadata(v),intent=voiceAutoIntent(c,p),matches=[];
  if(intent.languages.length)matches.push(`language: ${intent.languages.join(' + ')}`);
  if(intent.locale&&voiceLocaleMatches(m,intent.locale))matches.push(`locale: ${intent.locale}`);
  if(intent.archetype==='human'&&intent.age)matches.push(`age: ${intent.age}`);
  if(intent.presentation)matches.push(`presentation: ${intent.presentation}`);
  if(intent.accentDirection&&m.accent)matches.push(`creator accent direction: ${m.accent}`);
  const tone=String(m.tone||'').trim();if(tone)matches.push(`tone: ${tone}`);
  return {voiceId:v?.voice_id||'',voiceName:v?.name||'',selectedAt:new Date().toISOString(),matchScore:voiceMatchScore(v,c,p),matches,intent,provider:{name:m.provider||'elevenlabs',accent:m.accent||'',locale:m.locale||'',locales:m.locales||[],age:m.age||'',presentation:m.gender||'',languages:m.strictLanguages||m.languages||[],languageSource:m.languageSource||'',tone:m.tone||''}};
}
function voiceAutoIntentSummary(c={},p={}){
  const i=voiceAutoIntent(c,p),bits=[];
  if(i.languages.length)bits.push(i.languages.join(' + '));
  if(i.locale)bits.push(i.locale);
  if(i.archetype==='human'&&i.age)bits.push(i.age);
  if(i.presentation)bits.push(i.presentation);
  if(i.toneHints.length)bits.push(i.toneHints[0]);
  return bits.join(' · ')||'Story and character context';
}
function voiceAutoDecisionSummary(c={},p={}){
  const d=c.voiceAutoDecision;
  if(c.voiceMode==='auto'&&c.voiceId&&d?.voiceId===c.voiceId){
    const labels=(d.matches||[]).slice(0,4).map(x=>String(x).replace(/^./,m=>m.toUpperCase()));
    return labels.length?`Auto match · ${labels.join(' · ')}`:`Auto matched from ${voiceAutoIntentSummary(c,p)}`;
  }
  return `Auto target · ${voiceAutoIntentSummary(c,p)}`;
}
function buildProjectVoiceResolutionSnapshot(p={},voices=[],providerCapabilities={}){
  const rows=(p.characters||[]).map((c,index)=>{
    const current=c.voiceId?voices.find(v=>v.voice_id===c.voiceId):null;
    if(c.voiceLocked&&c.voiceId){const production=characterVoiceProductionState(c,p),reasons=production.ready?[]:voiceSuitabilityReasons(current,c,p),approvedFallback=production.code==='ready-approved-override';return {index,name:c.name||`Character ${index+1}`,status:production.ready?'ready':(reasons.length?'override-or-review':'ready'),voiceName:c.voiceName||current?.name||'',provider:c.voiceFallback?.provider||(current?voiceMetadata(current).provider:''),reasons,targetAge:characterTargetVoiceAge(c),targetSummary:voiceAutoIntentSummary(c,p),approvedFallback,fallbackAge:c.voiceFallback?.age||'',resolution:c.voiceFallback?.resolution||''}}
    if(current&&voiceSuitableForCharacter(current,c,p))return {index,name:c.name||`Character ${index+1}`,status:'auto-ready',voiceName:c.voiceName||current.name||'',provider:voiceMetadata(current).provider||'',reasons:[],targetAge:characterTargetVoiceAge(c),targetSummary:voiceAutoIntentSummary(c,p)};
    const exact=voices.filter(v=>voiceSuitableForCharacter(v,c,p)).map(v=>({v,score:voiceMatchScore(v,c,p)+voiceProviderCapabilityRank(v,c,p)})).sort((a,b)=>b.score-a.score)[0]?.v||null;
    const closest=bestVoiceManualAlternatives(voices,c,p,1)[0]||null;
    return {index,name:c.name||`Character ${index+1}`,status:exact?'auto-available':'blocked',voiceName:exact?.name||'',provider:exact?voiceMetadata(exact).provider:'',reasons:exact?[]:(closest?.review?.hardIssues||closest?.review?.issues||['No verified exact match available.']),closestName:closest?.v?.name||'',targetAge:characterTargetVoiceAge(c),targetSummary:voiceAutoIntentSummary(c,p)};
  });
  return {characters:rows,counts:{ready:rows.filter(x=>['ready','auto-ready','auto-available'].includes(x.status)).length,blocked:rows.filter(x=>x.status==='blocked').length,review:rows.filter(x=>x.status==='override-or-review').length},providerCapabilities};
}
function voiceResolutionStatusLabel(row={}){
  if(row.status==='blocked'){
    const age=String(row.targetAge||'').trim();
    return age?`Needs verified ${age} voice`:'Needs verified voice';
  }
  if(row.status==='override-or-review')return 'Manual review';
  if(row.approvedFallback)return row.fallbackAge?`Ready via approved ${row.fallbackAge} fallback`:'Ready via approved fallback';
  return 'Ready';
}
function voiceProviderDisplayName(provider=''){
  const raw=String(provider||'').trim();if(!raw)return '';
  const key=raw.toLowerCase();
  return ({google:'Google',elevenlabs:'ElevenLabs',sarvam:'Sarvam',murf:'Murf',azure:'Azure'}[key]||raw.replace(/(^|[-_\s])([a-z])/g,(_,a,b)=>`${a}${b.toUpperCase()}`));
}
function voiceResolutionReadyDetail(row={}){
  const voiceName=String(row.voiceName||'').trim();
  return voiceName||'Voice requirements satisfied';
}
function voiceResolutionStatusDetail(row={}){
  if(row.status==='blocked'){
    const reason=String(row.reasons?.[0]||'No verified exact match available.').replace(/[.]+$/,'');
    return reason;
  }
  if(row.status==='override-or-review')return String(row.reasons?.[0]||'Locked voice needs review').replace(/[.]+$/,'');
  if(row.voiceName||row.provider)return voiceResolutionReadyDetail(row);
  return 'Voice requirements satisfied';
}
function voiceResolutionSharedBlocker(p={}){
  const rows=(p.voiceResolutionSummary?.characters||[]).filter(x=>x.status==='blocked');
  if(rows.length<2)return '';
  const normalized=rows.map(x=>String(x.reasons?.[0]||'').trim().replace(/[.]+$/,'').toLowerCase()).filter(Boolean);
  if(normalized.length!==rows.length||!normalized.every(x=>x===normalized[0]))return '';
  const reason=String(rows[0].reasons?.[0]||'').trim().replace(/[.]+$/,'');
  const childCount=rows.filter(x=>String(x.targetAge||'').toLowerCase()==='child').length;
  if(childCount===rows.length&&/age not verified/i.test(reason))return `Shared blocker: ${rows.length} characters need a provider-verified Child voice; the closest connected-provider matches do not verify age.`;
  return `Shared blocker: ${rows.length} characters are blocked by the same requirement — ${reason}.`;
}
function voiceResolutionReadinessModel(p={}){
  const s=p.voiceResolutionSummary;if(!s?.characters?.length)return null;
  const ready=s.characters.filter(x=>['ready','auto-ready','auto-available'].includes(x.status)).length;
  const review=s.characters.filter(x=>x.status==='override-or-review').length;
  const blocked=s.characters.filter(x=>x.status==='blocked').length;
  return {ready,review,blocked,attention:review+blocked,rows:s.characters,sharedBlocker:voiceResolutionSharedBlocker(p)};
}
async function preselectAutoVoicesForProject(project){
  const p=project||current();if(!p?.id||!Array.isArray(p.characters)||!p.characters.length)return;
  const key=`${p.id}:${p.updatedAt||''}`;if(state.autoVoiceWarmupScheduled.has(key))return;
  state.autoVoiceWarmupScheduled.add(key);
  try{
    const d=await voiceCatalog(),all=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));if(!all.length)return;const providerCapabilities=d.providerCapabilities||{};
    const used=new Set((p.characters||[]).filter(c=>c.voiceLocked&&c.voiceId).map(c=>c.voiceId).filter(Boolean));if(p.narratorVoiceLocked&&p.narratorVoiceId)used.add(p.narratorVoiceId);
    let changed=false;
    for(let index=0;index<p.characters.length;index++){
      const c=p.characters[index];if(!c||c.voiceLocked)continue;
      const currentVoice=c.voiceId?all.find(v=>v.voice_id===c.voiceId):null;
      if(currentVoice&&voiceSuitableForCharacter(currentVoice,c,p)){if(!c.voiceAutoDecision){c.voiceAutoDecision=voiceAutoDecision(currentVoice,c,p);changed=true}used.add(c.voiceId);continue}
      const candidates=all.filter(v=>!used.has(v.voice_id)&&voiceSuitableForCharacter(v,c,p));
      const pool=candidates.length?candidates:all.filter(v=>voiceSuitableForCharacter(v,c,p));
      const ranked=pool.map(v=>({v,score:voiceMatchScore(v,c,p)+voiceProviderCapabilityRank(v,c,p)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));
      const pick=ranked[0]?.v;
      if(pick){c.voiceId=pick.voice_id;c.voiceName=pick.name;c.voiceMode='auto';c.voiceLocked=false;c.voiceSelectionUpdatedAt=new Date().toISOString();c.voiceAutoDecision=voiceAutoDecision(pick,c,p);c.voicePerformance=c.voicePerformanceMode==='manual'?(c.voicePerformance||'Natural'):characterAutoPerformance(p,c);c.voicePace=c.voicePaceMode==='manual'?(c.voicePace||'Natural'):characterAutoPace(p,c);used.add(pick.voice_id);changed=true}
      else {const nextIntent=voiceAutoIntent(c,p),sameNoMatch=Boolean(c.voiceAutoDecision?.noSuitableVoice)&&JSON.stringify(c.voiceAutoDecision?.intent||{})===JSON.stringify(nextIntent);if(c.voiceId||c.voiceName||!sameNoMatch){c.voiceId='';c.voiceName='';c.voiceMode='auto';c.voiceLocked=false;c.voiceAutoDecision={selectedAt:new Date().toISOString(),matches:[],intent:nextIntent,noSuitableVoice:true};changed=true}}
    }
    if(!p.narratorVoiceLocked){
      const currentNarrator=p.narratorVoiceId?all.find(v=>v.voice_id===p.narratorVoiceId):null;
      if(!(currentNarrator&&voiceSuitableForNarrator(currentNarrator,p))){
        const narratorCandidates=all.filter(v=>!used.has(v.voice_id)&&voiceSuitableForNarrator(v,p));
        const narratorPool=narratorCandidates.length?narratorCandidates:all.filter(v=>voiceSuitableForNarrator(v,p));
        const pickNarrator=narratorPool.map(v=>({v,score:/narrat|story|audiobook/i.test(`${v.name} ${v.category} ${voiceMetadata(v).use}`)?20:0})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name))[0]?.v;
        if(pickNarrator){p.narratorVoiceId=pickNarrator.voice_id;p.narratorVoiceName=pickNarrator.name;p.narratorAutoDecision={voiceId:pickNarrator.voice_id,voiceName:pickNarrator.name,selectedAt:new Date().toISOString(),languages:projectVoiceLanguages(p),reason:'Matches the project narration language and narrator use case where available.'};changed=true}
        else {const langs=projectVoiceLanguages(p),sameNoMatch=Boolean(p.narratorAutoDecision?.noSuitableVoice)&&JSON.stringify(p.narratorAutoDecision?.languages||[])===JSON.stringify(langs);if(p.narratorVoiceId||p.narratorVoiceName||!sameNoMatch){p.narratorVoiceId='';p.narratorVoiceName='';p.narratorAutoDecision={selectedAt:new Date().toISOString(),noSuitableVoice:true,languages:langs};changed=true}}
      }
    }
    const nextSummary=buildProjectVoiceResolutionSnapshot(p,all,providerCapabilities),priorSummary=p.voiceResolutionSummary||{};const priorComparable={characters:priorSummary.characters||[],counts:priorSummary.counts||{},providerCapabilities:priorSummary.providerCapabilities||{}};if(JSON.stringify(priorComparable)!==JSON.stringify(nextSummary)){p.voiceResolutionSummary={...nextSummary,updatedAt:new Date().toISOString()};changed=true}
    if(changed){p.updatedAt=new Date().toISOString();save();renderCharacters();renderStudioStageGate?.(p,episodeOf(p));}
  }catch(e){console.warn('[CineTale voice] Auto voice preselection unavailable',e)}
}
function scheduleAutoVoiceWarmup(project){const p=project||current();if(!p?.id)return;queueMicrotask(()=>preselectAutoVoicesForProject(p));}
function clearAudioPreviewCache(){audioPreviewCache.clear();audioRequestInFlight.clear();if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}}
function applyCharacterVoiceSelection(project,index,{voiceId='',voiceName='',mode='custom',locked=true}={}){
  const target=project?.characters?.[index];if(!target)return;
  target.voiceId=voiceId;target.voiceName=voiceName;target.voiceMode=mode;target.voiceLocked=!!locked;target.voiceSelectionUpdatedAt=new Date().toISOString();target.voiceRevision=Number(target.voiceRevision||0)+1;delete target.voiceLockReview;delete target.voiceManualOverride;delete target.voiceFallback;
}
async function ensureCharacterVoice(p,index){
  const c=p?.characters?.[index];if(!c)return null;
  const d=await voiceCatalog();const all=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));
  if(c.voiceId&&c.voiceLocked){const locked=all.find(v=>v.voice_id===c.voiceId),reasons=voiceSuitabilityReasons(locked,c,p);if(reasons.length&&!voiceLockAuditAcknowledged(c,p))return null;return {voiceId:c.voiceId,voiceName:c.voiceName||locked?.name||c.voice||'Assigned voice'};}
  if(!all.length)return c.voiceId?{voiceId:c.voiceId,voiceName:c.voiceName||c.voice||'Assigned voice'}:null;
  const currentVoice=c.voiceId?all.find(v=>v.voice_id===c.voiceId):null;
  const autoVoiceStillFits=Boolean(c.voiceId&&currentVoice&&voiceSuitableForCharacter(currentVoice,c,p));
  if(autoVoiceStillFits)return {voiceId:c.voiceId,voiceName:c.voiceName||currentVoice?.name||c.voice||'Assigned voice'};
  const used=new Set((p.characters||[]).filter((_,i)=>i!==index).map(x=>x.voiceId).filter(Boolean));if(p.narratorVoiceId)used.add(p.narratorVoiceId);
  const available=all.filter(v=>!used.has(v.voice_id));const voices=available.length?available:all;
  const suitable=voices.filter(v=>voiceSuitableForCharacter(v,c,p));
  if(!suitable.length)return null;
  const ranked=suitable.map(v=>({v,score:voiceMatchScore(v,c,p)+voiceProviderCapabilityRank(v,c,p)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));
  const bestScore=ranked[0]?.score||0;const pool=ranked.filter(x=>x.score===bestScore).map(x=>x.v);const pick=pool[hashString(c.name||index)%pool.length]||ranked[0]?.v;if(!pick)return null;
  updateProject(x=>{const target=x.characters?.[index];if(target&&!target.voiceLocked){applyCharacterVoiceSelection(x,index,{voiceId:pick.voice_id,voiceName:pick.name,mode:'auto',locked:false});target.voiceAutoDecision=voiceAutoDecision(pick,target,x);target.voicePerformance=target.voicePerformanceMode==='manual'?(target.voicePerformance||'Natural'):characterAutoPerformance(x,target);target.voicePace=target.voicePaceMode==='manual'?(target.voicePace||'Natural'):characterAutoPace(x,target)}});
  clearAudioPreviewCache();
  return {voiceId:pick.voice_id,voiceName:pick.name};
}
async function ensureNarratorVoice(p){
  const d=await voiceCatalog(),voices=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));
  if(p?.narratorVoiceId){const current=voices.find(v=>v.voice_id===p.narratorVoiceId);if(p.narratorVoiceLocked){const reasons=narratorVoiceSuitabilityReasons(current,p),ack=Boolean(p.narratorVoiceLockReview?.acknowledged&&p.narratorVoiceLockReview?.signature===JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}));if(reasons.length&&!ack)return null;return {voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||current?.name||'Narrator'}}if(current&&voiceSuitableForNarrator(current,p))return {voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||current?.name||'Narrator'};}
  const suitable=voices.filter(v=>voiceSuitableForNarrator(v,p));if(!suitable.length)return null;
  const ranked=suitable.map(v=>({v,score:/narrat|story|audiobook/i.test(`${v.name} ${v.category} ${voiceMetadata(v).use}`)?20:0})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));const pick=ranked[0]?.v;if(!pick)return null;
  updateProject(x=>{if(!x.narratorVoiceLocked){x.narratorVoiceId=pick.voice_id;x.narratorVoiceName=pick.name}});
  return {voiceId:pick.voice_id,voiceName:pick.name};
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
  Intimate:'close, personal and vulnerable; soft natural pauses and understated emotion',
  Confident:'confident, assured and clear; grounded authority without sounding adult, aggressive or theatrical',
  Focused:'focused, attentive and purposeful; controlled energy with precise natural phrasing',
  Gentle:'gentle, compassionate and soft; emotionally present without sounding weak or artificial'
};
const VOICE_PACE={Natural:'natural pace with varied sentence rhythm',Relaxed:'slightly relaxed pace with comfortable pauses',Quick:'slightly quicker conversational pace without rushing'};
function characterVoiceDirection(c={},p={}){
  const performance=c.voicePerformanceMode==='manual'?(c.voicePerformance||'Natural'):characterAutoPerformance(p,c);
  const pace=c.voicePaceMode==='manual'?(c.voicePace||'Natural'):characterAutoPace(p,c);
  const perf=VOICE_PERFORMANCE[performance]||VOICE_PERFORMANCE.Natural;
  const paceText=VOICE_PACE[pace]||VOICE_PACE.Natural;
  const generatedDelivery=String(c.voiceIntent?.delivery||'').trim();
  return [perf,paceText,c.voiceAccentDirection,c.voice,generatedDelivery,c.voiceCustomDirection].filter(Boolean).join('. ');
}
function narratorVoiceDirection(p={},scene={}){
  const perf=VOICE_PERFORMANCE[p.narratorPerformance||'Warm']||VOICE_PERFORMANCE.Warm;
  const pace=VOICE_PACE[p.narratorPace||'Natural']||VOICE_PACE.Natural;
  const sceneStyle=String(scene?.narrationStyle||'').trim();
  return [perf,pace,p.narratorAccentDirection,p.narratorCustomDirection,sceneStyle||'restrained storyteller; avoid trailer voice'].filter(Boolean).join('. ');
}
function sceneVoiceCharacterIndex(p,s){
  const entries=dialogueEntries(s?.dialogue);for(let i=0;i<entries.length;i++){const idx=resolveDialogueCharacterIndex(p,s,entries[i],i);if(idx>=0)return idx}
  return -1;
}
function sceneVoiceSummary(p,s){
  const idx=sceneVoiceCharacterIndex(p,s);
  if(idx<0){const perf=p?.narratorPerformance||'Warm';return `${p?.narratorVoiceName||'Narrator'} · ${perf} · ${p?.narratorVoiceLocked?'Voice locked':(p?.narratorVoiceId?'Assigned voice':'Auto voice')}`;}
  const c=p.characters[idx],perf=c.voicePerformance||'Natural';
  return `${c.name} · ${c.voiceName||'Auto voice'} · ${perf} · ${c.voiceLocked?'Voice locked':'Auto voice'}`;
}
function selectedShotVoiceCharacterIndex(p,s){
  const shot=selectedStudioShot(s);
  if(shot&&!shot.speaking)return -2;
  if(shot?.speaking){const idx=characterIndexForSpeaker(p,shot.speaker||'');if(idx>=0)return idx;}
  return sceneVoiceCharacterIndex(p,s);
}
function selectedShotVoiceSummary(p,s){
  const shot=selectedStudioShot(s);
  if(shot&&!shot.speaking)return String(s?.narration||'').trim()?'Narration + ambience / foley':'No dialogue · ambience / foley';
  const idx=selectedShotVoiceCharacterIndex(p,s);
  if(idx<0){const perf=p?.narratorPerformance||'Warm';return `${p?.narratorVoiceName||'Narrator'} · ${perf} · ${p?.narratorVoiceLocked?'Voice locked':(p?.narratorVoiceId?'Assigned voice':'Auto voice')}`;}
  const c=p.characters[idx],perf=c.voicePerformance||'Natural';
  return `${c.name} · ${c.voiceName||'Auto voice'} · ${perf} · ${c.voiceLocked?'Voice locked':'Auto voice'}`;
}
function selectedShotDialogueDisplay(s={}){
  const shot=selectedStudioShot(s);
  if(shot?.speaking)return `${shot.speaker||'Character'}: ${String(shot.spokenLine||'').trim()}`;
  if(shot)return `Shot ${shot.order} has no dialogue.`;
  return dialogueList(s.dialogue)[0]||dialogueText(s.narration)||'';
}
function sceneCopyUi(p,s,i){
  const shot=selectedStudioShot(s),voiceLabel=shot?.speaking?'Character voice':'Scene audio';
  const audioChip=shot&&!shot.speaking?`<div class="scene-voice-chip passive"><span class="scene-voice-icon">🎧</span><span class="scene-voice-copy"><small>${voiceLabel}</small><b>${esc(selectedShotVoiceSummary(p,s))}</b></span></div>`:`<button class="scene-voice-chip" data-scene-voice="${i}" data-selected-shot-id="${esc(shot?.id||'')}" type="button"><span class="scene-voice-icon">🎙</span><span class="scene-voice-copy"><small>${voiceLabel}</small><b>${esc(selectedShotVoiceSummary(p,s))}</b></span><span class="scene-voice-edit">Edit</span></button>`;
  const editLabel=shot&&!shot.speaking?'Edit scene direction':'Edit performance';
  return `<div class="scene-copy"><div class="scene-kicker">${p.format==='Movie'&&s.act?`${esc(s.act)} · `:''}SCENE ${String(s.number||i+1).padStart(2,'0')} · ${Number(s.durationSec)||0}s story beat</div><h3>${esc(s.title)}</h3><p>${esc(s.visual||s.purpose||'')}</p><div class="dialogue scene-dialogue-box"><span>${esc(selectedShotDialogueDisplay(s))}</span><button class="dialogue-edit-btn" data-scene-edit="${i}" data-selected-shot-id="${esc(shot?.id||'')}" type="button">${editLabel}</button></div>${audioChip}<div class="scene-meta"><span>🎵 ${esc(s.music||'Open music direction')}</span><span>🔊 ${esc(s.sfx||'Open SFX direction')}</span><span>🎥 ${esc(s.camera||'Open camera direction')}</span></div></div>`;
}
function bindSceneContextControls(card,sceneIndex){
  if(!card)return;
  const edit=card.querySelector(`[data-scene-edit="${sceneIndex}"]`);if(edit)edit.onclick=()=>openSceneAudioEditor(sceneIndex,edit.dataset.selectedShotId||'');
  const voice=card.querySelector(`[data-scene-voice="${sceneIndex}"]`);if(voice)voice.onclick=()=>{const p=current(),s=episodeOf(p)?.scenes?.[sceneIndex],idx=selectedShotVoiceCharacterIndex(p,s);if(idx>=0)openVoicePicker(idx);else openNarratorVoicePicker()};
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
].sort((a,b)=>a.localeCompare(b));
const LANGUAGE_PRESETS=['Abkhaz','Acehnese','Acholi','Afar','Afrikaans','Akan','Albanian','Amharic','Arabic','Armenian','Assamese','Aymara','Azerbaijani','Balinese','Balochi','Bambara','Bashkir','Basque','Belarusian','Bengali','Bhojpuri','Bosnian','Breton','Bulgarian','Burmese / Myanmar','Buryat','Cantonese','Catalan','Cebuano','Chamorro','Chichewa / Nyanja','Corsican','Croatian','Czech','Danish','Dari','Dhivehi / Maldivian','Dogri','Dutch','Dzongkha','English','Esperanto','Estonian','Ewe','Faroese','Fijian','Filipino / Tagalog','Finnish','French','Frisian','Fula / Fulani','Galician','Georgian','German','Greek','Greenlandic / Kalaallisut','Guarani','Gujarati','Haitian Creole','Haryanvi','Hausa','Hawaiian','Hebrew','Hiligaynon','Hindi','Hmong','Hungarian','Icelandic','Igbo','Ilocano','Indonesian','Irish','Italian','Japanese','Javanese','Kamba','Kannada','Karen','Kashmiri','Kazakh','Khmer','Kikuyu','Kinyarwanda','Kirundi','Konkani','Korean','Krio','Kurdish','Kyrgyz','Lao','Latin','Latvian','Lingala','Lithuanian','Luganda','Luo','Luxembourgish','Macedonian','Maithili','Malagasy','Malay','Malayalam','Maltese','Mandarin Chinese','Manipuri / Meitei','Marathi','Marshallese','Mongolian','Māori','Navajo','Nepali','Norwegian','Odia','Oromo','Palauan','Papiamento','Pashto','Persian / Farsi','Polish','Portuguese','Punjabi','Quechua','Rajasthani','Rohingya','Romanian','Romansh','Russian','Samoan','Sanskrit','Saraiki','Sardinian','Scots Gaelic','Sepedi / Northern Sotho','Serbian','Sesotho / Southern Sotho','Shan','Shona','Sicilian','Sindhi','Sinhala','Slovak','Slovenian','Somali','Spanish','Sundanese','Swahili','Swati','Swedish','Tajik','Tamil','Tatar','Telugu','Tetum','Thai','Tibetan','Tigrinya','Tok Pisin','Tongan','Tsonga','Tswana','Turkish','Turkmen','Twi','Ukrainian','Urdu','Uyghur','Uzbek','Venda','Vietnamese','Welsh','Wolof','Xhosa','Yiddish','Yoruba','Zulu'];

const FORMAT_CONFIG={
  Episode:{title:'Episode',explainer:'Build an ongoing series. Only Episode mode creates Episode 2, 3 and beyond.',ideaHint:'One sentence is enough. CineTale builds the world, recurring cast and first episode around it.',durationHint:'Target episode runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','15–20 minutes','Custom'],defaultDuration:'2–3 minutes',createLabel:'Build episode plan',unitLabel:'EPISODE',runtimeLabel:'estimated episode runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final episode'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Series memory',sceneTitle:'Scene production',finalName:'episode'},
  Short:{title:'Short',explainer:'One self-contained short-form video. No episodes or continuation controls.',ideaHint:'One sentence is enough. CineTale builds a compact beginning-to-end short around it.',durationHint:'Target finished short runtime.',durations:['15–30 seconds','30–60 seconds','60–90 seconds','2–3 minutes','Custom'],defaultDuration:'30–60 seconds',createLabel:'Build short plan',unitLabel:'SHORT',runtimeLabel:'estimated short runtime',journey:['Idea','Cast','Scenes','Audio','Video','Final short'],journeySubs:['Ready','If needed','Shots','Preview','Generate','Prepare'],memoryTitle:'Creative notes',sceneTitle:'Short scenes',finalName:'short'},
  Story:{title:'Story',explainer:'One complete standalone story with a real ending. No automatic Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete standalone story around it.',durationHint:'Target finished story runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','10–15 minutes','Custom'],defaultDuration:'5 minutes',createLabel:'Build story plan',unitLabel:'STORY',runtimeLabel:'estimated story runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final story'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Story memory',sceneTitle:'Story scenes',finalName:'story'},
  Movie:{title:'Movie',explainer:'Long-form beta. Plan a standalone movie structure with acts and scenes; production cost is estimated before paid rendering. It does not create Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete movie arc with acts, cast and key scenes.',durationHint:'Target movie runtime. Longer movies require more production assets.',durations:['10–15 minutes','20–30 minutes','45–60 minutes','90 minutes','Custom'],defaultDuration:'20–30 minutes',createLabel:'Build movie plan',unitLabel:'MOVIE',runtimeLabel:'estimated movie runtime',journey:['Concept','Cast','Acts & scenes','Audio','Video','Final movie'],journeySubs:['Ready','Portraits','Structure','Preview','Generate','Prepare'],memoryTitle:'Movie continuity',sceneTitle:'Movie scenes',finalName:'movie'}
};
const VALID_FORMATS=new Set(Object.keys(FORMAT_CONFIG));
function normalizedFormat(value,fallback='Episode'){const v=String(value||'').trim();return VALID_FORMATS.has(v)?v:fallback}
function durationTargetSeconds(value=''){const raw=String(value||'').trim().toLowerCase();const range=raw.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(seconds?|minutes?)/);if(range){const avg=(Number(range[1])+Number(range[2]))/2;return Math.round(avg*(range[3].startsWith('minute')?60:1))}const single=raw.match(/(\d+(?:\.\d+)?)\s*(seconds?|minutes?)/);return single?Math.round(Number(single[1])*(single[2].startsWith('minute')?60:1)):0}
function narrativeWordCount(ep){return String(ep?.storyText||'').trim().split(/\s+/).filter(Boolean).length}
function narrativeEstimateSeconds(ep){const words=narrativeWordCount(ep);return words?Math.round((words/135)*60):0}
function formatConfig(format=state.format){return FORMAT_CONFIG[normalizedFormat(format,'Episode')]||FORMAT_CONFIG.Episode}
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
let productionProfile='balanced';
const ownerQueryOverride=new URLSearchParams(location.search).get('owner')==='1';
function isOwnerMode(){return Boolean(ownerQueryOverride||state.ownerAccess?.isOwner)}
async function resolveOwnerAccess(){
  if(ownerQueryOverride){state.ownerAccess={resolved:true,isOwner:true,configured:true,source:'query'};return state.ownerAccess}
  const token=state.authSession?.access_token;if(!token){state.ownerAccess={resolved:true,isOwner:false,configured:false,source:''};return state.ownerAccess}
  try{const r=await fetch('/api/owner-status',{headers:{Authorization:`Bearer ${token}`}});const d=await r.json().catch(()=>({}));state.ownerAccess={resolved:true,isOwner:Boolean(d.isOwner),configured:Boolean(d.configured),source:d.isOwner?'account':''}}catch{state.ownerAccess={resolved:true,isOwner:false,configured:false,source:''}}
  return state.ownerAccess
}
function styleLabel(key){return VISUAL_STYLES[key]?.label||key||'Cinematic Realistic'}
function stylePromptFromPreset(key,custom=''){return key==='custom'?(String(custom||'').trim()||'creator-defined custom visual style'):(VISUAL_STYLES[key]?.prompt||String(custom||'').trim()||'cinematic realistic')}
function projectStyle(p){if(!p?.visualStylePreset)return String(p?.style||p?.worldBible?.visualLanguage||'cinematic realistic');return stylePromptFromPreset(p.visualStylePreset,p.customVisualStyle||'')}
function characterStyle(p,c){if(!c?.visualStyleOverride||c.visualStyleOverride==='project')return projectStyle(p);return stylePromptFromPreset(c.visualStyleOverride,c.customVisualStyle||'')}
function culturalPrompt(p){const t=p?.culturalTreatment||'auto',g=p?.worldBible?.globalContext||{},context=[p?.culturalContext,p?.regionCommunity||g.regionCommunity,p?.beliefContext||g.beliefContext,p?.traditionContext||g.traditionContext,p?.eraPlace||g.eraPlace,(g.respectGuardrails||[]).join('; ')].filter(Boolean).join(' · ').trim();const map={auto:'Infer cultural, historical, folklore or sacred context from the full story rather than a name alone. Distinguish an ordinary person from a sacred or mythological figure using the complete prompt and genre.', 'culturally-faithful':'Use culturally faithful details, avoid stereotypes, and preserve geography, clothing, architecture, customs and symbolism only when relevant to the story.', traditional:'Use a traditional treatment grounded in the requested culture and period; avoid generic or unrelated styling.', 'historically-grounded':'Prioritize historically plausible clothing, objects, architecture and social context for the requested time and place.', 'reverent-devotional':'Use a reverent devotional treatment. When a sacred figure is clearly intended, preserve respectful sacred identity, atmosphere and established high-level symbolism without caricature or turning the figure into an unrelated ordinary person.', 'sacred-cinematic':'Use a reverent sacred-cinematic treatment with culturally grounded symbolism and luminous spiritual atmosphere while preserving the figure’s intended sacred identity.', inspired:'Use a respectful inspired reinterpretation while keeping the source culture recognizable and avoiding stereotypes.', 'modern-retelling':'Use a respectful modern retelling; retain the core cultural or mythological identity while updating setting or styling only where the creator intends.'};const base=map[t]||map.auto;return context?`${base} Creator cultural/place/tradition context: ${context}. Preserve it across story, characters, wardrobe, architecture, objects, images, video, sound and language without turning it into a stereotype.`:base}
function sacredRepresentationPrompt(p){const mode=p?.sacredRepresentation||'auto';const map={auto:'Infer whether any sacred figure should remain symbolic, appear as an icon/idol, or appear visibly as a divine/mythological character from the creator’s wording and genre. Do not turn ordinary people into deities, and do not reduce an explicitly embodied deity to a generic human.',symbolic:'Sacred figures should remain symbolic, unseen, visionary, or indirectly present unless the creator explicitly overrides this in a scene.',idol:'Represent the sacred figure primarily through a reverently depicted icon, murti, statue, painting, shrine image, or other story-appropriate sacred representation rather than as an embodied speaking character.', 'visible-divine':'When a sacred figure is part of the cast, depict them as a visible divine character with recognizable, reverent tradition-appropriate identity rather than an ordinary human. Preserve canonical high-level visual cues without caricature or invented ritual claims.', 'traditional-mythological':'Use a traditional mythological depiction for sacred/mythological figures, preserving recognizable established iconographic cues and devotional dignity while avoiding random cross-cultural mixing.'};return map[mode]||map.auto}
function isSacredCharacter(p,c){
  const text=[p?.idea,p?.genre,p?.worldBible?.premise,c?.name,c?.role,c?.background,c?.appearance,c?.entityType,c?.sacredIdentity].filter(Boolean).join(' ').toLowerCase();
  if(String(c?.entityType||'').toLowerCase()==='sacred-figure') return true;
  return /(goddess|god\b|deity|divine|sacred|devotional|mytholog|देवी|देवता|भगवान|माता\s+पार्वती|बाल\s+गणेश|गणेश|दुर्गा|लक्ष्मी|सरस्वती|हनुमान|शिव|कृष्ण|राम)/i.test(text);
}
function sacredFigureGuidance(p,c){
  const text=[p?.idea,p?.genre,p?.worldBible?.premise,c?.name,c?.role,c?.background,c?.appearance,c?.entityType,c?.sacredIdentity,c?.representationMode,(c?.canonicalVisualCues||[]).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const explicitSacred=/(goddess|god\b|deity|divine|sacred|devotional|mytholog|देवी|देवता|भगवान|माता\s+पार्वती|बाल\s+गणेश|गणेश|दुर्गा|लक्ष्मी|सरस्वती|हनुमान|शिव|कृष्ण|राम)/i.test(text);
  if(!explicitSacred) return 'Do not infer a sacred identity from a name alone. Render the character exactly as the story context describes them.';
  const cues=[sacredRepresentationPrompt({...p,sacredRepresentation:c?.representationMode&&c.representationMode!=='project'?c.representationMode:p?.sacredRepresentation})];
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
function applyOwnerMode(){const ownerMode=isOwnerMode();$$('.owner-only').forEach(el=>{el.style.display=ownerMode?'':'none'});$$('.user-only').forEach(el=>{el.style.display=''});const avatar=$('.avatar-btn');if(avatar){avatar.textContent=authInitials();avatar.title=ownerMode?'Creator profile & owner settings':'Creator profile & settings'}}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__ctToast);window.__ctToast=setTimeout(()=>el.classList.remove('show'),2600)}
function saveUsage(){sessionStorage.setItem(usageKey,JSON.stringify(state.usage))}
function bumpUsage(kind,n=1){if(!(kind in state.usage))return;state.usage[kind]+=n;saveUsage();renderUsage()}
function renderUsage(){const map={visual:'#usageVisuals',audio:'#usageAudio',video:'#usageVideo'};for(const [k,sel] of Object.entries(map)){const el=$(sel);if(el)el.textContent=`${state.usage[k]||0} this session`}}
function safeLocalSet(key,value){try{localStorage.setItem(key,value);return true}catch(err){if(err?.name!=='QuotaExceededError'&&!/quota/i.test(String(err?.message||'')))console.warn('[CineTale storage] Local save failed',key,err);return false}}
function save(){for(const p of state.projects||[])captureProjectRecoverySnapshot(p);for(const p of state.projects||[])normalizeProjectIdentityBindings(p);const projectPayload=JSON.stringify(persistableProjects());const projectsSaved=safeLocalSet(storageKey,projectPayload);if(!projectsSaved)console.warn('[CineTale storage] Project JSON exceeded browser storage. Cloud sync and in-memory state remain active.');safeLocalSet(savedStoriesKey,JSON.stringify(state.savedStories||[]));if(state.currentId)safeLocalSet(currentKey,state.currentId);else try{localStorage.removeItem(currentKey)}catch{}scheduleCloudSave();return projectsSaved}
function current(){return state.projects.find(p=>p.id===state.currentId)||state.projects[0]||null}
function uid(prefix='id'){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`}
function ensureEpisodeIds(p){if(!p)return p;p.episodes=Array.isArray(p.episodes)?p.episodes:[];for(const e of p.episodes)e.id=e.id||uid('ep');if(!p.activeEpisodeId){const byNumber=p.episodes.find(e=>Number(e.number)===Number(p.activeEpisode));p.activeEpisodeId=byNumber?.id||p.episodes.at(-1)?.id||null}return p}
function episodeOf(p){if(!p)return null;ensureEpisodeIds(p);return (p.episodes||[]).find(e=>e.id===p.activeEpisodeId) || (p.episodes||[]).find(e=>Number(e.number)===Number(p.activeEpisode)) || (p.episodes||[]).at(-1) || null}
function formatTime(sec=0){const m=Math.floor(sec/60),s=Math.round(sec%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function updateProject(fn){const p=current();if(!p)return null;fn(p);p.updatedAt=new Date().toISOString();const persisted=save();renderAll();return {project:p,persisted}}
function updateProjectById(id,fn,{render=true}={}){const p=state.projects.find(x=>x.id===id);if(!p)return;fn(p);p.updatedAt=new Date().toISOString();save();if(render)renderAll()}
function visualCooldownSeconds(){return Math.max(0,Math.ceil((Number(state.visualCooldownUntil||0)-Date.now())/1000))}
function visualGenerationBlocked(){return visualCooldownSeconds()>0}
function visualBlockedMessage(){const sec=visualCooldownSeconds();return sec?`Visual generation is temporarily paused for about ${sec}s. Your project is saved.`:'Visual generation is temporarily unavailable. Your project is saved.'}
function setVisualCooldown(seconds=60,message=''){const sec=Math.max(15,Math.min(900,Number(seconds)||60));state.visualCooldownUntil=Date.now()+sec*1000;state.lastVisualErrorCode='VISUAL_QUOTA';state.providerHealth.visual={...state.providerHealth.visual,status:'limited',lastErrorAt:new Date().toISOString(),lastMessage:message||'Visual generation temporarily limited.'};queueMicrotask(()=>renderAll());setTimeout(()=>{if(!visualGenerationBlocked()){state.lastVisualErrorCode='';renderAll()}},sec*1000+250)}
function noteVisualSuccess(data={}){state.visualCooldownUntil=0;state.lastVisualErrorCode='';state.providerHealth.visual={status:'ready',route:data.providerRoute||'primary',lastSuccessAt:new Date().toISOString(),lastErrorAt:state.providerHealth.visual?.lastErrorAt||null,lastMessage:data.providerRoute==='backup'?'Backup visual service used successfully.':'Primary visual service used successfully.'}}
function preferVerifiedBackupVisual(){return state.backupVisualVerification?.status==='ready'||(state.providerHealth.visual?.status==='ready'&&state.providerHealth.visual?.route==='backup')}
const syncDiagnosticKey='cinetale.sync.diagnostics.v1';
const retryTelemetryKey='cinetale.sync.retry.telemetry.v1';
let syncDiagnosticEvents=[];
let retryTelemetry={retryClickCount:0,lastRetryClickedAt:'',lastSceneIndex:null,lastSceneId:'',lastSceneNumber:null,lastLabel:'',lastAction:'',lastUserInitiatedStage:'',lastUserInitiatedAt:'',lastUserInitiatedError:''};
try{const saved=JSON.parse(sessionStorage.getItem(syncDiagnosticKey)||'[]');if(Array.isArray(saved))syncDiagnosticEvents=saved.slice(-300)}catch{}
try{const saved=JSON.parse(sessionStorage.getItem(retryTelemetryKey)||'{}');if(saved&&typeof saved==='object')retryTelemetry={...retryTelemetry,...saved}}catch{}
function saveRetryTelemetry(){try{sessionStorage.setItem(retryTelemetryKey,JSON.stringify(retryTelemetry))}catch{}}
function recordRetryTelemetry(stage,project=null,scene=null,extra={}){
  const now=new Date().toISOString();
  if(stage==='retry-button-clicked-capture'){
    retryTelemetry.retryClickCount=Math.max(0,Number(retryTelemetry.retryClickCount)||0)+1;
    retryTelemetry.lastRetryClickedAt=now;
    retryTelemetry.lastSceneIndex=Number.isFinite(Number(extra.sceneIndex))?Number(extra.sceneIndex):null;
    retryTelemetry.lastSceneId=String(scene?.id||scene?.number||'');
    retryTelemetry.lastSceneNumber=Number(scene?.number)||null;
    retryTelemetry.lastLabel=String(extra.label||'');
    retryTelemetry.lastAction=String(extra.action||'');
  }
  if(extra.userInitiated===true||stage==='retry-button-clicked-capture'){
    retryTelemetry.lastUserInitiatedStage=String(stage||'');
    retryTelemetry.lastUserInitiatedAt=now;
    if(extra.error||extra.errorCode)retryTelemetry.lastUserInitiatedError=String(extra.error||extra.errorCode||'');
  }
  saveRetryTelemetry();
}
function canonicalMediaUrl(value=''){
  let raw=String(value||'').trim();if(!raw)return '';
  // Blob/data URLs are already complete browser-local media references. Never strip the `blob:`
  // prefix while looking for embedded http(s) tokens; doing so converts a valid object URL into
  // a bogus network URL and can detach the exact media bytes CineTale just validated.
  if(/^(?:blob:|data:)/i.test(raw))return raw;
  const origin=(typeof location!=='undefined'&&location.origin)?String(location.origin).replace(/\/+$/,''):'';
  // Production repair: when an already-absolute URL was accidentally prefixed with the app
  // origin, trust the final absolute URL token. This is independent of the current hostname and
  // therefore repairs both persisted values and DOM/runtime values deterministically.
  const protocolMatches=[...raw.matchAll(/https?:\/\//ig)];
  if(protocolMatches.length>1){
    const last=protocolMatches[protocolMatches.length-1];
    raw=raw.slice(last.index);
  }
  if(origin){
    let guard=0;
    while(raw.startsWith(origin)&&/^https?:\/\//i.test(raw.slice(origin.length))&&guard++<4)raw=raw.slice(origin.length);
  }
  const glued=raw.match(/^(https?:\/\/[^/?#]+)(https?:\/\/.+)$/i);if(glued)raw=glued[2];
  try{return new URL(raw,origin||undefined).href}catch{return raw}
}
function normalizeSceneMediaReferences(scene={}){
  for(const field of ['videoUrl','lipSyncVideoUrl','lipSyncRemoteVideoUrl','lipSyncSourceVideoUrl'])if(scene[field])scene[field]=canonicalMediaUrl(scene[field]);
  for(const shot of scene.coverageShots||[])if(shot?.videoUrl)shot.videoUrl=canonicalMediaUrl(shot.videoUrl);
  return scene;
}
function diagnosticUrl(value=''){const raw=canonicalMediaUrl(value);if(!raw)return '';try{const u=new URL(raw,(typeof location!=='undefined'&&location.origin)||undefined);return `${u.origin}${u.pathname}`}catch{return raw.split('?')[0].slice(0,240)}}
function syncDiag(stage,project=null,scene=null,extra={}){
  try{
    const ep=project?episodeOf(project):null;
    const event={at:new Date().toISOString(),stage:String(stage||''),build:APP_VERSION,projectId:String(project?.id||''),episodeId:String(ep?.id||ep?.number||''),sceneId:String(scene?.id||scene?.number||''),sceneNumber:Number(scene?.number)||null,title:String(scene?.title||''),lipSyncStatus:String(scene?.lipSyncStatus||''),providerStatus:String(scene?.lipSyncProviderStatus||''),validated:Boolean(project&&scene&&sceneHasValidatedLipSync(project,scene)),sourceOwned:Boolean(scene&&sceneSourceDurablyOwned(scene)),syncOwned:Boolean(scene&&sceneSyncDurablyOwned(scene)),operation:String(scene?.lipSyncOperation||''),generationId:String(scene?.lipSyncGenerationId||''),sourceStoragePath:String(scene?.videoStoragePath||''),syncStoragePath:String(scene?.lipSyncStoragePath||''),sourceUrl:diagnosticUrl(sceneMediaRuntimeUrl(scene||{},'source')||scene?.videoUrl||''),syncUrl:diagnosticUrl(sceneMediaRuntimeUrl(scene||{},'sync')||scene?.lipSyncVideoUrl||''),errorCode:String(scene?.lipSyncErrorCode||''),error:String(scene?.lipSyncError||''),...extra};
    syncDiagnosticEvents.push(event);if(syncDiagnosticEvents.length>300)syncDiagnosticEvents=syncDiagnosticEvents.slice(-300);sessionStorage.setItem(syncDiagnosticKey,JSON.stringify(syncDiagnosticEvents));recordRetryTelemetry(stage,project,scene,extra);renderSyncDiagnostics();
  }catch{}
}
function syncPlayerDiagnostics(){const out=[];document.querySelectorAll('video[data-scene-video-preview]').forEach(v=>out.push({sceneIndex:Number(v.dataset.sceneVideoPreview),src:diagnosticUrl(v.getAttribute('src')||''),currentSrc:diagnosticUrl(v.currentSrc||''),readyState:v.readyState,networkState:v.networkState,paused:v.paused,ended:v.ended,muted:v.muted,defaultMuted:v.defaultMuted,volume:v.volume,duration:Number.isFinite(v.duration)?v.duration:null,lipSyncReady:v.dataset.lipSyncReady||'',syncGated:v.dataset.syncGated||'',voiceSync:v.dataset.voiceSync||'',pendingAdoption:v.dataset.lipSyncPendingAdoption||''}));return out}
function syncDiagnosticReport(){const p=current(),ep=episodeOf(p);return {product:'CineTale Studio',build:APP_VERSION,capturedAt:new Date().toISOString(),retryTelemetry:{...retryTelemetry},project:p?{id:p.id,title:p.title,episodeId:ep?.id||ep?.number||'',scenes:(ep?.scenes||[]).map((s,i)=>({index:i,id:s.id||'',number:s.number||i+1,title:s.title||'',sourceOwned:sceneSourceDurablyOwned(s),syncOwned:sceneSyncDurablyOwned(s),hasValidatedSync:sceneHasValidatedLipSync(p,s),videoPrimaryShotId:s.videoPrimaryShotId||'',videoPrimarySpeaker:s.videoPrimarySpeaker||'',videoPrimarySpokenLine:s.videoPrimarySpokenLine||'',videoStoragePath:s.videoStoragePath||'',lipSyncStoragePath:s.lipSyncStoragePath||'',lipSyncStatus:s.lipSyncStatus||'',lipSyncProviderStatus:s.lipSyncProviderStatus||'',lipSyncOperation:s.lipSyncOperation||'',lipSyncGenerationId:s.lipSyncGenerationId||'',lipSyncRequestDigest:s.lipSyncRequestDigest||'',lipSyncProductionContract:s.lipSyncProductionContract||'',lipSyncErrorCode:s.lipSyncErrorCode||'',lipSyncError:s.lipSyncError||'',sourceRuntimeUrl:diagnosticUrl(sceneMediaRuntimeUrl(s,'source')||s.videoUrl||''),syncRuntimeUrl:diagnosticUrl(sceneMediaRuntimeUrl(s,'sync')||s.lipSyncVideoUrl||'')}))}:null,players:syncPlayerDiagnostics(),events:syncDiagnosticEvents.slice(-200)} }
function renderSyncDiagnostics(){const box=document.getElementById('syncDiagnosticResult'),summary=document.getElementById('retryTelemetrySummary');if(summary){const count=Math.max(0,Number(retryTelemetry.retryClickCount)||0),last=retryTelemetry.lastRetryClickedAt?` · last ${retryTelemetry.lastRetryClickedAt}`:'',stage=retryTelemetry.lastUserInitiatedStage?` · stage ${retryTelemetry.lastUserInitiatedStage}`:'';summary.textContent=`Retry clicks captured: ${count}${last}${stage}`}if(!box)return;try{box.textContent=JSON.stringify(syncDiagnosticReport(),null,2)}catch(e){box.textContent=`Diagnostic report unavailable: ${e.message||e}`}}
function bindRetryCaptureTelemetry(){
  if(document.__cinetaleRetryCaptureBound)return;document.__cinetaleRetryCaptureBound=true;
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-scene-video]');if(!button)return;
    const i=Number(button.dataset.sceneVideo),p=current(),ep=episodeOf(p),scene=ep?.scenes?.[i];if(!p||!scene)return;
    const action=sceneVideoAction(scene,p);if(action!=='complete')return;
    const extra={sceneIndex:i,action,label:String(button.textContent||''),userInitiated:true,allowSubmit:true,capturePhase:true};
    recordRetryTelemetry('retry-button-clicked-capture',p,scene,extra);
    syncDiag('retry-button-clicked-capture',p,scene,extra);
  },true);
}
bindRetryCaptureTelemetry();

function paidVideoGenerationAllowed(){return state.runtimeConfig?.paidGenerationAllowed!==false}
function apiPost(url,body,{headers={}}={}){if(url==='/api/video-job'&&!paidVideoGenerationAllowed()){const err=new Error(state.runtimeConfig?.reason||'Paid video generation is locked in this development deployment. Existing provider jobs can still be recovered.');err.status=423;err.code='PAID_GENERATION_LOCKED';return Promise.reject(err)}return fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(d.error||'Request failed');err.status=r.status;err.code=d.errorCode||d.code||'';err.details=d;if(url==='/api/generate-image'){state.lastVisualErrorCode=err.code||'';const attempts=Array.isArray(d.providerAttempts)?d.providerAttempts:[];const triedBackup=attempts.some(x=>x?.provider==='openai');const triedPrimary=attempts.some(x=>x?.provider==='gemini');const detail=triedBackup&&triedPrimary?'Primary and backup visual routes were both attempted.':triedBackup?'Backup visual route was attempted.':triedPrimary?'Primary visual route was attempted.':'';if(err.code==='VISUAL_QUOTA')setVisualCooldown(d.retryAfterSec||60,`${d.error||'Visual generation temporarily limited.'}${detail?' '+detail:''}`);else state.providerHealth.visual={...state.providerHealth.visual,status:'error',lastErrorAt:new Date().toISOString(),lastMessage:`${d.error||'Visual generation failed.'}${detail?' '+detail:''}`}}throw err}if(url==='/api/generate-image')noteVisualSuccess(d);return d})}
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
function syncProductionProfile(){document.querySelectorAll('[data-production-profile]').forEach(b=>b.classList.toggle('active',b.dataset.productionProfile===productionProfile))}
document.querySelectorAll('[data-production-profile]').forEach(b=>b.onclick=()=>{productionProfile=b.dataset.productionProfile||'balanced';syncProductionProfile()});
syncProductionProfile();

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
  const map={english:'en-US',spanish:'es-ES',hindi:'hi-IN',french:'fr-FR',german:'de-DE',italian:'it-IT',portuguese:'pt-BR',arabic:'ar-SA',japanese:'ja-JP',korean:'ko-KR','mandarin chinese':'zh-CN',cantonese:'zh-HK',tamil:'ta-IN',telugu:'te-IN',kannada:'kn-IN',malayalam:'ml-IN',marathi:'mr-IN',bengali:'bn-IN',gujarati:'gu-IN',punjabi:'pa-IN',urdu:'ur-PK',assamese:'as-IN',odia:'or-IN',nepali:'ne-NP',sinhala:'si-LK',thai:'th-TH',vietnamese:'vi-VN',indonesian:'id-ID',malay:'ms-MY',filipino:'fil-PH','filipino / tagalog':'fil-PH',swahili:'sw-KE',russian:'ru-RU',ukrainian:'uk-UA',polish:'pl-PL',turkish:'tr-TR',dutch:'nl-NL',greek:'el-GR',hebrew:'he-IL','persian / farsi':'fa-IR',persian:'fa-IR',farsi:'fa-IR'};
  return map[first]||navigator.language||document.documentElement.lang||'en';
}
let storyRecognizer=null,storyRecorder=null,storyRecorderStream=null,storyRecorderChunks=[],storyRecordTimer=null;
function appendStoryTranscript(text){
  const clean=String(text||'').trim(); if(!clean)return;
  const box=$('#idea'); const prefix=box.value.trim()?box.value.trim()+' ':''; box.value=(prefix+clean).slice(0,12000); state.storyInputMethod='voice';
}
function resetMicUI(){state.speechListening=false;$('#storyMicBtn')?.classList.remove('listening','recording');if($('#storyMicText'))$('#storyMicText').textContent='Speak'}
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
    storyRecorder.onstart=()=>{state.speechListening=true;state.storyInputMethod='voice';$('#storyMicBtn')?.classList.add('recording');$('#storyMicText').textContent='Stop';$('#speechStatus').textContent='Recording… speak naturally, then press Stop & transcribe.'};
    storyRecorder.onerror=()=>{$('#speechStatus').textContent='Voice recording stopped. Check microphone permission or type your story instead.';stopStorySpeech()};
    storyRecorder.onstop=async()=>{const chunks=[...storyRecorderChunks];const mime=storyRecorder?.mimeType||chunks[0]?.type||'audio/webm';if(storyRecorderStream){for(const t of storyRecorderStream.getTracks())t.stop();storyRecorderStream=null}resetMicUI();$('#speechStatus').textContent='Transcribing…';try{await transcribeRecordedStory(new Blob(chunks,{type:mime}))}catch(e){$('#speechStatus').textContent=e.message||'Voice transcription could not be completed.';toast(e.message||'Voice transcription could not be completed.')}};
    storyRecorder.start(500);storyRecordTimer=setTimeout(()=>{if(storyRecorder?.state==='recording')storyRecorder.stop()},90000);
  }catch(e){resetMicUI();$('#speechStatus').textContent='Microphone could not start. Check browser permission or type your story instead.';toast('Microphone could not start. Check browser microphone permission.')}
}
function startStorySpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){startRecordedStorySpeech();return}
  stopStorySpeech();storyRecognizer=new SR();storyRecognizer.lang=speechLangFor($('#language')?.value||'English');storyRecognizer.continuous=true;storyRecognizer.interimResults=true;
  let finalChunk='';storyRecognizer.onstart=()=>{state.speechListening=true;state.storyInputMethod='voice';$('#storyMicBtn')?.classList.add('listening');$('#storyMicText').textContent='Stop';$('#speechStatus').textContent='Listening… speak naturally. Your words will appear in the story box.'};
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
function startEditSetup(){const p=current();if(!p){toast('Create a project first.');return}state.editingProjectId=p.id;state.storySource=p.storySource||'idea';applyStorySourceUI();$('#idea').value=p.idea||p.logline||'';pickerState.genre=String(p.genre||'Mystery').split(/\s*\+\s*/).filter(Boolean);pickerState.language=String(p.language||'English').split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language');applyAudienceValue(p.audience||'Teen (13–17)');setSelectValue('#duration',p.duration||'2–3 minutes');setSelectValue('#castSize',p.castSize||'auto');setSelectValue('#visualStylePreset',p.visualStylePreset||'cinematic-realistic');$('#customStyle').value=p.customVisualStyle||'';$('#customStyleWrap').classList.toggle('hidden',$('#visualStylePreset').value!=='custom');setSelectValue('#languageScope',p.languageScope||'entire-story');setSelectValue('#culturalTreatment',p.culturalTreatment||'auto');setSelectValue('#sacredRepresentation',p.sacredRepresentation||'auto');$('#languageDirection').value=p.languageDirection||'';if($('#culturalContext'))$('#culturalContext').value=p.culturalContext||'';if($('#regionCommunity'))$('#regionCommunity').value=p.regionCommunity||p.worldBible?.globalContext?.regionCommunity||'';if($('#beliefContext'))$('#beliefContext').value=p.beliefContext||p.worldBible?.globalContext?.beliefContext||'';if($('#traditionContext'))$('#traditionContext').value=p.traditionContext||p.worldBible?.globalContext?.traditionContext||'';if($('#eraPlace'))$('#eraPlace').value=p.eraPlace||p.worldBible?.globalContext?.eraPlace||'';setSelectValue('#culturalGrounding',p.culturalGrounding||p.worldBible?.globalContext?.grounding||'grounded');setSelectValue('#languageBehavior',p.languageBehavior||p.worldBible?.globalContext?.languageBehavior||'natural');productionProfile=p.productionProfile||'balanced';syncProductionProfile();setSelectValue('#continuityStrength',p.continuityStrength||'strict');state.format=p.format||'Episode';applyFormatUI(false);setSelectValue('#duration',p.duration||formatConfig().defaultDuration);state.controlMode=p.controlMode||'Guided';$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.control===state.controlMode));$('#directorFields').classList.toggle('hidden',state.controlMode!=='Director');$('#editSetupBanner').classList.remove('hidden');$('#saveSetupOnly').classList.remove('hidden');$('#createButton span').textContent=`Rebuild ${formatConfig().title.toLowerCase()}`;setView('create');}
function cancelEditSetup(){state.editingProjectId=null;$('#editSetupBanner').classList.add('hidden');$('#saveSetupOnly').classList.add('hidden');$('#createButton span').textContent=formatConfig().createLabel}
function creativeDiversityContext(){return (state.projects||[]).slice(0,12).map(p=>({title:p.title||'',format:p.format||'',genre:p.genre||'',logline:p.logline||'',world:p.worldBible?.premise||'',characters:(p.characters||[]).map(c=>c.name).filter(Boolean).slice(0,8),episodeTitles:(p.episodes||[]).map(e=>e.title).filter(Boolean).slice(0,4),storySignature:String(p.episodes?.[0]?.storyText||'').replace(/\s+/g,' ').slice(0,320)}))}
function setupInput(){const visualStylePreset=$('#visualStylePreset').value,customVisualStyle=$('#customStyle').value.trim();return {idea:$('#idea').value.trim(),storySource:state.storySource||'idea',inputMethod:state.storyInputMethod||'text',format:state.format,genre:$('#genre').value.trim(),audience:audienceValue(),duration:$('#duration').value,castSize:$('#castSize').value,style:stylePromptFromPreset(visualStylePreset,customVisualStyle),visualStylePreset,customVisualStyle,language:$('#language').value.trim(),languageScope:$('#languageScope').value,culturalTreatment:$('#culturalTreatment').value,sacredRepresentation:$('#sacredRepresentation')?.value||'auto',languageDirection:$('#languageDirection').value.trim(),culturalContext:$('#culturalContext')?.value.trim()||'',regionCommunity:$('#regionCommunity')?.value.trim()||'',beliefContext:$('#beliefContext')?.value.trim()||'',traditionContext:$('#traditionContext')?.value.trim()||'',eraPlace:$('#eraPlace')?.value.trim()||'',culturalGrounding:$('#culturalGrounding')?.value||'grounded',languageBehavior:$('#languageBehavior')?.value||'natural',productionProfile,continuityStrength:$('#continuityStrength').value,controlMode:state.controlMode,characterDirection:$('#characterDirection')?.value.trim(),voiceDirection:$('#voiceDirection')?.value.trim(),soundDirection:$('#soundDirection')?.value.trim(),diversityContext:(state.storySource||'idea')==='idea'?creativeDiversityContext():[]}}
const manageBtn=$('#studioManageBtn'),manageMenu=$('#studioManageMenu');
function closeStudioManage(){manageMenu?.classList.add('hidden');manageBtn?.setAttribute('aria-expanded','false')}
if(manageBtn&&manageMenu){manageBtn.onclick=e=>{e.stopPropagation();const opening=manageMenu.classList.contains('hidden');manageMenu.classList.toggle('hidden',!opening);manageBtn.setAttribute('aria-expanded',String(opening))};manageMenu.addEventListener('click',()=>closeStudioManage());document.addEventListener('click',e=>{if(!e.target.closest('.studio-manage-wrap'))closeStudioManage()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeStudioManage()})}
$('#narratorVoiceBtn').onclick=()=>openNarratorVoicePicker();
function storyDraftTitle(text=''){const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return 'Untitled story';const first=clean.split(/[.!?]/)[0].trim();return first.length>64?first.slice(0,61).trim()+'…':first}
function saveStoryDraftFromCreate(){const input=setupInput();if(String(input.idea||'').trim().length<8){toast('Add a little more of your story before saving it.');return}const item={id:uid('story'),title:storyDraftTitle(input.idea),idea:input.idea,storySource:input.storySource,format:input.format,genre:input.genre,audience:input.audience,duration:input.duration,language:input.language,visualStylePreset:input.visualStylePreset,customVisualStyle:input.customVisualStyle,languageScope:input.languageScope,culturalTreatment:input.culturalTreatment,sacredRepresentation:input.sacredRepresentation,languageDirection:input.languageDirection,culturalContext:input.culturalContext,regionCommunity:input.regionCommunity,beliefContext:input.beliefContext,traditionContext:input.traditionContext,eraPlace:input.eraPlace,culturalGrounding:input.culturalGrounding,languageBehavior:input.languageBehavior,productionProfile:input.productionProfile,continuityStrength:input.continuityStrength,controlMode:input.controlMode,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};state.savedStories.unshift(item);save();renderLibrary();toast('Saved to My Stories — no generation credits used.')}
function loadSavedStory(id){const d=(state.savedStories||[]).find(x=>x.id===id);if(!d)return;state.editingProjectId=null;state.storySource=d.storySource||'full-story';applyStorySourceUI();$('#idea').value=d.idea||'';pickerState.genre=String(d.genre||'Mystery').split(/\s*\+\s*/).filter(Boolean);pickerState.language=String(d.language||'English').split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language');applyAudienceValue(d.audience||'Teen (13–17)');state.format=d.format||'Story';applyFormatUI(false);setSelectValue('#duration',d.duration||formatConfig().defaultDuration);setSelectValue('#visualStylePreset',d.visualStylePreset||'cinematic-realistic');$('#customStyle').value=d.customVisualStyle||'';$('#customStyleWrap').classList.toggle('hidden',$('#visualStylePreset').value!=='custom');setSelectValue('#languageScope',d.languageScope||'entire-story');setSelectValue('#culturalTreatment',d.culturalTreatment||'auto');setSelectValue('#sacredRepresentation',d.sacredRepresentation||'auto');$('#languageDirection').value=d.languageDirection||'';if($('#culturalContext'))$('#culturalContext').value=d.culturalContext||'';if($('#regionCommunity'))$('#regionCommunity').value=d.regionCommunity||'';if($('#beliefContext'))$('#beliefContext').value=d.beliefContext||'';if($('#traditionContext'))$('#traditionContext').value=d.traditionContext||'';if($('#eraPlace'))$('#eraPlace').value=d.eraPlace||'';setSelectValue('#culturalGrounding',d.culturalGrounding||'grounded');setSelectValue('#languageBehavior',d.languageBehavior||'natural');productionProfile=d.productionProfile||'balanced';syncProductionProfile();setSelectValue('#continuityStrength',d.continuityStrength||'strict');state.controlMode=d.controlMode||'Guided';$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.control===state.controlMode));setView('create');toast('Story loaded. You can edit it before creating a production.')}
function deleteSavedStory(id){const d=(state.savedStories||[]).find(x=>x.id===id);if(!d)return;if(!confirm(`Delete “${d.title||'this story'}” from My Stories?`))return;state.savedStories=state.savedStories.filter(x=>x.id!==id);save();renderLibrary();toast('Story removed from My Stories.')}
$('#saveStoryDraft').onclick=saveStoryDraftFromCreate;

$('#cancelEditSetup').onclick=cancelEditSetup;$('#editStorySetup').onclick=startEditSetup;$('#saveSetupOnly').onclick=()=>{const p=state.projects.find(x=>x.id===state.editingProjectId);if(!p)return;const input=setupInput();if(normalizedFormat(input.format)!==normalizedFormat(p.requestedFormat||p.format)){toast('Changing the creation type requires Rebuild so the project structure stays consistent.');return}Object.assign(p,input,{format:normalizedFormat(input.format),requestedFormat:normalizedFormat(input.format),targetRuntimeSec:durationTargetSeconds(input.duration),updatedAt:new Date().toISOString()});save();renderAll();cancelEditSetup();setView('studio');toast('Project setup updated. Existing story structure was kept.')}

$('#createForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const idea=$('#idea').value.trim(); if(idea.length<8){toast(state.storySource==='full-story'?'Add a little more of your story.':'Add a little more detail to your idea.');return}
  const btn=$('#createButton'), old=btn.innerHTML; btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> Building ${formatConfig().title.toLowerCase()}…`;
  const input=setupInput();
  const editingId=state.editingProjectId;
  if(editingId&&!confirm('Rebuild this story from the edited setup? Existing story structure and generated assets in this project will be replaced. Use “Save settings only” if you want to keep them.')){btn.disabled=false;btn.innerHTML=old;return}
  try{const d=await apiPost('/api/generate-plan',input);const p=d.plan;const existing=editingId?state.projects.find(x=>x.id===editingId):null;p.format=normalizedFormat(input.format,'Story');p.requestedFormat=p.format;p.duration=input.duration||p.duration||formatConfig(p.format).defaultDuration;p.targetRuntimeSec=durationTargetSeconds(p.duration)||Number(p.targetRuntimeSec)||0;p.id=existing?.id||p.id||uid('ct');p.createdAt=existing?.createdAt||p.createdAt;p.activeEpisode=p.activeEpisode||1;p.episodes=p.episodes||[];ensureEpisodeIds(p);p.activeEpisodeId=p.episodes[0]?.id||null;if(editingId){const idx=state.projects.findIndex(x=>x.id===editingId);state.projects[idx]=p;cancelEditSetup()}else state.projects.unshift(p);state.currentId=p.id;save();renderAll();setView('studio');toast(editingId?`${formatConfig(p.format).title} rebuilt from updated setup.`:(d.mode==='ai'?`${formatConfig(p.format).title} created.`:`${formatConfig(p.format).title} created in demo mode. Add API keys when ready for live generation.`))}catch(err){toast(err.message)}finally{btn.disabled=false;btn.innerHTML=old}
});

function duplicateSavedStory(id){const d=(state.savedStories||[]).find(x=>x.id===id);if(!d)return;const copy=structuredClone(d);copy.id=uid('story');copy.title=`${d.title||'Untitled story'} — Copy`;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;state.savedStories.unshift(copy);save();renderLibrary();toast('Saved story duplicated.')}

function projectMatchesFilter(p){const norm=v=>String(v||'').trim().toLowerCase();const q=norm(state.projectSearch||'');const archived=Boolean(p.archived);if(state.projectStatusFilter==='active'&&archived)return false;if(state.projectStatusFilter==='archived'&&!archived)return false;if(!q)return true;return norm(`${p.title||''} ${p.genre||''} ${p.format||''} ${p.logline||''}`).includes(q)}
function sortedProjects(){const list=state.projects.filter(projectMatchesFilter);const mode=state.projectSort||'updated';return list.sort((a,b)=>{if(mode==='title')return String(a.title||'').localeCompare(String(b.title||''));const key=mode==='created'?'createdAt':'updatedAt';return new Date(b[key]||b.createdAt||0)-new Date(a[key]||a.createdAt||0)})}
function duplicateProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;const copy=structuredClone(p);copy.id=uid('ct');copy.title=`${p.title||'Untitled'} — Copy`;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;copy.finalAssembly=null;state.projects.unshift(copy);state.currentId=copy.id;save();renderAll();toast('Project duplicated.')}
function renameProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;const name=prompt('Rename project',p.title||'Untitled');if(!name?.trim())return;p.title=name.trim();p.updatedAt=new Date().toISOString();save();renderAll();toast('Project renamed.')}
function archiveProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;p.archived=!p.archived;p.updatedAt=new Date().toISOString();save();renderAll();toast(p.archived?'Project archived.':'Project restored.')}
async function deleteProject(id){const p=state.projects.find(x=>x.id===id);if(!p||!confirm(`Delete “${p.title||'this project'}”? ${authUser()?'It and any account-saved final video will be removed from this profile and this browser.':'It will be removed from this browser.'} This cannot be undone unless you exported a backup.`))return;try{if(authUser()){const finalPaths=projectFinalVideoCloudPaths(p);if(finalPaths.length)await deleteFinalVideoCloudPaths(finalPaths)}}catch(e){toast(e.message||'Could not remove the saved final video. Project deletion was stopped.');return}state.projects=state.projects.filter(x=>x.id!==id);if(state.currentId===id)state.currentId=state.projects.find(x=>!x.archived)?.id||state.projects[0]?.id||null;save();renderAll();toast(authUser()?'Project and saved final video deleted from your profile.':'Project deleted.')}
function openProject(id){
  const p=state.projects.find(x=>x.id===id);
  if(!p){toast('That project is no longer available.');renderProjects();return false}
  const nav=state.projectNavigation;
  if(nav.locked&&nav.id===id)return true;
  nav.locked=true;nav.id=id;nav.epoch+=1;
  clearTimeout(nav.unlockTimer);
  state.currentId=id;
  safeLocalSet(currentKey,id);
  // Navigation must win over cloud autosave/rerenders. Switch views synchronously first.
  setView('studio');
  queueMicrotask(()=>{save();reconcilePersistedVideoJobsOnOpen(id).catch(()=>{})});
  nav.unlockTimer=setTimeout(()=>{nav.locked=false;nav.id=null},900);
  return true
}
function renderProjects(){const grid=$('#projectsGrid');const projects=sortedProjects();if(!state.projects.length){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">✦</div><h2>No projects yet</h2><p>Start with one idea and CineTale will build your first universe.</p><button class="primary" data-empty-create>Create a project</button></div>`;grid.querySelector('[data-empty-create]')?.addEventListener('click',()=>setView('create'));return}if(!projects.length){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">⌕</div><h2>No matching projects</h2><p>Change the search or project filter to see more.</p><button class="ghost" data-reset-project-filter>Reset filters</button></div>`;grid.querySelector('[data-reset-project-filter]').onclick=()=>{state.projectSearch='';state.projectStatusFilter='active';$('#projectSearch').value='';$('#projectStatusFilter').value='active';renderProjects()};return}
  grid.innerHTML=projects.map((p,i)=>`<article class="project-card surface ${p.archived?'project-archived':''}"><button class="project-open" type="button" data-project="${esc(p.id)}" aria-label="Open ${esc(p.title||'Untitled project')}"><div class="project-cover" style="filter:hue-rotate(${(i*37)%150}deg)"></div><div class="project-body"><small>${esc(p.format||'Project')} · ${esc(p.genre||'Open')}${p.archived?' · ARCHIVED':''}</small><h3>${esc(p.title||'Untitled')}</h3><p>${esc(p.logline||'')}</p><div class="project-meta"><span>${p.format==='Episode'?`${(p.episodes||[]).length} episode${(p.episodes||[]).length===1?'':'s'}`:`Standalone ${String(p.format||'project').toLowerCase()}`}</span><span>${p.generationMode==='ai'?'AI':'Demo'}</span></div></div></button><div class="project-actions"><button class="ghost small" type="button" data-project-rename="${esc(p.id)}">Rename</button><button class="ghost small" type="button" data-project-duplicate="${esc(p.id)}">Duplicate</button><button class="ghost small" type="button" data-project-archive="${esc(p.id)}">${p.archived?'Restore':'Archive'}</button><button class="ghost danger small" type="button" data-project-delete="${esc(p.id)}">Delete</button></div></article>`).join('');
  $$('[data-project-rename]').forEach(btn=>btn.onclick=()=>renameProject(btn.dataset.projectRename));
  $$('[data-project-duplicate]').forEach(btn=>btn.onclick=()=>duplicateProject(btn.dataset.projectDuplicate));
  $$('[data-project-archive]').forEach(btn=>btn.onclick=()=>archiveProject(btn.dataset.projectArchive));
  $$('[data-project-delete]').forEach(btn=>btn.onclick=()=>deleteProject(btn.dataset.projectDelete));
}
function renderVoiceResolutionBanner(p=current(),ep=episodeOf(p)){
  const host=$('#voiceResolutionBanner');if(!host)return;
  const ctx=state.voiceResolutionContext;
  if(!ctx||!p||ctx.projectId!==p.id||!ep||(ctx.episodeId&&ctx.episodeId!==ep.id)){host.classList.add('hidden');host.innerHTML='';return}
  const characterIndexes=voiceResolutionCharacterIndexes(p,ep,ctx.scope),narrator=ctx.scope==='audio'&&narratorNeedsVoiceResolution(p,ep),issues=ctx.scope==='cast'?castVoiceReviewIssues(p).map(x=>`${x.c?.name||'Character'}: voice review needed`):audioVoiceReadinessIssues(p,ep);
  state.voiceResolutionContext={...ctx,characterIndexes,narrator};
  if(!issues.length){host.classList.remove('hidden');host.classList.add('resolved');host.innerHTML=`<div><span class="kicker">VOICE RESOLUTION COMPLETE</span><b>All required voices are ready.</b><small>Returning to ${ctx.scope==='cast'?'Cast Review':'Audio Review'}…</small></div>`;if(document.querySelector('#characters.view.active'))setTimeout(()=>{if(!state.voiceResolutionContext)return;state.voiceResolutionContext=null;setView('studio');setTimeout(()=>document.querySelector('#studioStageGate')?.scrollIntoView({behavior:'smooth',block:'start'}),0);toast(ctx.scope==='cast'?'Voice reviews resolved. Cast Review is ready.':'Voices resolved. Audio Review recalculated automatically.');},350);return}
  host.classList.remove('hidden','resolved');
  const names=characterIndexes.map(i=>p.characters?.[i]?.name).filter(Boolean);
  const readiness=voiceResolutionReadinessModel(p);
  const readinessHeadline=readiness?`Voice readiness: ${readiness.ready} ready${readiness.attention?` · ${readiness.attention} need attention`:''}`:(names.length?`${names.length} character voice${names.length===1?'':'s'} need attention`:'Voice setup needs attention');
  const readinessRows=readiness?.rows?.length?readiness.rows.map(row=>`<div class="voice-readiness-row ${esc(row.status)}"><span class="voice-readiness-dot" aria-hidden="true"></span><div><b>${esc(row.name)}</b><small>${esc(voiceResolutionStatusLabel(row))}${voiceResolutionStatusDetail(row)?` · ${esc(voiceResolutionStatusDetail(row))}`:''}</small></div></div>`).join(''):'';
  const sharedBlocker=readiness?.sharedBlocker||'';
  const unrepresentedIssues=readinessRows?issues.filter(issue=>!readiness?.rows?.some(row=>String(issue||'').startsWith(`${row.name}:`))):issues;
  const issueSummary=unrepresentedIssues.length?`<small>${esc(unrepresentedIssues.join(' · '))}</small>`:'';
  host.innerHTML=`<div class="voice-resolution-copy"><span class="kicker">${ctx.scope==='cast'?'CAST VOICE REVIEW':'AUDIO VOICE RESOLUTION'}</span><b>${esc(readinessHeadline)}</b>${issueSummary}${readinessRows?`<div class="voice-resolution-auto-summary"><span>CineTale auto-resolution</span><div class="voice-readiness-list">${readinessRows}</div>${sharedBlocker?`<div class="voice-shared-blocker">${esc(sharedBlocker)}</div>`:''}</div>`:''}</div><div class="voice-resolution-actions">${narrator?'<button class="ghost" type="button" data-resolve-narrator>Open narrator voice</button>':''}<button class="ghost" type="button" data-return-stage>${ctx.scope==='cast'?'Back to Cast':'Back to Audio'}</button></div>`;
  host.querySelector('[data-resolve-narrator]')?.addEventListener('click',()=>openNarratorVoicePicker());
  host.querySelector('[data-return-stage]')?.addEventListener('click',()=>{state.voiceResolutionContext=null;setView('studio');setTimeout(()=>document.querySelector('#studioStageGate')?.scrollIntoView({behavior:'smooth',block:'start'}),0)});
}
function controlledVoiceFallbacks(voices=[],c={},p={}){
  const intent=voiceAutoIntent(c,p);if(intent.archetype!=='human'||!intent.age)return [];
  const allowedAge={Child:['Teen'],Teen:['Young adult'],Mature:['Adult']}[intent.age]||[];if(!allowedAge.length)return [];
  return voices.filter(v=>{
    const m=voiceMetadata(v);if(intent.languages.length&&!intent.languages.every(x=>voiceLanguageMatches(m,x,true)))return false;
    if(intent.locale&&!voiceLocaleMatches(m,intent.locale))return false;
    if(intent.presentation&&m.gender&&m.gender!=='Neutral'&&m.gender!==intent.presentation)return false;
    return allowedAge.includes(normalizeVoiceAge(m.age));
  }).map(v=>({v,reasons:voiceSuitabilityReasons(v,c,p)})).filter(x=>x.reasons.length===1&&/^Age mismatch/.test(x.reasons[0])).sort((a,b)=>voiceMatchScore(b.v,c,p)-voiceMatchScore(a.v,c,p));
}
function voiceResolutionTargetSummary(c={},p={}){return voiceAutoIntentSummary(c,p)||'Character voice requirements'}
function localCharacterVoicePersisted(projectId,characterId,voiceId){
  try{const projects=safeParse(localStorage.getItem(storageKey),[]);const p=(projects||[]).find(x=>x?.id===projectId),c=(p?.characters||[]).find(x=>characterId&&x?.id===characterId)||p?.characters?.find(x=>x?.voiceId===voiceId);return Boolean(c?.voiceId===voiceId&&c?.voiceLocked)}catch{return false}
}
async function applyResolvedCharacterVoice(index,v,{fallback=false,reasons=[],resolution='controlled-fallback',source='catalog',renderConfirmation=true}={}){
  const p=current(),character=p?.characters?.[index];if(!p||!character||!v?.voice_id)return false;
  const projectId=p.id,characterId=character.id||'',provider=voiceMetadata(v).provider||v.meta?.provider||'elevenlabs',now=new Date().toISOString();
  // Apply the assignment directly to the authoritative in-memory project first. Do not run a full
  // render cycle in the middle of a paid/generated voice adoption; that could replace the modal
  // while its click handler is still finalizing and leave the creator staring at “Saving…”.
  const t=p.characters[index];applyCharacterVoiceSelection(p,index,{voiceId:v.voice_id,voiceName:v.name||'Selected voice',mode:'custom',locked:true});t.voiceAutoDecision=null;invalidateSpeakingSyncForCharacterVoiceChange(p,index);invalidateStudioStages(p,'cast');
  if(fallback){const signature=voiceLockRequirementSignature(t,p);t.voiceLockReview={status:'needs-review',signature,voiceId:v.voice_id,voiceName:v.name||'',reasons:[...reasons],auditedAt:now,acknowledged:true,acknowledgedAt:now,resolution};t.voiceManualOverride={approvedAt:now,issues:[...reasons],target:voiceAutoIntent(t,p),provider,voiceId:v.voice_id,resolution};t.voiceFallback={approved:true,approvedAt:now,age:normalizeVoiceAge(v.meta?.age||'Teen')||'Teen',provider,voiceId:v.voice_id,voiceName:v.name||'',resolution,source}}
  if(p.voiceResolutionSummary?.characters?.[index]){const row=p.voiceResolutionSummary.characters[index];row.status='ready';row.voiceName=v.name||'Selected voice';row.provider=provider;row.reasons=[];row.approvedFallback=Boolean(fallback);row.fallbackAge=fallback?(normalizeVoiceAge(v.meta?.age||'Teen')||'Teen'):'';row.resolution=fallback?resolution:'';p.voiceResolutionSummary.counts={ready:p.voiceResolutionSummary.characters.filter(r=>['ready','auto-ready','auto-available'].includes(r.status)).length,blocked:p.voiceResolutionSummary.characters.filter(r=>r.status==='blocked').length,review:p.voiceResolutionSummary.characters.filter(r=>r.status==='override-or-review').length};p.voiceResolutionSummary.updatedAt=now}
  p.updatedAt=now;
  const persisted=save();
  const live=current()?.characters?.[index],memoryOk=Boolean(live?.voiceId===v.voice_id&&live?.voiceLocked),ledgerOk=Boolean(memoryOk&&persistVoiceAssignmentLedger(current(),live,index)),localOk=Boolean(persisted!==false&&localCharacterVoicePersisted(projectId,characterId,v.voice_id));
  // A voice choice becomes usable as soon as CineTale verifies the live assignment plus either
  // the compact durable voice ledger or the local project save. Cloud sync is intentionally
  // non-blocking here: the large workspace upsert must never leave a paid/generated voice
  // stuck on "Saving…" after the provider has already succeeded.
  const durableOk=Boolean(memoryOk&&(localOk||ledgerOk));
  let cloudOk=state.cloudSync.status==='synced'||state.cloudSync.status==='unavailable';
  if(memoryOk&&authUser()&&state.authConfig?.configured&&state.cloudSync.status!=='unavailable'){
    void pushCloudWorkspace().then(()=>{cloudOk=state.cloudSync.status==='synced'}).catch(()=>{});
  }
  if(!durableOk){toast('Voice save failed — the voice was not durably assigned. CineTale kept the generated option available so you can recover without regenerating it.');renderCharacters();return false}
  clearAudioPreviewCache();voiceCatalogCache=null;renderCharacters();renderStudioStageGate?.(current(),episodeOf(current()));renderVoiceResolutionBanner(current(),episodeOf(current()));
  resumeAutomaticDialogueFinalizationSoon();
  const remainingRows=voiceProductionReadiness(current(),episodeOf(current()),'audio').characters||[],remaining=remainingRows.length,nextIndex=remainingRows.find(x=>x.index!==index)?.index;
  const savedName=v.name||'Voice',fallbackLabel=fallback?`${normalizeVoiceAge(v.meta?.age||'Teen')||'Teen'} fallback · creator approved`:'Production voice';
  if(renderConfirmation){$('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal voice-save-confirmation"><span class="kicker">VOICE SAVED</span><h2>${esc(live?.name||'Character')}</h2><div class="voice-resolution-state resolved"><b>Saved ✓</b><small>${esc(savedName)} · ${esc(fallbackLabel)}. CineTale verified the assignment in the project and durable voice ledger before marking it ready.</small></div><div class="voice-resolution-target-box"><span>Production readiness</span><b>${remaining?`${remaining} voice requirement${remaining===1?'':'s'} remain`:'All required voices are ready'}</b></div><div class="modal-actions">${Number.isInteger(nextIndex)?'<button class="primary" type="button" id="voiceSaveNext">Resolve next voice</button>':''}<button class="ghost" type="button" id="voiceSaveDone">Done</button></div></div>`;$('#voiceSaveDone').onclick=closeModal;if(Number.isInteger(nextIndex))$('#voiceSaveNext').onclick=()=>openVoiceResolutionOptions(nextIndex)}
  toast(`${savedName} saved and locked to ${live?.name||'this character'}${fallback?' as an approved controlled fallback':''}. ${remaining?`${remaining} voice requirement${remaining===1?'':'s'} remain.`:'All required voices are ready.'}${!cloudOk&&(localOk||ledgerOk)?' Browser save is confirmed; cloud sync needs attention.':''}`);
  return true
}

const youthVoiceDesignBlocked=new Set();
const youthVoiceDesignPreviewCache=new Map();
const youthVoiceSavedSessionKey='cinetale.voice.designed.saved.v1';
function loadYouthSavedVoiceCache(){try{return new Map(Object.entries(safeParse(sessionStorage.getItem(youthVoiceSavedSessionKey),{})||{}))}catch{return new Map()}}
const youthVoiceSavedVoiceCache=loadYouthSavedVoiceCache();
function rememberYouthSavedVoice(generatedVoiceId,saved){if(!generatedVoiceId||!saved?.voiceId)return;youthVoiceSavedVoiceCache.set(generatedVoiceId,saved);try{sessionStorage.setItem(youthVoiceSavedSessionKey,JSON.stringify(Object.fromEntries(youthVoiceSavedVoiceCache)))}catch{}}
function forgetYouthSavedVoice(generatedVoiceId){youthVoiceSavedVoiceCache.delete(generatedVoiceId);try{sessionStorage.setItem(youthVoiceSavedSessionKey,JSON.stringify(Object.fromEntries(youthVoiceSavedVoiceCache)))}catch{}}
function youthVoiceDesignKey(c={},p={}){const i=voiceAutoIntent(c,p);return [p?.id||'',c?.id||c?.name||'',i.locale||'',i.age||'',i.presentation||'',...(i.languages||[])].join('|')}
function canDesignYouthFallback(c={},p={},catalog={}){
  const intent=voiceAutoIntent(c,p);return intent.archetype==='human'&&intent.age==='Child'&&!youthVoiceDesignBlocked.has(youthVoiceDesignKey(c,p))&&Array.isArray(catalog.providers)&&catalog.providers.includes('elevenlabs');
}
async function openDesignedYouthFallback(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;const key=youthVoiceDesignKey(c,p),target=voiceResolutionTargetSummary(c,p),presentation=explicitCharacterVoicePresentation(c)||'Masculine',locale=projectVoiceLocale(p)||'hi-IN',language=characterRequiredVoiceLanguages(p,c)[0]||'Hindi',performance=characterAutoPerformance(p,c)||'Natural',pace=characterAutoPace(p,c)||'Natural';
  const renderOptions=(d,selection=null)=>{
    const selectedIndex=Number.isInteger(selection?.index)?selection.index:-1;
    const cards=(d.previews||[]).map((x,i)=>{const selected=i===selectedIndex,locked=selectedIndex>=0&&!selected;return `<div class="voice-resolution-option designed-fallback ${selected?'voice-option-selected':''}"><div><div class="voice-option-title-row"><b>Youthful option ${i+1}</b>${selected?'<span class="voice-selected-badge">✓ SELECTED & SAVED</span>':''}</div><small>Designed adolescent voice · controlled Child → Teen fallback</small><em>${selected?'This is the creator-approved fallback currently locked to this character.':'Review the sound before choosing it. This remains a creator-approved fallback, not a verified Child voice.'}</em></div><div class="voice-option-actions"><button class="ghost tiny" type="button" data-youth-preview="${i}">▶ Listen</button><button class="primary tiny" type="button" data-youth-use="${i}" ${selected||locked?'disabled':''}>${selected?'✓ Selected & saved':locked?'Not selected':'Use this option'}</button></div></div>`}).join('');
    const status=selectedIndex>=0?`<div class="voice-resolution-state resolved youth-selection-confirmed"><b>Option ${selectedIndex+1} selected and saved ✓</b><small>${esc(selection?.voiceName||`${c.name} · CineTale youthful voice`)} is locked as a creator-approved Teen fallback. ${selection?.remaining?`${selection.remaining} voice requirement${selection.remaining===1?'':'s'} remain.`:'All required voices are ready.'}</small></div>`:'';
    $('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">CONTROLLED YOUTHFUL FALLBACK</span><h2>${esc(c.name)}</h2><div class="voice-resolution-target-box"><span>Exact target remains protected</span><b>${esc(target)}</b></div>${status||'<div class="voice-resolution-state"><b>Three adolescent options are ready to review.</b><small>CineTale generated these only because no connected provider could verify the required Child age. Choosing one is an explicit Child → Teen fallback. Generated previews are cached for this browser session so going back does not spend credits again.</small></div>'}<div class="voice-resolution-option-list">${cards}</div><div class="modal-actions">${selectedIndex>=0&&Number.isInteger(selection?.nextIndex)?'<button class="primary" type="button" id="youthResolveNext">Resolve next voice</button>':''}<button class="ghost" type="button" id="youthDesignBack">${selectedIndex>=0?'Done':'Back'}</button></div></div>`;
    let youthPlayingButton=null,youthPlayingAudio=null;
    const resetYouthPreviewButton=()=>{if(youthPlayingButton){youthPlayingButton.textContent='▶ Listen';youthPlayingButton.setAttribute('aria-pressed','false')}youthPlayingButton=null;youthPlayingAudio=null};
    const stopYouthPreview=()=>{if(youthPlayingAudio){try{youthPlayingAudio.pause();youthPlayingAudio.currentTime=0}catch{}}if(activeAudio===youthPlayingAudio)activeAudio=null;resetYouthPreviewButton()};
    $$('[data-youth-preview]').forEach(b=>{b.setAttribute('aria-pressed','false');b.onclick=()=>{const x=d.previews[Number(b.dataset.youthPreview)];if(!x?.audio)return;if(youthPlayingButton===b&&youthPlayingAudio&&!youthPlayingAudio.paused){stopYouthPreview();return}try{stopYouthPreview();if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}const a=new Audio(x.audio);activeAudio=a;youthPlayingAudio=a;youthPlayingButton=b;b.textContent='■ Stop';b.setAttribute('aria-pressed','true');a.onended=()=>{if(activeAudio===a)activeAudio=null;resetYouthPreviewButton()};a.onerror=()=>{if(activeAudio===a)activeAudio=null;resetYouthPreviewButton();toast('Could not play this preview.')};a.play().catch(()=>{if(activeAudio===a)activeAudio=null;resetYouthPreviewButton();toast('Browser blocked audio playback. Click Listen again.')})}catch{resetYouthPreviewButton();toast('Could not play this preview.')}}});
    let saving=false;
    $$('[data-youth-use]').forEach(b=>b.onclick=async()=>{
      if(saving||b.disabled)return;
      const optionIndex=Number(b.dataset.youthUse),x=d.previews[optionIndex];if(!x?.id)return;
      stopYouthPreview();saving=true;
      const allUse=$$('[data-youth-use]'),card=b.closest('.voice-resolution-option'),old=b.textContent;
      allUse.forEach(btn=>btn.disabled=true);card?.classList.add('voice-option-selecting');b.textContent='Selected · saving…';
      const inline=document.createElement('div');inline.className='voice-inline-save-status';inline.setAttribute('role','status');inline.textContent=`Option ${optionIndex+1} selected. Saving the reusable voice…`;card?.appendChild(inline);
      try{
        let saved=youthVoiceSavedVoiceCache.get(x.id);
        if(!saved){
          const rr=await fetch('/api/design-character-voice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',generatedVoiceId:x.id,voiceName:`${c.name} · CineTale youthful voice`,description:d.description,presentation,language,accentDirection:c.voiceAccentDirection||'Indian',locale})});
          saved=await rr.json().catch(()=>({}));if(!rr.ok||!saved.ok)throw new Error(saved.error||'Could not save the designed voice.');rememberYouthSavedVoice(x.id,saved)
        }
        inline.textContent='Provider voice saved. Locking it to this character…';b.textContent='Applying selection…';
        const v={voice_id:saved.voiceId,name:saved.voiceName||`${c.name} · CineTale youthful voice`,provider:'elevenlabs',meta:{provider:'elevenlabs',providerVoiceId:saved.voiceId,age:'Teen',ageVerified:false,ageSource:'creator-approved-designed-fallback',presentation:presentation,gender:presentation,language,strictLanguages:[language],languages:[language],locale,locales:[locale],tone:performance,use:'Character'}};
        const ok=await applyResolvedCharacterVoice(index,v,{fallback:true,reasons:['Age mismatch: Child requested; creator approved an adolescent Teen fallback designed for this character.'],resolution:'designed-youth-fallback',source:'elevenlabs-voice-design',renderConfirmation:false});
        if(!ok)throw new Error('CineTale could not verify the durable character assignment. The provider voice has been preserved for retry.');
        const remainingRows=voiceProductionReadiness(current(),episodeOf(current()),'audio').characters||[],remaining=remainingRows.length,nextIndex=remainingRows.find(row=>row.index!==index)?.index;
        forgetYouthSavedVoice(x.id);youthVoiceDesignPreviewCache.set(key,d);
        renderOptions(d,{index:optionIndex,voiceName:v.name,remaining,nextIndex});
        toast(`Option ${optionIndex+1} selected and saved for ${c.name}. ${remaining?`${remaining} voice requirement${remaining===1?'':'s'} remain.`:'All required voices are ready.'}`)
      }catch(e){
        saving=false;card?.classList.remove('voice-option-selecting');inline.textContent=e.message||'Save failed. The generated option is preserved for retry.';inline.classList.add('error');allUse.forEach(btn=>btn.disabled=false);b.textContent='Retry save';toast(e.message||'Could not save the designed voice. The generated option remains available without regenerating it.')
      }
    });
    $('#youthResolveNext')?.addEventListener('click',()=>openVoiceResolutionOptions(selection.nextIndex));
    $('#youthDesignBack').onclick=()=>selectedIndex>=0?closeModal():openVoiceResolutionOptions(index);
  };
  const cached=youthVoiceDesignPreviewCache.get(key);if(cached){renderOptions(cached);return}
  $('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">CONTROLLED YOUTHFUL FALLBACK</span><h2>${esc(c.name)}</h2><div class="voice-resolution-target-box"><span>Exact target remains protected</span><b>${esc(target)}</b></div><div class="voice-resolution-state warning"><b>Creating preview options may use voice-generation credits.</b><small>CineTale will design an adolescent voice as a controlled Child → Teen fallback. It will never be labeled as an exact Child match. Nothing is saved or assigned until you choose an option.</small></div><div class="voice-design-loading"><span class="spinner"></span><b>Creating three youthful options…</b><small>No voice has been assigned yet.</small></div><div class="modal-actions"><button class="ghost" type="button" id="youthDesignCancel">Cancel</button></div></div>`;$('#modal').classList.remove('hidden');$('#youthDesignCancel').onclick=closeModal;
  try{
    const r=await fetch('/api/design-character-voice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',presentation,locale,language,performance,pace})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){const err=new Error(d.error||'Could not create youthful voice options.');err.code=d.code||'';err.retryable=d.retryable!==false;throw err;}youthVoiceDesignPreviewCache.set(key,d);renderOptions(d);
  }catch(e){const safety=e?.code==='provider_safety_block'||e?.retryable===false;if(safety)youthVoiceDesignBlocked.add(key);$('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">CONTROLLED YOUTHFUL FALLBACK</span><h2>${esc(c.name)}</h2><div class="voice-resolution-state warning"><b>${safety?'Designed fallback unavailable for this attempt.':'Could not create youthful options.'}</b><small>${esc(e.message||'The provider did not return usable preview options.')}</small>${safety?'<small>CineTale has stopped this provider path for the current session. The protected Child target remains unchanged, and no automatic retry will spend additional credits.</small>':''}</div><div class="voice-resolution-choice-grid"><button class="ghost" type="button" id="youthDesignStudio">Advanced Voice Studio</button><button class="ghost" type="button" id="youthDesignPersonal">Record / upload voice</button></div><div class="modal-actions"><button class="ghost" type="button" id="youthDesignBack">Back to voice resolution</button></div></div>`;$('#youthDesignStudio').onclick=()=>openVoicePicker(index);$('#youthDesignPersonal').onclick=()=>openPersonalVoiceStudio(index);$('#youthDesignBack').onclick=()=>openVoiceResolutionOptions(index)}
}

async function openVoiceResolutionOptions(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;
  $('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">VOICE REQUIRED FOR PRODUCTION</span><h2>${esc(c.name)}</h2><p>Checking the connected voice library against this character’s required voice profile…</p></div>`;$('#modal').classList.remove('hidden');
  try{
    const productionState=characterVoiceProductionState(c,p),target=voiceResolutionTargetSummary(c,p);
    if(productionState.ready&&c.voiceLocked&&c.voiceId){const fallback=productionState.code==='ready-approved-override';$('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">VOICE READY FOR PRODUCTION</span><h2>${esc(c.name)}</h2><div class="voice-resolution-target-box"><span>Protected target</span><b>${esc(target)}</b></div><div class="voice-resolution-state resolved"><b>${fallback?'Approved controlled fallback saved ✓':'Voice assignment saved ✓'}</b><small>${esc(c.voiceName||'Assigned voice')}${fallback&&c.voiceFallback?.age?` · ${esc(c.voiceFallback.age)} fallback`:''}. This assignment is persisted and production readiness has been recalculated.</small></div><div class="voice-resolution-choice-grid"><button class="ghost" type="button" id="resolutionChangeVoice">Change voice</button></div><div class="modal-actions"><button class="primary" type="button" id="resolutionDone">Done</button></div></div>`;$('#resolutionChangeVoice').onclick=()=>openVoicePicker(index);$('#resolutionDone').onclick=closeModal;return}
    const d=await voiceCatalog(),voices=d.voices||[],exact=voices.filter(v=>voiceSuitableForCharacter(v,c,p)).sort((a,b)=>voiceMatchScore(b,c,p)-voiceMatchScore(a,c,p)),fallbacks=controlledVoiceFallbacks(voices,c,p).slice(0,4);
    const exactRows=exact.slice(0,5).map((v,i)=>`<div class="voice-resolution-option"><div><b>${esc(v.name)}</b><small>${esc([voiceMetadata(v).locale||voiceMetadata(v).accent,voiceMetadata(v).age,voiceMetadata(v).gender,voiceMetadata(v).language].filter(Boolean).join(' · '))}</small></div><button class="ghost tiny" type="button" data-resolution-exact="${i}">Use & lock</button></div>`).join('');
    const fallbackRows=fallbacks.map((x,i)=>{const m=voiceMetadata(x.v);return `<div class="voice-resolution-option fallback"><div><b>${esc(x.v.name)}</b><small>${esc([m.locale||m.accent,m.age,m.gender,m.language].filter(Boolean).join(' · '))}</small><em>${esc(x.reasons.join(' '))} This difference requires your explicit approval.</em></div><button class="ghost tiny" type="button" data-resolution-fallback="${i}">Approve fallback</button></div>`}).join('');
    const designBlocked=youthVoiceDesignBlocked.has(youthVoiceDesignKey(c,p)),designYouth=exact.length===0&&fallbacks.length===0&&canDesignYouthFallback(c,p,d);
    const stateCopy=exact.length?`${exact.length} suitable voice${exact.length===1?' is':'s are'} available.`:fallbacks.length?`No exact suitable voice is available. ${fallbacks.length} controlled fallback${fallbacks.length===1?' is':'s are'} available for review.`:designYouth?'No verified Child voice is available. CineTale can create a controlled youthful fallback for review.':designBlocked?'No verified Child voice is available. The designed-voice provider declined the controlled Teen fallback for this session, so CineTale will not retry it automatically.':'No suitable voice is currently available from your connected providers.';
    const designAction=designYouth?`<button class="primary" type="button" id="resolutionDesignYouth">Generate youthful options</button><small class="voice-resolution-credit-note">Optional · creates adolescent preview options and may use voice-provider credits. Nothing is assigned automatically.</small>`:'';
    $('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">VOICE REQUIRED FOR PRODUCTION</span><h2>${esc(c.name)}</h2><div class="voice-resolution-target-box"><span>Target</span><b>${esc(target)}</b></div><div class="voice-resolution-state"><b>${esc(stateCopy)}</b><small>CineTale will not silently replace language, locale, child age, or voice presentation just because another voice is available.</small></div>${exactRows?`<section><h3>Suitable voices</h3><div class="voice-resolution-option-list">${exactRows}</div></section>`:''}${fallbackRows?`<section><h3>Safe alternatives requiring approval</h3><div class="voice-resolution-option-list">${fallbackRows}</div></section>`:''}${designAction?`<section class="voice-designed-recovery"><h3>Smart fallback</h3><p>No existing connected voice meets the protected Child-age requirement. CineTale can design an adolescent Hindi character voice as a transparent Child → Teen fallback instead of making you browse thousands of unrelated voices.</p>${designAction}</section>`:''}<div class="voice-resolution-choice-grid"><button class="ghost" type="button" id="resolutionOpenStudio">Advanced Voice Studio</button><button class="ghost" type="button" id="resolutionPersonalVoice">Record / upload voice</button></div><p class="voice-resolution-block-note">You may leave this unresolved and continue editing, but production remains blocked until a valid or explicitly approved voice is assigned.</p><div class="modal-actions"><button class="ghost" type="button" id="resolutionClose">Close</button></div></div>`;
    $('#resolutionOpenStudio').onclick=()=>openVoicePicker(index);$('#resolutionPersonalVoice').onclick=()=>openPersonalVoiceStudio(index);$('#resolutionClose').onclick=closeModal;if($('#resolutionDesignYouth'))$('#resolutionDesignYouth').onclick=()=>openDesignedYouthFallback(index);
    $$('[data-resolution-exact]').forEach(b=>b.onclick=()=>applyResolvedCharacterVoice(index,exact[Number(b.dataset.resolutionExact)]));
    $$('[data-resolution-fallback]').forEach(b=>{const x=fallbacks[Number(b.dataset.resolutionFallback)];b.onclick=()=>applyResolvedCharacterVoice(index,x.v,{fallback:true,reasons:x.reasons})});
  }catch(e){$('#modalBody').innerHTML=`<div class="modal-form voice-resolution-modal"><span class="kicker">VOICE REQUIRED FOR PRODUCTION</span><h2>${esc(c.name)}</h2><div class="voice-resolution-target-box"><span>Target</span><b>${esc(voiceResolutionTargetSummary(c,p))}</b></div><div class="voice-resolution-state warning"><b>Voice library could not be checked right now.</b><small>No unsuitable voice has been assigned. Retry Voice Studio later or use an authorized personal voice.</small></div><div class="voice-resolution-choice-grid"><button class="ghost" type="button" id="resolutionRetryStudio">Open Voice Studio</button><button class="ghost" type="button" id="resolutionPersonalVoice">Record / upload voice</button></div><div class="modal-actions"><button class="ghost" type="button" id="resolutionClose">Close</button></div></div>`;$('#resolutionRetryStudio').onclick=()=>openVoicePicker(index);$('#resolutionPersonalVoice').onclick=()=>openPersonalVoiceStudio(index);$('#resolutionClose').onclick=closeModal;}
}
function voiceResolutionHighlights(p=current(),ep=episodeOf(p)){
  const ctx=state.voiceResolutionContext;if(!ctx||!p||ctx.projectId!==p.id||!ep||(ctx.episodeId&&ctx.episodeId!==ep.id))return new Set();return new Set(voiceResolutionCharacterIndexes(p,ep,ctx.scope));
}
function renderCharacters(){const p=current(),grid=$('#characterGrid');if(!p){renderVoiceResolutionBanner(null,null);grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">◎</div><h2>No cast yet</h2><p>Create a project first, then build or edit its recurring characters.</p><button class="primary" data-create-cast>Start a project</button></div>`;grid.querySelector('[data-create-cast]')?.addEventListener('click',()=>setView('create'));return}
  renderVoiceResolutionBanner(p,episodeOf(p));const voiceResolutionSet=voiceResolutionHighlights(p,episodeOf(p));
  const productionLocked=!storyIsApproved(p,episodeOf(p));const allPortraits=$('#generateAllPortraits');if(allPortraits){allPortraits.disabled=productionLocked||visualGenerationBlocked();allPortraits.title=productionLocked?'Approve the complete story first':visualGenerationBlocked()?visualBlockedMessage():'';allPortraits.textContent=visualGenerationBlocked()?'Visuals paused':'Generate all portraits'}
  grid.innerHTML=(p.characters||[]).map((c,i)=>{const job=state.portraitJobs.get(`${p.id}:${i}`),portrait=visualSrc(c),voiceAuditPending=voiceLockAuditPending(c,p),needsVoiceReview=voiceLockAuditNeedsReview(c,p),overrideConfirmed=voiceLockAuditAcknowledged(c,p),unverified=voiceLockAuditUnverified(c,p),reviewReasons=(c.voiceLockReview?.reasons||[]).join(' '),voiceStatus=voiceAuditPending?'Checking locked voice':unverified?'Voice verification unavailable':needsVoiceReview?'Voice review needed':c.voiceFallback?.approved?'Approved fallback':overrideConfirmed?'Voice override confirmed':c.voiceLocked?'Voice locked':'Voice',voiceClass=(voiceAuditPending||needsVoiceReview)?'review':overrideConfirmed?'override':c.voiceLocked?'locked':'auto';return `<article class="character-card surface ${portrait?'has-portrait':'no-portrait'} ${job?'portrait-job-active':''} ${needsVoiceReview?'voice-review-needed':''} ${voiceResolutionSet.has(i)?'voice-resolution-target':''}" ${voiceResolutionSet.has(i)?'data-voice-resolution-target="1"':''}><div class="character-portrait">${portrait?`<img src="${portrait}" alt="${esc(c.name)}">`:`<div class="initials">${esc((c.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</div>`}${job?`<div class="portrait-job-overlay"><span class="spinner dark"></span><b>${esc(job.label||'Creating portrait…')}</b><small>${esc(job.detail||'CineTale will update this card automatically when it is ready.')}</small></div>`:''}<div class="identity-lock">● ${c.locked!==false?'identity locked':'editable identity'}</div></div><h3>${esc(c.name)}</h3><div class="char-role">${esc(c.role||'Character')} · ${esc(c.age||'Age open')}</div><div class="char-tags"><span>${esc(c.languages||'Language open')}</span><span>${esc(c.background||'Background open')}</span><span>${esc(c.visualStyleOverride&&c.visualStyleOverride!=='project'?styleLabel(c.visualStyleOverride):styleLabel(p.visualStylePreset||'cinematic-realistic'))}</span>${isSacredCharacter(p,c)?`<span class="sacred-tag">✦ ${esc(c.sacredIdentity||'Sacred figure')}</span>`:''}</div><div class="char-desc">${esc(c.appearance||'Appearance open to creator direction.')}</div><div class="voice-assignment ${voiceClass}"><span class="voice-state-dot ${voiceClass}"></span><div><small>${esc(voiceStatus)}</small><b>${esc(c.voiceName||(c.voiceAutoDecision?.noSuitableVoice?'Auto · no suitable library match':'Auto on first listen'))}</b><em>${esc(voiceAuditPending?'CineTale is verifying this locked voice against the current character requirements.':needsVoiceReview?reviewReasons:c.voiceFallback?.approved?`${c.voiceFallback.age||'Teen'} fallback · creator approved`:overrideConfirmed?'Creator confirmed this manual voice override.':c.voiceLocked?`${c.voicePerformance||'Natural'} · ${c.voicePace||'Natural'} pace`:voiceAutoDecisionSummary(c,p))}</em></div></div>${needsVoiceReview?`<div class="voice-review-actions">${unverified?`<button class="ghost tiny" data-retry-voice-audit="${i}">Retry check</button>`:''}<button class="ghost tiny" data-reset-voice-auto="${i}">Reset to Auto</button><button class="ghost tiny" data-keep-voice="${i}">Keep anyway</button></div>`:''}${voiceResolutionSet.has(i)?`<div class="voice-resolution-card"><span>VOICE REQUIRED FOR PRODUCTION</span><b>Target · ${esc(voiceResolutionTargetSummary(c,p))}</b><small>${c.voiceAutoDecision?.noSuitableVoice||!c.voiceId?'No suitable voice is currently assigned. Review the connected library or use an authorized personal voice.':'This voice requires review before production.'}</small><div><button class="primary small" type="button" data-resolve-character-voice="${i}">Resolve voice</button></div><em>Editing may continue, but production remains blocked until this voice is resolved.</em></div>`:''}<div class="button-row"><button class="ghost" data-edit-character="${i}">Edit</button>${voiceResolutionSet.has(i)?'':`<button class="ghost" data-voice-character="${i}">Voice studio</button>`}<button class="primary small" data-generate-character="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the complete story first':esc(visualBlockedMessage())}"`:''}>${visualGenerationBlocked()?'Visuals paused':hasVisual(c)?'Regenerate':'Generate portrait'}</button><button class="ghost danger" data-delete-character="${i}" aria-label="Remove ${esc(c.name)} from cast">Remove</button></div></article>`}).join('');
  $$('[data-resolve-character-voice]').forEach(b=>b.onclick=()=>openVoiceResolutionOptions(Number(b.dataset.resolveCharacterVoice)));
  $$('[data-personal-resolution-voice]').forEach(b=>b.onclick=()=>openPersonalVoiceStudio(Number(b.dataset.personalResolutionVoice)));
  $$('[data-edit-character]').forEach(b=>b.onclick=()=>openCharacterEditor(Number(b.dataset.editCharacter)));
  $$('[data-generate-character]').forEach(b=>b.onclick=()=>openPortraitSetup(Number(b.dataset.generateCharacter)));
  $$('[data-voice-character]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.voiceCharacter)));$$('[data-delete-character]').forEach(b=>b.onclick=()=>deleteCharacter(Number(b.dataset.deleteCharacter)));
  $$('[data-reset-voice-auto]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.resetVoiceAuto);updateProject(x=>{const t=x.characters?.[i];if(!t)return;applyCharacterVoiceSelection(x,i,{voiceId:'',voiceName:'',mode:'auto',locked:false});t.voiceAutoDecision=null;invalidateSpeakingSyncForCharacterVoiceChange(x,i);invalidateStudioStages(x,'cast')});clearAudioPreviewCache();scheduleAutoVoiceWarmup(current());void pushCloudWorkspace();toast('Voice reset to Auto. CineTale will choose only a suitable match.')});
  $$('[data-keep-voice]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.keepVoice);updateProject(x=>{const t=x.characters?.[i];if(!t?.voiceLockReview)return;t.voiceLockReview.acknowledged=true;t.voiceLockReview.acknowledgedAt=new Date().toISOString();t.voiceLockReview.signature=voiceLockRequirementSignature(t,x);invalidateStudioStages(x,'cast')});void pushCloudWorkspace();toast('Voice override confirmed. CineTale will preserve this manual choice, but it remains marked as an override.')});
  $$('[data-retry-voice-audit]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.retryVoiceAudit);updateProject(x=>{const t=x.characters?.[i];if(t?.voiceLockReview)delete t.voiceLockReview});voiceCatalogCache=null;scheduleLockedVoiceAudit(current());toast('Retrying locked voice verification…')});
  scheduleAutoVoiceWarmup(p);scheduleLockedVoiceAudit(p);renderVoiceResolutionBanner(p,episodeOf(p));
}

function renderEpisodes(){const p=current(),list=$('#episodesList'),pageTitle=$('#episodesPageTitle'),pageCopy=$('#episodesPageCopy'),newBtn=$('#newEpisodeBtn');if(!p){list.innerHTML=`<div class="empty-state surface"><div class="empty-orb">◫</div><h2>No series yet</h2><p>Create an Episode project first.</p></div>`;return}ensureEpisodeIds(p);const episodic=(p.format||'Episode')==='Episode';if(pageTitle)pageTitle.textContent=episodic?'Episodes':`${p.format||'Project'} structure`;if(pageCopy)pageCopy.textContent=episodic?'Continue the same world while preserving canon and unresolved story threads.':`${p.format||'This format'} is standalone, so CineTale does not create Episode 2 automatically.`;if(newBtn)newBtn.classList.toggle('hidden',!episodic);if(!episodic){list.innerHTML=`<div class="empty-state surface"><div class="empty-orb">✓</div><h2>${esc(p.format||'Project')} is standalone</h2><p>Use Studio to edit the setup, cast, scenes, audio and final production. Episode controls only appear for Episode projects.</p><button class="primary" data-return-studio>Back to Studio</button></div>`;list.querySelector('[data-return-studio]')?.addEventListener('click',()=>setView('studio'));return}
  list.innerHTML=(p.episodes||[]).map((e,i)=>`<article class="episode-row surface"><div class="episode-number">${String(e.number||i+1).padStart(2,'0')}</div><div class="episode-copy"><h3>${esc(e.title)}</h3><p>${esc(e.synopsis||'')}</p></div><div class="episode-actions"><button class="ghost" data-open-episode-id="${esc(e.id)}">Open in Studio</button><button class="ghost" data-rename-episode-id="${esc(e.id)}">Rename</button><button class="ghost" data-duplicate-episode-id="${esc(e.id)}">Duplicate draft</button><button class="ghost danger" data-delete-episode-id="${esc(e.id)}">Delete</button></div></article>`).join('');
  $$('[data-open-episode-id]').forEach(b=>b.onclick=()=>{updateProject(x=>{ensureEpisodeIds(x);x.activeEpisodeId=b.dataset.openEpisodeId;const e=x.episodes.find(v=>v.id===x.activeEpisodeId);x.activeEpisode=e?.number||x.activeEpisode});setView('studio')});
  $$('[data-rename-episode-id]').forEach(b=>b.onclick=()=>renameEpisode(b.dataset.renameEpisodeId));$$('[data-duplicate-episode-id]').forEach(b=>b.onclick=()=>duplicateEpisodeDraft(b.dataset.duplicateEpisodeId));$$('[data-delete-episode-id]').forEach(b=>b.onclick=()=>deleteEpisode(b.dataset.deleteEpisodeId));
}
function assetStats(p){const ep=episodeOf(p);const chars=(p?.characters||[]).filter(hasVisual).length, scenes=(ep?.scenes||[]).filter(hasVisual).length,totalScenes=(ep?.scenes||[]).length,selected=(ep?.scenes||[]).filter(s=>s.finalIncluded!==false),videos=selected.filter(s=>sceneProductionReady(p,s)).length,selectedScenes=selected.length;return {chars,scenes,videos,totalScenes,selectedScenes,total:chars+scenes+videos,charDone:chars>0&&chars===(p.characters||[]).length,sceneDone:scenes>0&&scenes===totalScenes,videoDone:selectedScenes>0&&videos===selectedScenes}}
function storyTextOf(p,ep=episodeOf(p)){return String(ep?.storyText||'').trim()}
function hasStoryReview(p,ep=episodeOf(p)){return storyTextOf(p,ep).length>=180}
function storyIsApproved(p,ep=episodeOf(p)){return !hasStoryReview(p,ep) || ep?.storyApproved===true}
function storyWordCount(text=''){return String(text).trim()?String(text).trim().split(/\s+/).length:0}
function storyParagraphHtml(text=''){const clean=String(text||'').trim();if(!clean)return '';return clean.split(/\n\s*\n/).filter(Boolean).map(x=>`<p>${esc(x.trim())}</p>`).join('')}
function legacyStorySeed(p,ep){const parts=[p?.title,ep?.title,ep?.synopsis];for(const s of ep?.scenes||[]){parts.push(`Scene ${s.number||''}: ${s.title||''}. ${s.purpose||''} ${s.visual||''} ${dialogueText(s.narration)||''} ${dialogueList(s.dialogue).join(' ')}`)}return parts.filter(Boolean).join('\n\n')}
function projectGenerationInput(p,idea,storySource='full-story'){return {idea:String(idea||'').trim(),storySource,inputMethod:'text',format:p.format||'Story',genre:p.genre||'Open',audience:p.audience||'General',duration:p.duration||formatConfig(p.format).defaultDuration,castSize:p.castSize||'auto',style:p.style||stylePromptFromPreset(p.visualStylePreset||'cinematic-realistic',p.customVisualStyle||''),visualStylePreset:p.visualStylePreset||'cinematic-realistic',customVisualStyle:p.customVisualStyle||'',language:p.language||'English',languageScope:p.languageScope||'entire-story',culturalTreatment:p.culturalTreatment||'auto',sacredRepresentation:p.sacredRepresentation||'auto',languageDirection:p.languageDirection||'',culturalContext:p.culturalContext||'',regionCommunity:p.regionCommunity||p.worldBible?.globalContext?.regionCommunity||'',beliefContext:p.beliefContext||p.worldBible?.globalContext?.beliefContext||'',traditionContext:p.traditionContext||p.worldBible?.globalContext?.traditionContext||'',eraPlace:p.eraPlace||p.worldBible?.globalContext?.eraPlace||'',culturalGrounding:p.culturalGrounding||p.worldBible?.globalContext?.grounding||'grounded',languageBehavior:p.languageBehavior||p.worldBible?.globalContext?.languageBehavior||'natural',productionProfile:p.productionProfile||'balanced',continuityStrength:p.continuityStrength||'strict',controlMode:p.controlMode||'Guided'}}
function renderStoryReview(p,ep){const panel=$('#storyReviewPanel');if(!panel)return;const text=storyTextOf(p,ep),hasReview=hasStoryReview(p,ep),approved=storyIsApproved(p,ep),cfg=formatConfig(p?.format||'Episode'),continuityWarnings=Array.isArray(ep?.continuityWarnings)?ep.continuityWarnings:[],continuityBlocked=continuityWarnings.length&&!ep?.continuityAcknowledged;const status=$('#storyReviewStatus'),legacy=$('#storyReviewLegacy'),edit=$('#editFullStory'),rebuild=$('#rebuildFullStory'),approve=$('#approveFullStory'),body=$('#storyReviewText'),meta=$('#storyReviewMeta');panel.classList.toggle('is-approved',Boolean(approved&&hasReview));$('#storyReviewTitle').textContent=approved&&hasReview?'Story approved':`Review the complete ${cfg.title.toLowerCase()}`;$('#storyReviewCopy').textContent=approved&&hasReview?'Approved and locked to this production plan.':hasReview?'Read and approve the complete narrative before generating portraits, storyboards, audio or video.':'This older project does not yet contain a full narrative review. Existing production remains available, or you can rebuild a complete story review.';status.textContent=hasReview?(approved?'Approved':'Needs review'):'Legacy project';status.classList.toggle('approved',approved&&hasReview);legacy.classList.toggle('hidden',hasReview);edit.classList.toggle('hidden',!hasReview);rebuild.classList.toggle('hidden',hasReview);approve.classList.toggle('hidden',!hasReview||approved);body.classList.toggle('empty',!hasReview);body.innerHTML=hasReview?storyParagraphHtml(text):`<p>${esc(ep?.synopsis||p?.logline||'No full narrative is stored in this older project.')}</p>`;const words=storyWordCount(text),targetSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration),estimateSec=narrativeEstimateSeconds(ep),runtimeFit=targetSec&&estimateSec?estimateSec/targetSec:1,runtimeNote=targetSec&&estimateSec?`<span class="${runtimeFit<.75||runtimeFit>1.35?'runtime-mismatch':''}">≈${formatTime(estimateSec)} narrative · ${formatTime(targetSec)} target</span>`:'';meta.innerHTML=hasReview?`<span>${words.toLocaleString()} words</span><span>${esc(p.language||'Language open')}</span><span>${esc(p.audience||'Audience open')}</span><span>${esc(p.duration||'Runtime open')}</span>${runtimeNote}`:`<span>${esc(cfg.title)}</span><span>Created before Story Review</span>`;let guard=panel.querySelector('.continuity-guard');if(guard)guard.remove();if(continuityWarnings.length){guard=document.createElement('div');guard.className=`continuity-guard ${continuityBlocked?'blocking':'acknowledged'}`;guard.innerHTML=`<div><b>${continuityBlocked?'Continuity conflict needs review':'Continuity change acknowledged'}</b><span>${continuityWarnings.map(w=>esc(w.message||'A recurring series detail may have changed.')).join(' · ')}</span></div>${continuityBlocked?'<button type="button" class="ghost" id="ackContinuityChanges">Accept intentional changes</button>':''}`;body.parentElement?.insertBefore(guard,body);if(continuityBlocked){approve.disabled=true;approve.title='Review the continuity conflict first.';setTimeout(()=>{const b=$('#ackContinuityChanges');if(b)b.onclick=()=>{updateProject(x=>{const e=episodeOf(x);if(e)e.continuityAcknowledged=true});toast('Continuity change acknowledged. Review the story once more before approval.')}},0)}}else{approve.disabled=false;approve.title=''}}
function approveCurrentStory(){const p=current(),ep=episodeOf(p);if(!p||!ep||!hasStoryReview(p,ep))return;updateProject(x=>{const e=episodeOf(x);e.storyApproved=true;e.storyApprovedAt=new Date().toISOString();e.castApproved=false;e.storyboardApproved=false;e.audioApproved=false});toast('Story approved. Review the cast next.')}
async function rebuildStoryReviewFromText(text,button){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const source=String(text||'').trim();if(source.length<80){toast('Add more of the story before rebuilding the production plan.');return}const hasAssets=assetStats(p).total>0||Boolean(p.finalAssembly)||Boolean(p.finalVideoMeta);if(hasAssets&&!confirm('Rebuilding from this story will replace the current cast and scene plan and clear generated production assets for this project. Continue?'))return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Rebuilding story…'}try{const d=await apiPost('/api/generate-plan',projectGenerationInput(p,source,'full-story'));const next=d.plan;next.format=normalizedFormat(p.requestedFormat||p.format,'Story');next.requestedFormat=next.format;next.duration=p.duration||next.duration||formatConfig(next.format).defaultDuration;next.targetRuntimeSec=durationTargetSeconds(next.duration)||Number(next.targetRuntimeSec)||0;next.id=p.id;next.createdAt=p.createdAt;next.updatedAt=new Date().toISOString();next.archived=p.archived;ensureEpisodeIds(next);next.activeEpisode=1;next.activeEpisodeId=next.episodes[0]?.id||null;if(next.episodes[0])next.episodes[0].storyApproved=false;const idx=state.projects.findIndex(x=>x.id===p.id);state.projects[idx]=next;state.currentId=next.id;save();renderAll();setView('studio');toast('Story rebuilt. Review the complete narrative before production.')}catch(e){toast(e.message||'Could not rebuild the story.')}finally{if(button){button.disabled=false;button.textContent=old||'Save & rebuild'}}}
function openFullStoryEditor(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const text=storyTextOf(p,ep)||legacyStorySeed(p,ep);$('#modalBody').innerHTML=`<form class="modal-form" id="fullStoryEditorForm"><span class="kicker">STORY REVIEW</span><h2>Edit the complete story</h2><p>Changes are rebuilt into the cast and scene plan so production stays aligned with the story. Nothing is generated until you confirm below.</p><label class="field"><span>Complete story</span><textarea class="story-edit-area" id="fullStoryEditorText" required>${esc(text)}</textarea><small>Keep character names, relationships, cultural context and the ending exactly as you want them.</small></label><div class="modal-actions"><button type="button" class="ghost" id="fullStoryEditorCancel">Cancel</button><button type="submit" class="primary">Save & rebuild plan</button></div></form>`;$('#modal').classList.remove('hidden');$('#fullStoryEditorCancel').onclick=closeModal;$('#fullStoryEditorForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter,txt=$('#fullStoryEditorText').value;closeModal();await rebuildStoryReviewFromText(txt,b)}}
function rebuildLegacyStoryReview(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;rebuildStoryReviewFromText(legacyStorySeed(p,ep),$('#rebuildFullStory'))}
function requireApprovedStory(action='continue'){const p=current(),ep=episodeOf(p);if(storyIsApproved(p,ep))return true;toast(`Review and approve the complete story before you ${action}.`);$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return false}
function workflowTarget(workflow){
  const key=String(workflow||'').trim();
  if(key==='script')return document.querySelector('#storyReviewPanel');
  const gate=document.querySelector('#studioStageGate');
  if((key==='characters'||key==='storyboard'||key==='voice')&&gate&&!gate.classList.contains('hidden'))return gate;
  if(key==='characters'){setView('characters');return null}
  if(key==='storyboard'||key==='voice'||key==='video')return document.querySelector('#sceneProductionTitle')||document.querySelector('#sceneList');
  if(key==='render')return document.querySelector('#finalAssemblyPanel');
  return null;
}
function syncStudioInspectionSurface(){
  const host=$('#studioContent'),layout=host?.querySelector('.studio-layout'),panel=$('#finalAssemblyPanel');
  const inspecting=state.studioInspectionStage==='final';
  if(host){host.classList.toggle('studio-inspection-final',inspecting);host.dataset.inspectionStage=inspecting?'final':''}
  if(layout){layout.classList.toggle('inspection-surface-visible',inspecting);layout.setAttribute('aria-hidden',inspecting?'false':'false')}
  if(panel){panel.classList.toggle('inspection-open',inspecting);panel.setAttribute('aria-hidden',inspecting?'false':'false')}
  return Boolean(inspecting&&layout&&panel);
}
function assertStudioInspectionSurfaceVisible(){
  if(state.studioInspectionStage!=='final')return true;
  const host=$('#studioContent'),layout=host?.querySelector('.studio-layout'),panel=$('#finalAssemblyPanel');
  if(!host||!layout||!panel)return false;
  syncStudioInspectionSurface();
  // Runtime fail-safe: inspection is informational and must never be hidden by production-gate CSS.
  // Consequential controls remain gated by productionDependencyReadiness; this only guarantees visibility.
  if(getComputedStyle(layout).display==='none')layout.style.setProperty('display','block','important');
  if(getComputedStyle(panel).display==='none')panel.style.setProperty('display','block','important');
  return getComputedStyle(layout).display!=='none'&&getComputedStyle(panel).display!=='none';
}
function openStudioInspectionStage(stage='final'){
  if(stage!=='final')return false;
  const p=current(),ep=episodeOf(p);if(!p||!ep)return false;
  // Requested stage and production eligibility are separate state dimensions.
  // This must survive render/reconciliation passes so an upstream blocker cannot push the creator back to Audio.
  state.studioInspectionStage='final';
  setView('studio');
  renderStudio();
  syncStudioInspectionSurface();
  const reveal=()=>{
    const target=document.querySelector('#finalAssemblyPanel');if(!target)return;
    assertStudioInspectionSurfaceVisible();
    target.classList.add('inspection-open');
    target.setAttribute('tabindex','-1');
    const top=Math.max(0,target.getBoundingClientRect().top+window.scrollY-104);
    window.scrollTo({top,behavior:'auto'});
    target.focus({preventScroll:true});
  };
  requestAnimationFrame(()=>requestAnimationFrame(reveal));
  setTimeout(reveal,90);
  toast('Final episode readiness is open for inspection. Production actions stay protected until upstream requirements are ready.');
  return true;
}
function closeStudioInspectionStage(){
  if(!state.studioInspectionStage)return;
  state.studioInspectionStage=null;
  const layout=$('#studioContent .studio-layout'),panel=$('#finalAssemblyPanel');
  layout?.style.removeProperty('display');panel?.style.removeProperty('display');
  syncStudioInspectionSurface();
  renderStudio();
  requestAnimationFrame(()=>document.querySelector('#studioStageGate:not(.hidden), #storyReviewPanel, #sceneProductionTitle')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function bindWorkflowNavigation(){
  const flow=document.querySelector('#workflow');if(!flow||flow.__cinetaleWorkflowBound)return;
  flow.addEventListener('click',event=>{
    const step=event.target?.closest?.('[data-workflow]');if(!step||!flow.contains(step))return;
    const workflow=String(step.dataset.workflow||'');
    const inspectableLocked=step.classList.contains('locked')&&workflow==='render'&&step.classList.contains('inspectable');
    if(step.classList.contains('locked')&&!inspectableLocked)return;
    if(workflow==='render'&&inspectableLocked){event.preventDefault();openStudioInspectionStage('final');return}
    if(state.studioInspectionStage){state.studioInspectionStage=null;renderStudio();}
    const target=workflowTarget(workflow);
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  });
  flow.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const step=event.target?.closest?.('[data-workflow]');if(!step)return;event.preventDefault();step.click();
  });
  flow.querySelectorAll('[data-workflow]').forEach(step=>{step.setAttribute('role','button');step.setAttribute('tabindex','0')});
  flow.__cinetaleWorkflowBound=true;
}
function studioStageState(p,ep=episodeOf(p)){
  const a=assetStats(p||{}),finalReady=Boolean(p?.finalVideoMeta||p?.renderStatus==='ready'||p?.renderStatus==='final-video-ready'||a.videoDone);
  const story=storyIsApproved(p,ep);
  const cast=story&&Boolean(ep?.castApproved===true||finalReady);
  const storyboard=cast&&Boolean(ep?.storyboardApproved===true||finalReady);
  const audio=storyboard&&Boolean(ep?.audioApproved===true||finalReady);
  return {story,cast,storyboard,audio,production:audio,finalReady};
}
function invalidateStudioStages(project,from='cast'){
  const ep=episodeOf(project);if(!ep)return;
  const order=['cast','storyboard','audio'],start=Math.max(0,order.indexOf(from));
  for(let i=start;i<order.length;i++)ep[`${order[i]}Approved`]=false;
}
function voiceResolutionCharacterIndexes(p={},ep=episodeOf(p),scope='audio'){return [...new Set(voiceProductionReadiness(p,ep,scope).characters.map(x=>x.index).filter(Number.isInteger))]}
function narratorNeedsVoiceResolution(p={},ep=episodeOf(p)){return Boolean(voiceProductionReadiness(p,ep,'audio').narrator?.blocking)}
function clearVoiceResolutionContext(){state.voiceResolutionContext=null;renderVoiceResolutionBanner?.(current(),episodeOf(current()))}
async function openVoiceResolutionFromStage(scope='audio'){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
  // Navigation is the user's action and must happen synchronously on the first click.
  // Voice verification is reconciliation work; it may refresh the destination after it opens,
  // but it must never consume the click or make the creator click the recovery CTA again.
  const readiness=voiceProductionReadiness(p,ep,scope),characterIndexes=readiness.characters.map(x=>x.index),narrator=scope==='audio'&&Boolean(readiness.narrator?.blocking);
  state.voiceResolutionContext={projectId:p.id,episodeId:ep.id||'',scope,characterIndexes,narrator,openedAt:Date.now()};
  if(!characterIndexes.length&&!narrator){renderStudioStageGate(p,ep);toast(scope==='cast'?'Voice reviews are resolved. Cast Review is ready.':'Voice requirements were refreshed. Audio Review is ready.');return}
  if(!characterIndexes.length&&narrator){toast('Narrator voice needs resolution before production.');openNarratorVoicePicker();return}

  const navEpoch=++state.voiceResolutionNavigation.epoch;
  state.voiceResolutionNavigation.pending=true;
  setView('characters');
  requestAnimationFrame(()=>document.querySelector('#voiceResolutionBanner')?.scrollIntoView({behavior:'smooth',block:'start'}));
  toast(`Resolve ${characterIndexes.length} highlighted voice${characterIndexes.length===1?'':'s'} before ${scope==='cast'?'cast approval':'audio production'}.`);

  const needsAudit=(p.characters||[]).some(c=>c?.voiceLocked&&c.voiceId)||(p.narratorVoiceLocked&&p.narratorVoiceId);
  if(!needsAudit){state.voiceResolutionNavigation.pending=false;return}
  try{
    await auditLockedVoicesForProject(p);
    if(navEpoch!==state.voiceResolutionNavigation.epoch||current()?.id!==p.id)return;
    const liveEp=episodeOf(p),refreshed=voiceProductionReadiness(p,liveEp,scope);
    state.voiceResolutionContext={projectId:p.id,episodeId:liveEp?.id||'',scope,characterIndexes:refreshed.characters.map(x=>x.index),narrator:scope==='audio'&&Boolean(refreshed.narrator?.blocking),openedAt:state.voiceResolutionContext?.openedAt||Date.now()};
    renderCharacters();
    renderStudioStageGate(p,liveEp);
    renderVoiceResolutionBanner(p,liveEp);
  }finally{
    if(navEpoch===state.voiceResolutionNavigation.epoch)state.voiceResolutionNavigation.pending=false;
  }
}
function approveStudioStage(stage){
  const key=String(stage||'').toLowerCase(),p=current(),ep=episodeOf(p);if(!p||!ep)return;
  if(key==='cast'){const issues=castVoiceReviewIssues(p);if(issues.length){toast(`Cast approval blocked · ${issues.length} locked voice${issues.length===1?' needs':'s need'} review.`);openVoiceResolutionFromStage('cast');return}}
  if(key==='audio'){const issues=audioVoiceReadinessIssues(p,ep);if(issues.length){toast(`Audio approval blocked · ${issues[0]}${issues.length>1?` (+${issues.length-1} more)`:''}.`);openVoiceResolutionFromStage('audio');return}}
  updateProject(x=>{const e=episodeOf(x);if(!e)return;if(key==='cast'){e.castApproved=true;e.castApprovedAt=new Date().toISOString()}if(key==='storyboard'){e.storyboardApproved=true;e.storyboardApprovedAt=new Date().toISOString()}if(key==='audio'){e.audioApproved=true;e.audioApprovedAt=new Date().toISOString()}});
  const labels={cast:'Cast approved. Storyboard review is next.',storyboard:'Scene plan approved. Audio review is next.',audio:'Audio plan approved. Production is unlocked.'};toast(labels[key]||'Stage approved.');
}
function renderStudioStageGate(p,ep){
  const host=$('#studioStageGate');if(!host)return;
  const st=studioStageState(p,ep),cfg=formatConfig(p?.format||'Episode');
  if(!st.story||st.production){host.classList.add('hidden');host.innerHTML='';return}
  host.classList.remove('hidden');
  if(!st.cast){
    const chars=p.characters||[],voiceIssues=castVoiceReviewIssues(p);
    const rows=chars.length?chars.map(c=>{const pending=voiceLockAuditPending(c,p),unverified=voiceLockAuditUnverified(c,p),review=voiceLockAuditNeedsReview(c,p),override=voiceLockAuditAcknowledged(c,p),voiceLabel=pending?'Checking locked voice…':unverified?'Voice verification unavailable':review?'Voice review needed':override?'Voice override confirmed':c.voiceName||c.voice||(c.voiceAutoDecision?.noSuitableVoice?'Auto · no suitable match yet':'Auto voice');return `<div class="stage-review-row ${review?'needs-review':''}"><div><b>${esc(c.name||'Unnamed character')}</b><span>${esc(c.role||'Recurring character')}</span></div><small>${esc(voiceLabel)}</small></div>`}).join(''):`<div class="stage-review-empty">No recurring characters are defined yet.</div>`;
    host.innerHTML=`<div class="stage-gate-head"><div><span class="kicker">CAST REVIEW</span><h2>Confirm your recurring cast</h2><p>Review names, roles, relationships and voice direction before CineTale moves into scene planning. Existing portraits and paid media are preserved.</p>${voiceIssues.length?`<p class="stage-gate-warning">${voiceIssues.length} legacy or incompatible locked voice${voiceIssues.length===1?' needs':'s need'} review before cast approval.</p>`:''}</div><span class="stage-gate-step">Step 2 of 6</span></div><div class="stage-review-list">${rows}</div><div class="stage-gate-actions"><button class="ghost" type="button" data-stage-open-cast>Open cast board</button>${voiceIssues.length?`<button class="primary" type="button" data-stage-resolve-voices="cast">Resolve voice reviews</button>`:`<button class="primary" type="button" data-stage-approve="cast" ${chars.length?'':'disabled'}>Approve cast & continue</button>`}</div>`;
  }else if(!st.storyboard){
    const scenes=ep?.scenes||[];
    const rows=scenes.map((scene,i)=>{const plan=sceneCoveragePlan(scene,finalTimelineMode(p));return `<div class="stage-review-row"><div><b>${String(scene.number||i+1).padStart(2,'0')} · ${esc(scene.title||`Scene ${i+1}`)}</b><span>${esc(scene.purpose||scene.visual||'Scene direction ready')}</span></div><small>${Number(scene.durationSec)||0}s · ${plan.length} planned shot${plan.length===1?'':'s'}${hasVisual(scene)?' · preview ready':''}</small></div>`}).join('');
    host.innerHTML=`<div class="stage-gate-head"><div><span class="kicker">STORYBOARD REVIEW</span><h2>Review the scene plan</h2><p>Confirm the scene order and visual intent before audio and paid video production. Creating storyboard previews is optional at this stage.</p></div><span class="stage-gate-step">Step 3 of 6</span></div><div class="stage-review-list">${rows||'<div class="stage-review-empty">No scenes are available yet.</div>'}</div><div class="stage-gate-actions"><button class="ghost" type="button" data-stage-create-storyboards ${scenes.length?'':'disabled'}>Create optional previews</button><button class="primary" type="button" data-stage-approve="storyboard" ${scenes.length?'':'disabled'}>Approve scene plan & continue</button></div>`;
  }else if(!st.audio){
    const scenes=ep?.scenes||[],voiceIssues=audioVoiceReadinessIssues(p,ep),voiceState=voiceProductionReadiness(p,ep,'audio'),blockedNames=voiceState.characters.map(x=>p.characters?.[x.index]?.name).filter(Boolean),blockingCount=blockedNames.length+(voiceState.narrator?.blocking?1:0);
    const rows=scenes.map((scene,i)=>{const spoken=dialogueList(scene.dialogue).length+(String(scene.narration||'').trim()?1:0);return `<div class="stage-review-row"><div><b>${String(scene.number||i+1).padStart(2,'0')} · ${esc(scene.title||`Scene ${i+1}`)}</b><span>${spoken?`${spoken} spoken part${spoken===1?'':'s'} · ${esc(sceneAudioDirection(scene))}`:'No spoken dialogue · ambience / foley'}</span></div><small>${spoken?'Dialogue planned':'Sound planned'}</small></div>`}).join('');
    const blockerCopy=voiceIssues.length?`<p class="stage-gate-warning"><b>${blockingCount||voiceIssues.length} voice${(blockingCount||voiceIssues.length)===1?'':'s'} need attention.</b>${blockedNames.length?` ${esc(blockedNames.join(' · '))}`:''} Production-safe voices are required before preview or approval.</p>`:'';
    const actions=voiceIssues.length?`<button class="primary" type="button" data-stage-resolve-voices="audio">Resolve ${blockingCount||voiceIssues.length} voice${(blockingCount||voiceIssues.length)===1?'':'s'}</button>`:`<button class="ghost" type="button" data-stage-preview-audio>Preview episode audio</button><button class="primary" type="button" data-stage-approve="audio">Approve audio & continue</button>`;
    host.innerHTML=`<div class="stage-gate-head"><div><span class="kicker">AUDIO REVIEW</span><h2>${voiceIssues.length?'Resolve voices':'Review voices & sound'}</h2><p>${voiceIssues.length?'CineTale has already checked the episode. Resolve only the production voices that need attention; preview and approval unlock automatically afterward.':'Check who speaks, voice direction, narration and scene sound before video production. Previewing audio is optional and may use the configured voice service.'}</p>${blockerCopy}</div><span class="stage-gate-step">Step 4 of 6</span></div><div class="stage-review-list">${rows}</div><div class="stage-gate-actions">${actions}</div>`;
  }
  host.querySelector('[data-stage-open-cast]')?.addEventListener('click',()=>setView('characters'));
  host.querySelector('[data-stage-create-storyboards]')?.addEventListener('click',e=>generateAllScenes(e.currentTarget));
  host.querySelector('[data-stage-preview-audio]')?.addEventListener('click',()=>narrateEpisode());
  host.querySelectorAll('[data-stage-resolve-voices]').forEach(b=>b.addEventListener('click',()=>openVoiceResolutionFromStage(b.dataset.stageResolveVoices||'audio')));
  host.querySelectorAll('[data-stage-approve]').forEach(b=>b.addEventListener('click',()=>approveStudioStage(b.dataset.stageApprove)));
}
function renderWorkflow(p){
  const cfg=formatConfig(p?.format||'Episode'),a=assetStats(p),ep=episodeOf(p),st=studioStageState(p,ep),dependency=productionDependencyReadiness(p,ep),steps=$$('#workflow .workflow-step');
  steps.forEach(x=>x.classList.remove('done','active','locked'));
  cfg.journey.forEach((label,i)=>{const t=$(`#wf${i+1}Title`),sub=$(`#wf${i+1}Sub`);if(t)t.textContent=label;if(sub)sub.textContent=cfg.journeySubs[i]||''});
  if($('#wf1Sub'))$('#wf1Sub').textContent=st.story?'Approved':'Review';
  let current=0,next;
  if(!st.story){current=0;next={title:'Review the complete story',text:'Approve the narrative to unlock cast, storyboard, audio and production.',label:'Review story',action:'review-story'};}
  else if(!st.cast){current=1;next={title:'Review your cast',text:'Confirm recurring characters, relationships and voice direction before scene planning.',label:'Review cast',action:'stage-cast'};}
  else if(!st.storyboard){current=2;next={title:'Review the scene plan',text:'Confirm scene order and visual intent before audio or paid video production.',label:'Review storyboard',action:'stage-storyboard'};}
  else if(!st.audio){
    current=3;
    const voiceState=voiceProductionReadiness(p,ep,'audio'),blockedNames=voiceState.characters.map(x=>p.characters?.[x.index]?.name).filter(Boolean),blockingCount=blockedNames.length+(voiceState.narrator?.blocking?1:0);
    if(blockingCount){next={title:`${blockingCount} voice${blockingCount===1?'':'s'} need attention`,text:`${blockedNames.length?`${blockedNames.join(' and ')} need${blockedNames.length===1?'s':''} production-safe voice${blockedNames.length===1?'':'s'}. `:''}Resolve the highlighted voice requirement${blockingCount===1?'':'s'} before audio can be approved.`,label:`Resolve ${blockingCount} voice${blockingCount===1?'':'s'}`,action:'resolve-voices',hideAction:true};}
    else next={title:'Audio plan ready for approval',text:`Voice readiness is clear. Review the scene sound plan below, then approve audio to unlock production.`,label:'Approve audio',action:'stage-audio',hideAction:true};
  }
  else if(!dependency.timelineReady){
    current=4;
    const first=dependency.nodes.find(n=>n.state!=='ready'&&['video','sync','shots','dialogue','voice'].includes(n.id));
    const activelyGenerating=first?.id==='video'&&dependency.generating>0;
    const recoveryNeedsReview=first?.id==='video'&&!activelyGenerating&&dependency.recovering>0;
    next={
      title:activelyGenerating?'Production in progress':recoveryNeedsReview?'Recovery needs review':'Continue production',
      text:recoveryNeedsReview?`${dependency.sourceReady}/${dependency.plannedShots} ready · ${dependency.recovering} existing provider job${dependency.recovering===1?'':'s'} preserved${dependency.waiting?` · ${dependency.waiting} waiting`:''}. Review recovery without starting duplicate paid work.`:(first?.detail||'CineTale will preserve completed media and continue only the missing dependency.'),
      label:activelyGenerating?'View progress':first?.id==='voice'?'Resolve voices':first?.id==='dialogue'?'Complete audio review':'Review production',
      action:activelyGenerating?'scroll-production':first?.id==='voice'?'resolve-voices':first?.id==='dialogue'?'stage-audio':'finish-production'
    };
  }
  else if(!(p.renderStatus==='ready'||p.renderStatus==='final-video-ready'||p.finalVideoMeta)){current=5;next={title:`Prepare final ${cfg.finalName}`,text:'All authoritative upstream dependencies are ready. Preview the sequence and prepare the final cut.',label:'Prepare final',action:'assemble'};}
  else{current=5;next=p.finalVideoMeta?{title:`Final ${cfg.finalName} ready`,text:'Your finished video is ready to view, download or share.',label:'View final',action:'preview-final'}:{title:`${cfg.title} assembly ready`,text:'The sequence is locked and ready for final rendering.',label:'Render full video',action:'render-final'};}
  steps.forEach((step,i)=>{if(i<current)step.classList.add('done');else if(i===current)step.classList.add('active');else step.classList.add('locked')});
  const finalStep=steps[5];
  if(finalStep&&!st.finalReady){finalStep.classList.add('inspectable');finalStep.setAttribute('aria-disabled','false');finalStep.title='Open Final episode readiness without starting production';if($('#wf6Sub')&&current<5)$('#wf6Sub').textContent='Readiness'}
  if(st.finalReady){steps.forEach((step,i)=>{step.classList.remove('active','locked','inspectable');step.classList.add('done')})}
  steps.forEach(step=>step.classList.remove('inspection-selected'));
  if(state.studioInspectionStage==='final'&&finalStep){
    steps.forEach(step=>{step.classList.remove('active');step.removeAttribute('aria-current')});
    finalStep.classList.add('inspection-selected','active');finalStep.classList.remove('locked');finalStep.setAttribute('aria-current','step');
    if($('#wf6Sub'))$('#wf6Sub').textContent='Inspecting readiness';
  }else if(finalStep)finalStep.removeAttribute('aria-current');
  const card=$('#nextStepCard');if(card){$('#nextStepTitle').textContent=next.title;$('#nextStepText').textContent=next.text;const b=$('#nextStepAction');b.textContent=next.label;b.dataset.nextView=next.view||'';b.dataset.nextAction=next.action||'';b.classList.toggle('hidden',Boolean(next.hideAction));card.classList.toggle('guidance-only',Boolean(next.hideAction))}
}

function normalizedTier(value){const t=String(value||'standard').toLowerCase();if(t==='fast'||t==='draft'||t==='preview')return 'draft';if(t==='premium'||t==='cinematic'||t==='high')return 'premium';return 'standard'}
function tierLabel(value){return {draft:'Draft preview',standard:'Standard',premium:'Premium / Cinematic'}[normalizedTier(value)]}
function tierHint(value){return {draft:'Faster/cheaper when a draft route is configured.',standard:'Balanced default production quality.',premium:'Highest-fidelity route when a premium model is configured.'}[normalizedTier(value)]}
function setSceneTier(index,value){const p=current(),ep=episodeOf(p);if(!ep?.scenes?.[index])return;updateProject(x=>{const e=episodeOf(x);if(e?.scenes?.[index])e.scenes[index].tier=normalizedTier(value)});toast(`Scene quality set to ${tierLabel(value)}.`)}
function normalizedFraming(value){const v=String(value||'safe').toLowerCase();return ['auto','safe','medium','close','wide'].includes(v)?v:'safe'}
function framingLabel(value){return {auto:'Auto',safe:'Safe framing',medium:'Medium shot',close:'Close-up',wide:'Wide shot'}[normalizedFraming(value)]}
function setSceneFraming(index,value){const p=current(),ep=episodeOf(p);if(!ep?.scenes?.[index])return;updateProject(x=>{const e=episodeOf(x);if(e?.scenes?.[index])e.scenes[index].framing=normalizedFraming(value)});toast(`Scene framing set to ${framingLabel(value)}.`)}

function sceneCoveragePlan(scene,mode='balanced'){return ensureSceneCoverage(scene,mode)}
function sceneHasAnyProducedShotMedia(scene={}){
  return Boolean((Array.isArray(scene.coverageClips)&&scene.coverageClips.some(x=>x&&(x.videoStoragePath||x.videoLocalMediaKey||x.syncStoragePath||x.syncLocalMediaKey||x.videoMediaPersistedAt||x.syncMediaPersistedAt)))||scene.videoStoragePath||scene.videoLocalMediaKey||scene.videoMediaPersistedAt||scene.lipSyncStoragePath||scene.lipSyncLocalMediaKey||scene.lipSyncMediaPersistedAt);
}
function sceneLogicIssueText(issue={}){
  const messages={
    'speaker-mismatch':'A speaking shot is assigned to the wrong character.',
    'spoken-line-mismatch':'A speaking shot does not contain its authoritative dialogue line.',
    'dialogue-count-mismatch':'The number of speaking shots does not match the scene dialogue.',
    'nested-speaker-conflict':'A dialogue line contains conflicting speaker labels.',
    'unknown-speaking-character':'CineTale is refreshing this scene’s character links before production.',
    'ambiguous-speaking-character':'CineTale found more than one possible character for a speaking shot and paused safely.',
    'duplicate-shot-id':'Two shots share the same identity.',
    'duplicate-shot-order':'Two shots share the same order.',
    'timeline-overlap':'Two planned shots overlap in the scene timeline.',
    'duplicate-visual-beat':'Two visual shots repeat the exact same story beat.',
    'visual-shot-has-dialogue':'A visual-only shot contains dialogue ownership metadata.',
    'duplicate-character-id':'Two cast members share the same stable identity.',
    'duplicate-character-name':'Two cast members share the same production name.',
    'duplicate-scene-id':'Two scenes share the same stable identity.',
    'orphaned-shot-media':'Saved shot media no longer maps cleanly to the current shot plan.',
    'logic-audit-runtime':'CineTale could not verify this scene safely. Repair the scene before production.'
  };return messages[issue.code]||issue.message||'The scene plan contains an unresolved production-logic conflict.';
}
function sceneProductionLogicAuditUnsafe(project={},scene={},mode='balanced'){
  if(!project||!scene)return {ok:false,issues:[{code:'missing-scene',message:'The scene could not be validated.'}]};
  if(!sceneHasAnyProducedShotMedia(scene)){migratePersistedProjectIdentityReferences(project);recoverSceneDialogueIdentityBindings(project,scene);reconcileSceneIdentityOwnership(project,scene,mode);}
  let plan=ensureSceneCoverage(scene,mode),audit=coverageLogicAudit(scene,plan);
  // The Studio self-heals deterministic defects on ungenerated plans. Paid/durable media is never
  // silently reshuffled; once media exists the same conflict fails closed for explicit review.
  if(!audit.ok&&!sceneHasAnyProducedShotMedia(scene)){
    const repair=repairCoverageLogic(scene,plan,mode);
    if(repair.changed){scene.coveragePlan=repair.repaired;scene.productionLogicAutoFixedAt=new Date().toISOString();scene.productionLogicAutoFixedCodes=repair.autoFixed;reconcileSceneIdentityOwnership(project,scene,mode);plan=scene.coveragePlan||repair.repaired;audit=coverageLogicAudit(scene,plan)}
  }
  const issues=[...audit.issues],identitySeen=new Set(),entries=dialogueEntries(scene.dialogue);
  let speakingOrdinal=0;
  for(const shot of plan.filter(x=>x?.speaking)){
    const turnIndex=Number.isInteger(Number(shot.dialogueTurnIndex))?Number(shot.dialogueTurnIndex):speakingOrdinal;const entry=entries[turnIndex]??entries[speakingOrdinal],binding=sceneDialogueBindingAt(scene,turnIndex);speakingOrdinal++;
    const parts=dialogueParts(entry),hints=shotIdentityHints(shot,entry,binding);
    const match=resolveCharacterIdentityAuthoritative(project,{dialogueSpeaker:parts.speaker,shotSpeaker:shot.speaker||shot.character||shot.characterName,fallbackSpeakers:hints.speakerHints,characterIds:hints.characterIds});
    if(match.status!=='resolved'){const key=`${shot.id}|${match.status}|${match.reason}`;if(!identitySeen.has(key)){identitySeen.add(key);issues.push({code:match.status==='ambiguous'?'ambiguous-speaking-character':'unknown-speaking-character',shotId:shot.id,message:match.status==='ambiguous'?`Shot ${shot.order} has more than one possible character owner.`:`Shot ${shot.order} needs its character link refreshed before production.`,identityReason:match.reason,identityDiagnostics:match.diagnostics||[]})}}
  }
  return {...audit,ok:issues.length===0,issues,autoFixedCodes:Array.isArray(scene.productionLogicAutoFixedCodes)?scene.productionLogicAutoFixedCodes:[]};
}
function sceneProductionLogicAudit(project={},scene={},mode='balanced'){
  try{return sceneProductionLogicAuditUnsafe(project,scene,mode)}
  catch(error){console.error('[CineTale production logic] Audit failed',error);return {ok:false,issues:[{code:'logic-audit-runtime',message:'CineTale could not verify this scene safely. Repair the scene before production.'}],autoFixedCodes:[]}}
}
function repairSceneProductionLogic(sceneIndex){
  const p=current(),ep=episodeOf(p),scene=ep?.scenes?.[sceneIndex];if(!p||!scene)return;
  if(sceneHasAnyProducedShotMedia(scene)){toast('This scene already contains generated media, so CineTale will not reshuffle its shot logic automatically.');return}
  updateProject(x=>{migratePersistedProjectIdentityReferences(x);const e=episodeOf(x),target=e?.scenes?.[sceneIndex];if(!target)return;recoverSceneDialogueIdentityBindings(x,target);bindSceneDialogueCharacters(x,target,{preserveExisting:true});reconcileSceneIdentityOwnership(x,target,'balanced');const plan=ensureSceneCoverage(target,'balanced'),repair=repairCoverageLogic(target,plan,'balanced');if(repair.changed)target.coveragePlan=repair.repaired;reconcileSceneIdentityOwnership(x,target,'balanced');target.productionLogicAutoFixedAt=new Date().toISOString();target.productionLogicAutoFixedCodes=[...new Set([...(target.productionLogicAutoFixedCodes||[]),...repair.autoFixed,'identity-binding'])];target.shotTimelineVersion='1.11.0'});
  const live=current(),liveScene=episodeOf(live)?.scenes?.[sceneIndex],audit=sceneProductionLogicAudit(live,liveScene,'balanced');
  toast(audit.ok?'Scene plan repaired and verified.':`Plan still needs attention: ${sceneLogicIssueText(audit.issues[0])}`);
}
function assertSceneProductionLogic(project={},scene={},mode='balanced'){
  const audit=sceneProductionLogicAudit(project,scene,mode);if(audit.ok)return audit;
  const first=audit.issues[0];throw new Error(`CineTale stopped before generation because the scene plan has a logic conflict: ${first?.message||'speaker, dialogue, shot order, or continuity ownership is inconsistent.'}`);
}
function episodeProductionLogicAudit(project={},episode={},mode='balanced'){
  ensureCharacterIdentityIds(project);const issues=[];
  const characterIds=new Set(),characterNames=new Map();for(let i=0;i<(project?.characters||[]).length;i++){const c=project.characters[i],id=String(c?.id||'');if(!id)issues.push({code:'missing-character-id',message:`Character ${c?.name||i+1} has no stable identity.`});else if(characterIds.has(id))issues.push({code:'duplicate-character-id',message:`Two characters share the same stable identity (${c?.name||id}).`});else characterIds.add(id);const key=normalizeSpeakerAlias(c?.name||'');if(key){if(characterNames.has(key))issues.push({code:'duplicate-character-name',message:`Two characters use the same production name: ${c?.name||key}.`});else characterNames.set(key,i)}}
  const sceneIds=new Set(),scenes=(episode?.scenes||[]).map((scene,index)=>{if(scene?.id){if(sceneIds.has(String(scene.id)))issues.push({code:'duplicate-scene-id',sceneIndex:index,sceneNumber:scene?.number||index+1,message:`Scene ${scene?.number||index+1} shares an identity with another scene.`});else sceneIds.add(String(scene.id))}const audit=sceneProductionLogicAudit(project,scene,mode);return {index,scene,audit}});
  issues.push(...scenes.flatMap(x=>x.audit.issues.map(issue=>({...issue,sceneIndex:x.index,sceneNumber:x.scene?.number||x.index+1,sceneTitle:x.scene?.title||''}))));
  for(const {index,scene} of scenes){const planIds=new Set((sceneCoveragePlan(scene,mode)||[]).map(x=>String(x?.id||'')));for(const clip of coverageClips(scene)){const shotId=String(clip?.shotId||'');if(shotId&&!planIds.has(shotId)&&(clip.videoStoragePath||clip.videoLocalMediaKey||clip.syncStoragePath||clip.syncLocalMediaKey))issues.push({code:'orphaned-shot-media',sceneIndex:index,sceneNumber:scene?.number||index+1,message:`Scene ${scene?.number||index+1} contains durable media that no longer maps to its shot plan. CineTale will preserve it and stop before automatic regeneration.`})}}
  return {ok:issues.length===0,issues,scenes,revision:'v1.12.20-system-integrity'};
}
function coverageClips(scene={}){return Array.isArray(scene.coverageClips)?scene.coverageClips:[]}
function coverageMediaRuntimeUrl(entry={}){const key=String(entry?.videoLocalMediaKey||entry?.videoStoragePath||'');return key?sceneMediaRuntimeUrls.get(key)||'':''}
function coverageClipVideoUrl(entry={}){return (entry?.videoLocalMediaKey||entry?.videoStoragePath)&&entry?.videoMediaPersistedAt&&!entry?.videoMediaExpired?(coverageMediaRuntimeUrl(entry)||''):''}
function coverageSyncMediaRuntimeUrl(entry={}){const key=String(entry?.syncLocalMediaKey||entry?.syncStoragePath||'');return key?sceneMediaRuntimeUrls.get(key)||'':''}
function coverageClipSyncUrl(entry={}){return entry?.syncValidated===true&&(entry?.syncLocalMediaKey||entry?.syncStoragePath)&&entry?.syncMediaPersistedAt?(coverageSyncMediaRuntimeUrl(entry)||''):''}
function coverageShotCurrentVoiceId(project={},shot={}){const idx=characterIndexForSpeaker(project,shot?.speaker||'');return idx>=0?String(project.characters?.[idx]?.voiceId||''):''}
function coverageShotSyncIdentity(project={},scene={},shot={},entry={}){return JSON.stringify({pipeline:'v1.10.23-shot-sync',projectId:String(project?.id||''),sceneId:String(scene?.id||scene?.number||''),shotId:String(shot?.id||entry?.shotId||''),speaker:normalizeSpeakerAlias(shot?.speaker||entry?.speaker||''),spokenLine:String(shot?.spokenLine||entry?.spokenLine||'').trim(),voiceId:coverageShotCurrentVoiceId(project,shot),sourceStoragePath:String(entry?.videoStoragePath||''),sourcePersistedAt:String(entry?.videoMediaPersistedAt||'')})}
function coverageShotSyncValid(project={},scene={},shot={},entry={}){return Boolean(entry&&entry.syncValidated===true&&entry.syncProviderAudioAuthoritative===true&&entry.syncIdentity===coverageShotSyncIdentity(project,scene,shot,entry)&&(entry.syncLocalMediaKey||entry.syncStoragePath)&&entry.syncMediaPersistedAt)}
function finalTimelineMode(project={}){const mode=String(project?.autoFinalJob?.mode||project?.finalAssembly?.coverageMode||'balanced');return ['fast','balanced','cinematic'].includes(mode)?mode:'balanced'}
function coverageSourceDurablyOwned(entry={}){return Boolean(entry&&(entry.videoLocalMediaKey||entry.videoStoragePath)&&entry.videoMediaPersistedAt&&!entry.videoMediaExpired)}
function coverageSyncDurablyOwned(entry={}){return Boolean(entry&&(entry.syncLocalMediaKey||entry.syncStoragePath)&&entry.syncMediaPersistedAt&&entry.syncValidated===true&&entry.syncProviderAudioAuthoritative===true)}
function sceneStoryTimelineReady(project={},scene={},mode=finalTimelineMode(project)){
  const plan=sceneCoveragePlan(scene,mode),primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,mode)?.id||plan[0]?.id||'');if(!plan.length)return false;
  return plan.every(shot=>{if(String(shot.id)===primaryId)return shot.speaking?sceneHasValidatedLipSync(project,scene):sceneSourceDurablyOwned(scene);const entry=coverageEntry(scene,shot.id);if(!entry)return false;return shot.speaking?coverageShotSyncValid(project,scene,shot,entry):coverageSourceDurablyOwned(entry)});
}
function sceneShotMediaInventory(project={},scene={},mode=finalTimelineMode(project)){
  const plan=sceneCoveragePlan(scene,mode),primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,mode)?.id||plan[0]?.id||'');
  const shots=plan.map(shot=>{
    const shotId=String(shot?.id||''),primary=shotId===primaryId,entry=primary?null:coverageEntry(scene,shotId);
    const sourceDurable=primary?sceneSourceDurablyOwned(scene):coverageSourceDurablyOwned(entry);
    const syncReady=Boolean(shot?.speaking&&(primary?sceneHasValidatedLipSync(project,scene):coverageShotSyncValid(project,scene,shot,entry)));
    const operation=primary?scene?.videoOperation:entry?.operation;
    const dialogueOperation=shot?.speaking?(primary?scene?.lipSyncOperation:entry?.syncOperation):null;
    const dialogueError=Boolean(shot?.speaking&&(primary?(scene?.lipSyncStatus==='error'||scene?.lipSyncError):(entry?.syncStatus==='error'||entry?.syncError)));
    const rawSource=primary?scene?.videoUrl:entry?.videoUrl;
    const providerCompleted=Boolean(primary?scene?.videoProviderCompletedAt:entry?.videoProviderCompletedAt);
    const recoveryPending=Boolean(rawSource&&!sourceDurable&&!operation&&providerCompleted);
    const expiredOrLegacy=Boolean(rawSource&&!sourceDurable&&!operation&&!providerCompleted);
    const recoveryState=String(primary?scene?.videoRecoveryState:entry?.videoRecoveryState||'');
    let state='planned';
    if(shot?.speaking&&syncReady)state='ready';
    else if(!shot?.speaking&&sourceDurable)state='ready';
    else if(operation&&recoveryState==='recovering')state='recovering';
    else if(operation)state='rendering';
    else if(dialogueOperation)state='syncing';
    else if(sourceDurable&&shot?.speaking&&dialogueError)state='sync-error';
    else if(sourceDurable&&shot?.speaking)state='dialogue';
    else if(recoveryPending)state='recover';
    else if(expiredOrLegacy)state='recreate';
    return {shot,shotId,primary,entry,state,recoveryState,sourceDurable,syncReady,operation:Boolean(operation),operationId:String(operation||''),dialogueOperation:Boolean(dialogueOperation),dialogueError,providerCompleted,recoveryPending,expiredOrLegacy,needsVideo:!sourceDurable&&!recoveryPending,needsDialogue:Boolean(shot?.speaking&&sourceDurable&&!syncReady)};
  });
  return {plan,shots,total:shots.length,ready:shots.filter(x=>x.state==='ready').length,preserved:shots.filter(x=>x.sourceDurable||x.syncReady).length,needsVideo:shots.filter(x=>x.needsVideo&&!x.operation).length,rendering:shots.filter(x=>x.operation).length,needsDialogue:shots.filter(x=>x.needsDialogue).length,recreate:shots.filter(x=>x.state==='recreate').length};
}
function sceneVideoProgressState(project={},scene={},mode=finalTimelineMode(project)){
  const inv=sceneShotMediaInventory(project,scene,mode),total=inv.total,sourceReady=inv.shots.filter(x=>x.sourceDurable).length,deferred=project?.autoFinalJob?.status==='recovery-deferred';
  const activeGenerating=deferred?0:inv.shots.filter(x=>x.operation&&x.state!=='recovering').length;
  const recoveryPending=inv.shots.filter(x=>x.recoveryPending||x.state==='recovering'||(deferred&&x.operation)).length;
  const waiting=Math.max(0,total-sourceReady-activeGenerating-recoveryPending);
  let state='waiting',label=total?`${sourceReady}/${total} video ready`:'No shots';
  if(total&&sourceReady===total){state='ready';label=`${sourceReady}/${total} video ready · complete`}
  else if(activeGenerating){state='active';label=`${sourceReady}/${total} video ready · ${activeGenerating} generating`}
  else if(recoveryPending){state='recovering';label=`${sourceReady}/${total} video ready · ${recoveryPending} recovery pending`}
  else if(waiting){state='waiting';label=`${sourceReady}/${total} video ready · ${waiting} waiting`}
  return {state,label,total,sourceReady,activeGenerating,recoveryPending,waiting,inventory:inv};
}
function productionRecoveryAutoPollingAllowed(project={}){return Boolean(project)&&project?.autoFinalJob?.status!=='recovery-deferred'}

function productionDependencyReadiness(project={},episode=episodeOf(project)){
  const ep=episode||{},selected=selectedFinalScenes(ep),st=studioStageState(project,ep),voice=voiceProductionReadiness(project,ep,'audio');
  const coverageMode=finalTimelineMode(project),inventories=selected.map(({scene,index})=>({scene,index,inventory:sceneShotMediaInventory(project,scene,coverageMode),logic:sceneProductionLogicAudit(project,scene,coverageMode)}));
  const plannedShots=inventories.reduce((n,x)=>n+x.inventory.total,0),sourceReady=inventories.reduce((n,x)=>n+x.inventory.shots.filter(s=>s.sourceDurable).length,0),rendering=inventories.reduce((n,x)=>n+x.inventory.rendering,0),recover=inventories.reduce((n,x)=>n+x.inventory.shots.filter(s=>s.state==='recover'||s.state==='recovering').length,0),activeRecovering=inventories.reduce((n,x)=>n+x.inventory.shots.filter(s=>s.operation&&s.state==='recovering').length,0),generating=Math.max(0,rendering-activeRecovering),waiting=Math.max(0,plannedShots-sourceReady-generating-recover),recreate=inventories.reduce((n,x)=>n+x.inventory.recreate,0);
  const speaking=inventories.flatMap(x=>x.inventory.shots.filter(s=>s.shot?.speaking)),speakingTotal=speaking.length,syncReady=speaking.filter(s=>s.syncReady).length,syncing=speaking.filter(s=>s.dialogueOperation).length,syncErrors=speaking.filter(s=>s.dialogueError).length;
  const logicIssues=inventories.flatMap(x=>x.logic.issues||[]),timelineReady=selected.length>0&&selected.every(x=>sceneStoryTimelineReady(project,x.scene,coverageMode));
  const finalPresent=Boolean(project?.finalVideoMeta||project?.renderStatus==='final-video-ready');
  const finalStale=Boolean(finalPresent&&!timelineReady);
  const nodes=[];
  const add=(id,label,state,detail,recovery='',action='')=>nodes.push({id,label,state,detail,recovery,action});
  add('voice','Voice readiness',voice.blocking?'blocked':'ready',voice.blocking?`${voice.issues.length} production voice requirement${voice.issues.length===1?'':'s'} unresolved.`:'All speaking identities have production-safe voice assignments.',voice.blocking?'Resolve only the highlighted voices.':'','voice');
  if(voice.blocking)add('dialogue','Dialogue audio','blocked','Waiting for production-safe voice assignments before approved dialogue can be finalized.','Resolve voices first.','voice');
  else if(!st.audio)add('dialogue','Dialogue audio','attention','Voice assignments are ready, but the episode audio plan is not approved.','Review and approve voices, narration and sound direction.','audio');
  else add('dialogue','Dialogue audio','ready','Approved voice and sound contracts are ready for on-demand dialogue synthesis.','','');
  if(!st.storyboard)add('shots','Shot readiness','blocked','Waiting for storyboard approval before production planning is authoritative.','Review the scene plan first.','storyboard');
  else if(logicIssues.length)add('shots','Shot readiness','attention',`${logicIssues.length} production-logic conflict${logicIssues.length===1?'':'s'} must be resolved before generation.`,logicIssues[0]?.message||'Review the affected scene.','shots');
  else add('shots','Shot readiness','ready',`${plannedShots} planned story shot${plannedShots===1?'':'s'} have stable identities and production logic.`,'','');
  if(!selected.length)add('video','Video readiness','attention','No scenes are selected for final production.','Include at least one scene.','video');
  else if(logicIssues.length||!st.audio)add('video','Video readiness','blocked',`${sourceReady}/${plannedShots||0} planned shots have durable source video; upstream production requirements are not yet clear.`,sourceReady?'Completed source media is preserved.':'Finish upstream reviews first.','video');
  else if(sourceReady===plannedShots&&plannedShots)add('video','Video readiness','ready',`${sourceReady}/${plannedShots} planned shots have durable source video.`,'','');
  else if(project?.autoFinalJob?.status==='auth-required')add('video','Video readiness','attention',`${sourceReady}/${plannedShots} ready · session restoration required.`,`Sign in again, then resume. Existing provider jobs and completed media are preserved.`,'video');
  else if(project?.autoFinalJob?.status==='stalled')add('video','Video readiness','attention',`${sourceReady}/${plannedShots} ready · production paused after no new completed media for 15 minutes.`,`Resume only the preserved missing work when you are ready; CineTale will check existing provider jobs before any new submission.`,'video');
  else if(project?.autoFinalJob?.status==='recovery-deferred')add('video','Video readiness','attention',`${sourceReady}/${plannedShots} ready · ${recover} existing provider job${recover===1?'':'s'} still pending · automatic checking stopped.`,`Nothing is generating in CineTale right now. Provider operation IDs are preserved; use Review production to check them again later.`,'video');
  else if(rendering)add('video','Video readiness','producing',`${sourceReady}/${plannedShots} ready · ${generating} generating · ${recover} recovering · ${waiting} waiting.`,`CineTale preserves completed media and never replaces an existing paid operation just because recovery is slow.`,'video');
  else add('video','Video readiness','attention',`${sourceReady}/${plannedShots} source videos ready${recover?` · ${recover} finished result${recover===1?'':'s'} need saving`:''}${recreate?` · ${recreate} legacy/expired clip${recreate===1?'':'s'} need recreation`:''}.`,'Review the production estimate; CineTale will reuse all durable media.','video');
  if(!speakingTotal)add('sync','Dialogue sync','ready','No speaking shots require lip-sync.','','');
  else if(syncReady===speakingTotal)add('sync','Dialogue sync','ready',`${syncReady}/${speakingTotal} speaking shots are synchronized to approved voices.`,'','');
  else if(sourceReady<plannedShots)add('sync','Dialogue sync','blocked',`${syncReady}/${speakingTotal} speaking shots synchronized. Remaining sync depends on source-video readiness.`,'Finish only the missing source shots first.','sync');
  else if(syncErrors)add('sync','Dialogue sync','attention',`${syncReady}/${speakingTotal} speaking shots synchronized · ${syncErrors} sync failure${syncErrors===1?'':'s'} need retry.`,'Retry dialogue synchronization only; source videos stay preserved.','sync');
  else if(syncing)add('sync','Dialogue sync','producing',`${syncReady}/${speakingTotal} speaking shots synchronized · ${syncing} currently synchronizing.`,'No new video generation is required.','sync');
  else add('sync','Dialogue sync','attention',`${syncReady}/${speakingTotal} speaking shots synchronized.`,'Finish approved dialogue synchronization only; source video stays preserved.','sync');
  if(finalStale)add('final','Final episode','attention','The stored final is no longer authoritative because an upstream dependency changed.','Rebuild only the final file after upstream readiness returns.','final');
  else if(finalPresent&&timelineReady)add('final','Final episode','ready','A final production record exists and its upstream story-shot timeline is still authoritative.','','');
  else if(timelineReady)add('final','Final episode','attention','All selected story-shot timelines are ready; only final assembly remains.','Create the final file from preserved ready media.','final');
  else add('final','Final episode','blocked','Final assembly is waiting for the authoritative upstream readiness chain.','Use the first highlighted recovery action; completed media will be reused.','final');
  const firstAction=nodes.find(n=>n.state!=='ready'&&n.action)?.action||'';
  return {revision:'v1.12.64-provider-retrieval-diagnostics',nodes,selectedScenes:selected.length,plannedShots,sourceReady,generating,recovering:recover,waiting,speakingTotal,syncReady,timelineReady,finalPresent,finalStale,firstAction,ready:nodes.every(n=>n.state==='ready')};
}
function dependencyStateLabel(state=''){return ({ready:'Ready',blocked:'Waiting',attention:'Needs attention',producing:'In progress'})[state]||'Pending'}
function productionActionAuthority(project={},episode=episodeOf(project)){
  const graph=productionDependencyReadiness(project,episode),first=graph.nodes.find(n=>n.state!=='ready')||null,firstRecovery=graph.nodes.find(n=>n.state!=='ready'&&n.action)||null;
  const hardGate=graph.nodes.find(n=>['voice','dialogue','shots'].includes(n.id)&&n.state!=='ready')||null;
  const video=graph.nodes.find(n=>n.id==='video'),sync=graph.nodes.find(n=>n.id==='sync'),final=graph.nodes.find(n=>n.id==='final');
  const firstAction=firstRecovery?.action||'';
  return {
    graph,first,firstRecovery,hardGate,firstAction,
    productionUnlocked:!hardGate,
    canReviewProduction:!hardGate&&Boolean(video&&video.state!=='ready'),
    canFinishDialogue:!hardGate&&Boolean(video?.state==='ready'&&sync&&sync.state!=='ready'),
    canCreateFinal:!hardGate&&Boolean(video?.state==='ready'&&sync?.state==='ready'&&final&&final.state!=='ready'),
    isFirstAction:(action='')=>Boolean(action&&action===firstAction)
  };
}
function renderProductionDependencyPanel(project={},episode=episodeOf(project)){
  const host=document.querySelector('#productionDependencyPanel');if(!host)return;const authority=productionActionAuthority(project,episode),graph=authority.graph,first=authority.first,hardGate=authority.hardGate,firstRecovery=authority.firstRecovery;
  const firstRecoveryId=firstRecovery?.id||'';
  host.innerHTML=`<div class="production-dependency-head"><div><span class="kicker">PRODUCTION READINESS</span><b>One authoritative dependency chain</b><small>${first?`Next: ${esc(first.label)} · ${esc(first.detail)}`:'All production dependencies are ready.'}</small>${hardGate?`<em class="production-readiness-inspect-note">Inspection only · Paid production stays locked until ${esc(hardGate.label.toLowerCase())} is ready.</em>`:''}</div><span class="production-dependency-summary">${graph.nodes.filter(n=>n.state==='ready').length}/${graph.nodes.length} ready</span></div><div class="production-dependency-grid">${graph.nodes.map(n=>{const primary=!state.autoFinalRunning&&n.id===firstRecoveryId&&!['ready','producing'].includes(n.state)&&n.action;return `<div class="production-dependency-node ${esc(n.state)} ${primary?'next-recovery':''}" data-dependency-node="${esc(n.id)}"><span class="production-dependency-dot" aria-hidden="true"></span><div><div class="production-dependency-title"><b>${esc(n.label)}</b><span class="dependency-state-chip ${esc(n.state)}">${esc(dependencyStateLabel(n.state))}</span></div><small>${esc(n.detail)}</small>${n.recovery&&primary?`<em>${esc(n.recovery)}</em>`:''}</div>${primary&&n.action!=='video'?`<button class="primary tiny" type="button" data-dependency-action="${esc(n.action)}">${n.action==='voice'?'Resolve voices':n.action==='audio'?'Complete audio review':n.action==='storyboard'?'Review storyboard':n.action==='shots'?'Review scenes':n.action==='sync'?'Finish dialogue':n.action==='final'?'Create final':'Continue'}</button>`:''}</div>`}).join('')}</div>`;
  host.querySelectorAll('[data-dependency-action]').forEach(button=>button.addEventListener('click',()=>handleProductionDependencyAction(button.dataset.dependencyAction)));
}
function handleProductionDependencyAction(action=''){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
  const authority=productionActionAuthority(p,ep),safeAction=authority.firstAction;
  if(!safeAction)return;
  if(action!==safeAction){toast(`Finish ${authority.firstRecovery?.label||'the first production requirement'} first.`);return handleProductionDependencyAction(safeAction)}
  if(action==='voice'){openVoiceResolutionFromStage('audio');return}
  if(action==='audio'||action==='storyboard'){$('#studioStageGate')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(action==='shots'){$('#sceneProductionTitle')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(action==='video'){runProductionBatch({resume:Boolean(p.autoFinalJob)});return}
  if(action==='sync'){finishDialogueSynchronizationBatch({resume:Boolean(p.autoFinalJob)});return}
  if(action==='final'){createFinalVideo();return}
}
function sceneRelevantCharacterIds(project={},scene={}){
  const ids=[];
  const entries=dialogueEntries(scene.dialogue);
  for(let i=0;i<entries.length;i++){
    const idx=resolveDialogueCharacterIndex(project,scene,entries[i],i),id=idx>=0?String(project.characters?.[idx]?.id||''):'';
    if(id&&!ids.includes(id))ids.push(id);
  }
  return ids;
}
function sceneLipSyncVoiceTuple(c={}){
  return [c.id||'',c.voiceId||'',c.voiceLocked?1:0,c.voicePerformance||'',c.voicePace||'',c.voiceAccentDirection||'',c.voiceCustomDirection||'',c.voice||'',c.name||'',c.age||'',c.personality||'',c.voiceName||''];
}
function semanticDialogueBindings(scene={}){
  return dialogueEntries(scene.dialogue).map((entry,i)=>{const b=sceneDialogueBindingAt(scene,i),parts=dialogueParts(entry);return [String(b?.characterId||embeddedDialogueCharacterId(entry)||''),normalizeSpeakerAlias(parts.speaker||b?.speakerLabel||'')]});
}
function sceneLipSyncSignature(project={},scene={}){
  const relevantIds=sceneRelevantCharacterIds(project,scene),voices=relevantIds.map(id=>sceneLipSyncVoiceTuple((project.characters||[]).find(c=>String(c?.id||'')===id)||{}));
  const narration=dialogueText(scene.narration)||'';
  return JSON.stringify({pipeline:LIP_SYNC_PIPELINE_REV,video:scene.videoUrl||'',language:project.language||'English',dialogue:dialogueList(scene.dialogue),narration,direction:sceneAudioDirection(scene),narrationStyle:scene.narrationStyle||'',bindings:semanticDialogueBindings(scene),voices,narrator:narration?[project.narratorVoiceId||'',project.narratorVoiceName||'',project.narratorPerformance||'',project.narratorPace||'',project.narratorAccentDirection||'',project.narratorCustomDirection||'']:[]});
}
function legacyLipSyncSignatureCompatible(project={},scene={}){
  if(scene.lipSyncValidated!==true||scene.lipSyncStatus==='error'||scene.lipSyncPlaybackFailedAt||!['sync-labs','fal-sync'].includes(scene.lipSyncProvider)||!sceneLipSyncResultLooksDistinct(scene))return false;
  if(scene.lipSyncSourceVideoUrl&&normalizedMediaUrl(scene.lipSyncSourceVideoUrl)!==normalizedMediaUrl(scene.videoUrl||''))return false;
  let old;try{old=JSON.parse(String(scene.lipSyncSignature||''))}catch{return false}
  if(!old||typeof old!=='object'||!Array.isArray(old.voices))return false;
  if(String(old.video||'')!==String(scene.videoUrl||''))return false;
  if(JSON.stringify(old.dialogue||[])!==JSON.stringify(dialogueList(scene.dialogue)))return false;
  if(String(old.narration||'')!==String(dialogueText(scene.narration)||''))return false;
  if(String(old.direction||'')!==String(scene.audioDirection||''))return false;
  if(String(old.narrationStyle||'')!==String(scene.narrationStyle||''))return false;
  const currentBindings=semanticDialogueBindings(scene),oldBindings=Array.isArray(old.bindings)?old.bindings.map((b,i)=>[String(b?.characterId||''),normalizeSpeakerAlias(dialogueParts(dialogueEntries(scene.dialogue)[i]||'').speaker||b?.speakerLabel||'')]):[];
  if(oldBindings.length&&JSON.stringify(oldBindings)!==JSON.stringify(currentBindings))return false;
  for(const id of sceneRelevantCharacterIds(project,scene)){
    const c=(project.characters||[]).find(x=>String(x?.id||'')===id);if(!c)return false;
    const historical=old.voices.find(v=>Array.isArray(v)&&String(v[0]||'')===id);if(!historical)return false;
    const current=[c.id||'',c.voiceId||'',c.voiceLocked?1:0,c.voicePerformance||'',c.voicePace||'',c.voiceAccentDirection||'',c.voiceCustomDirection||''];
    if(JSON.stringify(historical.slice(0,7))!==JSON.stringify(current))return false;
  }
  if(String(old.narration||'')){
    const historicalNarrator=Array.isArray(old.narrator)?old.narrator:[],currentNarrator=[project.narratorVoiceId||'',project.narratorPerformance||'',project.narratorPace||''];
    if(JSON.stringify(historicalNarrator.slice(0,3))!==JSON.stringify(currentNarrator))return false;
  }
  return true;
}
function migrateValidatedLipSyncSignatures(project={}){
  let changed=false;
  for(const ep of project.episodes||[])for(const scene of ep.scenes||[]){
    const next=sceneLipSyncSignature(project,scene);
    if(scene?.lipSyncValidated===true&&scene.lipSyncSignature!==next&&legacyLipSyncSignatureCompatible(project,scene)){scene.lipSyncSignature=next;scene.lipSyncSignatureMigratedAt=new Date().toISOString();changed=true}
  }
  return changed;
}
function normalizedMediaUrl(value=''){return canonicalMediaUrl(value)}
function lipSyncRemoteHostAllowed(url='',provider=''){
  try{
    const u=new URL(String(url||'')),host=u.hostname.toLowerCase();
    if(provider==='sync-labs')return host==='assets.sync.so'||host.endsWith('.sync.so')||host==='storage.googleapis.com'||host.endsWith('.amazonaws.com')||host.endsWith('.cloudfront.net');
    if(provider==='fal-sync')return host==='fal.media'||host.endsWith('.fal.media')||host==='storage.googleapis.com';
    return host==='assets.sync.so'||host.endsWith('.sync.so')||host==='fal.media'||host.endsWith('.fal.media')||host==='storage.googleapis.com'||host.endsWith('.amazonaws.com')||host.endsWith('.cloudfront.net');
  }catch{return false}
}
function sceneLipSyncResultLooksDistinct(scene={}){
  const synced=normalizedMediaUrl(scene.lipSyncVideoUrl||''),source=normalizedMediaUrl(scene.videoUrl||'');
  if(!synced||!source||synced===source)return false;
  try{
    const u=new URL(synced);
    const proxied=u.searchParams.get('uri')||'';
    if(proxied&&/generativelanguage\.googleapis\.com/i.test(decodeURIComponent(proxied)))return false;
    if(u.pathname==='/api/lipsync-video'){
      const generationId=String(u.searchParams.get('id')||'').trim();
      if(!generationId||scene.lipSyncProvider!=='sync-labs')return false;
    }
    const remote=String(scene.lipSyncRemoteVideoUrl||'');
    if(remote&&!lipSyncRemoteHostAllowed(remote,scene.lipSyncProvider||''))return false;
  }catch{return false}
  return true;
}
function sceneHasRecoverableLipSyncAsset(project={},scene={}){
  if(!project||!scene?.videoUrl||!sceneHasSpokenContent(scene))return false;
  if(!['sync-labs','fal-sync'].includes(scene.lipSyncProvider)||!sceneLipSyncResultLooksDistinct(scene))return false;
  if(scene.lipSyncSourceVideoUrl&&normalizedMediaUrl(scene.lipSyncSourceVideoUrl)!==normalizedMediaUrl(scene.videoUrl||''))return false;
  if(scene.lipSyncProvider==='sync-labs'&&!String(scene.lipSyncGenerationId||'').trim()){
    try{const u=new URL(String(scene.lipSyncVideoUrl||''),location.origin);if(u.pathname==='/api/lipsync-video'&&!String(u.searchParams.get('id')||'').trim())return false}catch{return false}
  }
  return true;
}
function sceneLipSyncRecoveryCompatibility(project={},scene={}){
  // v1.9.86 deliberately does not re-trust legacy synchronized assets. A professional speaking clip
  // must have a complete source-video + character + dialogue + approved-audio production contract.
  if(!scene?.lipSyncProductionContract||!sceneVideoProductionProvenanceValid(project,scene))return '';
  if(!sceneHasRecoverableLipSyncAsset(project,scene))return '';
  // v1.9.76 and earlier could mark an arbitrary playable saved sync asset as recovered and then
  // overwrite its semantic signature with the CURRENT scene signature. That destroys the evidence
  // needed to prove the recovered audio actually belonged to this dialogue. Never re-trust one of
  // those legacy recovered assets unless a newer build already recorded how compatibility was proved.
  if(scene.lipSyncRecoveredAt&&!scene.lipSyncRecoveryCompatibility)return '';
  const current=sceneLipSyncSignature(project,scene),saved=String(scene.lipSyncSignature||'');
  if(saved===current)return 'exact';
  return legacyLipSyncSignatureCompatible(project,scene)?'legacy-compatible':'';
}
function productionContractIdentityCompatible(saved='',current=''){
  if(String(saved||'')===String(current||''))return true;
  let a,b;try{a=JSON.parse(String(saved||''));b=JSON.parse(String(current||''))}catch{return false}
  const scalar=['projectId','episodeId','sceneId','shotId','shotOrder','shotSpeaking','shotSpeaker','shotSpeakerCharacterId','shotLine'];
  for(const key of scalar)if(String(a?.[key]??'')!==String(b?.[key]??''))return false;
  // Visual/camera/cast-description metadata may be normalized by newer builds after the source
  // was already generated. Those descriptive changes do not change which exact speaking shot,
  // character, or line the paid synchronization job belongs to. The current source video still
  // has to pass its own strict videoProductionContract check separately.
  return true;
}
function sceneLipSyncAudioProvenanceValid(project={},scene={}){
  const current=sceneLipSyncSignature(project,scene),currentContract=sceneVideoProductionContract(project,scene);
  return Boolean(scene.lipSyncAudioSignature===current&&scene.lipSyncAudioDigest&&scene.lipSyncRequestDigest&&scene.lipSyncProductionContract&&productionContractIdentityCompatible(scene.lipSyncProductionContract,currentContract)&&sceneVideoProductionProvenanceValid(project,scene));
}
async function recoverSavedLipSyncAsset(project,scene,index){
  const compatibility=sceneLipSyncRecoveryCompatibility(project,scene);if(!compatibility)return '';
  const projectId=project.id,episodeId=episodeOf(project)?.id||episodeOf(project)?.number,sceneId=scene.id||'',url=scene.lipSyncVideoUrl,signature=sceneLipSyncSignature(project,scene),savedSignature=String(scene.lipSyncSignature||'');
  try{
    await waitForVideoAsset(url);
    let savedMedia=null;
    if(!sceneSyncDurablyOwned(scene))savedMedia=await persistSceneMediaUrl(projectId,episodeId,index,url,'sync',{render:false,commit:false});
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||sceneLipSyncRecoveryCompatibility(x,t)!==compatibility||normalizedMediaUrl(t.lipSyncVideoUrl||'')!==normalizedMediaUrl(url))return;if(savedMedia){t.lipSyncLocalMediaKey=savedMedia.localKey;t.lipSyncStoragePath=savedMedia.storagePath;t.lipSyncMediaPersistedAt=savedMedia.persistedAt;t.lipSyncMediaOwnership=savedMedia.ownership;t.lipSyncDurableVerifiedAt=savedMedia.persistedAt}t.lipSyncRecoveredFromSignature=savedSignature;t.lipSyncRecoveryCompatibility=compatibility;t.lipSyncSignature=sceneLipSyncSignature(x,t);t.lipSyncProviderAudioAuthoritative=true;t.lipSyncEmbeddedAudioVerified=true;t.lipSyncAudioFinalizeMethod='sync-provider-exact-approved-audio';t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncPlaybackFailedAt=null;t.lipSyncSubmissionFailedAt=null;t.lipSyncError=null;t.lipSyncErrorCode='';t.lipSyncProviderStatus='COMPLETED';t.lipSyncRecoveredAt=new Date().toISOString()},{render:false});
    const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
    return live&&liveScene&&sceneHasValidatedLipSync(live,liveScene)?liveScene.lipSyncVideoUrl:'';
  }catch(e){console.warn('[CineTale lipsync] Saved synchronized asset could not be recovered',e);return ''}
}
function sceneHasCurrentLipSync(project={},scene={}){return Boolean(['sync-labs','fal-sync'].includes(scene.lipSyncProvider)&&scene.lipSyncStatus!=='error'&&!scene.lipSyncPlaybackFailedAt&&sceneLipSyncResultLooksDistinct(scene)&&scene.lipSyncSignature===sceneLipSyncSignature(project,scene)&&sceneVideoProductionProvenanceValid(project,scene)&&sceneLipSyncAudioProvenanceValid(project,scene))}
function sceneHasSupersededDialogueSync(project={},scene={}){
  if(!sceneHasSpokenContent(scene)||!sceneVideoProductionProvenanceValid(project,scene))return false;
  const hasPaidState=Boolean(scene.lipSyncVideoUrl||scene.lipSyncOperation||scene.lipSyncGenerationId);
  if(!hasPaidState||!scene.lipSyncSignature)return false;
  if(scene.lipSyncSignature===sceneLipSyncSignature(project,scene))return false;
  // The source production contract still proves the same project/episode/scene/shot/speaker/line.
  // A differing dialogue signature therefore represents changed approved voice/performance state,
  // not permission to reuse an older synchronized mouth-performance with new audio.
  return productionContractIdentityCompatible(scene.lipSyncProductionContract||scene.videoProductionContract||'',sceneVideoProductionContract(project,scene));
}
function supersedeStaleDialogueSyncForAutomaticRefresh(project={},scene={},index=0){
  if(!sceneHasSupersededDialogueSync(project,scene))return false;
  const projectId=project.id,episodeId=episodeOf(project)?.id||episodeOf(project)?.number,sceneId=scene.id||'';
  syncDiag('stale-dialogue-sync-superseded',project,scene,{sceneIndex:index,oldGenerationId:String(scene.lipSyncGenerationId||scene.lipSyncOperation||''),oldSignature:String(scene.lipSyncSignature||''),newSignature:sceneLipSyncSignature(project,scene)});
  updateProjectById(projectId,x=>{
    const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t)return;
    t.lipSyncSupersededGenerationId=String(t.lipSyncGenerationId||t.lipSyncOperation||'');
    t.lipSyncSupersededAt=new Date().toISOString();
    // Preserve the durable source and leave old provider files untouched for audit/recovery, but
    // detach the stale synchronized result from active playback/state before creating one replacement.
    resetSceneLipSyncOnly(t,t.videoUrl);
    t.lipSyncAutoPending=true;t.lipSyncStatus='preparing';t.lipSyncError=null;t.lipSyncErrorCode='';
  },{render:false});
  return true;
}
function sceneSourceDurablyOwned(scene={}){const runtime=sceneMediaRuntimeUrl(scene,'source');return Boolean(scene?.videoUrl&&scene.videoMediaPersistedAt&&!scene.videoMediaExpired&&(runtime||scene.videoLocalMediaKey||(!scene.videoCloudMissing&&scene.videoStoragePath)))}
function sceneSyncDurablyOwned(scene={}){return Boolean(scene?.lipSyncVideoUrl&&(scene.lipSyncLocalMediaKey||scene.lipSyncStoragePath)&&scene.lipSyncMediaPersistedAt)}
function sceneHasValidatedLipSync(project={},scene={}){const approvedAudioReady=!sceneHasSpokenContent(scene)||scene.lipSyncEmbeddedAudioVerified===true||scene.lipSyncProviderAudioAuthoritative===true;return Boolean(sceneHasCurrentLipSync(project,scene)&&scene.lipSyncValidated===true&&approvedAudioReady&&sceneSyncDurablyOwned(scene))}
function sceneSourceMatchesCurrentProduction(project={},scene={}){return Boolean(sceneSourceDurablyOwned(scene)&&(!sceneHasSpokenContent(scene)||sceneVideoProductionProvenanceValid(project,scene)))}
function sceneNeedsModernSource(project={},scene={}){return Boolean(sceneHasSpokenContent(scene)&&scene.videoUrl&&!sceneVideoProductionProvenanceValid(project,scene))}
function sceneProductionReady(project={},scene={}){return Boolean(sceneSourceMatchesCurrentProduction(project,scene)&&(!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene)))}
function resetSceneLipSyncOnly(scene={},videoUrl=''){
  scene.lipSyncVideoUrl='';scene.lipSyncRemoteVideoUrl='';scene.lipSyncStoragePath='';scene.lipSyncLocalMediaKey='';scene.lipSyncProvider='';scene.lipSyncGenerationId='';scene.lipSyncSourceVideoUrl=videoUrl||scene.videoUrl||'';scene.lipSyncGeneratedAt=null;scene.lipSyncSignature='';scene.lipSyncAudioSignature='';scene.lipSyncAudioDigest='';scene.lipSyncRequestDigest='';scene.lipSyncProductionContract='';scene.lipSyncRecoveredFromSignature='';scene.lipSyncRecoveryCompatibility='';scene.lipSyncRecoveredAt=null;scene.lipSyncOperation=null;scene.lipSyncStatusUrl='';scene.lipSyncResponseUrl='';scene.lipSyncModel='';scene.lipSyncStatus='idle';scene.lipSyncValidated=false;scene.lipSyncRetryCount=0;scene.lipSyncError=null;scene.lipSyncErrorCode='';scene.lipSyncProviderStatus='';scene.lipSyncPlaybackFailedAt=null;scene.lipSyncSubmissionFailedAt=null;scene.lipSyncStartedAt=null;scene.lipSyncEmbeddedAudioVerified=false;scene.lipSyncProviderAudioAuthoritative=false;scene.lipSyncAudioFinalizedAt=null;scene.lipSyncAudioFinalizeMethod='';
}
function invalidateSpeakingSyncForCharacterVoiceChange(project={},characterIndex=-1){
  const character=project?.characters?.[characterIndex];if(!character)return 0;let changed=0;
  for(const episode of project.episodes||[])for(const scene of episode.scenes||[]){
    if(!scene?.videoUrl||!sceneHasSpokenContent(scene))continue;
    const shot=sourceSpeakingShot(scene)||primaryCoverageShot(scene,'balanced');
    if(!shot?.speaking||characterIndexForSpeaker(project,shot.speaker||'')!==characterIndex)continue;
    resetSceneLipSyncOnly(scene,scene.videoUrl);scene.lipSyncAutoPending=true;changed++;
  }
  if(changed){project.finalAssembly=null;project.renderStatus=null;project.finalVideoMeta=null;}
  return changed;
}
function resumeAutomaticDialogueFinalizationSoon(){
  setTimeout(()=>{const p=current(),ep=episodeOf(p);if(p&&ep)scheduleStudioLipSyncWarmup(p,ep)},0);
}
function resetSceneLipSyncForNewSource(scene={},videoUrl=''){
  resetSceneLipSyncOnly(scene,videoUrl);
  // A genuinely new source invalidates source ownership metadata until the replacement is durably
  // committed. Clearing only lip-sync state elsewhere must NEVER discard an already-owned source.
  scene.videoStoragePath='';scene.videoLocalMediaKey='';scene.videoMediaPersistedAt=null;scene.videoMediaOwnership='';scene.videoDurableVerifiedAt=null;scene.videoMediaExpired=false;scene.videoCloudMissing=false;scene.videoPlaybackError=null;
}
function sceneValidatedSyncPlaybackUrl(scene={},project=null){const p=project||current()||{};return sceneHasValidatedLipSync(p,scene)?(sceneMediaRuntimeUrl(scene,'sync')||''):''}
function scenePrimaryVideoUrl(scene={},project=null){const p=project||current()||{};if(sceneHasValidatedLipSync(p,scene))return sceneValidatedSyncPlaybackUrl(scene,p);return sceneSourceDurablyOwned(scene)?(sceneMediaRuntimeUrl(scene,'source')||''):''}
function sceneStudioCandidateUrls(scene={},project=null){const p=project||current()||{},urls=[];const validated=sceneHasValidatedLipSync(p,scene),sync=validated?sceneMediaRuntimeUrl(scene,'sync'):'',source=sceneSourceDurablyOwned(scene)?sceneMediaRuntimeUrl(scene,'source'):'';if(validated){if(sync)urls.push(sync);return urls}if(source)urls.push(source);for(const c of coverageClips(scene)){const url=coverageClipVideoUrl(c);if(url&&!urls.includes(url))urls.push(url)}return urls}
const studioMediaProbeCache=new Map();
function probeStudioMediaUrl(url,{timeout=9000}={}){
  const normalized=normalizedMediaUrl(url||'');if(!normalized)return Promise.resolve(false);
  const cached=studioMediaProbeCache.get(normalized);
  if(cached&&Date.now()-cached.at<60000)return cached.promise;
  const promise=new Promise(resolve=>{
    const probe=document.createElement('video');probe.preload='metadata';probe.muted=true;probe.playsInline=true;let done=false;
    const finish=ok=>{if(done)return;done=true;clearTimeout(timer);probe.removeAttribute('src');try{probe.load()}catch{}resolve(Boolean(ok))};
    probe.addEventListener('loadedmetadata',()=>finish(Number.isFinite(probe.duration)&&probe.duration>0),{once:true});
    probe.addEventListener('error',()=>finish(false),{once:true});
    const timer=setTimeout(()=>finish(false),timeout);probe.src=url;try{probe.load()}catch{finish(false)}
  });
  studioMediaProbeCache.set(normalized,{at:Date.now(),promise});
  return promise;
}
async function recoverMountedSceneMedia(video,index,project,scene,failedUrl=''){
  if(!video||video.dataset.mediaRecovery==='1')return false;video.dataset.mediaRecovery='1';
  try{
    const candidates=sceneStudioCandidateUrls(scene,project).filter(url=>normalizedMediaUrl(url)!==normalizedMediaUrl(failedUrl));
    for(const candidate of candidates){
      if(!await probeStudioMediaUrl(candidate))continue;
      const live=liveSceneAt(index),liveProject=live.project||project,liveScene=live.scene||scene;if(!liveProject||!liveScene)return false;
      const key=studioSceneMediaKey(liveProject,liveScene);studioVideoFallbacks.set(key,{signature:sceneLipSyncSignature(liveProject,liveScene),source:liveScene.videoUrl||'',url:candidate,failed:failedUrl});
      stopSceneVideoVoicePlayback(video,{keepIntent:false,restoreProviderAudio:false});
      const validatedSync=sceneHasValidatedLipSync(liveProject,liveScene)&&normalizedMediaUrl(candidate)===normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject));
      // Runtime blob/storage URLs are intentionally different from the provider URL. Compare
      // against CineTale's hydrated synchronized runtime asset, never the remote provider URL.
      // Otherwise a valid synchronized MP4 can be falsely classified as source media and muted.
      video.muted=sceneHasSpokenContent(liveScene)&&!validatedSync;
      if(validatedSync){video.removeAttribute('data-sync-gated');video.defaultMuted=false;video.muted=false;video.removeAttribute('muted');video.volume=1;video.dataset.lipSyncReady='1';video.dataset.voiceSync='provider'}
      video.src=candidate;video.load();return true;
    }
    return false;
  }finally{delete video.dataset.mediaRecovery}
}
function sceneStudioVideoUrl(scene={},project=null){normalizeSceneMediaReferences(scene);const p=project||current()||{},key=studioSceneMediaKey(p,scene),signature=sceneLipSyncSignature(p,scene),sourceRuntime=sceneMediaRuntimeUrl(scene,'source'),syncRuntime=sceneMediaRuntimeUrl(scene,'sync'),source=sceneSourceDurablyOwned(scene)?canonicalMediaUrl(sourceRuntime||(sceneSourceMediaHydrationPending(scene)?'':scene.videoUrl||'')):'',synced=sceneHasValidatedLipSync(p,scene)?canonicalMediaUrl(syncRuntime||(sceneSyncMediaHydrationPending(scene)?'':scene.lipSyncVideoUrl||'')):'',durableSync=synced,durableSource=source,desired=canonicalMediaUrl(sceneHasValidatedLipSync(p,scene)?durableSync:durableSource);const fallback=studioVideoFallbacks.get(key);if(fallback&&fallback.signature===signature&&fallback.source===source&&sceneStudioCandidateUrls(scene,p).some(x=>normalizedMediaUrl(x)===normalizedMediaUrl(fallback.url)))return fallback.url;const pin=studioVideoSourcePins.get(key);if(pin&&pin.signature===signature&&pin.source===source&&normalizedMediaUrl(pin.url)===normalizedMediaUrl(desired))return pin.url;if(desired)studioVideoSourcePins.set(key,{signature,source,url:desired});return desired}
function sceneVideoSources(scene={},project=null){const urls=[];const primary=scenePrimaryVideoUrl(scene,project);if(primary)urls.push(primary);for(const c of coverageClips(scene)){const url=coverageClipVideoUrl(c);if(url&&!urls.includes(url))urls.push(url)}return urls}
function sceneFinalVideoEntries(scene={},project=null){
  const p=project||current()||{},plan=sceneCoveragePlan(scene,'balanced'),byId=new Map(plan.map(shot=>[String(shot?.id||''),shot])),entries=[];
  const primaryUrl=scenePrimaryVideoUrl(scene,p),primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,'balanced')?.id||'');
  if(primaryUrl){const shot=byId.get(primaryId)||plan[0]||null;entries.push({url:primaryUrl,shotId:primaryId||shot?.id||'primary',order:Number(shot?.order)||1,startSec:Number(shot?.startSec)||0,endSec:Number(shot?.endSec)||0,plannedDurationSec:Number(shot?.durationSec)||Number(scene.videoDurationSec)||0,speaking:Boolean(shot?.speaking||scene.videoPrimarySpeaking),synchronized:sceneHasValidatedLipSync(p,scene)});}
  for(const c of coverageClips(scene)){const coverageUrl=coverageClipVideoUrl(c);if(!coverageUrl)continue;const shot=byId.get(String(c.shotId||''))||null;entries.push({url:coverageUrl,shotId:String(c.shotId||''),order:Number(shot?.order||c.order)||999,startSec:Number(shot?.startSec)||0,endSec:Number(shot?.endSec)||0,plannedDurationSec:Number(shot?.durationSec)||Number(c.durationSec)||0,speaking:Boolean(shot?.speaking||c.speaking),synchronized:false});}
  const seen=new Set();return entries.filter(entry=>{const key=normalizedMediaUrl(entry.url);if(!key||seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>(a.startSec-b.startSec)||(a.order-b.order));
}
function sceneAuthoritativeFinalVideoEntries(scene={},project=null){
  const p=project||current()||{},mode=finalTimelineMode(p),plan=sceneCoveragePlan(scene,mode),primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,mode)?.id||plan[0]?.id||''),entries=[];
  for(const shot of plan){
    const shotId=String(shot?.id||'');let url='',synchronized=false,source='coverage';
    if(shotId===primaryId){source='primary';if(shot.speaking){if(sceneHasValidatedLipSync(p,scene)){url=sceneValidatedSyncPlaybackUrl(scene,p);synchronized=true}}else url=scenePrimaryVideoUrl(scene,p)}
    else{
      const clip=coverageEntry(scene,shotId);if(shot.speaking){if(coverageShotSyncValid(p,scene,shot,clip)){url=coverageClipSyncUrl(clip);synchronized=true}}else url=coverageClipVideoUrl(clip);
    }
    if(!url)continue;
    entries.push({url,shotId,order:Number(shot.order)||entries.length+1,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,speaking:Boolean(shot.speaking),speaker:String(shot.speaker||''),spokenLine:String(shot.spokenLine||''),synchronized,authoritative:true,source,audioPurpose:shot.speaking?'dialogue':'ambience'});
  }
  return entries.sort((a,b)=>(a.order-b.order)||(a.startSec-b.startSec));
}
function validatePreparedFinalTimeline(project,selectedScenes,prepared){
  if(prepared.length!==selectedScenes.length)throw new Error('Final timeline validation failed: selected scene count changed during rendering.');
  const ids=new Set(),urls=new Set(),manifest=[];
  for(let i=0;i<prepared.length;i++){
    const asset=prepared[i],scene=selectedScenes[i],sceneId=String(scene?.id||scene?.number||i),plan=sceneCoveragePlan(scene,asset.coverageMode||finalTimelineMode(project));
    if(ids.has(sceneId))throw new Error(`Final timeline validation failed: scene ${i+1} appears more than once.`);ids.add(sceneId);
    if(asset.scene!==scene&&String(asset.scene?.id||asset.scene?.number||'')!==sceneId)throw new Error(`Final timeline validation failed: scene ${i+1} identity changed before render.`);
    if(!asset.videos?.length)throw new Error(`Final timeline validation failed: scene ${i+1} has no authoritative media.`);
    if(asset.videos.length!==plan.length)throw new Error(`Final timeline validation failed: scene ${i+1} has ${asset.videos.length}/${plan.length} planned shots ready. CineTale will not manufacture missing story coverage.`);
    const shotIds=new Set();
    for(let j=0;j<asset.videos.length;j++){
      const item=asset.videos[j],entry=item.entry||{},planned=plan[j],shotId=String(entry.shotId||'');
      if(!shotId||shotIds.has(shotId))throw new Error(`Final timeline validation failed: scene ${i+1} has a duplicate or missing shot identity.`);shotIds.add(shotId);
      if(String(planned?.id||'')!==shotId)throw new Error(`Final timeline validation failed: scene ${i+1} shot order changed before render.`);
      if(Boolean(planned?.speaking)!==Boolean(entry.speaking))throw new Error(`Final timeline validation failed: scene ${i+1} shot ${j+1} speech identity changed.`);
      if(entry.speaking&&!entry.synchronized)throw new Error(`Final timeline validation failed: scene ${i+1} speaking shot ${j+1} is not synchronized to its approved voice.`);
      const u=normalizedMediaUrl(entry.url||'');if(!u)throw new Error(`Final timeline validation failed: scene ${i+1} shot ${j+1} has an empty media reference.`);if(urls.has(u))throw new Error('Final timeline validation failed: the same video was assigned to more than one story-timeline position.');urls.add(u);
    }
    manifest.push({sceneId,sceneNumber:scene?.number||i+1,title:scene?.title||`Scene ${i+1}`,shotCount:asset.videos.length,speakingShotCount:asset.videos.filter(x=>x.entry?.speaking).length,synchronizedShotCount:asset.videos.filter(x=>x.entry?.synchronized).length,durationSec:Number(asset.sceneDuration)||0,shotIds:[...shotIds],audioPolicy:'dialogue-on-synchronized-shots+narration-on-opening-visual+ambient-source-on-nonspeaking-shots'});
  }
  return {version:2,validatedAt:new Date().toISOString(),sceneCount:manifest.length,sceneOrder:manifest.map(x=>x.sceneId),noDuplicateMedia:true,completePlannedShotCoverage:true,allSpeakingShotsSynchronized:true,noFabricatedLooping:true,audioContinuityPolicy:'explicit-per-shot',scenes:manifest};
}
function coverageUi(scene={}){const p=current()||{},summary=coverageSummary(scene,'balanced'),inv=sceneShotMediaInventory(p,scene,'balanced');return `<div class="scene-coverage-note"><b>Cinematic coverage</b><span>${summary.planned} shots planned · ${summary.speaking} speaking shot${summary.speaking===1?'':'s'} · ${inv.ready} ready · ${inv.needsVideo} need generation${inv.needsDialogue?` · ${inv.needsDialogue} need dialogue sync`:''}</span></div>`}

function shotTimelineStatus(project={},scene={},shot={}){
  const inventory=sceneShotMediaInventory(project,scene,'balanced'),item=inventory.shots.find(x=>x.shotId===String(shot?.id||''));
  if(!item)return {label:'PLANNED',kind:'planned'};
  if(item.state==='ready')return {label:'READY',kind:'ready'};
  if(item.state==='dialogue')return {label:'VIDEO SAVED · SYNC NEEDED',kind:'pending'};
  if(item.state==='sync-error')return {label:'DIALOGUE SYNC FAILED',kind:'sync-error'};
  if(item.state==='rendering')return {label:'GENERATING',kind:'active'};
  if(item.state==='syncing')return {label:'DIALOGUE SYNCING',kind:'syncing'};
  if(item.state==='recover')return {label:'SAVE NEEDED',kind:'recover'};
  if(item.state==='recreate')return {label:'RECREATE',kind:'attention'};
  return {label:'PLANNED',kind:'planned'};
}
function selectedStudioShot(scene={}){
  const plan=sceneCoveragePlan(scene,'balanced');if(!plan.length)return null;
  const requested=String(scene.studioSelectedShotId||'').trim();
  return plan.find(shot=>String(shot.id)===requested)||plan[0];
}
function shotIsPrimary(scene={},shot={}){
  const plan=sceneCoveragePlan(scene,'balanced'),primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,'balanced')?.id||plan[0]?.id||'');
  return String(shot?.id||'')===primaryId;
}
function selectedShotPlayback(project={},scene={},shot={}){
  if(!shot)return {url:'',ready:false,synchronized:false,primary:false};
  const primary=shotIsPrimary(scene,shot);
  if(primary){
    if(shot.speaking){const ready=sceneHasValidatedLipSync(project,scene),url=ready?sceneValidatedSyncPlaybackUrl(scene,project):(sceneSourceDurablyOwned(scene)?sceneMediaRuntimeUrl(scene,'source'):'');return {url,ready,synchronized:ready,primary:true};}
    const url=sceneSourceDurablyOwned(scene)?sceneMediaRuntimeUrl(scene,'source'):'';return {url,ready:Boolean(url),synchronized:false,primary:true};
  }
  const entry=coverageEntry(scene,shot.id);
  if(shot.speaking){const ready=coverageShotSyncValid(project,scene,shot,entry),url=ready?coverageClipSyncUrl(entry):coverageClipVideoUrl(entry);return {url,ready,synchronized:ready,primary:false,entry};}
  const url=coverageClipVideoUrl(entry);return {url,ready:Boolean(url),synchronized:false,primary:false,entry};
}
function sceneShotType(shot={}){
  if(shot.speaking)return 'SPEAKING';
  const kind=String(shot.kind||'').trim().toUpperCase();
  if(kind==='ESTABLISHING')return 'ESTABLISHING';
  if(kind==='MOVEMENT')return 'MOVEMENT';
  if(kind==='REACTION')return 'REACTION';
  if(kind==='DETAIL')return 'DETAIL';
  return 'VISUAL';
}
function sceneShotDisplayType(project={},shot={}){
  const type=sceneShotType(shot),lang=String(project?.language||'').toLowerCase();
  if(!lang.includes('hindi'))return type;
  return {SPEAKING:'संवाद',ESTABLISHING:'स्थापना',MOVEMENT:'क्रिया',REACTION:'प्रतिक्रिया',DETAIL:'विवरण',VISUAL:'दृश्य'}[type]||type;
}
function sceneShotTimelineUi(project={},scene={}){
  const logic=sceneProductionLogicAudit(project,scene,'balanced'),plan=sceneCoveragePlan(scene,'balanced');if(!plan.length)return '';
  const selected=selectedStudioShot(scene);
  const cards=plan.map(shot=>{
    const status=shotTimelineStatus(project,scene,shot),type=sceneShotDisplayType(project,shot),who=shot.speaking?(shot.speaker||'Dialogue'):type,line=shot.speaking?String(shot.spokenLine||'').trim():String(shot.storyBeat||shot.displayText||shot.visual||shot.purpose||'').trim(),isSelected=String(selected?.id||'')===String(shot.id),route=plannedShotRoute(project,scene,shot,Math.max(0,Number(shot.order||1)-1));
    return `<button type="button" class="scene-shot-card ${status.kind}${isSelected?' selected':''}" data-shot-id="${esc(shot.id)}" data-shot-status="${esc(status.kind)}" aria-pressed="${isSelected?'true':'false'}" aria-label="Shot ${shot.order}, ${esc(type.toLowerCase())}, ${esc(status.label.toLowerCase())}${isSelected?', selected':''}"><div class="scene-shot-card-top"><b>Shot ${shot.order}</b><span class="scene-shot-status ${status.kind}">${status.label}</span></div><strong>${esc(who)}</strong><div class="scene-shot-meta"><span class="scene-shot-type">${esc(type)}</span><span>${Number(shot.durationSec||0).toFixed(1)}s</span><span class="shot-route ${esc(route)}">${esc(productionRouteLabel(route))}</span></div><p>${esc(line||shot.visual||'Planned story beat')}</p></button>`
  }).join('');
  const inv=sceneShotMediaInventory(project,scene,'balanced'),parts=[`${plan.length} planned shots`];if(inv.ready)parts.push(`${inv.ready} ready`);if(inv.needsVideo)parts.push(`${inv.needsVideo} need generation`);if(inv.needsDialogue)parts.push(`${inv.needsDialogue} need dialogue sync`);if(inv.recreate)parts.push(`${inv.recreate} expired legacy clip${inv.recreate===1?'':'s'} to recreate`);
  const complete=Math.max(0,Math.min(plan.length,inv.ready||0)),progress=plan.length?Math.round((complete/plan.length)*100):0;
  const preview=scenePreviewReadiness(project,scene),reason=!logic.ok?sceneLogicIssueText(logic.issues[0]):'',logicBadge=logic.ok?`<span class="scene-logic-badge ok" title="Speaker, dialogue, shot order, timeline and cast ownership checks passed.">Plan verified</span>`:`<span class="scene-logic-badge attention" title="CineTale blocks generation until this plan is consistent.">Plan needs attention</span><small class="scene-logic-reason">${esc(reason)}</small><button type="button" class="scene-logic-repair" data-scene-logic-repair>Recheck & repair</button>`;
  return `<div class="scene-shot-timeline"><div class="scene-shot-timeline-head"><div><b>Story shot plan</b><small class="scene-shot-progress-copy">${complete}/${plan.length} ready · ${progress}%</small>${logicBadge}${preview.allReady?'<span class="scene-auto-edit-badge">Auto edit ready</span>':''}<button class="scene-play-sequence" data-scene-preview type="button" ${preview.allReady?'':`disabled title="Finish all planned shots before playing this scene."`}>${preview.label}</button></div><span>${parts.join(' · ')}</span></div><div class="scene-shot-progress" role="progressbar" aria-label="Scene shot readiness" aria-valuemin="0" aria-valuemax="${plan.length}" aria-valuenow="${complete}"><i style="width:${progress}%"></i></div><div class="scene-shot-strip">${cards}</div></div>`;
}
function sceneEditPlan(project={},scene={}){
  const plan=sceneCoveragePlan(scene,'balanced');
  return plan.map((shot,index)=>{
    const previous=plan[index-1]||null,next=plan[index+1]||null,type=sceneShotType(shot),speaking=Boolean(shot.speaking);
    // The editor is intentionally conservative: remove only short generator-settle/dead tails,
    // preserve every spoken syllable, and prefer clean cinematic cuts over decorative transitions.
    const trimInSec=index===0?.04:(speaking?.035:.08);
    const trimOutSec=index===plan.length-1?.04:(speaking?.07:.11);
    const transitionIn=index===0?'start':(!speaking&&!previous?.speaking?'soft-cut':'cut');
    const transitionMs=transitionIn==='soft-cut'?110:0;
    return {revision:SCENE_EDIT_PIPELINE_REV,shotId:shot.id,order:shot.order,type,speaking,trimInSec,trimOutSec,transitionIn,transitionMs,audioMode:speaking?'validated-dialogue':'controlled-silence',previousShotId:previous?.id||null,nextShotId:next?.id||null};
  });
}
function sceneEditForShot(project={},scene={},shot={}){return sceneEditPlan(project,scene).find(x=>String(x.shotId)===String(shot?.id||''))||{trimInSec:0,trimOutSec:0,transitionIn:'cut',transitionMs:0,audioMode:shot?.speaking?'validated-dialogue':'controlled-silence'}}
function sceneEditSummary(project={},scene={}){
  const plan=sceneEditPlan(project,scene),trimmed=plan.filter(x=>x.trimInSec>0||x.trimOutSec>0).length,soft=plan.filter(x=>x.transitionIn==='soft-cut').length;
  return {revision:SCENE_EDIT_PIPELINE_REV,shots:plan.length,trimmed,soft,label:plan.length?'Auto edit ready':'Auto edit waiting'};
}
function scenePreviewReadiness(project={},scene={}){
  const plan=sceneCoveragePlan(scene,'balanced'),inventory=sceneShotMediaInventory(project,scene,'balanced');
  const allReady=Boolean(plan.length)&&inventory.ready===plan.length&&!inventory.needsVideo&&!inventory.needsDialogue&&!inventory.recreate;
  return {planned:plan.length,ready:inventory.ready||0,allReady,label:allReady?'▶ Play edited scene':`Scene preview ${inventory.ready||0}/${plan.length} ready`};
}
async function resolveScenePreviewShotUrl(projectId,episodeId,sceneIndex,shotId){
  let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex],shot=sceneCoveragePlan(scene||{},'balanced').find(x=>String(x.id)===String(shotId));
  if(!p||!ep||!scene||!shot)return '';
  if(shotIsPrimary(scene,shot)){
    if(shot.speaking){
      if(!sceneHasValidatedLipSync(p,scene))return '';
      let url=sceneValidatedSyncPlaybackUrl(scene,p);if(!url)url=await hydrateSceneMedia(projectId,episodeId,sceneIndex,'sync').catch(()=> '');
      return url||'';
    }
    let url=scenePrimaryVideoUrl(scene,p);if(!url)url=await hydrateSceneMedia(projectId,episodeId,sceneIndex,'source').catch(()=> '');
    return url||'';
  }
  let entry=coverageEntry(scene,shot.id);
  if(shot.speaking){
    if(!coverageShotSyncValid(p,scene,shot,entry))return '';
    let url=coverageClipSyncUrl(entry);if(!url)url=await hydrateCoverageSyncMedia(projectId,episodeId,sceneIndex,shot.id).catch(()=> '');
    return url||'';
  }
  let url=coverageClipVideoUrl(entry);if(!url)url=await hydrateCoverageMedia(projectId,episodeId,sceneIndex,shot.id).catch(()=> '');
  return url||'';
}
let activeScenePreviewSession=null;
function stopActiveScenePreview(){
  const session=activeScenePreviewSession;if(!session)return;
  activeScenePreviewSession=null;
  try{session.video?.pause?.()}catch{}
  try{session.cancel?.()}catch{}
}
function playScenePreviewElement(video,session,{startAt=0,endAt=null}={}){
  return new Promise((resolve,reject)=>{
    let settled=false,raf=0;const cleanup=()=>{cancelAnimationFrame(raf);video.removeEventListener('ended',ended);video.removeEventListener('error',failed);if(session.cancel===cancel)session.cancel=null},finish=value=>{if(settled)return;settled=true;cleanup();resolve(value)},ended=()=>finish('ended'),failed=()=>{if(settled)return;settled=true;cleanup();reject(new Error('A scene shot could not be played.'))},cancel=()=>finish('cancelled');
    const tick=()=>{if(settled)return;if(Number.isFinite(endAt)&&video.currentTime>=endAt){try{video.pause()}catch{}finish('ended');return}raf=requestAnimationFrame(tick)};
    session.cancel=cancel;video.addEventListener('ended',ended,{once:true});video.addEventListener('error',failed,{once:true});
    try{if(Number.isFinite(startAt)&&startAt>0&&Number.isFinite(video.duration)&&video.duration>startAt+.08)video.currentTime=startAt}catch{}
    video.play().then(()=>{raf=requestAnimationFrame(tick)}).catch(err=>{cleanup();reject(err)});
  });
}
async function previewSceneSequence(sceneIndex,button=null){
  const p=current(),ep=episodeOf(p),scene=ep?.scenes?.[sceneIndex];if(!p||!ep||!scene)return;
  const readiness=scenePreviewReadiness(p,scene);if(!readiness.allReady){toast(`Finish all ${readiness.planned} planned shots before playing this scene.`);return}
  const plan=sceneCoveragePlan(scene,'balanced');if(!plan.length)return;
  const editPlan=sceneEditPlan(p,scene),editByShot=new Map(editPlan.map(x=>[String(x.shotId),x]));
  stopActiveScenePreview();
  const session={id:`${p.id}:${ep.id||ep.number}:${sceneIndex}:${Date.now()}`,video:null,cancel:null};activeScenePreviewSession=session;
  const old=button?.textContent;if(button){button.disabled=true;button.textContent='Opening scene…'}
  $('#modalBody').innerHTML=`<div class="scene-sequence-player"><div class="scene-sequence-head"><span class="kicker">SCENE PREVIEW · ${plan.length} SHOTS</span><h2>${esc(scene.title||`Scene ${sceneIndex+1}`)}</h2><p>Automatic scene edit preview. CineTale trims short dead starts/tails, keeps dialogue-safe cinematic cuts, suppresses unapproved visual-shot audio, and uses only validated synchronized character dialogue. No assets are regenerated and final assembly is not started.</p></div><video id="sceneSequenceVideo" controls playsinline preload="auto"></video><div class="scene-sequence-now" id="sceneSequenceNow">Preparing Shot 1…</div><div class="scene-sequence-steps">${plan.map((shot,i)=>`<span data-scene-preview-step="${i}"><b>${shot.order}</b><small>${esc(sceneShotType(shot))}</small></span>`).join('')}</div><div class="modal-actions"><button class="ghost" id="sceneSequenceClose" type="button">Close</button></div></div>`;
  $('#modal').classList.remove('hidden');const video=$('#sceneSequenceVideo');session.video=video;
  const close=()=>{stopActiveScenePreview();closeModal()};$('#sceneSequenceClose').onclick=close;
  try{
    for(let i=0;i<plan.length;i++){
      if(activeScenePreviewSession!==session||$('#modal').classList.contains('hidden'))break;
      const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||ep,liveScene=liveEpisode?.scenes?.[sceneIndex]||scene,shot=sceneCoveragePlan(liveScene,'balanced').find(x=>String(x.id)===String(plan[i].id))||plan[i];
      const status=shotTimelineStatus(liveProject,liveScene,shot);if(status.kind!=='ready')throw new Error(`Shot ${shot.order} is no longer ready. Scene preview stopped.`);
      if(shot.speaking){const playback=selectedShotPlayback(liveProject,liveScene,shot);if(!playback.synchronized)throw new Error(`Shot ${shot.order} dialogue is not synchronized to its approved character voice.`)}
      const url=await resolveScenePreviewShotUrl(p.id,ep.id||ep.number,sceneIndex,shot.id);if(!url)throw new Error(`Shot ${shot.order} saved media could not be restored. Scene preview stopped.`);
      $$('[data-scene-preview-step]').forEach(node=>node.classList.toggle('active',Number(node.dataset.scenePreviewStep)===i));
      const edit=editByShot.get(String(shot.id))||sceneEditForShot(liveProject,liveScene,shot),now=$('#sceneSequenceNow');if(now)now.textContent=`Shot ${shot.order} of ${plan.length} · ${sceneShotType(shot)}${shot.speaking&&shot.speaker?` · ${shot.speaker}`:''} · Auto edited`;
      if(i>0&&Number(edit.transitionMs)>0){video.classList.add('scene-edit-switching');await sleep(Number(edit.transitionMs));}
      video.pause();video.src=url;video.defaultMuted=!shot.speaking;video.muted=!shot.speaking;video.volume=shot.speaking?1:0;video.load();
      await waitMediaMetadata(video,{timeout:22000});video.classList.remove('scene-edit-switching');
      const mediaDuration=Number(video.duration)||0,startAt=Math.max(0,Math.min(Number(edit.trimInSec)||0,Math.max(0,mediaDuration-.25))),endAt=Math.max(startAt+.20,mediaDuration-Math.max(0,Number(edit.trimOutSec)||0));
      const outcome=await playScenePreviewElement(video,session,{startAt,endAt});if(outcome==='cancelled')break;
    }
    if(activeScenePreviewSession===session&&!$('#modal').classList.contains('hidden')){const now=$('#sceneSequenceNow');if(now)now.textContent='Scene preview complete · Shots 1–'+plan.length;toast('Scene preview complete.')}
  }catch(e){console.warn('[CineTale scene preview]',e);if(activeScenePreviewSession===session)toast(e?.message||'Scene preview could not continue.')}
  finally{if(activeScenePreviewSession===session){activeScenePreviewSession=null;session.cancel=null}if(button?.isConnected){button.disabled=false;button.textContent=old||'▶ Play scene'}}
}

const coverageShotActionsInFlight=new Set();
function coverageShotActionKey(project={},episode={},sceneIndex=-1,shot={}){return `${project?.id||''}:${episode?.id||episode?.number||''}:${sceneIndex}:${shot?.id||shot?.order||''}`}
function selectedShotButtonState(project={},scene={}){
  const shot=selectedStudioShot(scene);if(!shot)return {label:'Generate video clip',disabled:false};
  const status=shotTimelineStatus(project,scene,shot);
  if(status.kind==='ready')return {label:`Shot ${shot.order} ready`,disabled:true};
  if(status.kind==='active')return {label:`Rendering Shot ${shot.order}…`,disabled:true};
  if(status.kind==='syncing')return {label:`Dialogue syncing for Shot ${shot.order}…`,disabled:true};
  if(status.kind==='sync-error')return {label:`Retry Shot ${shot.order} dialogue`,disabled:false};
  if(status.kind==='pending')return {label:`Finish Shot ${shot.order} dialogue`,disabled:false};
  if(status.kind==='recover')return {label:`Restore Shot ${shot.order}`,disabled:false};
  if(status.kind==='attention')return {label:`Recreate Shot ${shot.order}`,disabled:false};
  return {label:`Generate Shot ${shot.order}`,disabled:false};
}
function selectedShotListenState(scene={}){
  const shot=selectedStudioShot(scene);
  if(!shot)return {label:'▶ Listen',disabled:false,title:'Preview this scene’s spoken performance'};
  if(!shot.speaking)return {label:'No dialogue',disabled:true,title:`Shot ${shot.order} is visual-only and has no character dialogue.`};
  return {label:'▶ Listen',disabled:false,title:`Preview Shot ${shot.order} dialogue in the assigned character voice.`};
}
function selectedShotPreviewMarkup(project={},scene={},sceneIndex=-1){
  const shot=selectedStudioShot(scene),art=visualSrc(scene);if(!shot)return art?`<img src="${art}" alt="${esc(scene.title||'Scene')}">`:`<div class="scene-placeholder"><b>${String(scene.number||sceneIndex+1).padStart(2,'0')}</b><span>Storyboard pending</span></div>`;
  const playback=selectedShotPlayback(project,scene,shot),status=shotTimelineStatus(project,scene,shot);
  if(playback.url){
    if(playback.primary)return sceneVideoMarkup(scene,art,`${scene.title||`Scene ${sceneIndex+1}`} · Shot ${shot.order}`,sceneIndex,project);
    const gated=shot.speaking&&!playback.synchronized,title=`${scene.title||`Scene ${sceneIndex+1}`} · Shot ${shot.order}`,poster=art?` poster="${esc(art)}"`:'';
    return `${sceneMediaDecodeShieldMarkup(art,title)}<video class="scene-video-element scene-selected-shot-video" data-shot-video-preview="${sceneIndex}" data-shot-id="${esc(shot.id)}" data-scene-media-loading="1" ${playback.synchronized?'data-shot-sync-ready="1"':''} ${gated?'data-shot-sync-gated="1" muted':''}${poster} src="${esc(playback.url)}" controls playsinline preload="metadata" aria-label="${esc(title)}"></video>`;
  }
  const label=status.kind==='active'?'Rendering…':status.kind==='syncing'?'Dialogue syncing…':status.kind==='sync-error'?'Dialogue sync needs retry':status.kind==='pending'?'Video saved · dialogue sync needed':status.kind==='recover'?'Video finished · saving needs attention':status.kind==='attention'?'Needs recreation':'Not generated';
  const detail=status.kind==='active'?`Creating Shot ${shot.order}`:status.kind==='syncing'?`Shot ${shot.order} video is already saved. CineTale is synchronizing the approved ${shot.speaker||'character'} voice now; no new video is being generated.`:status.kind==='sync-error'?`Shot ${shot.order} video remains safely saved. Only dialogue synchronization needs a manual retry; CineTale will not regenerate this video.`:status.kind==='pending'?`Shot ${shot.order} video is already saved. Finish only the approved ${shot.speaker||'character'} dialogue; CineTale will not regenerate this video.`:status.kind==='recover'?`Shot ${shot.order} finished at the video service. CineTale will retry saving that existing result without submitting another generation job.`:`Select the button below to ${status.kind==='attention'?'recreate':'generate'} Shot ${shot.order}.`;
  return `<div class="scene-placeholder scene-shot-placeholder"><b>Shot ${shot.order}</b><span>${esc(label)}</span><small>${esc(detail)}</small></div>`;
}
function applySceneShotSelection(project=null,episode=null,onlyIndex=null){
  const p=project||current(),ep=episode||episodeOf(p),list=$('#sceneList');if(!p||!ep||!list)return;
  (ep.scenes||[]).forEach((scene,index)=>{if(Number.isInteger(onlyIndex)&&index!==onlyIndex)return;const card=list.querySelector(`[data-scene-card-index="${index}"]`);if(!card)return;const shot=selectedStudioShot(scene),surface=card.querySelector('.scene-visual');if(!shot||!surface)return;
    card.querySelectorAll('.scene-shot-card').forEach(node=>{const selected=String(node.dataset.shotId||'')===String(shot.id);node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',selected?'true':'false')});
    const marker=`${shot.id}|${shotTimelineStatus(p,scene,shot).kind}|${selectedShotPlayback(p,scene,shot).url||''}`;if(surface.dataset.selectedShotMarker!==marker){surface.innerHTML=`${selectedShotPreviewMarkup(p,scene,index)}<div class="asset-tag hidden" data-scene-media-status="${index}"></div>`;surface.dataset.selectedShotMarker=marker;}
    const freshCopy=document.createElement('template');freshCopy.innerHTML=sceneCopyUi(p,scene,index).trim();const copyNode=freshCopy.content.firstElementChild,oldCopy=card.querySelector('.scene-copy');if(copyNode&&oldCopy)oldCopy.replaceWith(copyNode);else if(copyNode&&!oldCopy)card.querySelector('.scene-media-column')?.after(copyNode);bindSceneContextControls(card,index);
    const action=card.querySelector(`[data-scene-video="${index}"]`),state=selectedShotButtonState(p,scene);if(action){const key=coverageShotActionKey(p,ep,index,shot),inFlight=coverageShotActionsInFlight.has(key);action.textContent=inFlight?`Finishing Shot ${shot.order} dialogue…`:state.label;action.disabled=inFlight?true:state.disabled;if(!inFlight&&state.label.startsWith('Finish Shot ')){action.removeAttribute('disabled');delete action.dataset.finishRunning;}action.dataset.selectedShotId=shot.id;}
    const listen=card.querySelector(`[data-scene-listen="${index}"]`),listenState=selectedShotListenState(scene);if(listen){listen.textContent=listenState.label;listen.disabled=listenState.disabled;listen.title=listenState.title;listen.dataset.selectedShotId=shot.id;}
  });
  bindSceneVideoVoicePlayback(p,ep);bindSelectedShotMediaPlayback(p,ep);
}
function bindSelectedShotMediaPlayback(project,episode){
  const list=$('#sceneList');if(!list||!project||!episode)return;
  list.querySelectorAll('video[data-shot-video-preview]').forEach(video=>{
    const surface=video.closest?.('.scene-visual'),shield=()=>surface?.querySelector?.('[data-scene-media-shield="1"]');
    const loading=()=>{video.dataset.sceneMediaLoading='1';surface?.classList.remove('media-loaded','media-error');const guard=shield();if(guard)guard.hidden=false};
    const ready=()=>{fitSceneVideoToSurface(video);video.dataset.sceneMediaLoading='0';surface?.classList.add('media-loaded');surface?.classList.remove('media-error');const guard=shield();if(guard)guard.hidden=true};
    if(video.dataset.selectedShotLifecycleBound!=='1'){
      video.dataset.selectedShotLifecycleBound='1';
      video.addEventListener('loadstart',loading);video.addEventListener('emptied',loading);video.addEventListener('loadedmetadata',()=>fitSceneVideoToSurface(video));video.addEventListener('loadeddata',ready);video.addEventListener('canplay',ready);
      video.addEventListener('error',()=>{loading();surface?.classList.add('media-error')});
    }
    if(video.readyState>=2)ready();else{loading();setTimeout(()=>{if(!video.isConnected||video.readyState>=2||video.dataset.sceneMediaLoading!=='1')return;const guard=shield(),status=guard?.querySelector?.('[data-scene-media-restore-status]');if(!status)return;guard.dataset.restoreMode='error';const heading=status.querySelector('b'),detail=status.querySelector('small');if(heading)heading.textContent='Saved preview needs attention';if(detail)detail.textContent='This preserved clip has not opened yet. Select the shot again or retry recovery later. No new video was generated.';},12000)}
    const index=Number(video.dataset.shotVideoPreview),scene=episode?.scenes?.[index],shotId=String(video.dataset.shotId||''),shot=sceneCoveragePlan(scene||{},'balanced').find(x=>String(x.id)===shotId),playback=shot?selectedShotPlayback(project,scene,shot):null;
    if(!shot||!playback)return;
    if(!shot.speaking||playback.synchronized){video.removeAttribute('muted');video.defaultMuted=false;video.muted=false;video.volume=1;video.dataset.voiceSync=shot.speaking?'provider':'embedded';delete video.dataset.shotSyncGated;}
    else{video.defaultMuted=true;video.muted=true;video.volume=1;video.dataset.voiceSync='visual-only';video.dataset.shotSyncGated='1';}
  });
}
function selectSceneShot(sceneIndex,shotId){
  const p=current(),ep=episodeOf(p),scene=ep?.scenes?.[sceneIndex],plan=sceneCoveragePlan(scene||{},'balanced');if(!p||!scene||!plan.some(shot=>String(shot.id)===String(shotId)))return;
  updateProjectById(p.id,x=>{const target=findEpisodeById(x,ep.id||ep.number)?.scenes?.[sceneIndex];if(target)target.studioSelectedShotId=String(shotId)},{render:false});
  const live=state.projects.find(x=>x.id===p.id)||p,liveEp=findEpisodeById(live,ep.id||ep.number)||ep;applySceneShotSelection(live,liveEp,sceneIndex);
}
function refreshSceneShotProductionState(projectId,episodeId,sceneIndex){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex],list=$('#sceneList');
  if(!p||!ep||!scene||!list||current()?.id!==projectId)return;
  const card=list.querySelector(`[data-scene-card-index="${sceneIndex}"]`);if(!card)return;
  const makeNode=html=>{const t=document.createElement('template');t.innerHTML=String(html||'').trim();return t.content.firstElementChild};
  const freshCoverage=makeNode(coverageUi(scene)),oldCoverage=card.querySelector('.scene-coverage-note');
  if(freshCoverage){if(oldCoverage)oldCoverage.replaceWith(freshCoverage);else card.querySelector('.scene-media-support')?.append(freshCoverage)}
  const freshTimeline=makeNode(sceneShotTimelineUi(p,scene)),oldTimeline=card.querySelector('.scene-shot-timeline');
  if(freshTimeline){if(oldTimeline)oldTimeline.replaceWith(freshTimeline);else card.querySelector('.scene-actions')?.before(freshTimeline)}else oldTimeline?.remove();
  card.querySelectorAll('.scene-shot-card[data-shot-id]').forEach(node=>node.onclick=()=>selectSceneShot(sceneIndex,node.dataset.shotId));
  card.querySelectorAll('[data-scene-preview]').forEach(node=>node.onclick=()=>previewSceneSequence(sceneIndex,node));
  card.querySelectorAll('[data-scene-logic-repair]').forEach(node=>node.onclick=e=>{e?.stopPropagation?.();repairSceneProductionLogic(sceneIndex)});
  applySceneShotSelection(p,ep,sceneIndex);
}
function migrateProjectShotTimelines(project={}){
  let changed=false;
  for(const ep of project.episodes||[]){
    for(const scene of ep.scenes||[]){
      const before=JSON.stringify(scene.coveragePlan||[]),plan=ensureSceneCoverage(scene,'balanced');
      if(before!==JSON.stringify(plan))changed=true;
      const logicAudit=coverageLogicAudit(scene,plan),logicStatus=logicAudit.ok?'verified':'needs-attention';
      if(scene.productionLogicStatus!==logicStatus||scene.productionLogicRevision!=='v1.11.0-persisted-identity-reconciliation'){scene.productionLogicStatus=logicStatus;scene.productionLogicRevision='v1.11.0-persisted-identity-reconciliation';scene.productionLogicIssues=logicAudit.issues.slice(0,12);changed=true;}
      if(scene.shotTimelineVersion!=='1.11.0'){scene.shotTimelineVersion='1.11.0';changed=true}
      const currentId=String(scene.videoPrimaryShotId||'').trim();
      if(scene.videoUrl&&(!currentId||!plan.some(x=>String(x.id)===currentId))){
        const speaker=normalizeSpeakerAlias(scene.videoPrimarySpeaker||''),line=String(scene.videoPrimarySpokenLine||'').trim();
        const exact=plan.find(x=>x.speaking&&normalizeSpeakerAlias(x.speaker||'')===speaker&&String(x.spokenLine||'').trim()===line);
        if(exact){scene.videoPrimaryShotId=exact.id;scene.videoPrimarySpeaking=true;scene.videoPrimarySpeaker=exact.speaker||scene.videoPrimarySpeaker||'';scene.videoPrimarySpokenLine=exact.spokenLine||scene.videoPrimarySpokenLine||'';scene.videoPrimaryStartSec=Number(exact.startSec)||0;scene.videoPrimaryEndSec=Number(exact.endSec)||0;scene.videoPrimaryPlannedDurationSec=Number(exact.durationSec)||0;changed=true}
      }
    }
  }
  return changed;
}
function sceneFinalToggleUi(scene={},index=-1){return `<label class="scene-final-toggle"><input type="checkbox" data-scene-final-include="${index}" ${scene.finalIncluded===false?'':'checked'}><span><b>Include in final</b><small>${scene.finalIncluded===false?'Skipped — no video generation required':'Selected for final production'}</small></span></label>`}
function mediaAspectClass(project={}){return String(project.format||'Episode')==='Short'?'media-portrait':'media-landscape'}

function primaryCoverageShot(scene={},mode='balanced'){
  const plan=ensureSceneCoverage(scene,mode);
  const hasDialogue=dialogueList(scene.dialogue).length>0;
  return (hasDialogue?plan.find(x=>x?.speaking):null)||plan[0]||null;
}
function sourceSpeakingShot(scene={}){
  const id=String(scene.videoPrimaryShotId||'').trim();
  const plan=sceneCoveragePlan(scene,'balanced');
  const byId=id?plan.find(x=>String(x?.id||'')===id):null;
  if(byId?.speaking&&String(byId.spokenLine||'').trim())return byId;
  if(scene.videoPrimarySpeaking&&String(scene.videoPrimarySpokenLine||'').trim())return {id:id||'source-speaking-shot',speaking:true,speaker:String(scene.videoPrimarySpeaker||'').trim(),spokenLine:String(scene.videoPrimarySpokenLine||'').trim(),startSec:Number(scene.videoPrimaryStartSec)||0,endSec:Number(scene.videoPrimaryEndSec)||0,durationSec:Number(scene.videoPrimaryPlannedDurationSec)||0};
  return null;
}
function sceneForVideoShot(scene={},shot=null){
  if(!shot)return {...scene};
  return {
    ...scene,
    coverageShot:shot,
    visual:shot.visual||scene.visual,
    camera:shot.camera||scene.camera,
    dialogue:shot.speaking&&shot.spokenLine?[`${shot.speaker||''}: ${shot.spokenLine}`]:[],
    narration:shot.speaking?'':scene.narration
  };
}
function speakingVideoMeta(shot=null){
  return shot?{
    videoPrimaryShotId:shot.id||null,
    videoPrimarySpeaking:Boolean(shot.speaking),
    videoPrimarySpeaker:shot.speaker||'',
    videoPrimarySpokenLine:shot.spokenLine||'',
    videoPrimaryStartSec:Number(shot.startSec)||0,
    videoPrimaryEndSec:Number(shot.endSec)||0,
    videoPrimaryPlannedDurationSec:Number(shot.durationSec)||0
  }:{videoPrimaryShotId:null,videoPrimarySpeaking:false,videoPrimarySpeaker:'',videoPrimarySpokenLine:'',videoPrimaryStartSec:0,videoPrimaryEndSec:0,videoPrimaryPlannedDurationSec:0};
}

function videoProductionContract(project={},episode={},scene={},shot=null){
  const activeShot=shot||primaryCoverageShot(scene,'balanced')||null;
  const speaker=String(activeShot?.speaker||scene.videoPrimarySpeaker||'').trim();
  const speakerIndex=speaker?characterIndexForSpeaker(project,speaker):-1;
  const speakerCharacter=speakerIndex>=0?(project.characters||[])[speakerIndex]:null;
  const cast=(project.characters||[]).map(c=>({id:String(c?.id||''),name:String(c?.name||''),age:String(c?.age||''),appearance:String(c?.appearance||''),wardrobe:String(c?.wardrobe||''),sacredIdentity:String(c?.sacredIdentity||'')}));
  return JSON.stringify({pipeline:VIDEO_PRODUCTION_PIPELINE_REV,projectId:String(project?.id||''),episodeId:String(episode?.id||episode?.number||''),sceneId:String(scene?.id||scene?.number||''),sceneTitle:String(scene?.title||''),sceneVisual:String(scene?.visual||''),shotId:String(activeShot?.id||scene.videoPrimaryShotId||''),shotOrder:Number(activeShot?.order)||0,shotSpeaking:Boolean(activeShot?.speaking||scene.videoPrimarySpeaking),shotSpeaker:speaker,shotSpeakerCharacterId:String(speakerCharacter?.id||''),shotLine:String(activeShot?.spokenLine||scene.videoPrimarySpokenLine||''),shotVisual:String(activeShot?.visual||''),shotCamera:String(activeShot?.camera||''),storyboardAssetKey:String(scene?.imageAssetKey||''),cast});
}
function sourceVideoProductionShot(scene={}){
  const id=String(scene.videoPrimaryShotId||'').trim();
  const plan=sceneCoveragePlan(scene,'balanced');
  const planned=id?plan.find(x=>String(x?.id||'')===id):null;
  // Once a source video exists, its persisted shot identity is authoritative. Reconstruct the
  // production contract from what was actually rendered instead of re-selecting a potentially
  // different primary shot from a later coverage-plan revision. Current plan metadata may fill
  // non-identity presentation fields only; speaker/line/timing come from the source record.
  if(scene.videoUrl&&(id||scene.videoPrimarySpeaking||String(scene.videoPrimarySpokenLine||'').trim())){
    return {
      ...(planned||{}),
      id:id||String(planned?.id||'source-primary-shot'),
      order:Number(planned?.order)||0,
      speaking:Boolean(scene.videoPrimarySpeaking),
      speaker:String(scene.videoPrimarySpeaker||''),
      spokenLine:String(scene.videoPrimarySpokenLine||''),
      startSec:Number(scene.videoPrimaryStartSec)||0,
      endSec:Number(scene.videoPrimaryEndSec)||0,
      durationSec:Number(scene.videoPrimaryPlannedDurationSec)||0,
      visual:String(planned?.visual||''),
      camera:String(planned?.camera||'')
    };
  }
  return primaryCoverageShot(scene,'balanced');
}
function sceneVideoProductionContract(project={},scene={}){
  const ep=(project.episodes||[]).find(e=>(e.scenes||[]).some(s=>s===scene||String(s?.id||'')===String(scene?.id||'')))||episodeOf(project)||{};
  return videoProductionContract(project,ep,scene,sourceVideoProductionShot(scene));
}
function sceneVideoProductionProvenanceValid(project={},scene={}){
  if(!scene?.videoUrl)return false;
  const saved=String(scene.videoProductionContract||'');
  return Boolean(saved&&saved===sceneVideoProductionContract(project,scene));
}
function modernPrimarySourceMarker(scene={}){
  const marker=`${scene.videoStoragePath||''} ${scene.videoLocalMediaKey||''}`;
  return /(?:^|[-:])source[-:]primary(?:[-:]|$)/i.test(marker);
}
function recoverModernPrimaryVideoProvenance(project={},episode={},scene={}){
  if(!project||!episode||!scene?.videoUrl||!sceneSourceDurablyOwned(scene))return false;
  if(sceneVideoProductionProvenanceValid(project,scene))return false;
  if(String(scene.videoProductionContract||'').trim())return false;
  if(!scene.videoProviderCompletedAt||!modernPrimarySourceMarker(scene))return false;
  const shot=primaryCoverageShot(scene,'balanced');
  if(!shot?.id)return false;
  Object.assign(scene,speakingVideoMeta(shot));
  scene.videoProductionContract=videoProductionContract(project,episode,scene,shot);
  scene.videoSpeechGuide=Boolean(shot.speaking);
  scene.videoRecoveryState=scene.videoRecoveryState==='save_failed'?'save_failed':'ready';
  scene.videoProvenanceRecoveredAt=new Date().toISOString();
  scene.videoProvenanceRecoveryRevision='v1.11.0-primary-provenance-recovery';
  if(scene.lipSyncErrorCode==='legacy_video_identity_unverified'){
    scene.lipSyncStatus='idle';scene.lipSyncError=null;scene.lipSyncErrorCode='';scene.lipSyncValidated=false;scene.lipSyncAutoPending=false;
  }
  return true;
}
function recoverPersistedModernPrimaryVideoProvenance(project={}){
  let changed=false;
  for(const episode of project?.episodes||[])for(const scene of episode?.scenes||[])if(recoverModernPrimaryVideoProvenance(project,episode,scene))changed=true;
  return changed;
}

const confirmedVideoOperations=new Set();
const recoveringVideoOperations=new Set();
const VIDEO_RECOVERY_MAX_AGE_MS=20*60*1000;
function videoOperationConfirmed(scene={}){return Boolean(scene.videoOperation&&confirmedVideoOperations.has(scene.videoOperation))}
function videoOperationRecovering(scene={}){return Boolean(scene.videoOperation&&!videoOperationConfirmed(scene))}
function videoCooldownSeconds(scene={}){return Math.max(0,Math.ceil((Number(scene.videoRetryAt||0)-Date.now())/1000))}
function sceneVideoAction(scene={},project=null){
  if(videoCooldownSeconds(scene)>0)return 'limited';
  if(videoOperationConfirmed(scene)||videoOperationRecovering(scene))return 'busy';
  // Speaking clips finish automatically after source generation. Do not expose a second
  // user-facing "Complete clip" step; while approved-audio finalization is pending the
  // existing source remains a visual-only preview and the action is non-billable/finalizing.
  if(project&&sceneNeedsModernSource(project,scene))return 'modernize';
  if(project&&sceneSourceDurablyOwned(scene)&&sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project,scene)&&sceneVideoProductionProvenanceValid(project,scene))return 'finalizing';
  return scene.videoUrl?'regenerate':'generate';
}
function videoButtonLabel(scene={},project=null){
  if(videoCooldownSeconds(scene)>0)return 'Video temporarily limited';
  if(videoOperationConfirmed(scene))return videoProgressCopy(scene.videoQueuedAt);
  if(videoOperationRecovering(scene))return 'Checking saved render…';
  const action=sceneVideoAction(scene,project);
  if(action==='finalizing')return 'Finalizing dialogue…';
  if(action==='modernize')return 'Update clip';
  if(scene.videoError&&!scene.videoUrl)return 'Try video again';
  return action==='regenerate'?'Regenerate clip':'Generate video clip';
}
function videoButtonDisabled(scene={},productionLocked=false,project=null){return productionLocked||videoCooldownSeconds(scene)>0||Boolean(scene.videoOperation)||sceneVideoAction(scene,project)==='finalizing'}
function sceneVideoMarkup(scene,art,title='Scene video',index=-1,project=null){
  const src=sceneStudioVideoUrl(scene,project);
  const hasValidatedSync=Boolean(project&&sceneHasValidatedLipSync(project,scene));
  // A restored project can know that its synchronized asset is valid before the durable blob/
  // signed URL has finished hydrating into this browser session. Never flash a blank panel or
  // silently substitute the source movie during that window.
  if(!src&&hasValidatedSync){
    // Media hydration is transient. Keep the frame visually clean while the finished asset is
    // restored; progress/error copy belongs in the status row below, never inside the video area.
    if(art)return `<img class="scene-media-poster" src="${esc(art)}" alt="${esc(title)}">`;
    return `<div class="scene-placeholder scene-media-loading-blank" aria-busy="true"></div>`;
  }
  if(!src)return '';
  const poster=art?` poster="${esc(art)}"`:'';
  const sync=index>=0?` data-scene-video-preview="${index}"`:'';
  const isMountedSynced=hasValidatedSync&&normalizedMediaUrl(src)===normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(scene,project));
  const speaking=sceneHasSpokenContent(scene);
  const exact=isMountedSynced?' data-lip-sync-ready="1"':'';
  // Use the browser-native poster instead of a DOM overlay. A custom overlay can cover native
  // controls indefinitely when preload=metadata does not decode a first frame until playback.
  // The native poster keeps the player immediately visible/clickable while the media loads.
  if(speaking&&!isMountedSynced){
    // Keep the media surface clean: if CineTale owns a source video, show the actual video and
    // keep production state outside the frame. The source remains visual-only until the approved
    // synchronized AV is validated, so raw/provider speech can never become authoritative audio.
    return `${sceneMediaDecodeShieldMarkup(art,title)}<video controls playsinline preload="metadata" muted class="scene-video-element scene-source-preview"${poster}${sync} data-sync-gated="1" data-scene-media-loading="1" aria-label="${esc(title)}" src="${esc(src)}"></video>`;
  }
  return `${sceneMediaDecodeShieldMarkup(art,title)}<video controls playsinline preload="metadata" class="scene-video-element"${poster}${sync}${exact} data-scene-media-loading="1" aria-label="${esc(title)}" src="${esc(src)}"></video>`;
}
function fitSceneVideoToSurface(video){
  if(!video)return;
  const surface=video.closest?.('.scene-visual');
  if(!surface)return;
  const w=Number(video.videoWidth)||0,h=Number(video.videoHeight)||0;
  if(w>0&&h>0){
    surface.style.setProperty('--scene-media-ratio',`${w} / ${h}`);
    surface.dataset.mediaFitted='1';
  }
}
function sceneListPlaybackLocked(list){return Boolean(list&&[...list.querySelectorAll('video[data-scene-video-preview]')].some(v=>v.dataset.playerSession==='1'&&!v.ended))}
function sceneMediaStatusText(project,scene,video=null){
  // Keep playable video surfaces visually clean. Technical/sync state belongs below the player
  // or in owner diagnostics, never as a badge floating over the movie frame.
  if(scene?.videoUrl)return '';
  return 'Not generated';
}
function sceneSyncStateUi(project={},scene={}){
  if(!scene?.videoUrl||!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene))return '';
  const signature=sceneLipSyncSignature(project,scene);
  const unsafeRecovered=Boolean(scene.lipSyncRecoveredAt&&!scene.lipSyncRecoveryCompatibility);
  const preparing=scene.lipSyncStatus==='preparing';
  const active=scene.lipSyncStatus==='processing'&&Boolean(scene.lipSyncOperation)&&scene.lipSyncSignature===signature;
  const waiting=['waiting','idle'].includes(scene.lipSyncStatus)&&scene.lipSyncProviderStatus==='WAITING_FOR_SLOT';
  const failed=scene.lipSyncStatus==='error'&&Boolean(scene.lipSyncError);
  const legacyIdentity=sceneHasSpokenContent(scene)&&scene.videoUrl&&!sceneVideoProductionProvenanceValid(project,scene);
  if(!preparing&&!active&&!waiting&&!failed&&!unsafeRecovered&&!legacyIdentity)return '';
  const text=legacyIdentity?'This older clip needs to be recreated once.':unsafeRecovered?'Dialogue sync must be rebuilt':failed?`Dialogue sync needs attention · ${userSafeLipSyncError(scene.lipSyncError||'').message||'Retry restoring the saved synchronized video.'}`:waiting?'Dialogue sync queued':preparing?'Preparing approved dialogue…':'Finishing dialogue…';
  return `<div class="scene-sync-state" role="status"><span class="scene-sync-dot"></span><span>${text}</span></div>`;
}
function updateSceneMediaStatuses(project=null,episode=null){
  const p=project||current(),ep=episode||episodeOf(p),list=$('#sceneList');if(!p||!ep||!list)return;
  (ep.scenes||[]).forEach((scene,index)=>{const tag=list.querySelector(`[data-scene-media-status="${index}"]`),video=list.querySelector(`video[data-scene-video-preview="${index}"]`);if(tag){const text=sceneMediaStatusText(p,scene,video);tag.textContent=text;tag.classList.toggle('hidden',!text)}});
}

function splitBilingualTitle(value=''){
  const raw=String(value||'').trim();
  if(!raw)return {primary:'',secondary:''};
  const parts=raw.split(/\s*[|｜]\s*/).map(x=>x.trim()).filter(Boolean);
  if(parts.length<2)return {primary:raw,secondary:''};
  return {primary:parts[0],secondary:parts.slice(1).join(' · ')};
}
function bilingualTitleHtml(value=''){const t=splitBilingualTitle(value);return `<span class="title-primary">${esc(t.primary||'Untitled')}</span>${t.secondary?`<span class="title-secondary">${esc(t.secondary)}</span>`:''}`}
function meaningfulWorldUncertainty(value=''){const t=String(value||'').trim();if(!t)return '';if(/commercial registry|company registry|business registry|trading firm|fictional company|fictional business|exact business|exact company/i.test(t))return '';return t}
function plannedShotRoute(project={},scene={},shot={},index=0){
  const explicit=String(shot?.productionRoute||'').toLowerCase();
  if(['animated-art','economy-video','standard-video','premium-video'].includes(explicit))return explicit;
  const profile=String(project?.productionProfile||'balanced').toLowerCase(),text=`${scene?.title||''} ${scene?.dramaticPurpose||''} ${shot?.kind||''} ${shot?.purpose||''} ${shot?.visual||''}`.toLowerCase();
  const speaking=Boolean(shot?.speaking||String(shot?.spokenLine||'').trim()),critical=/climax|reveal|resolution|turning point|confront|discovery|unlock|opens|emotional payoff|final/i.test(text),movement=/run|walk|open|close|turn|enter|leave|cross|lift|drop|fall|race|chase|dance|fight|move|approach|unlock|push|pull/i.test(text);
  if(profile==='cinematic')return speaking||critical?'premium-video':(movement||index%2===1?'standard-video':'economy-video');
  if(profile==='economy')return speaking?'economy-video':(critical&&movement?'economy-video':'animated-art');
  const performanceCritical=critical||/close-up|close up|medium shot|reaction|confession|argument|whisper|reveal/i.test(text);
  if(speaking)return performanceCritical?'standard-video':'economy-video';
  if(critical&&movement)return 'economy-video';
  if(movement&&index%3===1)return 'economy-video';
  return 'animated-art';
}
function productionRouteLabel(route=''){return ({'animated-art':'ART MOTION','economy-video':'ECONOMY VIDEO','standard-video':'STANDARD VIDEO','premium-video':'CINEMATIC VIDEO'})[route]||'PLANNED'}
function globalContextSummaryHtml(p={}){
  const g=p.worldBible?.globalContext||{};const explicitBelief=String(p.beliefContext||'').trim();const rows=[['Region / community',g.regionCommunity||p.regionCommunity],['Belief context',explicitBelief||'Not specified'],['Tradition / occasion',g.traditionContext||p.traditionContext],['Time & place',g.eraPlace||p.eraPlace],['Languages',g.languages?.join?.(' · ')||p.language],['Language behavior',g.languageBehavior||p.languageBehavior],['Grounding',g.grounding||p.culturalGrounding]].filter(([,v])=>String(v||'').trim());
  const uncertainty=(Array.isArray(g.uncertaintyNotes)?g.uncertaintyNotes:[]).map(meaningfulWorldUncertainty).filter(Boolean);
  const facts=(Array.isArray(g.groundedFacts)?g.groundedFacts:[]).filter(Boolean);
  return rows.length?`${rows.map(([k,v])=>`<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}${facts.length?`<div class="global-grounded-facts"><small>Grounded context</small><span>${facts.slice(0,4).map(esc).join(' · ')}</span></div>`:''}${uncertainty.length?`<div class="global-uncertainty"><small>Needs care</small><span>${uncertainty.map(esc).join(' · ')}</span></div>`:''}`:'<span class="muted-copy">CineTale will infer only broad context from the story and avoid unsupported specifics.</span>';
}
function productionProfileSummaryHtml(p={}){const profile=String(p.productionProfile||'balanced').toLowerCase();const map={economy:['Economy','Use draft/Lite motion by default and reserve generation for necessary story beats.'],balanced:['Balanced','Mix economical coverage with standard motion for important story beats.'],cinematic:['Cinematic','Favor higher-quality motion on story-critical scenes; highest credit use.']};const [label,copy]=map[profile]||map.balanced;return `<div class="profile-summary"><b>${label}</b><span>${copy}</span><small>Paid video is never created merely by editing the story or world.</small></div>`}

function ensurePersistentWorld(project={}){
  project.worldBible=project.worldBible||{};
  if(!project.worldBible.worldId)project.worldBible.worldId=`world_${String(project.id||uid('world')).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  if(!project.worldBible.worldName)project.worldBible.worldName=`${project.title||'Untitled'} World`;
  if(!project.worldBible.createdAt)project.worldBible.createdAt=new Date().toISOString();
  project.worldBible.updatedAt=new Date().toISOString();
  const legacyCanon=Array.isArray(project.worldBible.canon)?project.worldBible.canon:[];
  project.worldBible.storyCanon=Array.isArray(project.worldBible.storyCanon)?project.worldBible.storyCanon:legacyCanon;
  project.worldBible.canon=[...project.worldBible.storyCanon];
  project.worldBible.globalContext=project.worldBible.globalContext||{};
  // Never preserve an inferred belief/religion as durable identity context. Explicit creator input remains authoritative.
  if(!String(project.beliefContext||'').trim())project.worldBible.globalContext.beliefContext='';
  project.worldBible.globalContext.groundedFacts=Array.isArray(project.worldBible.globalContext.groundedFacts)?project.worldBible.globalContext.groundedFacts:[];
  project.worldBible.globalContext.uncertaintyNotes=(Array.isArray(project.worldBible.globalContext.uncertaintyNotes)?project.worldBible.globalContext.uncertaintyNotes:[]).map(meaningfulWorldUncertainty).filter(Boolean);
  return project.worldBible;
}
function worldBibleSnapshotHtml(project={}){
  const w=ensurePersistentWorld(project),g=w.globalContext||{},chars=(project.characters||[]).filter(Boolean),canon=(w.storyCanon||[]).filter(Boolean),facts=(g.groundedFacts||[]).filter(Boolean);
  const languages=(Array.isArray(g.languages)?g.languages:[]).filter(Boolean);if(!languages.length&&project.language)languages.push(...String(project.language).split(/\s*\+\s*/).filter(Boolean));
  const context=[g.regionCommunity||project.regionCommunity,g.traditionContext||project.traditionContext,g.eraPlace||project.eraPlace].filter(Boolean);
  return `<div class="world-stat-row"><span><b>${chars.length}</b><small>recurring character${chars.length===1?'':'s'}</small></span><span><b>${canon.length}</b><small>story canon</small></span><span><b>${facts.length}</b><small>grounded fact${facts.length===1?'':'s'}</small></span><span><b>${languages.length||1}</b><small>language${languages.length===1?'':'s'}</small></span></div><div class="world-memory-line"><small>${esc(w.worldName)}</small><span>${context.length?esc(context.join(' · ')):'World context grows from approved story facts.'}</span></div>`;
}
function continuityGuardian(project={},episode={}){
  const findings=[];const audit=episodeProductionLogicAudit(project,episode,'balanced');
  for(const issue of audit.issues||[])findings.push({level:'block',text:issue.message||issue.code});
  for(const item of episode?.continuityWarnings||[])findings.push({level:'review',text:typeof item==='string'?item:(item?.message||JSON.stringify(item))});
  const uncertainty=project.worldBible?.globalContext?.uncertaintyNotes||[];for(const item of uncertainty.map?.(meaningfulWorldUncertainty).filter(Boolean)||[])findings.push({level:'care',text:`Cultural/historical detail needs care: ${item}`});
  const seen=new Set();return findings.filter(f=>{const k=`${f.level}|${f.text}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,6);
}
function continuityGuardianHtml(project={},episode={}){
  const findings=continuityGuardian(project,episode);
  if(!findings.length)return `<div class="guardian-clear"><b>Clear to plan</b><span>No structural continuity conflicts are currently detected.</span></div>`;
  const blocks=findings.filter(x=>x.level==='block').length,reviews=findings.length-blocks;
  return `<div class="guardian-counts"><span class="${blocks?'has-block':''}"><b>${blocks}</b> blocking</span><span><b>${reviews}</b> review</span></div>${findings.slice(0,3).map(x=>`<div class="guardian-item ${x.level}"><span></span><p>${esc(x.text)}</p></div>`).join('')}`;
}
function smartProductionPlan(project={},episode={}){
  const totals={shots:0,ready:0,reuse:0,generate:0,dialogue:0,recover:0,rendering:0,videoSeconds:0,dialogueSeconds:0,artMotion:0,economyVideo:0,standardVideo:0,premiumVideo:0};
  for(const scene of episode?.scenes||[]){const inv=sceneShotMediaInventory(project,scene,finalTimelineMode(project));totals.shots+=inv.total;totals.ready+=inv.ready;totals.reuse+=inv.preserved;totals.dialogue+=inv.needsDialogue;totals.rendering+=inv.rendering;totals.recover+=inv.shots.filter(x=>x.recoveryPending).length;for(let i=0;i<inv.shots.length;i++){const x=inv.shots[i],sec=Math.max(0,Number(x.shot?.durationSec||x.shot?.targetClipSec||0)),route=plannedShotRoute(project,scene,x.shot,i);if(x.needsVideo&&!x.operation){if(route==='animated-art')totals.artMotion++;else{totals.generate++;totals.videoSeconds+=sec;if(route==='economy-video')totals.economyVideo++;else if(route==='premium-video')totals.premiumVideo++;else totals.standardVideo++;}}if(x.needsDialogue)totals.dialogueSeconds+=sec}}
  return totals;
}
function smartProductionPlanHtml(project={},episode={}){
  const t=smartProductionPlan(project,episode),profile=String(project.productionProfile||'balanced').toLowerCase();
  const profileLabel=profile==='economy'?'Economy':profile==='cinematic'?'Cinematic':'Balanced';
  if(!t.shots)return `<div class="planner-empty"><b>Plan story shots first</b><span>CineTale will estimate reuse and new generation before any paid production.</span></div>`;
  return `<div class="plan-meter"><div style="width:${Math.min(100,Math.round((t.ready/Math.max(1,t.shots))*100))}%"></div></div><div class="plan-stat-row hybrid"><span><b>${t.ready}</b><small>ready/reuse</small></span><span><b>${t.artMotion}</b><small>art motion</small></span><span><b>${t.economyVideo+t.standardVideo+t.premiumVideo}</b><small>video routed</small></span><span><b>${t.dialogue}</b><small>dialogue finish</small></span><span><b>${t.recover}</b><small>recover first</small></span></div><div class="plan-route-breakdown"><span>Economy video <b>${t.economyVideo}</b></span><span>Standard video <b>${t.standardVideo}</b></span><span>Cinematic video <b>${t.premiumVideo}</b></span></div><div class="plan-estimate"><b>${profileLabel} hybrid plan</b><span>${Math.round(t.videoSeconds)} sec planned paid video · ${t.artMotion} shot${t.artMotion===1?'':'s'} planned as art motion · ${Math.round(t.dialogueSeconds)} sec dialogue finishing</span><small>Planning does not spend credits. Existing durable media is reused first. Art-motion routes are recommendations until the creator explicitly starts production.</small></div>`;
}

function actualProductionEstimate(project={},episode={},mode='balanced'){
  const totals={scenes:0,shots:0,missingVideo:0,missingVideoSeconds:0,dialogueFinish:0,recoverFirst:0,ready:0};
  for(const scene of selectedFinalScenes(episode).map(x=>x.scene)){
    totals.scenes++;const inv=sceneShotMediaInventory(project,scene,coverageModeFromAuto(mode));totals.shots+=inv.total;totals.ready+=inv.ready;totals.missingVideo+=inv.needsVideo;totals.dialogueFinish+=inv.needsDialogue;totals.recoverFirst+=inv.shots.filter(x=>x.recoveryPending).length;
    for(const x of inv.shots)if(x.needsVideo&&!x.operation)totals.missingVideoSeconds+=Math.max(0,Number(x.shot?.durationSec||x.shot?.targetClipSec||0));
  }
  return totals;
}
function compactWorldStatusHtml(project={},episode={}){
  const w=ensurePersistentWorld(project),g=w.globalContext||{},findings=continuityGuardian(project,episode),blocking=findings.filter(x=>x.level==='block').length,chars=(project.characters||[]).length,languages=(Array.isArray(g.languages)?g.languages:[]).filter(Boolean);if(!languages.length&&project.language)languages.push(...String(project.language).split(/\s*\+\s*/).filter(Boolean));
  const continuity=blocking?'Needs review':findings.length?'Review':'Protected';
  const profile=String(project.productionProfile||'balanced').toLowerCase();
  return `<div class="studio-intelligence-summary"><div><b>${blocking?'Continuity needs review':'Continuity protected'}</b><span>${chars} character${chars===1?'':'s'} · ${languages.length||1} language${(languages.length||1)===1?'':'s'} · ${esc(profile)} production</span></div><div class="studio-intelligence-actions"><span>${esc(continuity)}</span><button class="ghost tiny" id="viewWorldDetails" type="button">World</button><button class="ghost tiny" id="viewProductionDetails" type="button">Estimate</button></div></div>`;
}
function openWorldDetails(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;$('#modalBody').innerHTML=`<div class="modal-form compact-detail-modal"><h2>World & continuity</h2><p>CineTale keeps these details in the background so later scenes and episodes stay consistent.</p><div class="detail-modal-grid"><section><h3>World memory</h3>${worldBibleSnapshotHtml(p)}</section><section><h3>Continuity</h3>${continuityGuardianHtml(p,ep)}</section></div><div class="modal-actions"><button class="primary" id="worldDetailsClose" type="button">Done</button></div></div>`;$('#modal').classList.remove('hidden');$('#worldDetailsClose').onclick=closeModal}
function openProductionDetails(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const actual=actualProductionEstimate(p,ep,'balanced');$('#modalBody').innerHTML=`<div class="modal-form compact-detail-modal"><h2>Production details</h2><p>CineTale reuses finished media first and shows the paid work that is still genuinely missing.</p><div class="production-confirm-summary"><b>${actual.scenes} selected scene${actual.scenes===1?'':'s'} · ${actual.shots} planned shots</b><span>${actual.missingVideo} currently need generated video · about ${Math.round(actual.missingVideoSeconds)} sec of new video</span><span>${actual.dialogueFinish} existing speaking shot${actual.dialogueFinish===1?'':'s'} need dialogue finishing · ${actual.recoverFirst} recovery-first item${actual.recoverFirst===1?'':'s'}</span></div><details class="production-advisory"><summary>Cost-saving route suggestions</summary>${smartProductionPlanHtml(p,ep)}<small>These are planning recommendations. CineTale will not claim savings until a cheaper route is actually used in the final production.</small></details><div class="modal-actions"><button class="primary" id="productionDetailsClose" type="button">Done</button></div></div>`;$('#modal').classList.remove('hidden');$('#productionDetailsClose').onclick=closeModal}
function renderCompactWorldStatus(project={},episode={}){const host=$('#compactWorldStatus');if(host)host.innerHTML=compactWorldStatusHtml(project,episode);$('#viewWorldDetails')?.addEventListener('click',openWorldDetails);$('#viewProductionDetails')?.addEventListener('click',openProductionDetails)}
function renderWorldCommandCenter(project={},episode={}){
  ensurePersistentWorld(project);renderCompactWorldStatus(project,episode);const a=$('#worldBibleSnapshot'),b=$('#continuityGuardianSummary'),c=$('#smartProductionPlan');if(a)a.innerHTML=worldBibleSnapshotHtml(project);if(b)b.innerHTML=continuityGuardianHtml(project,episode);if(c)c.innerHTML=smartProductionPlanHtml(project,episode);const status=$('#worldMemoryStatus');if(status){const findings=continuityGuardian(project,episode);status.textContent=findings.some(x=>x.level==='block')?'Continuity review needed':'World memory active';status.classList.toggle('needs-review',findings.length>0)}}

function renderStudio(){const p=current();
  // Do not remount every scene/video element while a final file is being captured.
  // Firefox visibly blanks/reloads media elements when Studio is rebuilt mid-render.
  if(p&&state.finalRenderRunning&&state.finalRenderProjectId===p.id&&$('#sceneList')?.childElementCount){
    const ep=episodeOf(p);renderFinalAssembly(p,ep);renderWorkflow(p);return;
  }
  if(!p){$('#studioEmpty').classList.remove('hidden');$('#studioContent').classList.add('hidden');return}$('#studioEmpty').classList.add('hidden');$('#studioContent').classList.remove('hidden');bindWorkflowNavigation();p.format=normalizedFormat(p.requestedFormat||p.format,'Episode');const ep=episodeOf(p),scenes=ep?.scenes||[],stats=assetStats(p),cfg=formatConfig(p.format),episodic=p.format==='Episode';if(ep&&!scenes.length)queueMicrotask(()=>recoverEmptyEpisodeProduction(p.id,ep.id||ep.number));const productionLocked=!storyIsApproved(p,ep),targetSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration),narrativeSec=narrativeEstimateSeconds(ep);$('#studioTitle').innerHTML=bilingualTitleHtml(p.title||'Untitled');$('#studioCrumbTitle').textContent=splitBilingualTitle(p.title||'Current project').primary||p.title||'Current project';$('#studioLogline').textContent=p.logline||'';if($('#studioFormatChip'))$('#studioFormatChip').textContent=cfg.title;if($('#studioAudienceChip'))$('#studioAudienceChip').textContent=p.audience||'Audience open';if($('#studioStyleChip'))$('#studioStyleChip').textContent=styleLabel(p.visualStylePreset||'cinematic-realistic');if($('#studioLanguageChip'))$('#studioLanguageChip').textContent=p.language||'Language open';$('#unitLabel').textContent=cfg.unitLabel;$('#episodeNumber').textContent=episodic?String(ep?.number||1).padStart(2,'0'):'';$('#episodeNumber').classList.toggle('hidden',!episodic);$('#episodeTitle').innerHTML=bilingualTitleHtml(ep?.title||cfg.title);$('#episodeSynopsis').textContent=ep?.synopsis||'';$('#episodeRuntime').textContent=targetSec?`~${formatTime(targetSec)}`:(narrativeSec?`~${formatTime(narrativeSec)}`:'~00:00');$('#episodeRuntime').title=targetSec?`Creator-selected target: ${p.duration||formatTime(targetSec)}. Current narrative estimate: ${formatTime(narrativeSec)} at a natural reading pace.`:'Estimated from the complete story text at a natural reading pace.';$('#runtimeLabel').textContent=targetSec?`target ${cfg.finalName} runtime`:`estimated ${cfg.finalName} runtime`;$('#assetCount').textContent=`${stats.total} asset${stats.total===1?'':'s'}`;const episodesBtn=$('#studioEpisodesBtn'),nextBtn=$('#continueEpisode'),unitsBlock=$('#studioUnitsBlock');if(episodesBtn)episodesBtn.classList.toggle('hidden',!episodic);if(nextBtn)nextBtn.classList.toggle('hidden',!episodic);if(unitsBlock)unitsBlock.classList.toggle('hidden',!episodic);if($('#studioMemoryTitle'))$('#studioMemoryTitle').textContent=cfg.memoryTitle;if($('#sceneProductionTitle'))$('#sceneProductionTitle').textContent=cfg.sceneTitle;
  queueMicrotask(()=>queueSceneMediaHydration(p,ep));
  ensureEpisodeIds(p);$('#studioEpisodes').innerHTML=episodic?(p.episodes||[]).map(e=>`<div class="studio-episode-row"><button class="episode-chip ${e.id===ep?.id?'active':''}" data-studio-episode-id="${esc(e.id)}">${String(e.number).padStart(2,'0')} · ${esc(e.title)}</button>${(p.episodes||[]).length>1?`<button class="episode-mini-delete" data-studio-delete-id="${esc(e.id)}" aria-label="Delete ${esc(e.title)}">×</button>`:''}</div>`).join(''):'';$$('[data-studio-episode-id]').forEach(b=>b.onclick=()=>updateProject(x=>{ensureEpisodeIds(x);x.activeEpisodeId=b.dataset.studioEpisodeId;const e=x.episodes.find(v=>v.id===x.activeEpisodeId);x.activeEpisode=e?.number||x.activeEpisode}));$$('[data-studio-delete-id]').forEach(b=>b.onclick=()=>deleteEpisode(b.dataset.studioDeleteId));
  $('#canonList').innerHTML=(p.worldBible?.storyCanon||p.worldBible?.canon||[]).map(x=>`<div class="canon-chip">${esc(x)}</div>`).join('')||`<div class="canon-chip">${episodic?'Canon will build as the series grows.':'Project continuity notes will appear here.'}</div>`;const gc=$('#globalContextSummary');if(gc)gc.innerHTML=globalContextSummaryHtml(p);const pp=$('#productionProfileSummary');if(pp)pp.innerHTML=productionProfileSummaryHtml(p);
  if($('#studioContent')){$('#studioContent').classList.remove('studio-mode-auto','studio-mode-guided','studio-mode-director');$('#studioContent').classList.add(`studio-mode-${String(p.controlMode||'Guided').toLowerCase()}`)}
  const simpleSummary=$('#studioSimpleSummary');if(simpleSummary)simpleSummary.innerHTML=`<div><b>${(p.characters||[]).length}</b><small>Characters</small></div><div><b>${scenes.length}</b><small>Scenes</small></div><div><b>${targetSec?formatTime(targetSec):formatTime(narrativeSec)}</b><small>Runtime</small></div>`;
  renderWorldCommandCenter(p,ep);
  renderStoryReview(p,ep);
  renderStudioStageGate(p,ep);
  const stageState=studioStageState(p,ep);
  const studioContent=$('#studioContent');if(studioContent){studioContent.classList.toggle('story-pending',productionLocked);studioContent.classList.toggle('story-approved',!productionLocked);studioContent.classList.toggle('production-unlocked',stageState.production)}syncStudioInspectionSurface();
  const sceneList=$('#sceneList');
  if(sceneList&&!sceneList.__cinetaleSceneVideoActionBound){sceneList.addEventListener('click',event=>{const button=event.target?.closest?.('[data-scene-video]');if(!button||!sceneList.contains(button))return;handleSceneVideoActionClick(button,event)});sceneList.__cinetaleSceneVideoActionBound=true}
  const openSceneIndex=Math.max(0,Math.min(scenes.length-1,Number(p.studioOpenSceneIndex)||0)),guidedMode=String(p.controlMode||'Guided')!=='Director';
  const sceneMarkup=scenes.map((s,i)=>{const art=visualSrc(s),plan=sceneCoveragePlan(s,finalTimelineMode(p)),sceneProgress=sceneVideoProgressState(p,s,finalTimelineMode(p));return `<article class="scene-card surface scene-progress-${sceneProgress.state} ${guidedMode?(i===openSceneIndex?'studio-scene-open':'studio-scene-collapsed'):'studio-scene-open show-advanced'}" data-scene-card-index="${i}"><button class="scene-compact-header" data-scene-expand="${i}" type="button"><span><small>SCENE ${String(s.number||i+1).padStart(2,'0')}</small><b>${esc(s.title||`Scene ${i+1}`)}</b><em>${Number(s.durationSec)||0}s · ${plan.length} shots <strong class="scene-progress-chip ${sceneProgress.state}">${esc(sceneProgress.label)}</strong></em></span><i>${i===openSceneIndex||!guidedMode?'−':'+'}</i></button><div class="scene-expanded-body"><div class="scene-media-column"><div class="scene-visual ${mediaAspectClass(p)}">${videoOperationConfirmed(s)?(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder scene-video-rendering"><b>Rendering…</b><span>CineTale is creating the replacement clip.</span></div>`):videoOperationRecovering(s)?(s.videoUrl?sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p):(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder ${p?.autoFinalJob?.status==='recovery-deferred'?'scene-video-recovery-pending':'scene-video-rendering'}"><b>${p?.autoFinalJob?.status==='recovery-deferred'?'Recovery pending':'Checking saved render…'}</b><span>${p?.autoFinalJob?.status==='recovery-deferred'?'The existing job is preserved. Use Review production when you want to check it again.':'CineTale is verifying whether the previous video job is still active.'}</span></div>`)):s.videoUrl?((s.videoMediaExpired||sceneSourceMediaHydrationPending(s))&&!sceneMediaRuntimeUrl(s,'source')&&!sceneMediaRuntimeUrl(s,'sync')?(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder"><b>${String(s.number||i+1).padStart(2,'0')}</b><span>${s.videoMediaExpired?'Video needs regeneration':'Restoring video'}</span></div>`):sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p)):art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder storyboard-placeholder"><span class="storyboard-placeholder-icon" aria-hidden="true">▧</span><b>Scene storyboard</b><span>No visual created yet</span></div>`}<div class="asset-tag ${s.videoUrl?'hidden':''}" data-scene-media-status="${i}">${s.videoMediaExpired?'Regenerate clip once':s.videoUrl?'':videoOperationConfirmed(s)?videoProgressCopy(s.videoQueuedAt):videoOperationRecovering(s)?'Checking saved render':s.videoError?'Video needs retry':art?(s._visualPersisting?'Saving safely…':(s.imageMode==='ai'?'Generated art':'Preview art')):'Not generated'}</div></div><div class="scene-media-support">${sceneSyncStateUi(p,s)}${coverageUi(s)}${sceneFinalToggleUi(s,i)}</div></div>${sceneCopyUi(p,s,i)}<div class="scene-guided-actions"><button class="primary small" data-scene-guided-art="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the story first':esc(visualBlockedMessage())}"`:''}>${hasVisual(s)?'Refresh storyboard':'Create storyboard'}</button><button class="ghost small" data-scene-preview="${i}" ${hasVisual(s)?'':'disabled'} type="button">Preview scene</button></div>${sceneShotTimelineUi(p,s)}<div class="scene-actions"><div class="scene-action-buttons"><button class="primary small" data-scene-art="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the story first':esc(visualBlockedMessage())}"`:''}>${visualGenerationBlocked()?'Visuals paused':hasVisual(s)?'Regenerate art':'Generate art'}</button><button class="ghost" data-scene-listen="${i}" ${(productionLocked||selectedShotListenState(s).disabled)?`disabled title="${productionLocked?'Approve the story first':esc(selectedShotListenState(s).title)}"`:`title="${esc(selectedShotListenState(s).title)}"`}>${selectedShotListenState(s).label}</button><button class="ghost" data-scene-video="${i}" ${videoButtonDisabled(s,productionLocked,p)?`disabled title="${productionLocked?'Approve the story first':'Video generation is temporarily limited. Try again shortly.'}"`:''}>${videoButtonLabel(s,p)}</button></div><div class="scene-production-controls"><label class="scene-quality-control" title="${esc(tierHint(s.tier))}"><span>Video quality</span><select data-scene-tier="${i}"><option value="draft" ${normalizedTier(s.tier)==='draft'?'selected':''}>Draft preview</option><option value="standard" ${normalizedTier(s.tier)==='standard'?'selected':''}>Standard</option><option value="premium" ${normalizedTier(s.tier)==='premium'?'selected':''}>Premium / Cinematic</option></select></label><label class="scene-quality-control" title="Controls camera composition for video generation. Safe framing is recommended for normal scenes."><span>Framing</span><select data-scene-framing="${i}"><option value="safe" ${normalizedFraming(s.framing)==='safe'?'selected':''}>Safe framing</option><option value="auto" ${normalizedFraming(s.framing)==='auto'?'selected':''}>Auto</option><option value="medium" ${normalizedFraming(s.framing)==='medium'?'selected':''}>Medium shot</option><option value="close" ${normalizedFraming(s.framing)==='close'?'selected':''}>Close-up</option><option value="wide" ${normalizedFraming(s.framing)==='wide'?'selected':''}>Wide shot</option></select></label></div></div><button class="ghost scene-advanced-toggle" data-scene-advanced="${i}" type="button">${guidedMode?'Advanced shot controls':'Hide advanced controls'}</button></div></article>`}).join('');
  const sceneContextKey=`${p.id}|${ep?.id||ep?.number||''}`;
  const sceneDomUnchanged=sceneList&&sceneList.__cinetaleContextKey===sceneContextKey&&sceneList.__cinetaleMarkup===sceneMarkup;
  if(sceneList&&!sceneDomUnchanged){
    // Never replace the scene-card DOM during an active player session. Firefox will visibly
    // drop/recreate the media pipeline even when the URL is unchanged. Defer the structural
    // refresh until playback has ended; transient lip-sync state is patched in place instead.
    if(sceneListPlaybackLocked(sceneList)){sceneList.__cinetaleDeferredRender=true;sceneList.__cinetaleDeferredMarkup=sceneMarkup;sceneList.__cinetaleDeferredContextKey=sceneContextKey}
    else{
      // Patch ordinary scene metadata around the mounted player instead of moving the <video>
      // into a newly-created card. Even re-parenting the exact same HTMLVideoElement can make
      // Firefox restart its media pipeline and flash a grey frame. Keep both the player AND its
      // scene-visual parent attached whenever the scene still renders a video.
      const template=document.createElement('template');template.innerHTML=sceneMarkup;
      const oldCards=[...sceneList.children].filter(x=>x.matches?.('[data-scene-card-index]')),freshCards=[...template.content.children].filter(x=>x.matches?.('[data-scene-card-index]'));
      const canPatch=sceneList.__cinetaleContextKey===sceneContextKey&&oldCards.length===freshCards.length&&oldCards.every((card,i)=>String(card.dataset.sceneCardIndex)===String(freshCards[i]?.dataset.sceneCardIndex));
      if(canPatch){
        for(let i=0;i<oldCards.length;i++){
          const oldCard=oldCards[i],freshCard=freshCards[i],oldVisual=oldCard.querySelector('.scene-visual'),freshVisual=freshCard.querySelector('.scene-visual'),oldVideo=oldVisual?.querySelector('video[data-scene-video-preview]'),freshVideo=freshVisual?.querySelector('video[data-scene-video-preview]');
          if(oldVisual&&freshVisual&&oldVideo&&freshVideo){
            const oldSrc=normalizedMediaUrl(oldVideo.currentSrc||oldVideo.getAttribute('src')||''),freshSrc=normalizedMediaUrl(freshVideo.getAttribute('src')||'');
            const oldSyncGated=oldVideo.dataset.syncGated==='1',freshSyncGated=freshVideo.dataset.syncGated==='1';
            const oldNativeControls=oldVideo.hasAttribute('controls'),freshNativeControls=freshVideo.hasAttribute('controls');
            const mediaModeChanged=oldSyncGated!==freshSyncGated||oldNativeControls!==freshNativeControls||Boolean(oldVideo.dataset.lipSyncReady)!==Boolean(freshVideo.dataset.lipSyncReady);
            // A preview -> validated-sync transition changes the semantic identity of the player.
            // Reusing the old DOM node is unsafe because its sync-gate volumechange/click listeners
            // cannot be removed and will keep the new synchronized asset muted or control-less.
            // Replace ONLY this scene's video on that real media-state transition; unrelated scene
            // players stay mounted and therefore do not flicker.
            if(mediaModeChanged){
              stopSceneVideoVoicePlayback(oldVideo,{restoreProviderAudio:false});
              try{oldVideo.pause()}catch{}
              oldVideo.replaceWith(freshVideo);
            }else{
              oldVideo.dataset.pendingSceneSrc=oldSrc===freshSrc?'':freshVideo.getAttribute('src')||'';
              if(freshVideo.getAttribute('poster')!==oldVideo.getAttribute('poster')){
                const nextPoster=freshVideo.getAttribute('poster');if(nextPoster)oldVideo.setAttribute('poster',nextPoster);else oldVideo.removeAttribute('poster');
              }
              oldVideo.setAttribute('aria-label',freshVideo.getAttribute('aria-label')||'Scene video');
            }
            // Preserve runtime media classes. Replacing className used to remove media-loaded,
            // briefly revealing Firefox's grey media surface every time unrelated Studio state changed.
            const keepLoaded=oldVisual.classList.contains('media-loaded'),keepError=oldVisual.classList.contains('media-error');
            oldVisual.className=freshVisual.className;
            if(keepLoaded)oldVisual.classList.add('media-loaded');
            if(keepError)oldVisual.classList.add('media-error');
            const oldTag=oldVisual.querySelector('[data-scene-media-status]'),freshTag=freshVisual.querySelector('[data-scene-media-status]');
            if(oldTag&&freshTag){oldTag.className=freshTag.className;oldTag.textContent=freshTag.textContent}
            // Repair the complete scene-card shell around the preserved player. A prior incremental
            // render could leave one of these siblings absent (for example after an in-flight
            // sync transition). Never keep an empty desktop grid column simply because the old
            // node is missing. Rebuild only the non-player sections from the fresh deterministic
            // markup; the mounted scene-visual/video remains untouched unless media identity
            // actually changed above.
            const oldSupport=oldCard.querySelector('.scene-media-support'),freshSupport=freshCard.querySelector('.scene-media-support');
            if(freshSupport){
              if(oldSupport)oldSupport.replaceWith(freshSupport);
              else oldCard.querySelector('.scene-media-column')?.append(freshSupport);
            }
            const oldCopy=oldCard.querySelector('.scene-copy'),freshCopy=freshCard.querySelector('.scene-copy');
            if(freshCopy){
              if(oldCopy)oldCopy.replaceWith(freshCopy);
              else{const mediaColumn=oldCard.querySelector('.scene-media-column');mediaColumn?.after(freshCopy)}
            }
            const oldTimeline=oldCard.querySelector('.scene-shot-timeline'),freshTimeline=freshCard.querySelector('.scene-shot-timeline');
            if(freshTimeline){
              if(oldTimeline)oldTimeline.replaceWith(freshTimeline);
              else{const actions=oldCard.querySelector('.scene-actions');if(actions)actions.before(freshTimeline);else oldCard.append(freshTimeline)}
            }else oldTimeline?.remove();
            const oldActions=oldCard.querySelector('.scene-actions'),freshActions=freshCard.querySelector('.scene-actions');
            if(freshActions){
              if(oldActions)oldActions.replaceWith(freshActions);
              else oldCard.append(freshActions);
            }
          }else{
            // A real media-state transition (no video -> video, or video -> rendering/art) may
            // replace only that one scene card. Unrelated scene players stay mounted.
            oldCard.replaceWith(freshCard);
          }
        }
      }else sceneList.replaceChildren(...template.content.childNodes);
      sceneList.__cinetaleContextKey=sceneContextKey;sceneList.__cinetaleMarkup=sceneMarkup;sceneList.__cinetaleDeferredRender=false;
    }
  }
  $$('[data-scene-expand]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.sceneExpand),list=$('#sceneList');if(!list)return;for(const card of list.querySelectorAll('[data-scene-card-index]')){const open=Number(card.dataset.sceneCardIndex)===index;card.classList.toggle('studio-scene-open',open);card.classList.toggle('studio-scene-collapsed',!open);const icon=card.querySelector('.scene-compact-header i');if(icon)icon.textContent=open?'−':'+'}updateProjectById(p.id,x=>{x.studioOpenSceneIndex=index},{render:false})});
  $$('[data-scene-advanced]').forEach(b=>b.onclick=()=>{const card=b.closest('[data-scene-card-index]');if(!card)return;const show=!card.classList.contains('show-advanced');card.classList.toggle('show-advanced',show);b.textContent=show?'Hide advanced controls':'Advanced shot controls'});
  $$('[data-scene-guided-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneGuidedArt),b));$$('[data-scene-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneArt),b));$$('[data-scene-listen]').forEach(b=>b.onclick=()=>listenScene(Number(b.dataset.sceneListen),b));$$('[data-scene-video]').forEach(b=>b.onclick=e=>{e?.stopPropagation?.();handleSceneVideoActionClick(b,e)});$$('[data-scene-edit]').forEach(b=>b.onclick=()=>openSceneAudioEditor(Number(b.dataset.sceneEdit),b.dataset.selectedShotId||''));$$('[data-scene-voice]').forEach(b=>b.onclick=()=>{const p=current(),s=episodeOf(p)?.scenes?.[Number(b.dataset.sceneVoice)],idx=selectedShotVoiceCharacterIndex(p,s);if(idx>=0)openVoicePicker(idx);else openNarratorVoicePicker()});$$('[data-scene-tier]').forEach(sel=>sel.onchange=()=>setSceneTier(Number(sel.dataset.sceneTier),sel.value));$$('[data-scene-framing]').forEach(sel=>sel.onchange=()=>setSceneFraming(Number(sel.dataset.sceneFraming),sel.value));$$('[data-scene-final-include]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.sceneFinalInclude),cb.checked));$$('.scene-shot-card[data-shot-id]').forEach(card=>card.onclick=()=>{const host=card.closest('[data-scene-card-index]');if(host)selectSceneShot(Number(host.dataset.sceneCardIndex),card.dataset.shotId)});$$('[data-scene-preview]').forEach(button=>button.onclick=()=>{const host=button.closest('[data-scene-card-index]');if(host)previewSceneSequence(Number(host.dataset.sceneCardIndex),button)});$$('[data-scene-logic-repair]').forEach(button=>button.onclick=e=>{e?.stopPropagation?.();const host=button.closest('[data-scene-card-index]');if(host)repairSceneProductionLogic(Number(host.dataset.sceneCardIndex))});applySceneShotSelection(p,ep);bindSceneVideoVoicePlayback(p,ep);authorizeUnsyncedSpeakingScenesOnStudioOpen(p,ep);updateSceneMediaStatuses(p,ep);renderFinalAssembly(p,ep);renderWorkflow(p);if(state.studioInspectionStage==='final')assertStudioInspectionSurfaceVisible();if(productionRecoveryAutoPollingAllowed(p)){resumePendingVideoPolls();resumePendingCoverageVideoPolls()}maybeResumeAutoFinal(p);scheduleStudioLipSyncWarmup(p,ep);scheduleStudioCoverageSyncWarmup(p,ep)
}

async function requestSelectedCoverageShot(sceneIndex,shot,button){
  const p=current(),ep=episodeOf(p),scene=ep?.scenes?.[sceneIndex];if(!p||!ep||!scene||!shot)return;
  const episodeId=ep.id||ep.number,key=coverageShotActionKey(p,ep,sceneIndex,shot);if(coverageShotActionsInFlight.has(key))return;coverageShotActionsInFlight.add(key);
  const status=shotTimelineStatus(p,scene,shot),old=button?.textContent||'';
  const reflect=msg=>{if(button?.isConnected&&msg)button.textContent=msg;refreshSceneShotProductionState(p.id,episodeId,sceneIndex)};
  if(status.kind==='ready')return;
  if(status.kind==='syncing'){refreshSceneShotProductionState(p.id,episodeId,sceneIndex);toast(`Shot ${shot.order} dialogue is already synchronizing. No new video or dialogue job was submitted.`);return;}
  if(button){button.disabled=true;button.textContent=(status.kind==='pending'||status.kind==='sync-error')?`Finishing Shot ${shot.order} dialogue…`:`Generating Shot ${shot.order}…`;}
  refreshSceneShotProductionState(p.id,episodeId,sceneIndex);
  try{
    assertSceneProductionLogic(p,scene,'balanced');
    if((status.kind==='pending'||status.kind==='sync-error')&&shot.speaking){await ensureCoverageShotLipSync(p.id,episodeId,sceneIndex,shot,{onProgress:reflect});}
    else{
      await ensureAutoCoverageShot(p.id,episodeId,sceneIndex,Math.max(0,shot.order-1),normalizedTier(scene.tier),'balanced',reflect);
      // A speaking shot now has a durable saved source video. Reconcile the card immediately so
      // users see VIDEO SAVED · SYNC NEEDED instead of a stale PLANNED state while lip-sync runs.
      reflect();
      const live=state.projects.find(x=>x.id===p.id),liveEp=findEpisodeById(live,episodeId),liveScene=liveEp?.scenes?.[sceneIndex],liveShot=sceneCoveragePlan(liveScene||{},'balanced').find(x=>String(x.id)===String(shot.id));
      if(liveShot?.speaking){
        updateProjectById(p.id,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===liveShot.id);if(it)it.syncAutoPending=true},{render:false});
        refreshSceneShotProductionState(p.id,episodeId,sceneIndex);
        await ensureCoverageShotLipSync(p.id,episodeId,sceneIndex,liveShot,{onProgress:reflect});
        updateProjectById(p.id,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===liveShot.id);if(it)it.syncAutoPending=false},{render:false});
      }
    }
    refreshSceneShotProductionState(p.id,episodeId,sceneIndex);toast(`Shot ${shot.order} is ready.`);
  }catch(e){
    // Never collapse a saved speaking source back to PLANNED just because dialogue sync failed.
    // The source remains durable and the next click resumes/finishes only synchronization.
    refreshSceneShotProductionState(p.id,episodeId,sceneIndex);
    const live=state.projects.find(x=>x.id===p.id)||p,liveEp=findEpisodeById(live,episodeId)||ep,liveScene=liveEp?.scenes?.[sceneIndex],liveShot=sceneCoveragePlan(liveScene||{},'balanced').find(x=>String(x.id)===String(shot.id)),liveStatus=liveShot?shotTimelineStatus(live,liveScene,liveShot):null;
    if(liveStatus?.kind==='pending'||liveStatus?.kind==='sync-error')toast(`Shot ${shot.order} video is saved. Only dialogue synchronization needs attention; use ${liveStatus?.kind==='sync-error'?'Retry':'Finish'} Shot ${shot.order} dialogue when ready.`);
    else toast(e?.message||`Shot ${shot.order} could not finish.`)
  }finally{coverageShotActionsInFlight.delete(key);const live=state.projects.find(x=>x.id===p.id)||p,liveEp=findEpisodeById(live,episodeId)||ep,liveScene=liveEp?.scenes?.[sceneIndex],stateNow=selectedShotButtonState(live,liveScene||scene);refreshSceneShotProductionState(p.id,episodeId,sceneIndex);if(button?.isConnected){delete button.dataset.finishRunning;button.disabled=stateNow.disabled;button.textContent=stateNow.label||old}}
}
async function handleSceneVideoActionClick(button,event){
  event?.preventDefault?.();event?.stopPropagation?.();if(!button)return;
  const i=Number(button.dataset.sceneVideo),p=current(),ep=episodeOf(p),scene=ep?.scenes?.[i],shot=scene?selectedStudioShot(scene):null;if(!p||!ep||!scene||!shot)return;
  const action=sceneVideoAction(scene,p),status=shotTimelineStatus(p,scene,shot);
  syncDiag('scene-video-action-click',p,scene,{sceneIndex:i,shotId:String(shot.id||''),shotOrder:Number(shot.order)||0,status:status.kind,action,label:String(button.textContent||''),userInitiated:true,allowSubmit:false});
  if(action==='finalizing'){if(shotIsPrimary(scene,shot)){scheduleSceneLipSyncAfterSourceReady(p.id,ep.id||ep.number,i,{announce:false});return;}}
  if(status.kind==='ready'||status.kind==='active')return;
  if(shotIsPrimary(scene,shot))return await requestVideo(i,button);
  return await requestSelectedCoverageShot(i,shot,button);
}

function renderLibrary(){
  const grid=$('#libraryGrid');if(!grid)return;
  const tab=state.libraryTab||'stories';
  $$('#libraryTabs [data-library-tab]').forEach(b=>b.classList.toggle('active',b.dataset.libraryTab===tab));
  const titles={stories:['My Stories','Saved ideas and full stories that do not need to become projects yet.'],characters:['Characters','Reusable cast identities and generated character artwork.'],media:['Media','Generated storyboards, video clips and prepared final assemblies.'],voices:['Voices','Creator-approved and assigned voices currently used across your projects.']};
  const [title,copy]=titles[tab]||titles.stories;if($('#librarySectionTitle'))$('#librarySectionTitle').textContent=title;if($('#librarySectionCopy'))$('#librarySectionCopy').textContent=copy;if($('#libraryNewStory'))$('#libraryNewStory').classList.toggle('hidden',tab!=='stories');
  if(tab==='stories'){
    const drafts=state.savedStories||[];
    if(!drafts.length){grid.innerHTML=`<div class="empty-state surface library-empty"><div class="empty-orb">✎</div><h2>No saved stories yet</h2><p>Save an idea or full story before generating anything. It stays here until you are ready to turn it into an Episode, Short, Story or Movie.</p><button class="primary" data-library-create-story>Save your first story</button></div>`;grid.querySelector('[data-library-create-story]')?.addEventListener('click',()=>setView('create'));return}
    grid.innerHTML=drafts.map(d=>`<article class="story-library-card surface"><div class="story-type"><span>${esc(d.format||'Story')}</span><span>${esc(d.language||'Language open')}</span><span>${esc(d.audience||'Audience open')}</span></div><h3>${esc(d.title||'Untitled story')}</h3><p>${esc(d.idea||'')}</p><div class="story-type"><span>${esc(d.genre||'Open genre')}</span><span>Saved ${new Date(d.updatedAt||d.createdAt||Date.now()).toLocaleDateString()}</span></div><div class="story-library-actions"><button class="primary small" type="button" data-use-story="${esc(d.id)}">Use in Create</button><button class="ghost" type="button" data-duplicate-story="${esc(d.id)}">Duplicate</button><button class="ghost danger" type="button" data-delete-story="${esc(d.id)}">Delete</button></div></article>`).join('');
    $$('[data-use-story]').forEach(b=>b.onclick=()=>loadSavedStory(b.dataset.useStory));$$('[data-duplicate-story]').forEach(b=>b.onclick=()=>duplicateSavedStory(b.dataset.duplicateStory));$$('[data-delete-story]').forEach(b=>b.onclick=()=>deleteSavedStory(b.dataset.deleteStory));return;
  }
  if(tab==='characters'){
    const chars=[];for(const p of state.projects)for(const c of p.characters||[])chars.push({kind:'Character',name:c.name,image:visualSrc(c),project:p.title,role:c.role,voice:c.voiceName});
    if(!chars.length){grid.innerHTML=`<div class="empty-state surface library-empty"><div class="empty-orb">◎</div><h2>No characters yet</h2><p>Characters from your productions will appear here for quick reference.</p></div>`;return}
    grid.innerHTML=chars.map((a,i)=>`<button class="asset-card surface" data-lib-character="${i}"><div class="asset-thumb">${a.image?`<img src="${a.image}" alt="${esc(a.name)}">`:`<div class="initials">${esc((a.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</div>`}</div><div class="asset-info"><small>Character · ${esc(a.project||'Project')}</small><b>${esc(a.name)}</b><span>${esc(a.role||'Character')}${a.voice?` · ${esc(a.voice)}`:''}</span></div></button>`).join('');return;
  }
  if(tab==='voices'){
    const voices=[];for(const p of state.projects){if(p.narratorVoiceName)voices.push({name:p.narratorVoiceName,kind:'Narrator',project:p.title,locked:p.narratorVoiceLocked});for(const c of p.characters||[])if(c.voiceName)voices.push({name:c.voiceName,kind:c.name,project:p.title,locked:c.voiceLocked})}
    const unique=[...new Map(voices.map(v=>[`${v.project}|${v.kind}|${v.name}`,v])).values()];if(!unique.length){grid.innerHTML=`<div class="empty-state surface library-empty"><div class="empty-orb">🎙</div><h2>No saved voices yet</h2><p>Assigned and locked character or narrator voices will appear here.</p></div>`;return}
    grid.innerHTML=unique.map(v=>`<article class="story-library-card surface"><div class="story-type"><span>${v.locked?'Locked':'Auto / assigned'}</span><span>${esc(v.project)}</span></div><h3>${esc(v.name)}</h3><p>${esc(v.kind)} voice</p></article>`).join('');return;
  }
  const all=[];for(const p of state.projects){for(const e of p.episodes||[])for(const s of e.scenes||[]){const art=visualSrc(s);if(art)all.push({kind:'Storyboard',name:`${p.title} · ${s.title}`,image:art});if(s.videoUrl)all.push({kind:'Video clip',name:`${p.title} · ${s.title}`,video:s.videoUrl})}if(p.finalVideoMeta?.createdAt)all.push({kind:'Final video',name:p.title,finalVideoProjectId:p.id,finalVideoMeta:p.finalVideoMeta});if(p.finalAssembly?.preparedAt)all.push({kind:'Final assembly',name:p.title,assembly:p.finalAssembly})}
  if(!all.length){grid.innerHTML=`<div class="empty-state surface library-empty"><div class="empty-orb">▣</div><h2>No generated media yet</h2><p>Storyboard frames, video clips and final assemblies will appear here.</p></div>`;return}
  grid.innerHTML=all.map((a,i)=>`<button class="asset-card surface" data-asset="${i}"><div class="asset-thumb">${a.video?`<div class="initials" aria-hidden="true">▶</div>`:a.image?`<img src="${a.image}" alt="${esc(a.name)}">`:`<div class="initials">✓</div>`}</div><div class="asset-info"><small class="media-kind-badge">${a.kind}</small><b>${esc(a.name)}</b></div></button>`).join('');$$('[data-asset]').forEach(b=>b.onclick=()=>openLibraryAsset(all[Number(b.dataset.asset)]));
}
function renderAll(){renderUsage();renderProjects();renderCharacters();renderEpisodes();renderStudio();renderLibrary()}

function characterPrompt(p,c){return `Original character reference portrait for an entertainment project. Cultural treatment: ${culturalPrompt(p)}. Sacred representation: ${sacredRepresentationPrompt(p)}. Sacred/cultural identity guidance: ${sacredFigureGuidance(p,c)} Character: ${c.name}. Role: ${c.role}. Age/presentation: ${c.age||'creator-defined'}. Appearance: ${c.appearance||'creator-defined'}. Background/culture/origin: ${c.background||'creator-defined'}. Personality: ${c.personality||''}. Wardrobe: ${c.wardrobe||''}. Visual style: ${characterStyle(p,c)}. ${c.locked!==false?continuityPrompt(p):'Character identity may be reinterpreted because Identity Lock is off.'} If a reference portrait is supplied, treat it as the canonical identity source and change rendering style rather than identity. SAFE PORTRAIT FRAMING: keep the complete head, hair, face, chin and both shoulders comfortably inside the square frame with generous breathing room on every side. Do not cut off the crown of the head, face, chin, ears, shoulders or important identity details. Prefer a centered chest-up portrait rather than an extreme close-up. CLEAN PORTRAIT ONLY: no written words, no captions, no arrows, no callout labels, no infographic annotations, no logos, no celebrity resemblance.`}
async function portraitReferenceEntries(p,s){const chars=(p?.characters||[]).filter(c=>c.locked!==false&&hasVisual(c));const sceneText=s?[s.title,s.visual,s.purpose,dialogueText(s.narration),...dialogueList(s.dialogue)].join(' ').toLowerCase():'';const mentioned=s?chars.filter(c=>sceneText.includes(String(c.name||'').toLowerCase())):[];const ordered=s?(mentioned.length?[...mentioned,...chars.filter(c=>!mentioned.includes(c))]:chars):chars;const out=[];for(const c of ordered.slice(0,4)){const image=await visualDataUrl(c);if(image)out.push({name:c.name,image})}return out}
function scenePrompt(p,ep,s,refs=[]){const cast=(p.characters||[]).map(c=>`${c.name}: ${c.appearance||''}; wardrobe: ${c.wardrobe||'continuity wardrobe'}; identity context: ${sacredFigureGuidance(p,c)}${c.visualStyleOverride&&c.visualStyleOverride!=='project'?`; style override ${characterStyle(p,c)}`:''}`).join(' | ');const refManifest=refs.length?` Reference portraits are supplied in this exact order: ${refs.map((r,i)=>`${i+1}) ${r.name}`).join('; ')}. Each reference image belongs to that named character only; never swap identities between characters.`:'';const progression=(Array.isArray(s.visualProgression)?s.visualProgression:[]).filter(Boolean).join(' → '),locks=(Array.isArray(s.continuityLocks)?s.continuityLocks:[]).filter(Boolean).join(' | ');return `Original storyboard frame. Project: ${p.title}. Format: ${p.format||'Episode'}. Production unit: ${ep.title}. Scene: ${s.title}. Visual action: ${s.visual}. Story purpose: ${s.dramaticPurpose||s.purpose}. Character objective: ${s.characterObjective||'follow the established scene objective'}. Scene change/reveal: ${s.newInformation||'advance the current story beat'}. Emotional turn: ${s.emotionalTurn||'preserve the intended scene emotion'}. ${progression?`Visual progression for this scene: ${progression}.`:''} ${locks?`Continuity locks: ${locks}.`:''} Generation quality: ${tierLabel(s.tier)}. ${tierHint(s.tier)} Cast continuity: ${cast}. Project visual style: ${projectStyle(p)}. Cultural treatment: ${culturalPrompt(p)}. Sacred representation: ${sacredRepresentationPrompt(p)}. ${continuityPrompt(p)}${refManifest} Preserve cultural and geographic details requested by the creator without stereotyping. SAFE STORYBOARD FRAMING: compose in 16:9 with all principal faces fully inside frame, comfortable headroom and side margins, and important hands/props visible when story-relevant. Do not crop a principal character at the face/head edge or create an unintended extreme close-up. If two or more principal characters are present, keep each readable in frame unless the scene explicitly requests an intentional close-up. No captions, no written labels, no callout arrows, no infographic annotations, no logos.`}
function portraitStyleOptions(p,c){const selected=c?.visualStyleOverride||'project';const projectLabel=styleLabel(p?.visualStylePreset||'cinematic-realistic');const values=[['project',`Use project style — ${projectLabel}`],['cinematic-realistic','Photorealistic / Cinematic'],['3d-animated','3D Animated'],['2d-animated','2D Animated'],['storybook','Illustrated / Storybook'],['anime','Anime'],['watercolor','Watercolor'],['graphic-novel','Graphic Novel'],['clay','Clay / Stop-motion Inspired'],['devotional-art','Devotional Art'],['sacred-cinematic','Sacred Cinematic'],['custom','Custom style']];return values.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('')}
function portraitJobKey(projectId,index){return `${projectId}:${index}`}
function setPortraitJob(projectId,index,value){const key=portraitJobKey(projectId,index);if(value)state.portraitJobs.set(key,value);else state.portraitJobs.delete(key);renderCharacters()}
function deferProjectPersistence(){const run=()=>{try{save()}catch(err){console.warn('[CineTale portrait] Deferred workspace save failed',err)}};if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1200});else setTimeout(run,0)}
function showPortraitProgress(name){const box=$('#portraitProgress');if(!box)return()=>{};const started=Date.now();box.classList.remove('hidden');const tick=()=>{const sec=Math.max(1,Math.round((Date.now()-started)/1000));box.innerHTML=`<span class="spinner dark"></span><div><b>Creating ${esc(name)}…</b><small>${sec}s elapsed · Portrait generation can take a little longer during provider load. You can stay on this screen; it will update automatically.</small></div>`};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)}
function characterLikelyMinor(c={}){
  const t=String(c.age||'').toLowerCase();
  const n=(t.match(/\b(\d{1,2})\b/)||[])[1];
  if(n&&Number(n)<18)return true;
  return /\b(baby|infant|toddler|child|kid|preteen|teen|teenager|minor|young girl|young boy)\b/i.test(t);
}
function openPortraitSetup(i){
  const p=current(),c=p?.characters?.[i];if(!c||!requireApprovedStory('generate character art'))return;
  const currentPortrait=visualSrc(c),hasPortrait=Boolean(currentPortrait||c.imageAssetKey),minor=characterLikelyMinor(c),existingConsent=Boolean(c.referencePhotoConsent?.confirmedAt);
  $('#modalBody').innerHTML=`<form class="modal-form portrait-setup" id="portraitSetupForm"><div class="portrait-setup-head"><div><small>CHARACTER PORTRAIT</small><h2>${hasPortrait?'Regenerate':'Generate'} ${esc(c.name)}</h2><p>Confirm the look before using image-generation quota. CineTale keeps the character identity consistent across later scenes.</p></div>${hasPortrait&&currentPortrait?`<img class="portrait-setup-thumb" src="${esc(currentPortrait)}" alt="Current portrait for ${esc(c.name)}">`:''}</div><label class="field"><span>Portrait style</span><select id="portraitStyle">${portraitStyleOptions(p,c)}</select><small>The project style is recommended for continuity. Choose another style only when you want this character rendered differently.</small></label><label class="field ${c.visualStyleOverride==='custom'?'':'hidden'}" id="portraitCustomStyleWrap"><span>Custom style</span><input id="portraitCustomStyle" value="${esc(c.customVisualStyle||'')}" placeholder="Describe the portrait treatment…"></label><label class="field"><span>Appearance</span><textarea id="portraitAppearance" rows="4">${esc(c.appearance||'')}</textarea><small>Edit only if CineTale inferred something incorrectly or you want a specific visual detail.</small></label><label class="field"><span>Culture / background / origin</span><input id="portraitBackground" value="${esc(c.background||'')}" placeholder="Optional cultural, regional or fictional context"></label><div class="photo-reference-box"><div><b>Use a reference photo · optional</b><span>The photo is compressed locally and used only as an identity reference for this character's generated visuals.</span></div><label class="consent-check"><input id="portraitPhotoConsent" type="checkbox" ${existingConsent?'checked':''}><span>I confirm this is my photo, or I have permission to use this person's image for character generation.</span></label>${minor?`<label class="consent-check"><input id="portraitMinorConsent" type="checkbox" ${c.referencePhotoConsent?.minorAuthorized?'checked':''}><span>I confirm I am the parent/guardian or otherwise authorized to use this child's image.</span></label>`:''}<div class="settings-note">CineTale will not enable photo selection or generation from a reference photo until the required authorization is confirmed.</div><label class="ghost photo-upload-btn ${existingConsent?'':'disabled'}" id="portraitPhotoChooseLabel">Choose photo<input id="portraitReferencePhoto" type="file" accept="image/*" hidden ${existingConsent?'':'disabled'}></label><div id="portraitReferencePreview" class="photo-reference-preview ${c.referencePhoto?'':'hidden'}">${c.referencePhoto?`<img src="${esc(c.referencePhoto)}" alt="Uploaded identity reference"><button type="button" class="ghost tiny danger" id="removeReferencePhoto">Remove photo</button>`:''}</div></div>${isSacredCharacter(p,c)?`<div class="identity-note sacred-portrait-note"><b>Sacred identity</b><span>${esc(c.sacredIdentity||'CineTale detected a sacred/mythological character.')} Cultural and canonical cues remain active during portrait generation.</span></div>`:''}<div class="identity-note"><b>Identity Lock</b><span>The generated portrait becomes this character's active identity reference. You can return here later to generate an alternative without changing the story.</span></div><div id="portraitProgress" class="portrait-progress hidden"></div><div class="modal-actions"><button type="button" class="ghost" id="portraitCancel">Cancel</button><button type="submit" class="primary" id="portraitGenerate">${hasPortrait?'Generate alternative':'Generate portrait'}</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#portraitCancel').onclick=closeModal;$('#portraitStyle').onchange=e=>$('#portraitCustomStyleWrap').classList.toggle('hidden',e.target.value!=='custom');
  let uploadedReference=c.referencePhoto||'';
  const refInput=$('#portraitReferencePhoto'),refPreview=$('#portraitReferencePreview'),consent=$('#portraitPhotoConsent'),minorConsent=$('#portraitMinorConsent'),chooseLabel=$('#portraitPhotoChooseLabel'),generate=$('#portraitGenerate');
  const consentReady=()=>Boolean(consent?.checked&&(!minor||minorConsent?.checked));
  const syncConsentUi=()=>{const ready=consentReady();if(refInput)refInput.disabled=!ready;if(chooseLabel){chooseLabel.classList.toggle('disabled',!ready);chooseLabel.setAttribute('aria-disabled',ready?'false':'true')}if(generate)generate.disabled=Boolean(uploadedReference&&!ready)};
  consent?.addEventListener('change',syncConsentUi);minorConsent?.addEventListener('change',syncConsentUi);syncConsentUi();
  if(refInput)refInput.onchange=async()=>{const file=refInput.files?.[0];if(!file)return;if(!consentReady()){toast('Confirm photo authorization before choosing a reference photo.');refInput.value='';return}try{uploadedReference=await fileToReferenceDataUrl(file);refPreview.classList.remove('hidden');refPreview.innerHTML=`<img src="${esc(uploadedReference)}" alt="Uploaded identity reference"><button type="button" class="ghost tiny danger" id="removeReferencePhoto">Remove photo</button>`;$('#removeReferencePhoto').onclick=()=>{uploadedReference='';refInput.value='';refPreview.classList.add('hidden');refPreview.innerHTML='';syncConsentUi()};syncConsentUi()}catch(err){toast(err.message||'Could not prepare that photo.')}};
  if($('#removeReferencePhoto'))$('#removeReferencePhoto').onclick=()=>{uploadedReference='';if(refInput)refInput.value='';refPreview.classList.add('hidden');refPreview.innerHTML='';syncConsentUi()};
  $('#portraitSetupForm').onsubmit=async e=>{e.preventDefault();const btn=$('#portraitGenerate'),style=$('#portraitStyle').value,custom=$('#portraitCustomStyle').value.trim(),appearance=$('#portraitAppearance').value.trim(),background=$('#portraitBackground').value.trim();if(style==='custom'&&!custom){toast('Describe the custom portrait style first.');return}if(uploadedReference&&!consentReady()){toast(minor?'Confirm both photo authorization statements before generating from this reference.':'Confirm photo authorization before generating from this reference.');return}const referencePhotoConsent=uploadedReference?{confirmedAt:new Date().toISOString(),authorized:true,minorAuthorized:minor?Boolean(minorConsent?.checked):false,scope:'character-generation'}:null;const stopProgress=showPortraitProgress(c.name);try{const ok=await generateCharacter(i,btn,{visualStyleOverride:style,customVisualStyle:custom,appearance,background,referencePhoto:uploadedReference,referencePhotoConsent});if(ok){const progress=$('#portraitProgress');if(progress)progress.innerHTML='<div><b>Portrait ready.</b><small>The Cast card has been updated automatically.</small></div>';setTimeout(closeModal,350)}}finally{stopProgress()}}
}
async function generateCharacter(i,button,overrides={}){const p=current(),base=p?.characters?.[i];if(!base||!requireApprovedStory('generate character art'))return false;if(visualGenerationBlocked()){toast(visualBlockedMessage());return false;}const projectId=p.id,characterId=base.id,c={...base,...overrides},old=button?.textContent,stopProgress=generationProgress(button,['Creating portrait…','Rendering portrait…','Finishing portrait…']);setPortraitJob(projectId,i,{label:'Creating portrait…',detail:'The visual provider is rendering this identity. You can keep working while it finishes.'});try{const sacred=isSacredCharacter(p,c);const canReuseReference=hasVisual(base)&&base.locked!==false&&(!sacred||base.sacredReferenceReady===true);const prior=canReuseReference?await visualDataUrl(base):'';const referenceImages=[c.referencePhoto||'',prior].filter(Boolean).slice(0,2);const d=await apiPost('/api/generate-image',{prompt:characterPrompt(p,c),label:c.name,aspect:'1:1',quality:'standard',referenceImages,preferBackup:preferVerifiedBackupVisual()});if(d.mode==='ai')bumpUsage('visual');const live=state.projects.find(x=>x.id===projectId);const target=(live?.characters||[]).find(x=>x.id===characterId)||live?.characters?.[i];if(!target)throw new Error('Character changed while the portrait was generating. Please try again.');const assetKey=target.imageAssetKey||uid('visual');const staged=stageVisualAsset(assetKey,d.image);target.appearance=c.appearance;target.background=c.background;target.visualStyleOverride=c.visualStyleOverride||'project';target.customVisualStyle=c.customVisualStyle||'';target.referencePhoto=c.referencePhoto||'';target.referencePhotoConsent=c.referencePhotoConsent||null;target.image=staged.src;target.imageAssetKey=assetKey;target.imageMode=d.mode;target.imageProviderRoute=d.providerRoute||'primary';target.locked=true;target._visualPersisting=true;if(sacred&&d.mode==='ai')target.sacredReferenceReady=true;live.updatedAt=new Date().toISOString();setPortraitJob(projectId,i,null);renderAll();toast('Portrait ready · saving safely…');const stored=await saveVisualAsset(assetKey,d.image);target.image=stored.src||target.image;target.imageAssetKey=stored.key||assetKey;delete target._visualPersisting;live.updatedAt=new Date().toISOString();save();renderAll();requestAnimationFrame(()=>{const card=$$('#characterGrid .character-card').find(el=>el.textContent?.includes(target.name||''))||$$('#characterGrid .character-card')[i],img=card?.querySelector('img');if(img&&typeof img.decode==='function')img.decode().catch(()=>{})});toast(d.mode==='ai'?(d.providerRoute==='backup'?'Portrait generated using the backup visual service and identity locked.':c.referencePhoto?'Portrait generated from your uploaded identity reference and locked.':canReuseReference?'Alternative portrait generated and identity reference updated.':'Portrait generated and identity locked.'):(d.warning||'Preview portrait shown because live visual generation is unavailable.'));return true}catch(e){setPortraitJob(projectId,i,null);toast(/quota/i.test(String(e?.message||''))&&Number(e?.status)!==429?'The image was generated, but this browser could not store it. CineTale uses dedicated local media storage; reload and retry once.':e.message);return false}finally{stopProgress();if(button&&button.isConnected){button.disabled=visualGenerationBlocked();button.textContent=visualGenerationBlocked()?'Visuals paused':(old||'Generate portrait')}}}
async function generateAllCharacters(button){const p=current();if(!p||!requireApprovedStory('generate cast portraits'))return;const chars=p.characters||[];if(!chars.length){toast('Add a character first.');return}const missingIndexes=chars.map((c,i)=>hasVisual(c)?null:i).filter(i=>i!==null);const indexes=missingIndexes.length?missingIndexes:chars.map((_,i)=>i);const label=missingIndexes.length?`${indexes.length} missing portrait${indexes.length===1?'':'s'}`:`all ${indexes.length} existing portrait${indexes.length===1?'':'s'}`;if(!confirm(`${missingIndexes.length?'Generate':'Regenerate'} ${label} using each character's current appearance and portrait style? ${missingIndexes.length&&missingIndexes.length<chars.length?'Existing portraits will be kept. ':''}This uses image-generation quota.`))return;const old=button?.textContent;if(button)button.disabled=true;let completed=0;for(let n=0;n<indexes.length;n++){if(visualGenerationBlocked()){toast('Portrait batch paused because visual generation is temporarily limited. Completed portraits are safe.');break}const i=indexes[n];if(button)button.textContent=`Generating ${n+1}/${indexes.length}`;if(await generateCharacter(i,null))completed++}if(button){button.disabled=false;button.textContent=old}toast(`${completed}/${indexes.length} character portrait${indexes.length===1?'':'s'} completed.`)}
async function generateScene(i,button){const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s||!requireApprovedStory('generate storyboard art'))return false;if(visualGenerationBlocked()){toast(visualBlockedMessage());return false}const projectId=p.id,episodeId=ep.id,sceneId=s.id,old=button?.textContent,stopProgress=generationProgress(button,['Creating scene…','Rendering details…','Finishing scene…']);try{const refs=await portraitReferenceEntries(p,s);const d=await apiPost('/api/generate-image',{prompt:scenePrompt(p,ep,s,refs),label:s.title,aspect:'16:9',quality:normalizedTier(s.tier),referenceImages:refs.map(r=>r.image),preferBackup:preferVerifiedBackupVisual()});if(d.mode==='ai')bumpUsage('visual');const project=state.projects.find(x=>x.id===projectId),episode=(project?.episodes||[]).find(x=>x.id===episodeId)||episodeOf(project),target=(episode?.scenes||[]).find(x=>x.id===sceneId)||episode?.scenes?.[i];if(!target)throw new Error('Scene changed while artwork was generating. Please try again.');const assetKey=target.imageAssetKey||uid('visual');const staged=stageVisualAsset(assetKey,d.image);target.image=staged.src;target.imageAssetKey=assetKey;target.imageMode=d.mode;target.imageProviderRoute=d.providerRoute||'primary';target._visualPersisting=true;project.updatedAt=new Date().toISOString();renderAll();toast('Storyboard ready · saving safely…');const stored=await saveVisualAsset(assetKey,d.image);target.image=stored.src||target.image;target.imageAssetKey=stored.key||assetKey;delete target._visualPersisting;project.updatedAt=new Date().toISOString();save();renderAll();toast(d.mode==='ai'?(d.providerRoute==='backup'?'Storyboard generated using the backup visual service.':'Storyboard generated.'):(d.warning||'Preview storyboard shown because live visual generation is unavailable.'));return true}catch(e){toast(/quota/i.test(String(e?.message||''))&&Number(e?.status)!==429?'The image was generated, but this browser could not store it. CineTale uses dedicated local media storage; reload and retry once.':e.message);return false}finally{stopProgress();if(button&&button.isConnected){button.disabled=visualGenerationBlocked();button.textContent=visualGenerationBlocked()?'Visuals paused':(old||'Generate art')}}}
const sceneAudioDbName='cinetale-scene-audio-v1';
const sceneAudioBlobMemory=new Map();
const sceneAudioObjectUrls=new Map();
const sceneVideoAudioControllers=new WeakMap();
const sceneAudioWarmups=new Set();
let sceneVideoAudioContext=null;
function userSafeLipSyncError(error){const raw=String(error?.message||error||'').trim(),code=String(error?.code||error?.details?.errorCode||'').trim();if(code==='provider_access_blocked'||/<html|Cloudflare|Sorry, you have been blocked|cf-error-details/i.test(raw))return {message:'Dialogue synchronization is temporarily unavailable. Your generated video and approved voice are safe; retry synchronization later.',code:'provider_access_blocked'};if(/Content-Length header of network response|response Body|terminated|premature close|unexpected end of (?:file|stream)|fetch failed/i.test(raw))return {message:'The saved synchronized video could not be read completely. CineTale will retry restoring the existing asset without generating another video.',code:'sync_media_delivery_incomplete'};return {message:raw||'Dialogue synchronization could not finish. Your source video remains safe.',code};}
function offlineAudioDecoder(){const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;return Offline?new Offline(1,1,44100):null}

function stableAudioHash(value=''){let h=2166136261;const s=String(value);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return `${(h>>>0).toString(16)}-${s.length}`}
async function strongStringDigest(value=''){const text=String(value||'');try{if(globalThis.crypto?.subtle&&globalThis.TextEncoder){const bytes=new TextEncoder().encode(text),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}}catch(e){console.warn('[CineTale integrity] SHA-256 text digest unavailable; using deterministic fallback',e)}return stableAudioHash(text)}
function openSceneAudioDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){resolve(null);return}const req=indexedDB.open(sceneAudioDbName,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('audio'))db.createObjectStore('audio',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Scene audio storage unavailable.'))})}
async function loadSceneAudioBlob(key){if(sceneAudioBlobMemory.has(key))return sceneAudioBlobMemory.get(key);try{const db=await openSceneAudioDb();if(!db)return null;const row=await new Promise((resolve,reject)=>{const tx=db.transaction('audio','readonly'),req=tx.objectStore('audio').get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();if(row?.blob){sceneAudioBlobMemory.set(key,row.blob);return row.blob}}catch(e){console.warn('[CineTale scene audio] Local cache read unavailable',e)}return null}
async function saveSceneAudioBlob(key,blob,meta={}){sceneAudioBlobMemory.set(key,blob);try{const db=await openSceneAudioDb();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put({key,blob,meta,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){console.warn('[CineTale scene audio] Local cache write unavailable',e)}}
async function dataUrlToAudioBlob(dataUrl){const r=await fetch(dataUrl);if(!r.ok)throw new Error('Could not prepare generated scene audio.');return await r.blob()}
function sceneAudioItemKey(p,s,item,index){const payload={v:2,projectId:p?.id||'',sceneId:s?.id||String(s?.number||''),index,text:item.text||'',voiceId:item.voiceId||'',characterId:item.characterId||'',kind:item.kind||'dialogue',direction:item.direction||'',speakerProfile:item.speakerProfile||'',language:p?.language||'English'};return `scene-audio:${stableAudioHash(JSON.stringify(payload))}`}
async function getOrCreateSceneAudioAsset(p,s,item,index){const key=sceneAudioItemKey(p,s,item,index);let blob=await loadSceneAudioBlob(key),created=false;if(!blob){if(!item.voiceId||String(item.voiceId).startsWith('browser-'))throw new Error(`A natural voice is not assigned for ${item.speakerName||item.kind||'this line'}.`);const payload={text:item.text,voiceId:item.voiceId,kind:item.kind,direction:item.direction||'',language:p.language||'English',speakerProfile:item.speakerProfile||''};const d=await cachedAudioRequest('/api/tts',payload,'scene-tts');if(!(d?.mode==='ai'&&d.audio))throw new Error('Natural scene dialogue is unavailable on this deployment.');blob=await dataUrlToAudioBlob(d.audio);await saveSceneAudioBlob(key,blob,{voiceId:item.voiceId,kind:item.kind,characterId:item.characterId||'',speakerName:item.speakerName||'',text:item.text});created=!d.__cached;if(created)bumpUsage('audio')}let url=sceneAudioObjectUrls.get(key);if(!url){url=URL.createObjectURL(blob);sceneAudioObjectUrls.set(key,url)}return {key,blob,url,created,item}}
async function sceneVoiceAssets(p,s){const items=await scenePlaybackItems(p,s),assets=[];for(let i=0;i<items.length;i++)assets.push(await getOrCreateSceneAudioAsset(p,s,items[i],i));return assets}
async function ensureSceneVideoAudioContext(){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;sceneVideoAudioContext=sceneVideoAudioContext||new Ctx();if(sceneVideoAudioContext.state==='suspended')await sceneVideoAudioContext.resume();return sceneVideoAudioContext}
function sceneVoiceLeadInSec(){return 0}
function audioLeadingSilenceSec(buffer,{maxTrimSec=.65,threshold=.012,padSec=.035}={}){try{const rate=Number(buffer?.sampleRate)||44100,limit=Math.min(buffer.length,Math.floor(maxTrimSec*rate));if(limit<=0)return 0;let first=-1;for(let i=0;i<limit;i++){let peak=0;for(let c=0;c<buffer.numberOfChannels;c++)peak=Math.max(peak,Math.abs(buffer.getChannelData(c)[i]||0));if(peak>=threshold){first=i;break}}if(first<0)return 0;return Math.max(0,first/rate-padSec)}catch{return 0}}
async function decodeSceneAudioTrack(ctx,assets,{leadInSec=0}={}){const tracks=[];let cursor=Math.max(0,Number(leadInSec)||0);for(const asset of assets){const ab=await asset.blob.arrayBuffer(),buffer=await ctx.decodeAudioData(ab.slice(0)),trim=audioLeadingSilenceSec(buffer),duration=Math.max(.02,buffer.duration-trim);tracks.push({asset,buffer,trim,start:cursor,end:cursor+duration});cursor+=duration}return {tracks,duration:cursor,leadInSec:Math.max(0,Number(leadInSec)||0)}}
function wavFromAudioBuffer(buffer){const channels=Math.max(1,Math.min(2,buffer.numberOfChannels||1)),frames=buffer.length,rate=buffer.sampleRate,bytes=44+frames*channels*2,out=new ArrayBuffer(bytes),v=new DataView(out);let o=0;const str=x=>{for(let i=0;i<x.length;i++)v.setUint8(o++,x.charCodeAt(i))};str('RIFF');v.setUint32(o,36+frames*channels*2,true);o+=4;str('WAVE');str('fmt ');v.setUint32(o,16,true);o+=4;v.setUint16(o,1,true);o+=2;v.setUint16(o,channels,true);o+=2;v.setUint32(o,rate,true);o+=4;v.setUint32(o,rate*channels*2,true);o+=4;v.setUint16(o,channels*2,true);o+=2;v.setUint16(o,16,true);o+=2;str('data');v.setUint32(o,frames*channels*2,true);o+=4;const data=[];for(let c=0;c<channels;c++)data.push(buffer.getChannelData(Math.min(c,buffer.numberOfChannels-1)));for(let i=0;i<frames;i++){for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,data[c][i]||0));v.setInt16(o,x<0?x*0x8000:x*0x7fff,true);o+=2}}return new Blob([out],{type:'audio/wav'})}
async function sceneLipSyncPlaybackItems(p,s){
  // Bind synchronization to the exact speaking shot that produced the owned source video.
  const shot=sourceSpeakingShot(s)||primaryCoverageShot(s,'balanced');
  if(!shot?.speaking||!String(shot.spokenLine||'').trim())throw new Error('CineTale could not identify the exact speaking shot for dialogue synchronization.');
  const items=(await scenePlaybackItems(p,s)).filter(x=>x.kind==='dialogue');
  const wantedText=String(shot.spokenLine||'').trim(),wantedSpeaker=normalizeSpeakerAlias(shot.speaker||'');
  const wantedIndex=characterIndexForSpeaker(p,shot.speaker||''),wantedCharacterId=wantedIndex>=0?String(p.characters?.[wantedIndex]?.id||''):'';
  const matches=items.filter(item=>String(item.text||'').trim()===wantedText&&(!wantedCharacterId||String(item.characterId||'')===wantedCharacterId)&&(!wantedSpeaker||normalizeSpeakerAlias(item.speakerName||'')===wantedSpeaker));
  if(matches.length!==1)throw new Error('CineTale stopped dialogue synchronization because the speaking shot could not be matched to exactly one character voice and dialogue line.');
  const item=matches[0];
  if(!item.voiceId||String(item.voiceId).startsWith('browser-'))throw new Error(`A verified natural voice is not assigned to ${item.speakerName||shot.speaker||'the speaking character'}.`);
  return [item];
}
async function sceneLipSyncAudioDataUrl(p,s){const selected=await sceneLipSyncPlaybackItems(p,s),assets=[];for(let i=0;i<selected.length;i++)assets.push(await getOrCreateSceneAudioAsset(p,s,selected[i],i));if(!assets.length)return '';const decoder=offlineAudioDecoder();if(!decoder)return assets.length===1?blobToDataUrl(assets[0].blob):'';const decoded=[];let duration=sceneVoiceLeadInSec(s);for(const a of assets){const ab=await a.blob.arrayBuffer(),b=await decoder.decodeAudioData(ab.slice(0)),trim=audioLeadingSilenceSec(b),playDuration=Math.max(.02,b.duration-trim);decoded.push({buffer:b,trim,playDuration});duration+=playDuration}const rate=44100,Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)return assets.length===1?blobToDataUrl(assets[0].blob):'';const offline=new Offline(1,Math.max(1,Math.ceil((duration+.05)*rate)),rate),compressor=offline.createDynamicsCompressor(),gain=offline.createGain();compressor.threshold.value=-24;compressor.knee.value=18;compressor.ratio.value=3;gain.gain.value=1.24;compressor.connect(gain);gain.connect(offline.destination);let cursor=sceneVoiceLeadInSec(s);for(const item of decoded){const src=offline.createBufferSource();src.buffer=item.buffer;src.connect(compressor);src.start(cursor,item.trim,item.playDuration);cursor+=item.playDuration}const rendered=await offline.startRendering();return await blobToDataUrl(wavFromAudioBuffer(rendered))}
async function coverageShotPlaybackItem(p,s,shot={}){
  const items=(await scenePlaybackItems(p,s)).filter(x=>x.kind==='dialogue');const wantedText=String(shot.spokenLine||'').trim(),wantedSpeaker=normalizeSpeakerAlias(shot.speaker||'');
  const idx=characterIndexForSpeaker(p,shot.speaker||''),characterId=idx>=0?String(p.characters?.[idx]?.id||''):'';
  const matches=items.filter(item=>String(item.text||'').trim()===wantedText&&(!characterId||String(item.characterId||'')===characterId)&&(!wantedSpeaker||normalizeSpeakerAlias(item.speakerName||'')===wantedSpeaker));
  if(matches.length!==1)throw new Error(`CineTale could not match shot ${shot.order||''} to exactly one approved character voice.`);const item=matches[0];if(!item.voiceId||String(item.voiceId).startsWith('browser-'))throw new Error(`A verified natural voice is not assigned to ${item.speakerName||shot.speaker||'this speaking character'}.`);return item;
}
async function coverageShotLipSyncAudioDataUrl(p,s,shot={}){const item=await coverageShotPlaybackItem(p,s,shot),asset=await getOrCreateSceneAudioAsset(p,s,item,Math.max(0,(sceneCoveragePlan(s,'balanced').findIndex(x=>x.id===shot.id))));return blobToDataUrl(asset.blob)}

async function approvedAudioMetrics(audioDataUrl=''){
  const decoder=offlineAudioDecoder();if(!decoder)throw new Error('This browser cannot validate the approved dialogue audio.');
  const r=await fetch(audioDataUrl);if(!r.ok)throw new Error('CineTale could not reopen the approved dialogue audio.');
  const ab=await r.arrayBuffer(),buffer=await decoder.decodeAudioData(ab.slice(0));let sum=0,peak=0,count=0;
  for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<data.length;i+=Math.max(1,Math.floor(data.length/120000))){const v=Math.abs(data[i]||0);sum+=v*v;peak=Math.max(peak,v);count++}}
  const rms=Math.sqrt(sum/Math.max(1,count));return {duration:Number(buffer.duration)||0,rms,peak,buffer};
}
function preferredEmbeddedAudioRecorderMime(){
  if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')return '';
  const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.424028,mp4a.40.2','video/mp4'];
  return types.find(type=>MediaRecorder.isTypeSupported(type))||'';
}
async function finalizeSynchronizedVideoWithApprovedAudio(syncUrl,audioDataUrl,{project=null,scene=null}={}){
  const mime=preferredEmbeddedAudioRecorderMime();
  if(!mime)throw new Error('This browser cannot embed the approved character voice into the synchronized MP4. CineTale left the clip unapproved instead of presenting silent video.');
  const metrics=await approvedAudioMetrics(audioDataUrl);syncDiag('approved-audio-verified',project,scene,{duration:metrics.duration,rms:metrics.rms,peak:metrics.peak});
  if(!(metrics.duration>.05)||!(metrics.peak>.002)||!(metrics.rms>.0002))throw new Error('The approved dialogue audio is effectively silent. CineTale stopped before adopting a silent speaking clip.');
  const Ctx=window.AudioContext||window.webkitAudioContext,ctx=await ensureSceneVideoAudioContext();if(!Ctx||!ctx)throw new Error('This browser cannot prepare embedded dialogue audio.');
  if(ctx.state==='suspended'){try{await ctx.resume()}catch{}}
  if(ctx.state!=='running')throw new Error('The browser blocked CineTale from embedding the approved dialogue audio. CineTale will retry approved-audio finalization when the clip is next played.');
  const video=document.createElement('video');video.preload='auto';video.playsInline=true;video.muted=true;video.defaultMuted=true;video.crossOrigin='anonymous';video.src=syncUrl;
  await new Promise((resolve,reject)=>{let done=false;const finish=(ok,e)=>{if(done)return;done=true;clearTimeout(timer);ok?resolve():reject(e||new Error('The synchronized video could not be prepared for audio finalization.'))};video.addEventListener('canplay',()=>finish(true),{once:true});video.addEventListener('error',()=>finish(false,new Error('The synchronized video could not be decoded for approved-audio finalization.')),{once:true});const timer=setTimeout(()=>finish(false,new Error('Timed out while preparing the synchronized video for approved-audio finalization.')),12000);try{video.load()}catch(e){finish(false,e)}});
  const capture=video.captureStream||video.mozCaptureStream;if(typeof capture!=='function')throw new Error('This browser cannot create a durable synchronized video with embedded approved audio.');
  const mediaStream=capture.call(video),videoTrack=mediaStream.getVideoTracks?.()[0];if(!videoTrack)throw new Error('CineTale could not capture the synchronized video track for approved-audio finalization.');
  const audioDest=ctx.createMediaStreamDestination(),audioSource=ctx.createBufferSource();audioSource.buffer=metrics.buffer;audioSource.connect(audioDest);const audioTrack=audioDest.stream.getAudioTracks?.()[0];if(!audioTrack)throw new Error('CineTale could not create the approved dialogue audio track.');
  const combined=new MediaStream([videoTrack,audioTrack]),chunks=[];let recorder;
  try{recorder=new MediaRecorder(combined,{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:192000})}catch(e){throw new Error(`The browser could not start CineTale's approved-audio MP4 finalizer. ${String(e?.message||e)}`)}
  const stopped=new Promise((resolve,reject)=>{recorder.addEventListener('dataavailable',e=>{if(e.data?.size)chunks.push(e.data)});recorder.addEventListener('stop',resolve,{once:true});recorder.addEventListener('error',e=>reject(e?.error||new Error('Approved-audio MP4 recording failed.')),{once:true})});
  recorder.start(250);video.currentTime=0;let audioStarted=false;const startAudio=()=>{if(audioStarted)return;audioStarted=true;try{audioSource.start()}catch{}};
  if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(()=>startAudio());
  try{await video.play()}catch(e){try{recorder.stop()}catch{};throw new Error(`The browser blocked synchronized-video finalization. CineTale will retry when the clip is next played. ${String(e?.message||e)}`)}
  if(!audioStarted)setTimeout(startAudio,0);
  await new Promise((resolve,reject)=>{let done=false;const finish=(ok,e)=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener('ended',ended);ok?resolve():reject(e)};const ended=()=>finish(true);video.addEventListener('ended',ended,{once:true});const timer=setTimeout(()=>finish(false,new Error('Timed out while embedding the approved dialogue audio.')),Math.max(15000,(Number(video.duration)||8)*1000+8000))});
  try{recorder.stop()}catch{};await stopped;for(const t of combined.getTracks?.()||[])try{t.stop()}catch{};video.pause();video.removeAttribute('src');try{video.load()}catch{}
  const blob=new Blob(chunks,{type:'video/mp4'});if(!blob.size||!await playableVideoBlob(blob))throw new Error('CineTale created the approved-audio synchronized MP4, but could not verify it as playable.');
  syncDiag('embedded-audio-finalized',project,scene,{mime:'video/mp4',bytes:blob.size,audioDuration:metrics.duration});return blob;
}
const lipSyncJobsInFlight=new Map();
const validatedLipSyncUrls=new Set();
const studioVideoSourcePins=new Map();
const studioVideoFallbacks=new Map();
function studioSceneMediaKey(project={},scene={}){const ep=episodeOf(project);return `${project?.id||''}:${ep?.id||ep?.number||''}:${scene?.id||scene?.number||''}`}
function sceneLipSyncJobKey(p,s){return `${p.id||''}:${s.id||s.number||''}:${sceneLipSyncSignature(p,s)}`}
const LIP_SYNC_JOB_STALE_MS=15*60*1000;
function sceneLipSyncJobAgeMs(scene={}){const t=Date.parse(scene.lipSyncStartedAt||'');return Number.isFinite(t)?Math.max(0,Date.now()-t):Infinity}
function resumableSceneLipSyncJob(scene={},signature=''){
  if(scene.lipSyncSignature!==signature)return null;
  const providerState=String(scene.lipSyncProviderStatus||'').toUpperCase();
  const durableGenerationId=String(scene.lipSyncGenerationId||'').trim();
  const requestId=String(scene.lipSyncOperation||((['PENDING','PROCESSING','COMPLETED'].includes(providerState))?durableGenerationId:'')).trim();
  if(!requestId)return null;
  // Provider generations are durable paid work. Once a generation ID exists, a browser refresh,
  // a transient status-fetch failure, or elapsed wall-clock time must never make CineTale submit
  // a duplicate job. Resume the saved generation until the provider explicitly reports failure.
  const status=String(scene.lipSyncStatus||'').toLowerCase();
  if(!['processing','waiting','error','preparing','ready'].includes(status))return null;
  const hasDurableProviderGeneration=Boolean(durableGenerationId&&['PENDING','PROCESSING','COMPLETED'].includes(providerState));
  if(!hasDurableProviderGeneration&&scene.lipSyncOperation&&sceneLipSyncJobAgeMs(scene)>LIP_SYNC_JOB_STALE_MS)return null;
  return {requestId,provider:String(scene.lipSyncProvider||'sync-labs'),model:String(scene.lipSyncModel||''),statusUrl:String(scene.lipSyncStatusUrl||''),responseUrl:String(scene.lipSyncResponseUrl||''),requestDigest:String(scene.lipSyncRequestDigest||''),productionContract:String(scene.lipSyncProductionContract||'')};
}
async function submitSceneLipSyncRequest(videoUrl,audioDataUrl,signature,requestDigest='',sourceStoragePath=''){
  const submissionKey=String(requestDigest||'').replace(/[^a-f0-9]/gi,'').slice(0,64)||`${hashString(signature).toString(36)}_${stableAudioHash(audioDataUrl).split('-')[0]}`;
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    await refreshAuthIfNeeded();
    const accessToken=String(state.authSession?.access_token||'');
    syncDiag('lipsync-submit-attempt',current(),episodeOf(current())?.scenes?.find(x=>x?.videoStoragePath===sourceStoragePath)||null,{attempt:attempt+1,sourceStoragePath,videoUrl:diagnosticUrl(videoUrl),audioBytes:String(audioDataUrl||'').length,submissionKeyPrefix:submissionKey.slice(0,12)});
    let d;try{d=await apiPost('/api/lipsync-job',{videoUrl,audioDataUrl,submissionKey,sourceStoragePath},{headers:accessToken?{Authorization:`Bearer ${accessToken}`}:{}})}catch(e){syncDiag('lipsync-submit-http-error',current(),episodeOf(current())?.scenes?.find(x=>x?.videoStoragePath===sourceStoragePath)||null,{attempt:attempt+1,httpStatus:Number(e?.status)||null,errorCode:String(e?.code||''),error:String(e?.message||e),details:e?.details||null});throw e}
    syncDiag('lipsync-submit-response',current(),episodeOf(current())?.scenes?.find(x=>x?.videoStoragePath===sourceStoragePath)||null,{attempt:attempt+1,responseStatus:String(d.status||''),requestId:String(d.requestId||''),provider:String(d.provider||''),model:String(d.model||''),errorCode:String(d.errorCode||''),error:String(d.error||'')});
    if(d.status==='queued'||d.requestId||d.status==='not_configured')return d;
    if(!['retryable','submission_unknown'].includes(d.status||''))return d;
    last=d;
    if(attempt<2){const wait=Math.max(750,Math.min(10000,Number(d.retryAfterMs)||1500*Math.pow(2,attempt)));await sleep(wait)}
  }
  const err=new Error(last?.error||'Lip-sync provider could not accept the scene after safe retries.');err.code=last?.errorCode||'sync_submit_retry_exhausted';err.details=last||null;throw err;
}
async function pollSceneLipSync(projectId,episodeId,index,job,signature,requestDigest,productionContract,sceneId=''){
  let consecutiveTransportFailures=0;
  for(let attempt=0;attempt<180;attempt++){
    await sleep(attempt<6?2500:5000);
    const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
    let d;
    try{
      d=await apiPost('/api/lipsync-status',{requestId:job.requestId,provider:job.provider||'',model:job.model||'',statusUrl:job.statusUrl||'',responseUrl:job.responseUrl||'',sourceVideoUrl:liveScene?.videoUrl||''});
      consecutiveTransportFailures=0;
      if(liveScene?.lipSyncLastPollError){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncLastPollError='';t.lipSyncLastPollErrorAt=null}},{render:false})}
    }catch(e){
      const status=Number(e?.status)||0,code=String(e?.code||'').toLowerCase(),message=String(e?.message||e);
      const transient=status===0||status===408||status===425||status===429||status>=500||code.includes('network')||code.includes('fetch')||/networkerror|failed to fetch|load failed|fetch resource/i.test(message);
      syncDiag('lipsync-status-http-error',live,liveScene,{attempt:attempt+1,requestId:String(job.requestId||''),httpStatus:status||null,errorCode:String(e?.code||''),error:message,details:e?.details||null,transient});
      if(!transient)throw e;
      consecutiveTransportFailures++;
      updateProjectById(projectId,x=>{const ep=findEpisodeById(x,episodeId),t=sceneAtIdentity(ep,index,sceneId);if(!t||t.lipSyncSignature!==signature)return;t.lipSyncOperation=t.lipSyncOperation||job.requestId;t.lipSyncGenerationId=t.lipSyncGenerationId||job.requestId;t.lipSyncStatus='processing';if(!['PENDING','PROCESSING'].includes(String(t.lipSyncProviderStatus||'').toUpperCase()))t.lipSyncProviderStatus='PROCESSING';t.lipSyncLastPollError=message;t.lipSyncLastPollErrorAt=new Date().toISOString();t.lipSyncError=null;t.lipSyncErrorCode=''},{render:false});
      syncDiag('lipsync-status-transient-retry',state.projects.find(x=>x.id===projectId),sceneAtIdentity(findEpisodeById(state.projects.find(x=>x.id===projectId),episodeId),index,sceneId),{attempt:attempt+1,requestId:String(job.requestId||''),consecutiveTransportFailures,nextRetryMs:Math.min(15000,1500*Math.pow(2,Math.min(consecutiveTransportFailures,3)))});
      // Retry the SAME paid provider generation. After several consecutive transport failures,
      // pause this browser polling loop but preserve the job so refresh/reopen resumes it.
      if(consecutiveTransportFailures>=8){
        syncDiag('poll-paused-preserving-job',state.projects.find(x=>x.id===projectId),sceneAtIdentity(findEpisodeById(state.projects.find(x=>x.id===projectId),episodeId),index,sceneId),{requestId:String(job.requestId||''),consecutiveTransportFailures});
        return '';
      }
      await sleep(Math.min(15000,1500*Math.pow(2,Math.min(consecutiveTransportFailures,3))));
      continue;
    }
    if(attempt<4||d.status==='ready'||d.status==='error'||d.queueStatus!==liveScene?.lipSyncProviderStatus)syncDiag('lipsync-status-response',live,liveScene,{attempt:attempt+1,requestId:String(job.requestId||''),responseStatus:String(d.status||''),queueStatus:String(d.queueStatus||''),generationId:String(d.generationId||''),provider:String(d.provider||''),model:String(d.model||''),videoUrl:diagnosticUrl(d.videoUrl||''),remoteVideoUrl:diagnosticUrl(d.remoteVideoUrl||''),errorCode:String(d.errorCode||''),error:String(d.error||'')});
    if(d.status==='ready'){
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||sceneLipSyncSignature(x,t)!==signature||t.lipSyncRequestDigest!==requestDigest||t.lipSyncProductionContract!==productionContract||!sceneVideoProductionProvenanceValid(x,t))return;t.lipSyncVideoUrl=d.videoUrl;t.lipSyncRemoteVideoUrl=d.remoteVideoUrl||'';t.lipSyncProvider=d.provider||job.provider||'sync-labs';t.lipSyncGenerationId=d.generationId||job.requestId||'';t.lipSyncSourceVideoUrl=t.videoUrl||'';t.lipSyncGeneratedAt=new Date().toISOString();t.lipSyncSignature=signature;t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncModel=d.model||t.lipSyncModel||job.model||'';t.lipSyncStatus='ready';t.lipSyncValidated=false;t.lipSyncRetryCount=0;t.lipSyncError=null;t.lipSyncProviderStatus='COMPLETED';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
      const readyProject=state.projects.find(x=>x.id===projectId),readyScene=sceneAtIdentity(findEpisodeById(readyProject,episodeId),index,sceneId);syncDiag('lipsync-ready-received',readyProject,readyScene,{requestId:String(job.requestId||''),videoUrl:diagnosticUrl(d.videoUrl||''),remoteVideoUrl:diagnosticUrl(d.remoteVideoUrl||'')});
      return d.videoUrl;
    }
    if(d.queueStatus){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t&&t.lipSyncSignature===signature)t.lipSyncProviderStatus=d.queueStatus},{render:false})}
    if(d.status==='error')throw new Error(d.error||'Lip synchronization failed.');
  }
  // Do not poison a paid long-running job just because this browser polling window ended.
  // The saved request ID is resumed the next time the scene is opened or played.
  return '';
}
const coverageShotSyncPollsInFlight=new Map();
async function pollCoverageShotLipSync(projectId,episodeId,sceneIndex,shot,request,{identity,requestDigest}={}){
  const pollKey=`${projectId}:${episodeId}:${sceneIndex}:${shot?.id||shot?.order||''}:${request?.requestId||''}`;
  const existing=coverageShotSyncPollsInFlight.get(pollKey);if(existing)return await existing;
  const task=(async()=>{
  let transportFailures=0;
  for(let attempt=0;attempt<180;attempt++){
    await sleep(attempt<6?2500:5000);
    const p=state.projects.find(x=>x.id===projectId),scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex],entry=scene?.coverageClips?.find(c=>c.shotId===shot.id);if(!p||!scene||!entry)throw new Error('The speaking shot disappeared while dialogue synchronization was running.');
    if(entry.syncIdentity!==identity||entry.syncRequestDigest!==requestDigest)throw new Error('The speaking-shot dialogue or voice changed while synchronization was running.');
    let d;try{d=await apiPost('/api/lipsync-status',{requestId:request.requestId,provider:request.provider||'',model:request.model||'',statusUrl:request.statusUrl||'',responseUrl:request.responseUrl||'',sourceVideoUrl:entry.videoUrl||''});transportFailures=0}
    catch(e){const status=Number(e?.status)||0,message=String(e?.message||e),transient=status===0||status===408||status===425||status===429||status>=500||/networkerror|failed to fetch|load failed|fetch resource/i.test(message);if(!transient)throw e;transportFailures++;updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(it&&it.syncIdentity===identity){it.syncStatus='processing';it.syncProviderStatus='PROCESSING';it.syncLastPollError=message;it.syncLastPollErrorAt=new Date().toISOString()}},{render:false});if(transportFailures>=8)return '';await sleep(Math.min(15000,1500*Math.pow(2,Math.min(transportFailures,3))));continue}
    if(d.status==='ready'){
      const providerUrl=d.videoUrl||'';if(!providerUrl)throw new Error('The speaking-shot synchronization completed without a video result.');
      const saved=await persistCoverageSyncMediaUrl(projectId,episodeId,sceneIndex,shot.id,providerUrl,{commit:false});
      updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(!it||it.syncIdentity!==identity||it.syncRequestDigest!==requestDigest)return;it.syncVideoUrl=providerUrl;it.syncRemoteVideoUrl=d.remoteVideoUrl||'';it.syncLocalMediaKey=saved.localKey;it.syncStoragePath=saved.storagePath;it.syncMediaPersistedAt=saved.persistedAt;it.syncMediaOwnership=saved.ownership;it.syncProvider=d.provider||request.provider||'sync-labs';it.syncModel=d.model||request.model||'';it.syncGenerationId=d.generationId||request.requestId||'';it.syncOperation=null;it.syncStatus='ready';it.syncProviderStatus='COMPLETED';it.syncValidated=true;it.syncProviderAudioAuthoritative=true;it.syncAutoPending=false;it.syncError='';it.syncLastPollError='';it.syncLastPollErrorAt=null;x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
      return saved.runtimeUrl||providerUrl;
    }
    if(d.queueStatus)updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(it&&it.syncIdentity===identity)it.syncProviderStatus=d.queueStatus},{render:false});
    if(d.status==='error'){const message=d.error||'Speaking-shot dialogue synchronization failed.';updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(!it||it.syncIdentity!==identity)return;it.syncOperation=null;it.syncStatus='error';it.syncProviderStatus=d.queueStatus||d.providerStatus||'FAILED';it.syncValidated=false;it.syncProviderAudioAuthoritative=false;it.syncAutoPending=false;it.syncError=message;it.syncFailedAt=new Date().toISOString()},{render:false});throw new Error(message);}
  }
  return '';
  })();
  coverageShotSyncPollsInFlight.set(pollKey,task);
  try{return await task}finally{if(coverageShotSyncPollsInFlight.get(pollKey)===task)coverageShotSyncPollsInFlight.delete(pollKey)}
}
async function ensureCoverageShotLipSync(projectId,episodeId,sceneIndex,shot,{onProgress}={}){
  if(!shot?.speaking)return '';
  let p=state.projects.find(x=>x.id===projectId),scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];if(!p||!scene)throw new Error('The scene disappeared before speaking-shot synchronization.');
  const primaryId=String(scene.videoPrimaryShotId||primaryCoverageShot(scene,finalTimelineMode(p))?.id||'');
  if(String(shot.id)===primaryId){
    if(!sceneHasValidatedLipSync(p,scene)){onProgress?.(`Synchronizing dialogue shot ${shot.order} for scene ${scene.number||sceneIndex+1}…`);const url=await ensureAutoFinalDialogueSync(projectId,episodeId,sceneIndex,{onProgress});p=state.projects.find(x=>x.id===projectId);scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];if(!url||!sceneHasValidatedLipSync(p,scene))throw new Error(`Scene ${scene?.number||sceneIndex+1} primary dialogue shot did not finish synchronization.`)}
    return sceneValidatedSyncPlaybackUrl(scene,p)||await hydrateSceneMedia(projectId,episodeId,sceneIndex,'sync');
  }
  let entry=coverageEntry(scene,shot.id);if(!entry)throw new Error(`Scene ${scene.number||sceneIndex+1} is missing generated coverage for speaking shot ${shot.order}.`);
  if(coverageShotSyncValid(p,scene,shot,entry)){const hydrated=coverageClipSyncUrl(entry)||await hydrateCoverageSyncMedia(projectId,episodeId,sceneIndex,shot.id);if(hydrated)return hydrated}
  const identity=coverageShotSyncIdentity(p,scene,shot,entry);
  if(entry.syncIdentity&&entry.syncIdentity!==identity){updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(!it)return;it.syncVideoUrl='';it.syncRemoteVideoUrl='';it.syncLocalMediaKey='';it.syncStoragePath='';it.syncMediaPersistedAt='';it.syncMediaOwnership='';it.syncOperation=null;it.syncGenerationId='';it.syncRequestDigest='';it.syncStatus='idle';it.syncProviderStatus='';it.syncValidated=false;it.syncProviderAudioAuthoritative=false;it.syncError='';it.syncIdentity=identity},{render:false});p=state.projects.find(x=>x.id===projectId);scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id)}
  const audioDataUrl=await coverageShotLipSyncAudioDataUrl(p,scene,shot),requestDigest=await strongStringDigest(`${identity}\n${audioDataUrl}`);
  let request=null;
  if(entry.syncOperation&&entry.syncRequestDigest===requestDigest&&entry.syncIdentity===identity)request={requestId:entry.syncOperation,provider:entry.syncProvider||'sync-labs',model:entry.syncModel||'',statusUrl:entry.syncStatusUrl||'',responseUrl:entry.syncResponseUrl||''};
  if(!request){onProgress?.(`Submitting dialogue shot ${shot.order} for scene ${scene.number||sceneIndex+1}…`);const sourceUrl=await ensureCoverageSourceForServer(projectId,episodeId,sceneIndex,shot.id);const d=await submitSceneLipSyncRequest(sourceUrl,audioDataUrl,identity,requestDigest,String(entry.videoStoragePath||''));if(d.status==='not_configured')throw new Error('Dialogue synchronization is not enabled on this deployment.');if(d.status==='busy')throw new Error('Dialogue synchronization is temporarily busy. CineTale preserved the speaking shot and will resume it later.');if(!d.requestId)throw new Error('The lip-sync provider did not return a request ID for a speaking shot.');request={requestId:d.requestId,provider:d.provider||'sync-labs',model:d.model||'',statusUrl:d.statusUrl||'',responseUrl:d.responseUrl||''};updateProjectById(projectId,x=>{const sc=findEpisodeById(x,episodeId)?.scenes?.[sceneIndex],it=sc?.coverageClips?.find(c=>c.shotId===shot.id);if(!it)return;it.syncIdentity=identity;it.syncRequestDigest=requestDigest;it.syncOperation=d.requestId;it.syncGenerationId=d.provider==='sync-labs'?d.requestId:(it.syncGenerationId||'');it.syncProvider=d.provider||'sync-labs';it.syncModel=d.model||'';it.syncStatusUrl=d.statusUrl||'';it.syncResponseUrl=d.responseUrl||'';it.syncStatus='processing';it.syncProviderStatus='PENDING';it.syncValidated=false;it.syncProviderAudioAuthoritative=false;it.syncAutoPending=true;it.syncError='';it.syncStartedAt=new Date().toISOString()},{render:false})}
  onProgress?.(`Finishing dialogue shot ${shot.order} for scene ${scene.number||sceneIndex+1}…`);const url=await pollCoverageShotLipSync(projectId,episodeId,sceneIndex,shot,request,{identity,requestDigest});p=state.projects.find(x=>x.id===projectId);scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(!url||!coverageShotSyncValid(p,scene,shot,entry))throw new Error(`Scene ${scene?.number||sceneIndex+1} speaking shot ${shot.order} did not finish synchronization.`);return url;
}
async function ensureSceneShotTimelineReady(projectId,episodeId,sceneIndex,tier,mode,onProgress){
  let p=state.projects.find(x=>x.id===projectId),scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];if(!p||!scene)return;const coverageMode=coverageModeFromAuto(mode),plan=ensureSceneCoverage(scene,coverageMode);
  for(let shotIndex=0;shotIndex<plan.length;shotIndex++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');await ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress)}
  p=state.projects.find(x=>x.id===projectId);scene=findEpisodeById(p,episodeId)?.scenes?.[sceneIndex];const livePlan=ensureSceneCoverage(scene,coverageMode);
  for(const shot of livePlan.filter(x=>x.speaking)){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');await ensureCoverageShotLipSync(projectId,episodeId,sceneIndex,shot,{onProgress})}
}

async function finalizeExistingSynchronizedAssetWithApprovedAudio(p,s,index,{quiet=true,userInitiated=false}={}){
  if(!p||!s?.lipSyncVideoUrl||!sceneHasSpokenContent(s)||s.lipSyncProviderAudioAuthoritative===true)return '';
  const projectId=p.id,episodeId=episodeOf(p)?.id||episodeOf(p)?.number,sceneId=s.id||'',signature=sceneLipSyncSignature(p,s);
  // Sync Labs creates the returned MP4 from the exact video + audio inputs submitted for this
  // generation. If the current signature/audio provenance still matches that paid request, the
  // provider output itself is the authoritative self-contained speaking clip. Do not re-record it
  // through browser MediaRecorder; that path is codec/browser-dependent and can make controls
  // unusable even though the provider result is already complete.
  syncDiag('provider-audio-adoption-start',p,s,{sceneIndex:index,userInitiated:Boolean(userInitiated),existingGenerationId:String(s.lipSyncGenerationId||'')});
  const providerUrl=s.lipSyncVideoUrl;
  await waitForVideoAsset(providerUrl);
  let savedSync=null;
  if(!sceneSyncDurablyOwned(s))savedSync=await persistSceneMediaUrl(projectId,episodeId,index,providerUrl,'sync',{render:false,commit:false});
  updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||sceneLipSyncSignature(x,t)!==signature||!sceneLipSyncResultLooksDistinct(t)||!sceneLipSyncAudioProvenanceValid(x,t))return;if(savedSync){t.lipSyncLocalMediaKey=savedSync.localKey;t.lipSyncStoragePath=savedSync.storagePath;t.lipSyncMediaPersistedAt=savedSync.persistedAt;t.lipSyncMediaOwnership=savedSync.ownership;t.lipSyncDurableVerifiedAt=savedSync.persistedAt}t.lipSyncProviderAudioAuthoritative=true;t.lipSyncEmbeddedAudioVerified=true;t.lipSyncAudioFinalizedAt=new Date().toISOString();t.lipSyncAudioFinalizeMethod='sync-provider-exact-approved-audio';t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null;t.lipSyncErrorCode='';t.lipSyncAutoPending=false},{render:false});
  const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
  if(!live||!liveScene||!sceneHasValidatedLipSync(live,liveScene))throw new Error('The completed synchronized provider clip could not be adopted with its exact approved audio contract.');
  syncDiag('provider-audio-authoritative',live,liveScene,{sceneIndex:index,storagePath:String(liveScene.lipSyncStoragePath||''),runtimeUrl:diagnosticUrl(sceneValidatedSyncPlaybackUrl(liveScene,live)),generationId:String(liveScene.lipSyncGenerationId||'')});
  if(!quiet&&current()?.id===projectId)toast(`Scene ${liveScene.number||index+1} is ready with its approved voice.`);
  return sceneValidatedSyncPlaybackUrl(liveScene,live)||liveScene.lipSyncVideoUrl||'';
}
async function ensureSceneLipSync(p,s,index,{quiet=false,allowSubmit=true,propagateErrors=false,userInitiated=false}={}){
  if(!p||!s?.videoUrl||!sceneHasSpokenContent(s))return '';
  const signature=sceneLipSyncSignature(p,s),sceneId=s.id||'';
  syncDiag('ensure-sync-start',p,s,{sceneIndex:index,userInitiated:Boolean(userInitiated),allowSubmit:Boolean(allowSubmit),quiet:Boolean(quiet),signature});
  if(!sceneVideoProductionProvenanceValid(p,s)){syncDiag('gate-source-provenance-failed',p,s,{sceneIndex:index,userInitiated:Boolean(userInitiated)});
    updateProjectById(p.id,x=>{const e=findEpisodeById(x,episodeOf(p)?.id||episodeOf(p)?.number),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncValidated=false;t.lipSyncStatus='error';t.lipSyncError='This speaking video predates CineTale’s strict character/shot identity contract. Regenerate this clip once before dialogue synchronization.';t.lipSyncErrorCode='legacy_video_identity_unverified';}},{render:false});
    return '';
  }
  if(sceneHasValidatedLipSync(p,s)){syncDiag('gate-already-validated',p,s,{sceneIndex:index});return s.lipSyncVideoUrl;}
  // A completed/pending sync tied to an older approved voice/performance must never be
  // audio-finalized with the new voice. Supersede that stale dialogue state and allow exactly one
  // automatic replacement submission while keeping the source video and its production contract.
  if(sceneHasSupersededDialogueSync(p,s)){
    const changed=supersedeStaleDialogueSyncForAutomaticRefresh(p,s,index);
    if(changed){
      p=state.projects.find(x=>x.id===p.id)||p;
      s=sceneAtIdentity(findEpisodeById(p,episodeOf(p)?.id||episodeOf(p)?.number),index,sceneId)||s;
      allowSubmit=true;
      syncDiag('auto-dialogue-refresh-authorized',p,s,{sceneIndex:index,reason:'approved-voice-or-performance-changed'});
    }
  }
  // Recover an already-paid synchronized render even when an older build left its
  // validation flag/signature stale. This performs a read-only asset check and never submits a job.
  if(sceneHasRecoverableLipSyncAsset(p,s)&&s.lipSyncVideoUrl){
    const recovered=await recoverSavedLipSyncAsset(p,s,index);
    if(recovered){p=state.projects.find(x=>x.id===p.id)||p;s=sceneAtIdentity(findEpisodeById(p,episodeOf(p)?.id||episodeOf(p)?.number),index,sceneId)||s;updateSceneMediaStatuses(p,episodeOf(p));if(sceneHasValidatedLipSync(p,s))return recovered;}
  }
  if(sceneHasCurrentLipSync(p,s)&&s.lipSyncVideoUrl){
    try{
      // Existing completed synchronized assets are finalized automatically with the exact
      // approved TTS. This is read-only with respect to the lip-sync provider: no new paid job.
      const finalized=await finalizeExistingSynchronizedAssetWithApprovedAudio(p,s,index,{quiet,userInitiated});
      if(finalized)return finalized;
    }catch(e){
      console.warn('[CineTale lipsync] Automatic approved-audio finalization paused; the source remains safe.',e);
      syncDiag('auto-audio-finalization-paused',p,s,{sceneIndex:index,userInitiated:Boolean(userInitiated),error:String(e?.message||e)});
      // Browser autoplay/AudioContext policy can block background finalization. Keep the completed
      // synchronized asset and retry from the user's natural Play gesture; never resubmit or mark
      // the silent/unfinalized file READY.
      updateProjectById(p.id,x=>{const e2=findEpisodeById(x,episodeOf(p)?.id||episodeOf(p)?.number),t=sceneAtIdentity(e2,index,sceneId);if(t){t.lipSyncValidated=false;t.lipSyncStatus='ready';t.lipSyncError=e?.message||String(e);t.lipSyncErrorCode='audio_finalization_pending'}},{render:false});
      if(!userInitiated)return '';
      if(propagateErrors)throw e;
      return '';
    }
  }
  if(s.lipSyncStatus==='error'&&s.lipSyncSignature===signature&&(s.lipSyncPlaybackFailedAt||s.lipSyncSubmissionFailedAt)){
    // Background hydration must not silently burn credits after a failed sync, but an explicit
    // Retry clip action must be allowed to recover. Earlier builds returned here even for
    // userInitiated=true, so the Retry button could never actually retry after a submission or
    // playback failure. Preserve the owned source video and voice choices; clear only the failed
    // synchronization attempt so the current exact production contract can be submitted again.
    if(!userInitiated){syncDiag('retry-blocked-background',p,s,{reason:'prior-failed-sync'});return '';}
    syncDiag('retry-user-reset',p,s,{reason:'prior-failed-sync'});
    updateProjectById(p.id,x=>{const e=findEpisodeById(x,episodeOf(p)?.id||episodeOf(p)?.number),t=sceneAtIdentity(e,index,sceneId);if(!t)return;t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncStatus='idle';t.lipSyncProviderStatus='';t.lipSyncError=null;t.lipSyncErrorCode='';t.lipSyncPlaybackFailedAt=null;t.lipSyncSubmissionFailedAt=null;t.lipSyncAutoPending=false;},{render:false});
  }
  const key=sceneLipSyncJobKey(p,s);
  if(lipSyncJobsInFlight.has(key)){
    syncDiag('inflight-sync-found',p,s,{sceneIndex:index,userInitiated:Boolean(userInitiated)});
    const existing=lipSyncJobsInFlight.get(key);
    if(!userInitiated)return existing;
    // A Retry click must not inherit an empty result from a background hydration task. Wait for the
    // existing task first (avoids duplicate provider submission); if it produced no validated sync,
    // continue with a fresh explicit attempt after that task has released the lock.
    const joined=await existing;
    const joinedProject=state.projects.find(x=>x.id===p.id)||p,joinedScene=sceneAtIdentity(findEpisodeById(joinedProject,episodeOf(p)?.id||episodeOf(p)?.number),index,sceneId)||s;
    syncDiag('inflight-sync-finished-for-retry',joinedProject,joinedScene,{sceneIndex:index,returnedUrl:diagnosticUrl(joined||''),validated:sceneHasValidatedLipSync(joinedProject,joinedScene)});
    if(joined&&sceneHasValidatedLipSync(joinedProject,joinedScene))return joined;
    p=joinedProject;s=joinedScene;
  }
  const task=(async()=>{
    const projectId=p.id,episodeId=episodeOf(p)?.id||episodeOf(p)?.number;
    try{
      // Resume a saved synchronization request before considering a new billable submission.
      let liveProject=state.projects.find(x=>x.id===projectId)||p,liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||s;
      // A user-initiated retry may have just cleared a persisted failed attempt above. Refreshing
      // here ensures we submit from the current scene state rather than the stale object passed
      // into ensureSceneLipSync().
      if(userInitiated){liveProject=state.projects.find(x=>x.id===projectId)||liveProject;liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||liveScene;}
      const productionContract=sceneVideoProductionContract(liveProject,liveScene);
      // Existing Sync Labs jobs from strict-contract builds remain valid when only the contract
      // schema/pipeline label changed. Preserve the exact submitted contract, but accept it for
      // polling only when every project/scene/shot/speaker/line/visual/cast identity field matches.
      if(liveScene?.lipSyncOperation&&liveScene?.lipSyncRequestDigest&&liveScene?.lipSyncProductionContract&&productionContractIdentityCompatible(liveScene.lipSyncProductionContract,productionContract)){
        syncDiag('existing-job-contract-compatible',liveProject,liveScene,{requestId:String(liveScene.lipSyncOperation||''),requestDigest:String(liveScene.lipSyncRequestDigest||'')});
      }
      let job=resumableSceneLipSyncJob(liveScene,signature);if(job)syncDiag('resumable-job-found',liveProject,liveScene,{requestId:String(job.requestId||''),provider:String(job.provider||''),status:String(liveScene?.lipSyncStatus||''),providerStatus:String(liveScene?.lipSyncProviderStatus||''),hasDigest:Boolean(job.requestDigest),hasContract:Boolean(job.productionContract)});
      if(job&&(!productionContractIdentityCompatible(job.productionContract,productionContract)||!job.requestDigest)){syncDiag('resumable-job-rejected',liveProject,liveScene,{requestId:String(job.requestId||''),contractCompatible:productionContractIdentityCompatible(job.productionContract,productionContract),hasDigest:Boolean(job.requestDigest)});job=null;}
      if(!job&&liveScene?.lipSyncStatus==='processing'&&liveScene?.lipSyncSignature===signature&&liveScene?.lipSyncOperation&&sceneLipSyncJobAgeMs(liveScene)>LIP_SYNC_JOB_STALE_MS){
        const retryCount=Math.max(0,Number(liveScene.lipSyncRetryCount)||0);
        if(retryCount>=1)throw new Error('Lip-sync provider did not finish the saved request. Change the scene voice or regenerate the source clip before retrying again.');
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t)return;t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncStatus='idle';t.lipSyncRetryCount=retryCount+1;t.lipSyncError='Previous lip-sync request expired before producing a usable result; retrying once.'},{render:false});
        liveProject=state.projects.find(x=>x.id===projectId)||p;liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||s;
      }
      if(!job){
        // Studio background warmup may resume/poll an existing paid job, but must never
        // start a new billable lip-sync generation without an explicit playback/final-render need.
        if(!allowSubmit){syncDiag('gate-submit-disabled',liveProject,liveScene,{sceneIndex:index,userInitiated:Boolean(userInitiated)});return '';}
        const activeScene=(findEpisodeById(liveProject,episodeId)?.scenes||[]).find((candidate,candidateIndex)=>candidateIndex!==index&&candidate?.lipSyncStatus==='processing'&&candidate?.lipSyncOperation&&candidate?.lipSyncSignature===sceneLipSyncSignature(liveProject,candidate));
        if(activeScene){syncDiag('gate-other-scene-processing',liveProject,liveScene,{sceneIndex:index,otherSceneId:String(activeScene.id||''),otherOperation:String(activeScene.lipSyncOperation||'')});
          updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncProviderStatus='WAITING_FOR_SLOT';t.lipSyncError=null}},{render:false});
          if(!quiet)toast('Another scene is finishing dialogue synchronization. This scene will stay on its safe source clip for now.');
          return '';
        }
        const audioDataUrl=await sceneLipSyncAudioDataUrl(liveProject,liveScene);if(!audioDataUrl){syncDiag('audio-empty',liveProject,liveScene);return '';}syncDiag('audio-ready',liveProject,liveScene,{audioBytes:String(audioDataUrl).length});
        const audioDigest=await strongStringDigest(audioDataUrl),audioSignature=sceneLipSyncSignature(liveProject,liveScene);
        if(audioSignature!==signature)throw new Error('Scene dialogue changed while synchronization audio was being prepared. CineTale stopped the stale sync request.');
        const requestDigest=await strongStringDigest(`${productionContract}\n${signature}\n${audioDataUrl}`);
        const videoUrl=await ensureSceneSourceForServer(projectId,episodeId,index);syncDiag('source-ready-for-server',liveProject,liveScene,{videoUrl:diagnosticUrl(videoUrl)});
        const refreshedProject=state.projects.find(x=>x.id===projectId)||liveProject,refreshedScene=sceneAtIdentity(findEpisodeById(refreshedProject,episodeId),index,sceneId)||liveScene;
        const sourceStoragePath=String(refreshedScene?.videoStoragePath||'');
        const d=await submitSceneLipSyncRequest(videoUrl,audioDataUrl,signature,requestDigest,sourceStoragePath);syncDiag('submit-accepted-to-client',refreshedProject,refreshedScene,{requestId:String(d.requestId||''),responseStatus:String(d.status||''),provider:String(d.provider||''),model:String(d.model||'')});
        if(d.status==='not_configured'){const err=new Error('Dialogue synchronization is not enabled on this deployment. Enable CineTale lip-sync in the production environment before finishing speaking clips.');err.code='lipsync_not_configured';throw err}
        if(d.status==='busy'){
          updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncStatus='waiting';t.lipSyncProviderStatus='WAITING_FOR_SLOT';t.lipSyncError='Dialogue synchronization is temporarily busy. Your source video is safe; retry the clip shortly.';t.lipSyncErrorCode='lipsync_busy'}},{render:false});
          if(userInitiated){const err=new Error('Dialogue synchronization is temporarily busy. Your source video is safe; retry the clip shortly.');err.code='lipsync_busy';throw err}
          if(!quiet)toast('Dialogue synchronization is busy with another scene. CineTale will not submit a duplicate job.');
          return '';
        }
        if(!d.requestId)throw new Error('Lip-sync provider did not return a queue request ID.');
        // Carry the exact request identity into the in-memory job immediately. Previously the
        // persisted scene was updated, but this local `liveScene` reference remained stale. A newly
        // accepted Sync Labs job therefore had no requestDigest in `job` and no digest on the stale
        // scene reference, so CineTale threw before the very first status poll. That left the UI on
        // the muted provider source forever even though the provider job had already been accepted.
        job={requestId:d.requestId,provider:d.provider||'',model:d.model||'',statusUrl:d.statusUrl||'',responseUrl:d.responseUrl||'',requestDigest,productionContract};
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t)return;t.lipSyncOperation=d.requestId;t.lipSyncGenerationId=d.provider==='sync-labs'?d.requestId:(t.lipSyncGenerationId||'');t.lipSyncStatusUrl=d.statusUrl||'';t.lipSyncResponseUrl=d.responseUrl||'';t.lipSyncModel=d.model||'';t.lipSyncStartedAt=new Date().toISOString();t.lipSyncStatus='processing';t.lipSyncProviderStatus='PENDING';t.lipSyncSignature=signature;t.lipSyncAudioSignature=audioSignature;t.lipSyncAudioDigest=audioDigest;t.lipSyncRequestDigest=requestDigest;t.lipSyncProductionContract=productionContract;t.lipSyncRecoveryCompatibility='';t.lipSyncRecoveredAt=null;t.lipSyncProvider=d.provider||'sync-labs';t.lipSyncSourceVideoUrl=t.videoUrl||'';t.lipSyncValidated=false;t.lipSyncPlaybackFailedAt=null;t.lipSyncSubmissionFailedAt=null;t.lipSyncErrorCode='';t.lipSyncError=null;t.lipSyncAutoPending=false},{render:false});
        // Refresh the live references after persistence so all subsequent validation/polling sees
        // the exact job identity that was just committed.
        liveProject=state.projects.find(x=>x.id===projectId)||liveProject;
        liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||liveScene;
      }
      const activeRequestDigest=String(job.requestDigest||liveScene?.lipSyncRequestDigest||'');const activeProductionContract=String(job.productionContract||liveScene?.lipSyncProductionContract||productionContract||''),currentProductionContract=sceneVideoProductionContract(liveProject,liveScene),contractMatches=productionContractIdentityCompatible(activeProductionContract,currentProductionContract);
      syncDiag('pre-poll-contract-check',liveProject,liveScene,{requestId:String(job.requestId||''),hasRequestDigest:Boolean(activeRequestDigest),jobContract:String(activeProductionContract||''),currentContract:String(currentProductionContract||''),contractMatches});
      if(!activeRequestDigest||!contractMatches)throw new Error('Lip-sync job is missing the exact production identity contract for this scene.');
      syncDiag('poll-start',liveProject,liveScene,{requestId:String(job.requestId||''),requestDigest:activeRequestDigest,productionContract:activeProductionContract});
      const url=await pollSceneLipSync(projectId,episodeId,index,job,signature,activeRequestDigest,activeProductionContract,sceneId);
      if(!url){syncDiag('poll-ended-without-url',liveProject,liveScene,{requestId:String(job.requestId||'')});return '';}
      syncDiag('sync-url-received',liveProject,liveScene,{requestId:String(job.requestId||''),url:diagnosticUrl(url)});
      await waitForVideoAsset(url);syncDiag('sync-url-playable',liveProject,liveScene,{url:diagnosticUrl(url)});
      // The provider output was generated from the exact approved audio payload identified by
      // this signature/request digest. Persist that completed MP4 directly; do not make browser
      // MediaRecorder support a release requirement.
      const savedSync=await persistSceneMediaUrl(projectId,episodeId,index,url,'sync',{render:false,commit:false});
      syncDiag('sync-persisted',liveProject,liveScene,{storagePath:String(savedSync.storagePath||''),ownership:String(savedSync.ownership||''),runtimeUrl:diagnosticUrl(savedSync.runtimeUrl||''),providerApprovedAudio:true});
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||t.lipSyncSignature!==signature||!sceneLipSyncResultLooksDistinct(t)||!sceneLipSyncAudioProvenanceValid(x,t))return;t.lipSyncLocalMediaKey=savedSync.localKey;t.lipSyncStoragePath=savedSync.storagePath;t.lipSyncMediaPersistedAt=savedSync.persistedAt;t.lipSyncMediaOwnership=savedSync.ownership;t.lipSyncDurableVerifiedAt=savedSync.persistedAt;t.lipSyncProviderAudioAuthoritative=true;t.lipSyncEmbeddedAudioVerified=true;t.lipSyncAudioFinalizedAt=new Date().toISOString();t.lipSyncAudioFinalizeMethod='sync-provider-exact-approved-audio';t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null;t.lipSyncErrorCode=''},{render:false});
      liveProject=state.projects.find(x=>x.id===projectId)||liveProject;liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||liveScene;
      syncDiag('provider-audio-authoritative',liveProject,liveScene,{sceneIndex:index,generationId:String(liveScene.lipSyncGenerationId||''),runtimeUrl:diagnosticUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject))});
      liveProject=state.projects.find(x=>x.id===projectId);liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId);
      if(!liveProject||!liveScene||!sceneHasValidatedLipSync(liveProject,liveScene))throw new Error('Lip-sync result could not be validated as a distinct playable synchronized asset.');
      syncDiag('sync-authoritative',liveProject,liveScene,{runtimeUrl:diagnosticUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject)),storagePath:String(liveScene.lipSyncStoragePath||'')});
      // The render lock prevents active playback from being destroyed. Once safe, the next
      // render/player mount must prefer this validated synchronized asset over the old source pin.
      updateSceneMediaStatuses(liveProject,findEpisodeById(liveProject,episodeId));
      if(!quiet)toast('Dialogue synchronization is ready.');
      return url;
    }catch(e){
      console.warn('[CineTale lipsync]',e);
      const diagProject=state.projects.find(x=>x.id===projectId)||p,diagScene=sceneAtIdentity(findEpisodeById(diagProject,episodeId),index,sceneId)||s;syncDiag('ensure-sync-error',diagProject,diagScene,{error:String(e?.message||e),errorCode:String(e?.code||e?.details?.errorCode||''),httpStatus:Number(e?.status)||null,details:e?.details||null,userInitiated:Boolean(userInitiated)});
      const safeError=userSafeLipSyncError(e);
      updateProjectById(projectId,x=>{const ep=findEpisodeById(x,episodeId),t=sceneAtIdentity(ep,index,sceneId);if(t){const hadJob=Boolean(t.lipSyncOperation);t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncStatus='error';t.lipSyncError=safeError.message;t.lipSyncErrorCode=safeError.code;if(!hadJob)t.lipSyncSubmissionFailedAt=new Date().toISOString()}},{render:false});
      if(!quiet)toast(safeError.message);
      if(propagateErrors){const safe=new Error(safeError.message);safe.code=safeError.code;throw safe}
      return '';
    }finally{lipSyncJobsInFlight.delete(key)}
  })();
  lipSyncJobsInFlight.set(key,task);return task;
}

function autoFinalDialogueSyncActive(scene={}){const status=String(scene.lipSyncStatus||'').toLowerCase(),provider=String(scene.lipSyncProviderStatus||'').toUpperCase();return Boolean(scene.lipSyncOperation||['processing','waiting','preparing'].includes(status)||['PENDING','PROCESSING','WAITING_FOR_SLOT'].includes(provider))}
async function ensureAutoFinalDialogueSync(projectId,episodeId,index,{onProgress,maxWaitMs=20*60*1000}={}){
  const started=Date.now();let cycle=0;
  while(Date.now()-started<maxWaitMs){
    if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');
    let project=state.projects.find(x=>x.id===projectId),episode=findEpisodeById(project,episodeId),scene=episode?.scenes?.[index];
    if(!project||!scene)throw new Error('A selected scene is no longer available.');
    if(sceneHasValidatedLipSync(project,scene))return sceneValidatedSyncPlaybackUrl(scene,project)||scene.lipSyncVideoUrl||'';
    const sceneNo=scene.number||index+1,active=autoFinalDialogueSyncActive(scene);
    const label=active?`Finishing scene ${sceneNo} of ${selectedFinalScenes(episode).length} · synchronizing dialogue…`:`Finishing scene ${sceneNo} of ${selectedFinalScenes(episode).length} · preparing dialogue synchronization…`;
    onProgress?.(label);
    autoFinalJobPatch(projectId,{status:'running',stage:label,lastError:''});
    const result=await ensureSceneLipSync(project,scene,index,{quiet:true,allowSubmit:true,propagateErrors:false});
    project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId);scene=episode?.scenes?.[index];
    if(project&&scene&&sceneHasValidatedLipSync(project,scene))return sceneValidatedSyncPlaybackUrl(scene,project)||result||scene.lipSyncVideoUrl||'';
    if(!scene)throw new Error('A selected scene is no longer available.');
    const definitiveError=scene.lipSyncStatus==='error'&&!scene.lipSyncOperation&&!['lipsync_busy',''].includes(String(scene.lipSyncErrorCode||''));
    if(definitiveError)throw new Error(scene.lipSyncError||`Scene ${sceneNo} dialogue synchronization failed.`);
    cycle++;
    syncDiag('auto-final-sync-wait',project,scene,{sceneIndex:index,cycle,hasOperation:Boolean(scene.lipSyncOperation),status:String(scene.lipSyncStatus||''),providerStatus:String(scene.lipSyncProviderStatus||'')});
    await sleep(Math.min(6000,2500+cycle*250));
  }
  const project=state.projects.find(x=>x.id===projectId),episode=findEpisodeById(project,episodeId),scene=episode?.scenes?.[index];
  throw new Error(`Scene ${scene?.number||index+1} is still synchronizing. CineTale preserved the active job; keep this project open or reopen it to continue automatically.`);
}
function scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,index,{announce=true}={}){
  updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t&&t.videoUrl&&sceneHasSpokenContent(t))t.lipSyncAutoPending=true},{render:false});
  setTimeout(async()=>{
    const project=state.projects.find(x=>x.id===projectId),episode=findEpisodeById(project,episodeId),scene=episode?.scenes?.[index];
    if(!project||!scene?.videoUrl||!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene))return;
    try{
      if(announce&&current()?.id===projectId)toast(`Video ready. Finalizing dialogue for scene ${scene.number||index+1}…`);
      await ensureSceneLipSync(project,scene,index,{quiet:true,allowSubmit:true});
      const live=state.projects.find(x=>x.id===projectId),liveEpisode=findEpisodeById(live,episodeId),liveScene=liveEpisode?.scenes?.[index];
      if(!live||!liveScene)return;
      if(sceneHasValidatedLipSync(live,liveScene)){
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t)t.lipSyncAutoPending=false},{render:false});
        if(current()?.id===projectId){renderStudioAfterSceneMediaUpdate(index);updateSceneMediaStatuses(live,liveEpisode);renderFinalAssembly(live,liveEpisode);toast(`Scene ${liveScene.number||index+1} dialogue synchronization is ready.`)}
      }else if(liveScene.lipSyncOperation){
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t)t.lipSyncAutoPending=false},{render:false});
      }else if(liveScene.lipSyncAutoPending===true&&liveScene.lipSyncProviderStatus==='WAITING_FOR_SLOT'){
        setTimeout(()=>scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,index,{announce:false}),6000);
      }
    }catch(e){console.warn('[CineTale lipsync] Automatic post-video synchronization paused',e)}
  },250);
}
function sceneHasSpokenContent(scene={}){return Boolean(dialogueText(scene.narration).trim()||dialogueEntries(scene.dialogue).some(line=>dialogueParts(line).text))}
function muteProviderGuideAudio(video,ctl){if(!video||!ctl)return;if(ctl.providerMuteApplied)return;ctl.previousMuted=Boolean(video.muted);video.muted=true;ctl.providerMuteApplied=true;video.dataset.providerGuideMuted='1'}
function restoreProviderGuideAudio(video,ctl){if(!video||!ctl||!ctl.providerMuteApplied)return;video.muted=Boolean(ctl.previousMuted);ctl.providerMuteApplied=false;delete video.dataset.providerGuideMuted}
function stopSceneVideoVoicePlayback(video,{keepIntent=false,restoreProviderAudio=true}={}){const ctl=sceneVideoAudioControllers.get(video);if(!ctl)return;ctl.token=(ctl.token||0)+1;for(const src of ctl.sources||[]){try{src.stop()}catch{}}ctl.sources=[];if(!keepIntent)ctl.requestedPlay=false;if(restoreProviderAudio)restoreProviderGuideAudio(video,ctl)}
function liveSceneAt(index){const p=current(),ep=episodeOf(p);return {project:p,scene:ep?.scenes?.[index]||null}}
function waitForVideoAsset(url,{timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
    const probe=document.createElement('video');let settled=false;
    const finish=(ok,error)=>{if(settled)return;settled=true;clearTimeout(timer);probe.onloadedmetadata=probe.oncanplay=probe.onerror=null;try{probe.removeAttribute('src');probe.load()}catch{}ok?resolve(true):reject(error||new Error('Synchronized video could not be loaded.'))};
    const timer=setTimeout(()=>finish(false,new Error('Synchronized video took too long to verify.')),timeoutMs);
    probe.preload='metadata';probe.playsInline=true;probe.onloadedmetadata=()=>finish(true);probe.oncanplay=()=>finish(true);probe.onerror=()=>finish(false,new Error('Synchronized video is not playable in this browser.'));probe.src=url;try{probe.load()}catch(e){finish(false,e)}
  });
}
function markSceneLipSyncPlaybackError(projectId,index,message){
  updateProjectById(projectId,x=>{const e=episodeOf(x),t=e?.scenes?.[index];if(!t)return;t.lipSyncStatus='error';t.lipSyncError=message||'Synchronized video playback failed.';t.lipSyncPlaybackFailedAt=new Date().toISOString()},{render:false});
}
async function adoptSceneLipSyncVideo(video,index,{resumeVideo=true,preserveTime=true}={}){
  const {project,scene}=liveSceneAt(index);if(!project||!scene||!sceneHasValidatedLipSync(project,scene))return false;
  const desired=scenePrimaryVideoUrl(scene,project),currentSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||''),desiredSrc=normalizedMediaUrl(desired);
  if(!desired||!desiredSrc)return false;
  let ctl=sceneVideoAudioControllers.get(video);
  if(!ctl){ctl={sources:[],token:0,requestedPlay:false,preparing:false,track:null,providerMuteApplied:false,previousMuted:false,adopting:false,gating:false};sceneVideoAudioControllers.set(video,ctl)}
  if(ctl.adopting)return false;
  // Never replace the active media element while a source clip is visibly playing.
  // The synchronized asset is prevalidated in the background and adopted only while paused/ended.
  if(!video.paused&&!video.ended){video.dataset.lipSyncPendingAdoption='1';return false}
  if(currentSrc===desiredSrc){validatedLipSyncUrls.add(desiredSrc);for(const src of ctl.sources||[]){try{src.stop()}catch{}}ctl.sources=[];ctl.track=null;restoreProviderGuideAudio(video,ctl);video.removeAttribute('data-sync-gated');video.defaultMuted=false;video.muted=false;video.removeAttribute('muted');video.volume=1;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';return true}
  ctl.adopting=true;
  const oldTime=Math.max(0,Number(video.currentTime)||0),oldRawSrc=video.currentSrc||video.getAttribute('src')||scene.videoUrl||'',wasPlaying=resumeVideo&&(!video.paused||ctl.requestedPlay);
  try{
    // Atomic handoff: verify the rendered synchronized asset before touching the currently working source clip.
    await waitForVideoAsset(desired);
    validatedLipSyncUrls.add(desiredSrc);
    const live=liveSceneAt(index);if(!live.project||!live.scene||!sceneHasValidatedLipSync(live.project,live.scene)||normalizedMediaUrl(scenePrimaryVideoUrl(live.scene,live.project))!==desiredSrc)return false;
    for(const src of ctl.sources||[]){try{src.stop()}catch{}}ctl.sources=[];ctl.track=null;restoreProviderGuideAudio(video,ctl);
    video.dataset.lipSyncSwitching='1';video.src=desired;video.load();
    await new Promise((resolve,reject)=>{let done=false;const finish=(ok)=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener('loadedmetadata',onReady);video.removeEventListener('error',onError);ok?resolve():reject(new Error('Synchronized video could not replace the source clip.'))};const onReady=()=>finish(true),onError=()=>finish(false);const timer=setTimeout(()=>finish(false),12000);video.addEventListener('loadedmetadata',onReady,{once:true});video.addEventListener('error',onError,{once:true})});
    if(preserveTime&&oldTime>0&&Number.isFinite(video.duration)){try{video.currentTime=Math.min(oldTime,Math.max(0,video.duration-.08))}catch{}}
    video.removeAttribute('data-sync-gated');video.defaultMuted=false;video.muted=false;video.removeAttribute('muted');video.volume=1;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';delete video.dataset.lipSyncSwitching;delete video.dataset.lipSyncPendingAdoption;
    updateProjectById(project.id,x=>{const e=episodeOf(x),t=e?.scenes?.[index];if(t){t.lipSyncStatus='ready';t.lipSyncValidated=true;t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null}},{render:false});
    if(wasPlaying){try{await video.play()}catch{}}
    return true;
  }catch(e){
    console.warn('[CineTale lipsync] Verified handoff failed; keeping/restoring the original scene video.',e);
    delete video.dataset.lipSyncSwitching;markSceneLipSyncPlaybackError(project.id,index,e?.message||String(e));
    const nowSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'');
    if(oldRawSrc&&nowSrc===desiredSrc){try{video.src=oldRawSrc;video.load();await new Promise(resolve=>{if(video.readyState>=1)return resolve();const done=()=>{video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',done);resolve()};video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',done,{once:true});setTimeout(done,3000)});if(oldTime>0&&Number.isFinite(video.duration))video.currentTime=Math.min(oldTime,Math.max(0,video.duration-.08));if(wasPlaying)await video.play().catch(()=>{})}catch{}}
    // Keep the working source clip mounted; never fall back to a detached audio overlay.
    return false;
  }finally{ctl.adopting=false}
}
const studioLipSyncWarmups=new Set();
const STUDIO_LIPSYNC_MIGRATION_REV='v1.9.62';
function authorizeUnsyncedSpeakingScenesOnStudioOpen(project,episode){
  // Opening Studio is not consent to spend additional lip-sync credits. Freshly generated
  // source clips are explicitly authorized by scheduleSceneLipSyncAfterSourceReady(), which
  // persists lipSyncAutoPending so a reload can safely resume that already-requested step.
  // Older unsynchronized projects remain reviewable without silently starting new paid work.
  return false;
}

const studioCoverageSyncWarmups=new Set();
function scheduleStudioCoverageSyncWarmup(project,episode){
  if(!project?.id||!episode)return;const episodeId=episode.id||episode.number,key=`${project.id}:${episodeId}`;if(studioCoverageSyncWarmups.has(key))return;
  const pending=[];for(let index=0;index<(episode.scenes||[]).length;index++){const scene=episode.scenes[index];for(const shot of sceneCoveragePlan(scene||{},'balanced').filter(x=>x?.speaking)){if(shotIsPrimary(scene,shot))continue;const entry=coverageEntry(scene,shot.id);if(entry?.syncOperation&&!coverageShotSyncValid(project,scene,shot,entry))pending.push({index,shotId:String(shot.id)})}}
  if(!pending.length)return;studioCoverageSyncWarmups.add(key);
  const run=async()=>{try{for(const item of pending){const live=state.projects.find(x=>x.id===project.id),ep=findEpisodeById(live,episodeId),scene=ep?.scenes?.[item.index],shot=sceneCoveragePlan(scene||{},'balanced').find(x=>String(x.id)===item.shotId);if(!live||!scene||!shot)continue;const entry=coverageEntry(scene,shot.id);if(!entry?.syncOperation||coverageShotSyncValid(live,scene,shot,entry))continue;try{await ensureCoverageShotLipSync(live.id,episodeId,item.index,shot,{onProgress:()=>{}});if(current()?.id===live.id)refreshSceneShotProductionState(live.id,episodeId,item.index)}catch(e){console.warn('[CineTale coverage sync] Saved dialogue job recovery paused',e)}}}finally{studioCoverageSyncWarmups.delete(key)}};
  if('requestIdleCallback' in window)requestIdleCallback(()=>void run(),{timeout:1800});else setTimeout(()=>void run(),1200);
}
function scheduleStudioLipSyncWarmup(project,episode){
  if(!project?.id||!episode||state.finalRenderRunning)return;
  if(previewSequenceLocks.has(previewSequenceKey(project,episode)))return;
  const episodeId=episode.id||episode.number,key=`${project.id}:${episodeId}`;
  if(studioLipSyncWarmups.has(key))return;
  const pending=(episode.scenes||[]).map((scene,index)=>({scene,index})).filter(({scene})=>scene?.videoUrl&&scene.finalIncluded!==false&&sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project,scene));
  if(!pending.length)return;
  studioLipSyncWarmups.add(key);
  const runRecovery=async()=>{
    try{
      // Studio-open recovery is READ ONLY: validate/recover already-paid synchronized assets
      // and resume already-saved jobs, but never submit a fresh billable lip-sync request.
      await Promise.allSettled(pending.map(async({index})=>{
        const liveProject=state.projects.find(x=>x.id===project.id),liveEpisode=findEpisodeById(liveProject,episodeId),liveScene=liveEpisode?.scenes?.[index];
        if(!liveProject||!liveScene?.videoUrl||!sceneHasSpokenContent(liveScene)||sceneHasValidatedLipSync(liveProject,liveScene))return;
        // Background recovery never changes an on-screen player. It may validate an already-paid
        // synchronized asset, but adoption is deferred until the scene is mounted again. This prevents asynchronous
        // source changes/flicker inside an already-visible player.
        await ensureSceneLipSync(liveProject,liveScene,index,{quiet:true,allowSubmit:liveScene.lipSyncAutoPending===true});
      }));
    }catch(e){console.warn('[CineTale lipsync] Background saved-dialogue recovery paused',e)}
    finally{
      studioLipSyncWarmups.delete(key);
      const liveProject=state.projects.find(x=>x.id===project.id),liveEpisode=findEpisodeById(liveProject,episodeId);
      if(current()?.id===project.id&&liveProject&&liveEpisode)updateSceneMediaStatuses(liveProject,liveEpisode);
    }
  };
  // Video visibility wins over background provider recovery. Let scene players mount/decode first
  // so provider/status traffic does not compete with their initial metadata/frame requests.
  if('requestIdleCallback' in window)requestIdleCallback(()=>void runRecovery(),{timeout:1800});
  else setTimeout(()=>void runRecovery(),1200);
}
function bindSceneVideoVoicePlayback(p,ep){
  const list=$('#sceneList');if(!list)return;
  list.querySelectorAll('video[data-scene-video-preview]').forEach(video=>{
    fitSceneVideoToSurface(video);
    const surface=video.closest?.('.scene-visual');
    const shield=()=>surface?.querySelector?.('[data-scene-media-shield="1"]');
    const setRestoreStatus=(title='Opening saved video…',detail='CineTale is loading the preserved asset. No new video will be generated.',mode='loading')=>{const guard=shield(),status=guard?.querySelector?.('[data-scene-media-restore-status]');if(!guard||!status)return;guard.dataset.restoreMode=mode;const b=status.querySelector('b'),small=status.querySelector('small'),retry=status.querySelector('[data-scene-media-retry]');if(b)b.textContent=title;if(small)small.textContent=detail;if(retry)retry.hidden=mode!=='error';guard.setAttribute('aria-label',title)};
    const markSceneMediaLoading=()=>{video.dataset.sceneMediaLoading='1';surface?.classList.remove('media-loaded','media-error');const guard=shield();if(guard)guard.hidden=false;setRestoreStatus()};
    const markSceneMetadata=()=>fitSceneVideoToSurface(video);
    const markSceneMediaLoaded=()=>{
      fitSceneVideoToSurface(video);
      video.dataset.sceneMediaLoading='0';
      surface?.classList.add('media-loaded');
      surface?.classList.remove('media-error');
      const guard=shield();if(guard)guard.hidden=true;
    };
    if(video.dataset.mediaLifecycleBound!=='1'){
      video.dataset.mediaLifecycleBound='1';
      video.addEventListener('loadstart',markSceneMediaLoading);
      video.addEventListener('emptied',markSceneMediaLoading);
      video.addEventListener('loadedmetadata',markSceneMetadata);
      // Reveal the real player only once the browser has decoded a frame. Metadata alone is not enough.
      video.addEventListener('loadeddata',markSceneMediaLoaded);
      video.addEventListener('canplay',markSceneMediaLoaded);
    }
    if(video.readyState>=2)markSceneMediaLoaded();else{markSceneMediaLoading();setTimeout(()=>{if(video.isConnected&&video.readyState<2&&video.dataset.sceneMediaLoading==='1')setRestoreStatus('Saved video is preserved','Opening this saved clip is taking longer than expected. You can continue working and retry the preview when needed.','error')},12000)}
    const retryRestore=shield()?.querySelector?.('[data-scene-media-retry]');
    if(retryRestore&&retryRestore.dataset.bound!=='1'){
      retryRestore.dataset.bound='1';
      retryRestore.addEventListener('click',async event=>{
        event.preventDefault();event.stopPropagation();retryRestore.disabled=true;retryRestore.textContent='Restoring…';setRestoreStatus('Restoring saved video…','CineTale is retrying the existing saved asset. No new generation is being submitted.','recovering');surface?.classList.remove('media-error');
        try{const restored=await hydrateSceneMedia(p.id,ep?.id||ep?.number,index,'source');if(restored){video.src=restored;video.load();return}setRestoreStatus('Saved video needs recovery','CineTale could not reopen the saved asset. No new video was generated.','error')}catch(e){setRestoreStatus('Saved video needs recovery','CineTale could not reopen the saved asset. No new video was generated.','error');console.warn('[CineTale scene media] Manual restore failed',e)}finally{retryRestore.disabled=false;retryRestore.textContent='Retry restore'}
      });
    }
    if(video.dataset.voiceBound==='1')return;video.dataset.voiceBound='1';const index=Number(video.dataset.sceneVideoPreview);const scene=ep?.scenes?.[index];if(!scene)return;
    const mountedSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'');
    const mountedLive=liveSceneAt(index),mountedProject=mountedLive.project||p,mountedScene=mountedLive.scene||scene;
    const mountedDesired=normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(mountedScene,mountedProject));
    const mountedAuthoritativeSync=Boolean(mountedProject&&mountedScene&&sceneHasValidatedLipSync(mountedProject,mountedScene)&&mountedDesired&&mountedSrc===mountedDesired);
    syncDiag('player-bound',mountedProject,mountedScene,{sceneIndex:index,currentSrc:diagnosticUrl(video.currentSrc||video.getAttribute('src')||''),desiredSync:diagnosticUrl(sceneValidatedSyncPlaybackUrl(mountedScene,mountedProject)),mountedAuthoritativeSync,domLipSyncReady:video.dataset.lipSyncReady||'',syncGated:video.dataset.syncGated||'',muted:Boolean(video.muted),defaultMuted:Boolean(video.defaultMuted),volume:Number(video.volume)});
    if(mountedAuthoritativeSync||video.dataset.lipSyncReady==='1'){
      // Runtime truth wins over stale DOM state. A finished synchronized player owns its embedded
      // dialogue audio even if it inherited preview attributes during hydration or a scene-local patch.
      video.removeAttribute('data-sync-gated');video.dataset.lipSyncReady='1';video.defaultMuted=false;video.muted=false;video.removeAttribute('muted');video.volume=1;video.dataset.voiceSync='provider';
    }
    const syncGated=video.dataset.syncGated==='1';
    if(syncGated){
      // An unsynchronized source is a VISUAL preview only. Never fake finished dialogue by
      // layering a separately-timed TTS track over unrelated mouth motion. The Listen button
      // is the authoritative voice preview until a validated synchronized clip exists.
      video.muted=true;
      video.dataset.voiceSync='visual-only';
      video.addEventListener('volumechange',()=>{if(video.dataset.syncGated==='1'&&!video.muted)video.muted=true});
      // The unfinished speaking source remains a visual-only preview, but it must still behave like
      // a video. Users can click/tap it (or press Enter/Space) to play/pause while CineTale finalizes
      // the approved-voice lip-sync automatically. Never disable pointer interaction on a visible video.
      const toggleVisualPreview=()=>{if(video.paused||video.ended){if(video.ended)try{video.currentTime=0}catch{};void video.play().catch(()=>{});}else{try{video.pause()}catch{}}};
      video.addEventListener('click',toggleVisualPreview);
      video.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleVisualPreview();}});
    }
    video.addEventListener('play',()=>{
      video.dataset.playerSession='1';
      const diagLive=liveSceneAt(index);syncDiag('player-play',diagLive.project||p,diagLive.scene||scene,{sceneIndex:index,currentSrc:diagnosticUrl(video.currentSrc||video.getAttribute('src')||''),muted:Boolean(video.muted),defaultMuted:Boolean(video.defaultMuted),volume:Number(video.volume),lipSyncReady:video.dataset.lipSyncReady||'',syncGated:video.dataset.syncGated||''});
      let ctl=sceneVideoAudioControllers.get(video);if(!ctl){ctl={sources:[],token:0,requestedPlay:true,preparing:false,track:null,providerMuteApplied:false,previousMuted:Boolean(video.muted),adopting:false,gating:false};sceneVideoAudioControllers.set(video,ctl)}else ctl.requestedPlay=true;
      const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;
      // If a completed synchronized visual exists but approved-audio embedding was blocked in the
      // background, use the user's ordinary Play gesture to finish it transparently. There is no
      // separate Complete clip button and no new provider submission.
      if(sceneHasSpokenContent(liveScene)&&liveScene?.lipSyncVideoUrl&&sceneHasCurrentLipSync(liveProject,liveScene)&&liveScene.lipSyncEmbeddedAudioVerified!==true){
        try{video.pause()}catch{}
        syncDiag('player-triggered-audio-finalization',liveProject,liveScene,{sceneIndex:index,userInitiated:true});
        // Resume AudioContext immediately while transient user activation is still present.
        void ensureSceneVideoAudioContext().then(()=>ensureSceneLipSync(liveProject,liveScene,index,{quiet:false,allowSubmit:false,propagateErrors:false,userInitiated:true})).then(async()=>{
          const done=liveSceneAt(index),doneProject=done.project||liveProject,doneScene=done.scene||liveScene;
          if(doneProject&&doneScene&&sceneHasValidatedLipSync(doneProject,doneScene)){if(current()?.id===doneProject.id)renderStudioAfterSceneMediaUpdate(index);const mounted=document.querySelector(`video[data-scene-video-preview="${index}"]`);if(mounted){await adoptSceneLipSyncVideo(mounted,index,{resumeVideo:false,preserveTime:false}).catch(()=>false);try{await mounted.play()}catch{}}}
        }).catch(e=>console.warn('[CineTale lipsync] Play-triggered audio finalization paused',e));
        return;
      }
      const currentSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||''),desired=normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject));
      if(video.dataset.lipSyncReady==='1'||(desired&&currentSrc===desired)){restoreProviderGuideAudio(video,ctl);video.removeAttribute('data-sync-gated');video.defaultMuted=false;video.muted=false;video.removeAttribute('muted');video.volume=1;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';syncDiag('player-authoritative-audio-enabled',liveProject,liveScene,{sceneIndex:index,currentSrc:diagnosticUrl(video.currentSrc||video.getAttribute('src')||''),muted:Boolean(video.muted),defaultMuted:Boolean(video.defaultMuted),volume:Number(video.volume)});return}
      if(desired&&currentSrc!==desired){
        // Never replace an attached player's source from a native play event. Even a deliberate
        // pause/load/play handoff flashes in Firefox and can restart decoding. Keep this mounted
        // preview stable for the current Studio session; the validated synchronized asset becomes
        // authoritative on the next clean mount/navigation, where it is selected before playback.
        video.dataset.lipSyncPendingAdoption='1';
      }
      if(sceneHasSpokenContent(liveScene)){
        // Until lip-sync is validated, source playback is visual-only. Approved dialogue is
        // reviewed via Listen; finished speaking playback comes from one synchronized media file.
        muteProviderGuideAudio(video,ctl);
        video.muted=true;
        video.dataset.voiceSync='visual-only';
      }
    });
    video.addEventListener('pause',()=>{const ctl=sceneVideoAudioControllers.get(video);if(ctl?.adopting)return;delete video.dataset.playerSession;stopSceneVideoVoicePlayback(video,{keepIntent:false,restoreProviderAudio:true})});
    video.addEventListener('seeking',()=>{const ctl=sceneVideoAudioControllers.get(video);if(!ctl||ctl.adopting)return;const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;const desired=normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject));if(desired&&normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'')===desired)return;stopSceneVideoVoicePlayback(video,{keepIntent:!video.paused,restoreProviderAudio:false});muteProviderGuideAudio(video,ctl);video.muted=true;video.dataset.voiceSync='visual-only'});
    video.addEventListener('error',()=>{
      markSceneMediaLoading();
      const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;if(!liveProject||!liveScene)return;
      const failed=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||''),sync=normalizedMediaUrl(sceneValidatedSyncPlaybackUrl(liveScene,liveProject)),source=normalizedMediaUrl(sceneMediaRuntimeUrl(liveScene,'source')||'');
      const failedValidatedSync=Boolean(sync&&failed===sync);
      if(failedValidatedSync)markSceneLipSyncPlaybackError(liveProject.id,index,'The finished synchronized clip could not be opened. The owned source was preserved and was not substituted as a silent finished scene.');
      // A validated speaking result is atomic. Never replace it with the silent source or coverage
      // when playback fails; that makes a broken sync look successful. Unsynchronized scenes may
      // still recover among their owned visual candidates.
      setRestoreStatus('Restoring saved video…','CineTale is retrying the existing saved asset. No new generation is being submitted.','recovering');
      recoverMountedSceneMedia(video,index,liveProject,liveScene,failed).then(recovered=>{
        if(recovered)return;
        setRestoreStatus('Saved video needs recovery','CineTale could not reopen the saved asset yet. Retry restore before considering any regeneration.','error');surface?.classList.add('media-error');
        if(failedValidatedSync){if(current()?.id===liveProject.id)renderStudioAfterSceneMediaUpdate(index);return}
        updateProjectById(liveProject.id,x=>{const e=episodeOf(x),t=e?.scenes?.[index];if(t){t.videoMediaExpired=true;t.videoPlaybackError='The saved source video could not be reopened. Retry restore first; CineTale will not regenerate automatically.'}},{render:false});
        if(current()?.id===liveProject.id)renderStudioAfterSceneMediaUpdate(index);
      }).catch(e=>{setRestoreStatus('Saved video needs recovery','CineTale could not reopen the saved asset yet. Retry restore before considering any regeneration.','error');surface?.classList.add('media-error');console.warn('[CineTale scene media] Recovery probe failed',e)});
    });
    video.addEventListener('ended',()=>{
      // Playback completion must be visually inert: no source swap, no Studio remount, no
      // card re-render. A validated synchronized clip is adopted on the next normal mount.
      stopSceneVideoVoicePlayback(video,{restoreProviderAudio:false});
      const live=liveSceneAt(index);delete video.dataset.playerSession;
      updateSceneMediaStatuses(live.project||p,episodeOf(live.project||p));
    });
  })
}
function playAudioUrl(url){return new Promise(async(resolve,reject)=>{if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}const a=new Audio(url);activeAudio=a;try{const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx){previewAudioContext=previewAudioContext||new Ctx();await previewAudioContext.resume();const src=previewAudioContext.createMediaElementSource(a),compressor=previewAudioContext.createDynamicsCompressor(),gain=previewAudioContext.createGain();compressor.threshold.value=-24;compressor.knee.value=18;compressor.ratio.value=3;gain.gain.value=1.32;src.connect(compressor);compressor.connect(gain);gain.connect(previewAudioContext.destination)}}catch(e){console.warn('[CineTale audio] enhanced playback unavailable; using normal browser playback',e)}a.onended=()=>{if(activeAudio===a)activeAudio=null;resolve()};a.onerror=()=>{if(activeAudio===a)activeAudio=null;reject(new Error('Audio playback failed.'))};a.play().catch(reject)})}
function audioCacheKey(kind,payload){return `${kind}:${JSON.stringify(payload)}`}
async function cachedAudioRequest(endpoint,payload,kind='tts'){
  const key=audioCacheKey(kind,payload);
  if(audioPreviewCache.has(key))return {...audioPreviewCache.get(key),__cached:true};
  if(audioRequestInFlight.has(key))return audioRequestInFlight.get(key);
  const request=apiPost(endpoint,payload).then(d=>{if(d?.mode==='ai'&&d.audio)audioPreviewCache.set(key,d);return d}).finally(()=>audioRequestInFlight.delete(key));
  audioRequestInFlight.set(key,request);return request;
}
async function speakText(text,voiceId,options={}){
  const spoken=String(text||'').trim();if(!spoken||!requireApprovedStory('generate or preview audio'))return;
  try{
    const payload={text:spoken,voiceId,kind:options.kind||'dialogue',direction:options.direction||'',language:options.language||current()?.language||'English',speakerProfile:options.speakerProfile||''};
    const d=await cachedAudioRequest('/api/tts',payload,'tts');
    if(d.mode==='ai'&&d.audio){if(!d.__cached)bumpUsage('audio');await playAudioUrl(d.audio);return d}
    if(d.mode==='browser'&&'speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(spoken);u.rate=options.kind==='narration'?.94:.98;speechSynthesis.speak(u);return d}
    throw new Error('Natural voice generation is not configured for this project.');
  }catch(e){toast(e.message||'Natural voice preview could not start.');throw e}
}
function characterIndexForSpeaker(p,speaker=''){const match=resolveCharacterIdentity(p,{speaker});return match.status==='resolved'?match.index:-1}
async function scenePlaybackItems(p,s){
  const items=[];const direction=sceneAudioDirection(s);
  const narration=dialogueText(s.narration).trim();
  if(narration){const nv=await ensureNarratorVoice(p);items.push({text:narration,voiceId:nv?.voiceId,kind:'narration',direction:narratorVoiceDirection(p,s),speakerProfile:['project narrator',p.narratorVoiceName,p.narratorPerformance,p.narratorPace].filter(Boolean).join('. ')})}
  const dialogueEntriesForScene=dialogueEntries(s.dialogue);
  for(let lineIndex=0;lineIndex<dialogueEntriesForScene.length;lineIndex++){
    const line=dialogueEntriesForScene[lineIndex],{speaker,text}=dialogueParts(line);if(!text)continue;const idx=resolveDialogueCharacterIndex(p,s,line,lineIndex);const assigned=idx>=0?await ensureCharacterVoice(p,idx):null;const liveProject=state.projects.find(x=>x.id===p.id)||p;const c=idx>=0?liveProject.characters?.[idx]:null;
    const resolvedVoiceId=c?.voiceId||assigned?.voiceId||'';const characterDirection=c?characterVoiceDirection(c,p):'';items.push({text,voiceId:resolvedVoiceId,characterId:c?.id||'',speakerName:c?.name||speaker,kind:'dialogue',direction:[direction,characterDirection].filter(Boolean).join('. '),speakerProfile:c?[c.name,c.age,c.personality,c.voice,c.voicePerformance,c.voicePace,c.voiceName].filter(Boolean).join('. '):speaker});
  }
  return items;
}
async function playSceneAudio(p,s,{dialogueOnly=false}={}){
  const items=await scenePlaybackItems(p,s);if(!items.length)return false;
  const narration=items.filter(x=>x.kind==='narration'),dialogue=items.filter(x=>x.kind==='dialogue');
  const missingCharacterVoice=dialogue.find(x=>x.speakerName&&!x.voiceId);if(missingCharacterVoice)throw new Error(`No suitable approved voice is available for ${missingCharacterVoice.speakerName}. Open Voice Studio, broaden the filters deliberately, or keep Auto until a suitable library voice is connected.`);
  const missingNarratorVoice=narration.find(x=>!x.voiceId);if(missingNarratorVoice)throw new Error('No suitable narrator voice supports the project language. Open Narrator Voice Studio or connect a compatible voice; CineTale will not substitute an unrelated default narrator.');
  // Scene-card Listen is a character-performance preview. When dialogue exists, never prepend
  // narrator audio; that made a male narrator appear to be part of Maya's selected voice preview.
  // Full episode narration remains available through narrateEpisode().
  if(!dialogueOnly||!dialogue.length)for(const item of narration)await speakText(item.text,item.voiceId,{...item,language:p.language});
  if(dialogue.length>=2&&dialogue.every(x=>x.voiceId&&!String(x.voiceId).startsWith('browser-'))){
    try{const payload={language:p.language,turns:dialogue.map(x=>({text:x.text,voiceId:x.voiceId,direction:x.direction}))};const d=await cachedAudioRequest('/api/dialogue',payload,'dialogue');if(d.mode==='ai'&&d.audio){if(!d.__cached)bumpUsage('audio');await playAudioUrl(d.audio);return true}}catch(e){console.warn('[CineTale audio] Natural dialogue endpoint unavailable; falling back to expressive per-line TTS',{message:e?.message||String(e)})}
  }
  for(const item of dialogue)await speakText(item.text,item.voiceId,{...item,language:p.language});
  return Boolean(dialogue.length||narration.length);
}
async function playSelectedShotAudio(p,s,shot){
  if(!shot?.speaking)return false;
  const spoken=String(shot.spokenLine||'').trim();if(!spoken)return false;
  const speaker=String(shot.speaker||'').trim();
  let idx=characterIndexForSpeaker(p,speaker);
  if(idx<0){
    const entries=dialogueEntries(s.dialogue),matchIndex=entries.findIndex(line=>{const parts=dialogueParts(line);return String(parts.text||'').trim()===spoken||normalizeSpeakerAlias(parts.speaker)===normalizeSpeakerAlias(speaker)});
    if(matchIndex>=0)idx=resolveDialogueCharacterIndex(p,s,entries[matchIndex],matchIndex);
  }
  const assigned=idx>=0?await ensureCharacterVoice(p,idx):null,liveProject=state.projects.find(x=>x.id===p.id)||p,c=idx>=0?liveProject.characters?.[idx]:null;
  const voiceId=c?.voiceId||assigned?.voiceId||'';
  if(!voiceId)throw new Error(`No approved character voice is assigned to ${speaker||'this speaking shot'}.`);
  const direction=[sceneAudioDirection(s),c?characterVoiceDirection(c,p):''].filter(Boolean).join('. ');
  await speakText(spoken,voiceId,{kind:'dialogue',direction,language:p.language,characterId:c?.id||'',speakerName:c?.name||speaker,speakerProfile:c?[c.name,c.age,c.personality,c.voice,c.voicePerformance,c.voicePace,c.voiceName].filter(Boolean).join('. '):speaker});
  return true;
}
async function listenScene(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s)return;const shot=selectedStudioShot(s),listenState=selectedShotListenState(s);
  if(shot&&!shot.speaking){toast(`Shot ${shot.order} is visual-only and has no dialogue.`);if(button){button.textContent=listenState.label;button.disabled=true;button.title=listenState.title}return}
  $('#sceneList')?.querySelectorAll('video[data-scene-video-preview]').forEach(v=>{if(!v.paused)try{v.pause()}catch{}stopSceneVideoVoicePlayback(v)});const old=button?.textContent;if(button){button.disabled=true;button.classList.add('audio-loading');button.textContent='Preparing dialogue…'}
  const slowHint=setTimeout(()=>{if(button?.disabled)button.textContent='Generating natural voice…'},850);
  try{const played=shot?await playSelectedShotAudio(p,s,shot):await playSceneAudio(p,s,{dialogueOnly:true});if(!played){toast('This selection has no spoken dialogue.');return}updateProject(x=>x.narrationPlayed=true)}catch(e){console.warn('[CineTale audio] Dialogue preview failed',{message:e?.message||String(e)});toast(e?.message||'Character voice preview could not start.')}finally{clearTimeout(slowHint);if(button){const now=selectedShotListenState(s);button.disabled=now.disabled;button.classList.remove('audio-loading');button.textContent=now.label||old||'▶ Listen';button.title=now.title}}
}
async function narrateEpisode(){
  const p=current(),ep=episodeOf(p);if(!ep)return;
  try{for(const s of (ep.scenes||[]))await playSceneAudio(p,s);updateProject(x=>x.narrationPlayed=true);toast(`${formatConfig(p.format||'Episode').title} audio preview complete.`)}catch(e){toast(e?.message||'Audio preview could not start because a suitable voice is unavailable.')}
}
function openSceneAudioEditor(index,selectedShotId=''){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[index];if(!s)return;
  const selectedShot=sceneCoveragePlan(s,'balanced').find(x=>String(x.id)===String(selectedShotId||s.studioSelectedShotId||''))||selectedStudioShot(s);
  const lines=dialogueList(s.dialogue).join('\n');
  const sourceEntries=dialogueEntries(s.dialogue);
  const speakerIndexes=[...new Set(sourceEntries.map((line,lineIndex)=>resolveDialogueCharacterIndex(p,s,line,lineIndex)).filter(idx=>idx>=0))];
  const speakerButtons=speakerIndexes.map(idx=>`<button type="button" class="scene-speaker-voice" data-edit-scene-speaker="${idx}">Voice · ${esc(p.characters[idx].name)}</button>`).join('');
  const audioVoiceButtons=`<div class="scene-speaker-voices"><button type="button" class="scene-speaker-voice narrator" id="sceneNarratorVoice">Narrator voice</button>${speakerButtons}</div>`;
  const selectedShotNote=selectedShot?`<div class="scene-selected-performance-note"><b>Selected Shot ${Number(selectedShot.order)||''}${selectedShot.speaking&&selectedShot.speaker?` · ${esc(selectedShot.speaker)}`:''}</b><span>${selectedShot.speaking?esc(String(selectedShot.spokenLine||'').trim()):'Visual-only shot · no spoken dialogue'}</span></div>`:'';
  $('#modalBody').innerHTML=`<form class="modal-form" id="sceneAudioForm"><h2>Edit performance</h2><p>Adjust the words, who speaks them, and how the moment should feel. Voice identity stays consistent unless you deliberately change it in Voice Studio.</p>${selectedShotNote}${audioVoiceButtons}<label class="field"><span>Narration</span><textarea id="sceneNarration" placeholder="Optional narration">${esc(dialogueText(s.narration)||'')}</textarea></label><label class="field"><span>Dialogue · one speaker line per row</span><textarea id="sceneDialogue" rows="6" placeholder="Zoya: What is this?">${esc(lines)}</textarea></label><label class="field"><span>Scene performance direction</span><input id="sceneAudioDirection" value="${esc(s.audioDirection||sceneAudioDirection(s))}" placeholder="Quiet, uneasy curiosity; intimate, conversational"></label><label class="field"><span>Narrator style</span><input id="sceneNarrationStyle" value="${esc(s.narrationStyle||'warm, restrained storyteller; natural pacing')}" placeholder="Warm, restrained storyteller"></label><div class="modal-actions"><button type="button" class="ghost" id="sceneAudioCancel">Cancel</button><button type="button" class="ghost" id="sceneAudioPreview">Preview</button><button class="primary" type="submit">Save performance</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#sceneAudioCancel').onclick=closeModal;$('#sceneNarratorVoice').onclick=()=>openNarratorVoicePicker();$$('[data-edit-scene-speaker]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.editSceneSpeaker)));
  $('#sceneAudioForm').onsubmit=e=>{e.preventDefault();const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);updateProject(x=>{const target=episodeOf(x)?.scenes?.[index];if(!target)return;target.narration=$('#sceneNarration').value.trim();target.dialogue=dialogue;target.audioDirection=$('#sceneAudioDirection').value.trim();target.narrationStyle=$('#sceneNarrationStyle').value.trim();bindSceneDialogueCharacters(x,target,{preserveExisting:true});invalidateStudioStages(x,'audio')});closeModal();toast('Scene dialogue and delivery saved. Audio review is required again before production.')};
  $('#sceneAudioPreview').onclick=async()=>{const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const temp={...s,narration:$('#sceneNarration').value.trim(),dialogue,audioDirection:$('#sceneAudioDirection').value.trim(),narrationStyle:$('#sceneNarrationStyle').value.trim(),dialogueBindings:structuredClone(s.dialogueBindings||[])};bindSceneDialogueCharacters(p,temp,{preserveExisting:true});try{for(const item of await scenePlaybackItems(p,temp))await speakText(item.text,item.voiceId,{...item,language:p.language})}catch{}};
}
function selectedFinalScenes(ep){return (ep?.scenes||[]).map((s,i)=>({scene:s,index:i})).filter(x=>x.scene.finalIncluded!==false)}
function assemblySceneData(p,ep){return selectedFinalScenes(ep).map(({scene:s,index:i})=>{const sources=sceneVideoSources(s,p);return {index:i,number:s.number||i+1,title:s.title||`Scene ${i+1}`,durationSec:Number(s.durationSec)||0,narrativeBeatSec:Number(s.durationSec)||0,videoDurationSec:Number(s.videoDurationSec)||0,videoUrl:scenePrimaryVideoUrl(s,p)||null,coverageShotCount:sources.length,coveragePlanCount:sceneCoveragePlan(s,'balanced').length,videoUrls:sources,voiceSummary:sceneVoiceSummary(p,s),music:s.music||'',sfx:s.sfx||''}})}
function finalAssemblyManifest(p,ep){
  const scenes=assemblySceneData(p,ep),canon=Array.isArray(p?.worldBible?.canon)?p.worldBible.canon.filter(Boolean):[];
  return {
    version:3,
    preparedAt:new Date().toISOString(),
    coverageMode:finalTimelineMode(p),
    projectId:p?.id||null,
    projectTitle:p?.title||'Untitled',
    format:p?.format||'Episode',
    episodeId:ep?.id||null,
    episodeNumber:ep?.number??null,
    episodeTitle:ep?.title||null,
    sceneCount:scenes.length,
    targetNarrativeRuntimeSec:Number(p?.targetRuntimeSec)||durationTargetSeconds(p?.duration),
    totalPlannedNarrativeBeatSec:scenes.reduce((sum,scene)=>sum+(Number(scene.narrativeBeatSec)||0),0),
    generatedClipDurationSec:scenes.reduce((sum,scene)=>sum+(Number(scene.videoDurationSec)||0),0),
    scenes,
    voices:{
      narrator:sceneVoiceSummary(p,{}),
      characters:(p?.characters||[]).map(c=>({name:c.name||'Character',voiceName:c.voiceName||null,voiceLocked:!!c.voiceLocked,performance:c.voicePerformance||'Natural'}))
    },
    continuity:{strength:p?.continuityStrength||'strict',canon},
    production:{efficientFallbackUsed:selectedFinalScenes(ep).some(({scene})=>scene.videoRoute==='efficient-fallback')}
  }
}
function setSceneFinalIncluded(i,included){updateProject(x=>{const e=episodeOf(x),s=e?.scenes?.[i];if(!s)return;s.finalIncluded=!!included;x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null});toast(included?'Scene included in the final production.':'Scene skipped. CineTale will not require a video clip for it.')}
function finalVideoAssetKey(p,ep){return `${p?.id||'project'}:${ep?.id||ep?.number||'active'}`}
function openFinalVideoDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){resolve(null);return}const req=indexedDB.open(finalVideoDbName,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveFinalVideoBlob(key,blob,meta){const db=await openFinalVideoDb();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put({blob,meta},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function loadFinalVideoBlob(key){const db=await openFinalVideoDb();if(!db)return null;const value=await new Promise((resolve,reject)=>{const tx=db.transaction('videos','readonly');const req=tx.objectStore('videos').get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();return value}
const finalVideoBucket='cinetale-final-videos';
function finalVideoFilename(p,mime='video/webm'){const ext=/mp4/i.test(mime)?'mp4':'webm';return `${(p?.title||'cinetale').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'cinetale'}-final.${ext}`}
function finalVideoCloudPath(p,ep,filename,createdAt=new Date().toISOString()){const uid=authUser()?.id;if(!uid)return '';const safe=v=>String(v||'item').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,96)||'item';const stamp=String(createdAt).replace(/[^0-9TZ]/g,'').slice(0,18);return `${uid}/${safe(p?.id)}/${safe(ep?.id||ep?.number||'active')}/${stamp}-${safe(filename)}`}
function finalVideoStorageReady(){return Boolean(authUser()?.id&&state.authConfig?.configured&&state.authSession?.access_token)}
async function supabaseStorageObject(path,{method='GET',body,contentType='application/octet-stream',upsert=false}={}){if(!finalVideoStorageReady())throw new Error('Cloud final-video storage requires sign-in.');await refreshAuthIfNeeded();const c=state.authConfig,token=state.authSession?.access_token,base=String(c.url||'').replace(/\/+$/,'');const encoded=String(path||'').split('/').map(encodeURIComponent).join('/');const r=await fetch(`${base}/storage/v1/object/${finalVideoBucket}/${encoded}`,{method,headers:{apikey:c.anonKey,Authorization:`Bearer ${token}`,...(body?{'Content-Type':contentType,'cache-control':'3600',...(upsert?{'x-upsert':'true'}:{})}: {})},body});if(!r.ok){let detail='';try{const d=await r.json();detail=d?.message||d?.error||d?.statusCode||''}catch{detail=await r.text().catch(()=> '')}const err=new Error(detail||`Final-video cloud storage failed (${r.status}).`);err.status=r.status;throw err}return r}

function sceneMediaCloudPath(p,ep,scene,kind='source',mime='video/mp4',versionTag=''){const uid=authUser()?.id;if(!uid)return '';const safe=v=>String(v||'item').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,96)||'item';const ext=/webm/i.test(mime)?'webm':/matroska/i.test(mime)?'mkv':'mp4';const ver=safe(versionTag||`${Date.now()}`);return `${uid}/${safe(p?.id)}/${safe(ep?.id||ep?.number||'active')}/scene-media/${safe(scene?.id||scene?.number||'scene')}-${safe(kind)}-${ver}.${ext}`}
async function signedSceneMediaUrl(path,expiresIn=900){if(!path||!finalVideoStorageReady())return '';await refreshAuthIfNeeded();const c=state.authConfig,token=state.authSession?.access_token,base=String(c.url||'').replace(/\/+$/,'');const encoded=String(path).split('/').map(encodeURIComponent).join('/');const r=await fetch(`${base}/storage/v1/object/sign/${finalVideoBucket}/${encoded}`,{method:'POST',headers:{apikey:c.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn})});if(!r.ok)return '';const d=await r.json().catch(()=>({}));const signed=d.signedURL||d.signedUrl||'';return signed?new URL(signed,base).href:''}
async function sceneMediaBlobFromLocal(scene={},kind='source'){
  const localKey=kind==='sync'?scene.lipSyncLocalMediaKey:scene.videoLocalMediaKey;
  let blob=null;
  if(localKey){try{blob=await loadSceneMediaBlob(localKey)}catch(e){console.warn('[CineTale media] Browser media lookup failed',e)}}
  if(!blob?.size){const runtime=sceneMediaRuntimeUrl(scene,kind);if(runtime&&String(runtime).startsWith('blob:')){try{const r=await fetch(runtime);if(r.ok)blob=await r.blob()}catch(e){console.warn('[CineTale media] Runtime media lookup failed',e)}}}
  if(blob?.size)blob=await normalizeVideoBlobForPlayback(blob);
  return blob?.size&&await playableVideoBlob(blob)?blob:null;
}
async function repairSceneCloudMedia(projectId,episodeId,index,kind='source'){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];
  if(!p||!ep||!scene||!finalVideoStorageReady())return '';
  const pathField=kind==='sync'?'lipSyncStoragePath':'videoStoragePath',localField=kind==='sync'?'lipSyncLocalMediaKey':'videoLocalMediaKey';
  let storagePath=String(scene[pathField]||''),blob=null;
  if(storagePath){
    try{
      const rr=await supabaseStorageObject(storagePath,{method:'GET'}),cloudBlob=await rr.blob();
      const normalized=await normalizeVideoBlobForPlayback(cloudBlob);
      if(normalized?.size&&await playableVideoBlob(normalized)){
        if(scene[localField])await saveSceneMediaBlob(scene[localField],normalized).catch(()=>{});
        if(scene[localField]||storagePath)setSceneMediaRuntimeUrl(scene[localField]||storagePath,normalized);
        const signed=await signedSceneMediaUrl(storagePath,1200);if(signed)return signed;
      }
    }catch(e){
      if(Number(e?.status)!==404)console.warn('[CineTale media] Stored scene copy could not be reopened; attempting repair',e);
    }
  }
  blob=await sceneMediaBlobFromLocal(scene,kind);
  if(!blob)return '';
  if(!storagePath)storagePath=sceneMediaCloudPath(p,ep,scene,kind,blob.type||'video/mp4',`repair-${Date.now().toString(36)}`);
  const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:true});await up.text().catch(()=> '');
  const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob(),normalized=await normalizeVideoBlobForPlayback(verifiedBlob);
  if(!normalized?.size||!await playableVideoBlob(normalized))throw new Error('CineTale repaired the saved scene file, but the repaired copy could not be verified as playable video.');
  const persistedAt=new Date().toISOString();
  updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(!t)return;if(kind==='sync'){t.lipSyncStoragePath=storagePath;t.lipSyncMediaOwnership='cloud';t.lipSyncMediaPersistedAt=t.lipSyncMediaPersistedAt||persistedAt;t.lipSyncDurableVerifiedAt=persistedAt;t.lipSyncCloudMissing=false}else{t.videoStoragePath=storagePath;t.videoMediaOwnership='cloud';t.videoMediaPersistedAt=t.videoMediaPersistedAt||persistedAt;t.videoDurableVerifiedAt=persistedAt;t.videoMediaExpired=false;t.videoCloudMissing=false;t.videoPlaybackError=null}},{render:false});
  const live=state.projects.find(x=>x.id===projectId),liveScene=findEpisodeById(live,episodeId)?.scenes?.[index];if(liveScene)setSceneMediaRuntimeUrl((kind==='sync'?liveScene.lipSyncLocalMediaKey:liveScene.videoLocalMediaKey)||storagePath,normalized);
  return await signedSceneMediaUrl(storagePath,1200);
}
async function ensureSceneSourceForServer(projectId,episodeId,index){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!p||!ep||!scene)throw new Error('The scene disappeared before dialogue synchronization could start.');
  if(finalVideoStorageReady()){
    const repaired=await repairSceneCloudMedia(projectId,episodeId,index,'source');if(repaired)return repaired;
  }
  const localBlob=await sceneMediaBlobFromLocal(scene,'source');
  if(localBlob&&finalVideoStorageReady()){
    const repaired=await repairSceneCloudMedia(projectId,episodeId,index,'source');if(repaired)return repaired;
  }
  if(scene.videoUrl&&!scene.videoMediaExpired){
    try{
      const saved=await persistSceneMediaUrl(projectId,episodeId,index,scene.videoUrl,'source',{render:false,commit:true});
      const live=state.projects.find(x=>x.id===projectId),liveScene=findEpisodeById(live,episodeId)?.scenes?.[index];
      if(saved&&liveScene?.videoStoragePath){const signed=await signedSceneMediaUrl(liveScene.videoStoragePath,1200);if(signed)return signed}
    }catch(e){console.warn('[CineTale media] Legacy source rescue failed',e)}
  }
  updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(!t)return;t.videoCloudMissing=true;t.videoMediaExpired=true;t.videoPlaybackError='The saved source video is no longer available in CineTale storage or this browser. Recreate this clip once; the replacement will be verified before it is used.';t.lipSyncStatus='error';t.lipSyncError='Source video needs one-time recreation before dialogue can be finished.';t.lipSyncErrorCode='source_media_missing'},{render:false});
  const err=new Error('The saved source video is no longer available. Recreate this clip once; CineTale will verify and preserve the replacement before finishing dialogue.');err.code='source_media_missing';throw err;
}
async function persistSceneMediaUrl(projectId,episodeId,index,url,kind='source',{render=true,commit=true,shotId='primary'}={}){
  const normalized=normalizedMediaUrl(url||''),versionTag=`${hashString(normalized).toString(16)}-${Date.now().toString(36)}`;
  const jobKey=`${projectId}:${episodeId}:${index}:${kind}:${shotId}:${normalized}`;if(!url)return null;if(sceneMediaPersistInFlight.has(jobKey))return sceneMediaPersistInFlight.get(jobKey);
  const job=(async()=>{
    const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!p||!ep||!scene)throw new Error('The scene disappeared before its generated media could be saved.');
    const localKey=sceneMediaRecordKey(p,ep,scene,kind,`${shotId}-${versionTag}`);let r;
    try{r=await fetch(url,{cache:'no-store'})}catch(e){throw new Error('Generated video finished, but CineTale could not download it for durable storage. The temporary provider result was not adopted.')}
    if(!r.ok)throw new Error(`Generated video finished, but durable storage download failed (${r.status}). The temporary provider result was not adopted.`);
    let blob=await r.blob();blob=await normalizeVideoBlobForPlayback(blob);if(!await playableVideoBlob(blob))throw new Error('Generated video finished, but the returned file was not a playable video. The temporary provider result was not adopted.');
    const localSaved=await saveSceneMediaBlob(localKey,blob);if(!localSaved&&!finalVideoStorageReady())throw new Error('CineTale could not save a durable browser copy of the generated video. The scene was not marked ready.');
    const runtimeUrl=setSceneMediaRuntimeUrl(localKey,blob);let storagePath='',ownership=localSaved?'browser':'';
    if(finalVideoStorageReady()){
      storagePath=sceneMediaCloudPath(p,ep,scene,kind,blob.type||'video/mp4',`${shotId}-${versionTag}`);
      try{
        const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:true});await up.text().catch(()=> '');
        const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob();
        if(!await playableVideoBlob(verifiedBlob))throw new Error('The account-saved copy could not be reopened as playable video.');
        ownership='cloud';
      }catch(e){throw new Error(`CineTale generated the clip, but could not verify the account-saved copy. The scene was not marked ready. ${String(e?.message||e)}`)}
    }
    const result={localKey,storagePath,blob,runtimeUrl,ownership,persistedAt:new Date().toISOString(),providerUrl:url};
    if(commit){
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(!t)return;if(kind==='sync'){t.lipSyncLocalMediaKey=localKey;t.lipSyncStoragePath=storagePath;t.lipSyncMediaPersistedAt=result.persistedAt;t.lipSyncMediaOwnership=ownership}else{t.videoLocalMediaKey=localKey;t.videoStoragePath=storagePath;t.videoMediaPersistedAt=result.persistedAt;t.videoMediaOwnership=ownership;t.videoMediaExpired=false;t.videoPlaybackError=null}},{render:false});
      if(render&&current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index);
    }
    return result;
  })().finally(()=>sceneMediaPersistInFlight.delete(jobKey));sceneMediaPersistInFlight.set(jobKey,job);return job;
}
function pendingPrimaryVideoPatch(scene={}){const meta=scene.videoPendingPrimaryMeta&&typeof scene.videoPendingPrimaryMeta==='object'?scene.videoPendingPrimaryMeta:{};const contract=String(scene.videoPendingProductionContract||'');return {...meta,...(contract?{videoProductionContract:contract}:{}),videoSpeechGuide:scene.videoPendingSpeechGuide===true||meta.videoPrimarySpeaking===true}}
function clearPendingPrimaryVideoState(scene={}){delete scene.videoPendingPrimaryMeta;delete scene.videoPendingProductionContract;delete scene.videoPendingSpeechGuide}
function claimCompletedPrimaryVideo(projectId,episodeId,index,operation,providerUrl,patch={}){
  let claimed=false;updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(!t)return;if(operation&&t.videoOperation&&t.videoOperation!==operation)return;const pending=pendingPrimaryVideoPatch(t);Object.assign(t,pending,patch||{});t.videoUrl=providerUrl;t.videoOperation=null;t.videoQueuedAt=null;t.videoProviderCompletedAt=t.videoProviderCompletedAt||new Date().toISOString();t.videoRecoveryState='saving';t.videoError=null;t.videoErrorCode=null;claimed=true},{render:false});return claimed;
}
function claimCompletedCoverageVideo(projectId,episodeId,index,shotId,operation,providerUrl){
  let claimed=false;
  updateProjectById(projectId,x=>{
    const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[index];if(!scene)return;
    const clips=coverageClips(scene),item=coverageEntryForOperation(scene,shotId,operation);if(!item)return;
    const superseded=[...new Set([
      ...(Array.isArray(item.videoSupersededOperations)?item.videoSupersededOperations:[]),
      ...clips.filter(c=>c?.shotId===shotId&&c?.operation&&c.operation!==operation).map(c=>c.operation)
    ].filter(Boolean))];
    const merged={...item,shotId,videoUrl:providerUrl,operation:null,queuedAt:null,videoProviderCompletedAt:item.videoProviderCompletedAt||new Date().toISOString(),videoRecoveryState:'saving',error:null,errorCode:null,errorRetryable:null,failedAt:null,videoSupersededOperations:superseded};
    scene.coverageClips=clips.filter(c=>c?.shotId!==shotId);scene.coverageClips.push(merged);claimed=true;
  },{render:false});
  return claimed;
}
async function commitPrimarySceneVideo(projectId,episodeId,index,providerUrl,{operation=null,patch={},announce=true}={}){
  try{
    const saved=await persistSceneMediaUrl(projectId,episodeId,index,providerUrl,'source',{render:false,commit:false});
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(!target)return;if(operation&&target.videoOperation&&target.videoOperation!==operation)return;const pending=pendingPrimaryVideoPatch(target);resetSceneLipSyncForNewSource(target,providerUrl);Object.assign(target,pending,patch);clearPendingPrimaryVideoState(target);target.videoUrl=providerUrl;target.videoOperation=null;target.videoQueuedAt=null;target.videoProviderCompletedAt=target.videoProviderCompletedAt||new Date().toISOString();target.videoRecoveryState='ready';target.videoError=null;target.videoErrorCode=null;target.videoPlaybackError=null;target.videoLocalMediaKey=saved.localKey;target.videoStoragePath=saved.storagePath;target.videoMediaPersistedAt=saved.persistedAt;target.videoMediaOwnership=saved.ownership;target.videoMediaExpired=false;target.videoCloudMissing=false;target.videoDurableVerifiedAt=saved.persistedAt;x.videoStatus='ready';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
    if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index);scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,index);if(announce)toast('Scene video is saved and ready.');return providerUrl;
  }catch(e){
    updateProjectById(projectId,x=>{const ep=findEpisodeById(x,episodeId),target=ep?.scenes?.[index];if(!target)return;if(operation&&target.videoOperation&&target.videoOperation!==operation)return;target.videoOperation=null;target.videoQueuedAt=null;target.videoUrl=providerUrl||target.videoUrl||'';target.videoProviderCompletedAt=target.videoProviderCompletedAt||new Date().toISOString();target.videoRecoveryState='save_failed';target.videoError=e?.message||'Generated video could not be saved durably.';target.videoErrorCode='VIDEO_ASSET_PERSIST_FAILED';target.videoPlaybackError=null},{render:false});if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index);throw e;
  }
}

async function persistCoverageMediaUrl(projectId,episodeId,index,shotId,url,{commit=true}={}){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!p||!ep||!scene)throw new Error('The scene disappeared before its coverage video could be saved.');
  const normalized=normalizedMediaUrl(url||''),versionTag=`${hashString(normalized).toString(16)}-${Date.now().toString(36)}`,localKey=sceneMediaRecordKey(p,ep,scene,'coverage',`${shotId}-${versionTag}`);let r;
  try{r=await fetch(url,{cache:'no-store'})}catch{throw new Error('Coverage video finished, but CineTale could not download it for durable storage.')}
  if(!r.ok)throw new Error(`Coverage video durable download failed (${r.status}).`);let blob=await r.blob();blob=await normalizeVideoBlobForPlayback(blob);if(!await playableVideoBlob(blob))throw new Error('Coverage provider returned a file that CineTale could not verify as playable video.');
  const localSaved=await saveSceneMediaBlob(localKey,blob);if(!localSaved&&!finalVideoStorageReady())throw new Error('CineTale could not save the coverage video durably.');const runtimeUrl=setSceneMediaRuntimeUrl(localKey,blob);let storagePath='',ownership=localSaved?'browser':'';
  if(finalVideoStorageReady()){
    storagePath=sceneMediaCloudPath(p,ep,scene,`coverage-${shotId}`,blob.type||'video/mp4',versionTag);
    const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:true});await up.text().catch(()=> '');const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob();if(!await playableVideoBlob(verifiedBlob))throw new Error('The account-saved coverage copy could not be reopened as playable video.');ownership='cloud';
  }
  const result={localKey,storagePath,runtimeUrl,ownership,persistedAt:new Date().toISOString(),providerUrl:url};
  if(commit)updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index],item=t?.coverageClips?.find(c=>c.shotId===shotId);if(item){item.videoLocalMediaKey=localKey;item.videoStoragePath=storagePath;item.videoMediaPersistedAt=result.persistedAt;item.videoMediaOwnership=ownership;item.videoMediaExpired=false}},{render:false});
  return result;
}
async function hydrateCoverageMedia(projectId,episodeId,index,shotId){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index],entry=scene?.coverageClips?.find(c=>c.shotId===shotId);if(!entry)return '';const key=entry.videoLocalMediaKey||entry.videoStoragePath||'';if(key&&sceneMediaRuntimeUrls.has(key))return sceneMediaRuntimeUrls.get(key);let blob=null;
  if(entry.videoLocalMediaKey)blob=await loadSceneMediaBlob(entry.videoLocalMediaKey);if(!blob&&entry.videoStoragePath&&finalVideoStorageReady()){const rr=await supabaseStorageObject(entry.videoStoragePath,{method:'GET'});blob=await rr.blob();if(blob?.size&&entry.videoLocalMediaKey)await saveSceneMediaBlob(entry.videoLocalMediaKey,blob)}
  if(blob?.size)blob=await normalizeVideoBlobForPlayback(blob);if(blob?.size&&await playableVideoBlob(blob)){const runtime=setSceneMediaRuntimeUrl(entry.videoLocalMediaKey||entry.videoStoragePath,blob);return runtime}
  if(entry.videoUrl&&!entry.videoMediaExpired){try{const saved=await persistCoverageMediaUrl(projectId,episodeId,index,shotId,entry.videoUrl,{commit:true});return saved.runtimeUrl}catch{updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index],item=t?.coverageClips?.find(c=>c.shotId===shotId);if(item)item.videoMediaExpired=true},{render:false})}}
  return '';
}
async function persistCoverageSyncMediaUrl(projectId,episodeId,index,shotId,url,{commit=true}={}){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index],entry=scene?.coverageClips?.find(c=>c.shotId===shotId);if(!p||!ep||!scene||!entry)throw new Error('The speaking shot disappeared before its synchronized video could be saved.');
  const normalized=normalizedMediaUrl(url||''),versionTag=`${hashString(normalized).toString(16)}-${Date.now().toString(36)}`,localKey=sceneMediaRecordKey(p,ep,scene,'shot-sync',`${shotId}-${versionTag}`);let r;
  try{r=await fetch(url,{cache:'no-store'})}catch{throw new Error('Speaking-shot synchronization finished, but CineTale could not download the result for durable storage.')}
  if(!r.ok)throw new Error(`Speaking-shot synchronized video download failed (${r.status}).`);let blob=await r.blob();blob=await normalizeVideoBlobForPlayback(blob);if(!await playableVideoBlob(blob))throw new Error('The synchronized speaking-shot result was not a playable video.');
  const localSaved=await saveSceneMediaBlob(localKey,blob);if(!localSaved&&!finalVideoStorageReady())throw new Error('CineTale could not save the synchronized speaking shot durably.');const runtimeUrl=setSceneMediaRuntimeUrl(localKey,blob);let storagePath='',ownership=localSaved?'browser':'';
  if(finalVideoStorageReady()){
    storagePath=sceneMediaCloudPath(p,ep,scene,`shot-sync-${shotId}`,blob.type||'video/mp4',versionTag);
    const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:true});await up.text().catch(()=> '');const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob();if(!await playableVideoBlob(verifiedBlob))throw new Error('The account-saved synchronized speaking shot could not be reopened as playable video.');ownership='cloud';
  }
  const result={localKey,storagePath,runtimeUrl,ownership,persistedAt:new Date().toISOString(),providerUrl:url};
  if(commit)updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index],item=t?.coverageClips?.find(c=>c.shotId===shotId);if(item){item.syncLocalMediaKey=localKey;item.syncStoragePath=storagePath;item.syncMediaPersistedAt=result.persistedAt;item.syncMediaOwnership=ownership}},{render:false});
  return result;
}
async function hydrateCoverageSyncMedia(projectId,episodeId,index,shotId){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index],entry=scene?.coverageClips?.find(c=>c.shotId===shotId);if(!entry)return '';const key=entry.syncLocalMediaKey||entry.syncStoragePath||'';if(key&&sceneMediaRuntimeUrls.has(key))return sceneMediaRuntimeUrls.get(key);let blob=null;
  if(entry.syncLocalMediaKey)blob=await loadSceneMediaBlob(entry.syncLocalMediaKey);if(!blob&&entry.syncStoragePath&&finalVideoStorageReady()){const rr=await supabaseStorageObject(entry.syncStoragePath,{method:'GET'});blob=await rr.blob();if(blob?.size&&entry.syncLocalMediaKey)await saveSceneMediaBlob(entry.syncLocalMediaKey,blob)}
  if(blob?.size)blob=await normalizeVideoBlobForPlayback(blob);if(blob?.size&&await playableVideoBlob(blob))return setSceneMediaRuntimeUrl(entry.syncLocalMediaKey||entry.syncStoragePath,blob);
  if(entry.syncVideoUrl){try{const saved=await persistCoverageSyncMediaUrl(projectId,episodeId,index,shotId,entry.syncVideoUrl,{commit:true});return saved.runtimeUrl}catch{}}
  return '';
}
async function ensureCoverageSourceForServer(projectId,episodeId,index,shotId){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index],entry=scene?.coverageClips?.find(c=>c.shotId===shotId);if(!p||!ep||!scene||!entry)throw new Error('The speaking shot source disappeared before synchronization.');
  await hydrateCoverageMedia(projectId,episodeId,index,shotId).catch(()=>null);
  const live=state.projects.find(x=>x.id===projectId),liveEntry=findEpisodeById(live,episodeId)?.scenes?.[index]?.coverageClips?.find(c=>c.shotId===shotId)||entry;
  if(liveEntry.videoStoragePath&&finalVideoStorageReady()){const signed=await signedSceneMediaUrl(liveEntry.videoStoragePath,1200);if(signed)return signed}
  if(liveEntry.videoUrl)return liveEntry.videoUrl;
  throw new Error('The speaking shot source is not available for dialogue synchronization.');
}
async function hydrateSceneMedia(projectId,episodeId,index,kind='source'){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!p||!ep||!scene)return '';
  const localKey=kind==='sync'?scene.lipSyncLocalMediaKey:scene.videoLocalMediaKey,storagePath=kind==='sync'?scene.lipSyncStoragePath:scene.videoStoragePath,remote=kind==='sync'?scene.lipSyncVideoUrl:scene.videoUrl,key=localKey||storagePath||'';
  if(key&&sceneMediaRuntimeUrls.has(key))return sceneMediaRuntimeUrls.get(key);
  const inFlightKey=`${projectId}:${episodeId}:${index}:${kind}`;if(sceneMediaHydrationInFlight.has(inFlightKey))return sceneMediaHydrationInFlight.get(inFlightKey);
  const job=(async()=>{let blob=null,cloudMissing=false;try{
    if(localKey){try{blob=await loadSceneMediaBlob(localKey)}catch(e){console.warn('[CineTale media] Local scene media could not be loaded',e)}}
    if(!blob&&storagePath&&finalVideoStorageReady()){
      try{const rr=await supabaseStorageObject(storagePath,{method:'GET'});blob=await rr.blob();if(blob?.size&&localKey)await saveSceneMediaBlob(localKey,blob).catch(()=>{})}
      catch(e){cloudMissing=Number(e?.status)===404;if(!cloudMissing)console.warn('[CineTale media] Cloud scene media could not be loaded',e)}
    }
    if(blob?.size)blob=await normalizeVideoBlobForPlayback(blob);
    if(blob?.size&&await playableVideoBlob(blob)){
      const runtimeKey=localKey||storagePath;const runtime=setSceneMediaRuntimeUrl(runtimeKey,blob);
      if(cloudMissing&&kind==='source')updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t)t.videoCloudMissing=true},{render:false});
      if(cloudMissing&&finalVideoStorageReady())repairSceneCloudMedia(projectId,episodeId,index,kind).then(()=>{if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index)}).catch(e=>console.warn('[CineTale media] Automatic cloud repair failed',e));
      if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index);return runtime;
    }
    // One-time legacy rescue: if an older provider URL is still alive, immediately archive it.
    if(remote){try{const saved=await persistSceneMediaUrl(projectId,episodeId,index,remote,kind);const live=state.projects.find(x=>x.id===projectId),le=findEpisodeById(live,episodeId),ls=le?.scenes?.[index];return sceneMediaRuntimeUrl(ls||scene,kind)||saved?.runtimeUrl||''}catch(e){console.warn('[CineTale media] Legacy provider rescue failed',e)}}
    if(kind==='source')updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t){t.videoCloudMissing=Boolean(storagePath);t.videoMediaExpired=true;t.videoPlaybackError='The saved source video is no longer available in CineTale storage or this browser. Recreate this clip once; the replacement will be verified before it is used.'}},{render:false});
    if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(index);return '';
  }finally{sceneMediaHydrationInFlight.delete(inFlightKey)}})();sceneMediaHydrationInFlight.set(inFlightKey,job);return job;
}
function queueSceneMediaHydration(project={},episode={}){for(let i=0;i<(episode?.scenes||[]).length;i++){const scene=episode.scenes[i];if(scene?.lipSyncStoragePath||scene?.lipSyncLocalMediaKey||scene?.lipSyncVideoUrl)hydrateSceneMedia(project.id,episode.id||episode.number,i,'sync').catch(()=>{});if(scene?.videoStoragePath||scene?.videoLocalMediaKey||scene?.videoUrl)hydrateSceneMedia(project.id,episode.id||episode.number,i,'source').catch(()=>{});for(const clip of coverageClips(scene)){if(clip?.videoStoragePath||clip?.videoLocalMediaKey||clip?.videoUrl)hydrateCoverageMedia(project.id,episode.id||episode.number,i,clip.shotId).catch(()=>{});if(clip?.syncStoragePath||clip?.syncLocalMediaKey||clip?.syncVideoUrl)hydrateCoverageSyncMedia(project.id,episode.id||episode.number,i,clip.shotId).catch(()=>{})}}}
async function uploadFinalVideoCloud(p,ep,blob,filename,createdAt){if(!finalVideoStorageReady())return null;const path=finalVideoCloudPath(p,ep,filename,createdAt);const r=await supabaseStorageObject(path,{method:'POST',body:blob,contentType:blob.type||'video/webm',upsert:true});await r.text().catch(()=> '');return path}
async function downloadFinalVideoCloud(path){if(!path||!finalVideoStorageReady())return null;const r=await supabaseStorageObject(path,{method:'GET'});const blob=await r.blob();if(!blob?.size)throw new Error('The cloud final video was empty.');return blob}
async function deleteFinalVideoCloudPaths(paths=[]){const clean=[...new Set((paths||[]).filter(Boolean))];if(!clean.length||!finalVideoStorageReady())return;await refreshAuthIfNeeded();const c=state.authConfig,token=state.authSession?.access_token,base=String(c.url||'').replace(/\/+$/,'');const r=await fetch(`${base}/storage/v1/object/${finalVideoBucket}`,{method:'DELETE',headers:{apikey:c.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:clean})});if(!r.ok){let detail='';try{const d=await r.json();detail=d?.message||d?.error||''}catch{}throw new Error(detail||`Could not delete saved final video (${r.status}).`)}}
function projectFinalVideoCloudPaths(p){const out=[];if(p?.finalVideoMeta?.storagePath)out.push(p.finalVideoMeta.storagePath);for(const ep of p?.episodes||[]){if(ep?.finalVideoMeta?.storagePath)out.push(ep.finalVideoMeta.storagePath)}return [...new Set(out)]}
function setFinalRenderProgress(percent,text,{force=false}={}){
  const wrap=$('#finalRenderProgress'),bar=$('#finalRenderProgressBar'),label=$('#finalRenderProgressText');if(!wrap)return;
  const now=Date.now(),nextPercent=percent==null?null:Math.max(0,Math.min(100,Math.round(percent))),nextText=String(text||'');
  // Final rendering runs in real time. Avoid repainting the same progress box dozens of times
  // while media frames are being captured; repeated DOM writes were visibly flickering in Firefox.
  if(!force&&nextPercent!==null&&finalRenderProgressState.percent!==null&&now-finalRenderProgressState.at<450&&nextText===finalRenderProgressState.text&&Math.abs(nextPercent-finalRenderProgressState.percent)<2)return;
  wrap.classList.toggle('hidden',nextPercent==null);
  if(bar&&nextPercent!=null)bar.style.width=`${nextPercent}%`;
  if(label&&nextText&&label.textContent!==nextText)label.textContent=nextText;
  finalRenderProgressState={at:now,percent:nextPercent,text:nextText};
}
const PRODUCTION_STALL_MS=15*60*1000;
const RECOVERY_ONLY_MAX_ATTEMPTS=4;
const RECOVERY_ONLY_POLL_MS=2500;
function autoFinalJobPatch(projectId,patch={}){updateProjectById(projectId,x=>{const prior=x.autoFinalJob||{},nowIso=new Date().toISOString(),priorReady=Number(prior.completedCount||0),nextReady=Number(patch.completedCount??prior.completedCount??0),resetProgressClock=Boolean(patch.resetProgressClock),cleanPatch={...patch};delete cleanPatch.resetProgressClock;const progressed=nextReady>priorReady;x.autoFinalJob={...prior,...cleanPatch,updatedAt:nowIso,lastProgressAt:(progressed||resetProgressClock)?nowIso:(prior.lastProgressAt||prior.startedAt||nowIso),lastProgressReady:progressed?nextReady:Number(prior.lastProgressReady??priorReady)}} ,{render:false});if(state.autoFinalRunning){try{const key=autoFinalLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(old)localStorage.setItem(key,JSON.stringify({...old,ts:Date.now()}))}catch{}}}
function productionLifecycleUi(project={}){
  const job=project?.autoFinalJob||{},active=Boolean(state.autoFinalRunning),phase=String(job.phase||''),status=String(job.status||'');
  const checking=active&&phase==='video'&&status==='recovering';
  const producing=active&&phase==='video'&&status==='running';
  const syncing=active&&phase==='sync'&&status==='running';
  return {active,checking,producing,syncing,showProgress:producing||syncing,showPause:producing||syncing,buttonText:checking?'Checking saved provider jobs…':syncing?'Finishing dialogue…':producing?'Producing video shots…':'Building story timeline…'};
}
function productionStallInfo(projectId){const p=state.projects.find(x=>x.id===projectId),job=p?.autoFinalJob;if(!job||job.status!=='running')return {stalled:false,elapsed:0};const at=Date.parse(job.lastProgressAt||job.startedAt||job.updatedAt||0)||Date.now(),elapsed=Date.now()-at;return {stalled:elapsed>=PRODUCTION_STALL_MS,elapsed,ready:Number(job.completedCount||0),lastProgressAt:job.lastProgressAt||job.startedAt||''}}
function triggerProductionStallPause(projectId,stage='Provider work is taking unusually long.'){const info=productionStallInfo(projectId);if(!info.stalled)return false;state.autoFinalCancelRequested=true;state.autoFinalPauseReason='stalled';autoFinalJobPatch(projectId,{status:'stalled',stage:`Stalled safely · ${info.ready} source videos ready · no new completed media for ${Math.max(15,Math.round(info.elapsed/60000))} min`,stallDetectedAt:new Date().toISOString(),lastError:'Existing paid provider jobs were preserved. CineTale stopped starting new work until you resume.'});return true}
function clearAutoFinalJob(projectId){updateProjectById(projectId,x=>{x.autoFinalJob=null},{render:false})}
function isTransientStatus(status){return [408,425,429,500,502,503,504].includes(Number(status))}
const videoStatusRequestsInFlight=new Map(),videoStatusCooldowns=new Map();
let videoProviderStatusGate=Promise.resolve(),videoProviderRecoveryCircuit={nextAt:0,error:'',failures:0};
function videoStatusCooldown(operation,error='',retryAfterMs=0){const prior=videoStatusCooldowns.get(operation)||{failures:0},failures=Math.max(1,Number(prior.failures||0)+1),delay=Math.max(Number(retryAfterMs)||0,Math.min(60000,4000*Math.pow(2,Math.min(4,failures-1))));const state={failures,nextAt:Date.now()+delay,error:String(error||'Video provider status is temporarily unavailable.'),delay};videoStatusCooldowns.set(operation,state);return state}
function videoRecoveryPending(operation,state={}){const wait=Math.max(1000,Number(state.nextAt||0)-Date.now());return {status:'recovery_pending',done:false,terminal:false,retryable:true,retryAfterMs:wait,transportFailures:Number(state.failures||1),error:state.error||'CineTale is waiting to recover the existing provider job.'}}
async function fetchVideoStatus(operation,{retries=0,force=false}={}){
  if(!operation)return {status:'error',done:true,terminal:true,errorCode:'VIDEO_OPERATION_MISSING',retryable:false,error:'The saved video operation is missing.'};
  const isInteraction=String(operation).startsWith('interaction:');
  const cooling=videoStatusCooldowns.get(operation);if(!force&&cooling&&Date.now()<Number(cooling.nextAt||0))return videoRecoveryPending(operation,cooling);
  if(!force&&isInteraction&&Date.now()<Number(videoProviderRecoveryCircuit.nextAt||0))return videoRecoveryPending(operation,{...videoProviderRecoveryCircuit,delay:Math.max(0,Number(videoProviderRecoveryCircuit.nextAt||0)-Date.now())});
  if(videoStatusRequestsInFlight.has(operation))return videoStatusRequestsInFlight.get(operation);
  const run=async()=>{let last;for(let attempt=0;attempt<=Math.max(0,Number(retries)||0);attempt++){try{
    if(!force&&isInteraction&&Date.now()<Number(videoProviderRecoveryCircuit.nextAt||0))return videoRecoveryPending(operation,{...videoProviderRecoveryCircuit,delay:Math.max(0,Number(videoProviderRecoveryCircuit.nextAt||0)-Date.now())});
    const cacheBust=`${Date.now()}-${attempt}`;const r=await fetch(`/api/video-status?operation=${encodeURIComponent(operation)}&_=${cacheBust}`,{cache:'no-store',headers:{'cache-control':'no-cache','pragma':'no-cache'}});const d=await r.json().catch(()=>({}));
    if(r.ok){
      if(d?.status==='recovery_pending'){
        const wait=Math.max(5000,Number(d.retryAfterMs)||Number(d.retryAfterSeconds)*1000||0),state=videoStatusCooldown(operation,d.error||'The provider status endpoint is temporarily unavailable.',wait);
        if(isInteraction){const failures=Math.max(1,Number(videoProviderRecoveryCircuit.failures||0)+1),providerDelay=Math.max(wait,Math.min(90000,10000*Math.pow(2,Math.min(3,failures-1))));videoProviderRecoveryCircuit={failures,nextAt:Date.now()+providerDelay,error:d.error||'Video job-status retrieval is temporarily unavailable.',delay:providerDelay}}
        if(d.manualReviewRequired)return {...d,retryAfterMs:wait,transportFailures:state.failures};
        return videoRecoveryPending(operation,state)
      }
      videoStatusCooldowns.delete(operation);if(isInteraction)videoProviderRecoveryCircuit={nextAt:0,error:'',failures:0};return d
    }
    last=new Error(d.error||`Video status failed (${r.status})`);if(!isTransientStatus(r.status))throw last;const state=videoStatusCooldown(operation,last.message,Number(d.retryAfterMs)||Number(d.retryAfterSeconds)*1000||0);if(isInteraction){const providerDelay=Math.max(state.delay,30000);videoProviderRecoveryCircuit={failures:Math.max(1,Number(videoProviderRecoveryCircuit.failures||0)+1),nextAt:Date.now()+providerDelay,error:last.message,delay:providerDelay}}if(attempt>=Math.max(0,Number(retries)||0))return videoRecoveryPending(operation,state)
  }catch(e){last=e;if(attempt>=Math.max(0,Number(retries)||0)){const state=videoStatusCooldown(operation,e?.message||String(e),0);if(isInteraction){const providerDelay=Math.max(state.delay,30000);videoProviderRecoveryCircuit={failures:Math.max(1,Number(videoProviderRecoveryCircuit.failures||0)+1),nextAt:Date.now()+providerDelay,error:e?.message||String(e),delay:providerDelay}}return videoRecoveryPending(operation,state)}}
  if(attempt<Math.max(0,Number(retries)||0))await sleep(Math.min(6000,1000*Math.pow(2,attempt)))}const state=videoStatusCooldown(operation,last?.message||'Video status unavailable',0);return videoRecoveryPending(operation,state)};
  const task=(isInteraction?(async()=>{const previous=videoProviderStatusGate;let release;videoProviderStatusGate=new Promise(resolve=>{release=resolve});await previous;try{return await run()}finally{release()}})():run()).finally(()=>videoStatusRequestsInFlight.delete(operation));
  videoStatusRequestsInFlight.set(operation,task);return task;
}
function videoStatusTerminalError(d={}){
  if(d?.status==='ready'&&d?.videoUrl)return null;
  if(d?.done===true||d?.terminal===true||['error','failed','not_found'].includes(String(d?.status||'').toLowerCase())){
    const e=new Error(d?.error||'The video job finished without a usable video file.');
    e.code=d?.errorCode||'VIDEO_TERMINAL_NO_ASSET';e.retryable=Boolean(d?.retryable);e.requiresPromptAdjustment=Boolean(d?.requiresPromptAdjustment);return e;
  }
  return null;
}
function videoUserFailureMessage(error){
  const code=String(error?.code||'');
  if(code==='VIDEO_REAL_PERSON_LIKENESS_FILTER')return 'This shot was filtered for a possible real-person or celebrity likeness. CineTale will use a safer original-character prompt on the next manual retry. Your project and existing media are safe.';
  if(code==='VIDEO_PROVIDER_POLICY_FILTER')return 'The video service filtered this shot and did not return a usable clip. Your project is safe; adjust the shot or try again only after changing the visual direction.';
  if(code==='VIDEO_ASSET_MISSING'||code==='VIDEO_TERMINAL_NO_ASSET')return 'Video could not be prepared. Your project is safe. Try this shot again when ready.';
  if(code==='VIDEO_PROVIDER_FAILED'&&error?.retryable)return 'The video service had a temporary problem. Your project is safe. Try this shot again in a few minutes.';
  if(code==='VIDEO_PROVIDER_FAILED')return 'The video service could not complete this shot. Your project is safe. You can try this shot again when ready.';
  return videoQuotaMessage(error);
}
function videoProgressCopy(startedAt){const elapsed=Math.max(0,Date.now()-Number(startedAt||Date.now()));if(elapsed>=3*60*1000)return 'Taking longer than usual…';if(elapsed>=45*1000)return 'Creating video…';return 'Preparing video…'}
async function runPool(items,limit,worker){const queue=[...items],results=[],errors=[];const runners=Array.from({length:Math.max(1,Math.min(limit,queue.length||1))},async()=>{while(queue.length){const item=queue.shift();try{results.push(await worker(item))}catch(error){errors.push({item,error})}}});await Promise.all(runners);return {results,errors}}
function updateAutoFinalProgressUi(projectId,episodeId,message=''){if(current()?.id!==projectId)return;const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),selected=selectedFinalScenes(ep),ready=selected.filter(x=>sceneStoryTimelineReady(p,x.scene)).length,total=selected.length;if($('#finalReadiness'))$('#finalReadiness').textContent=`${ready} / ${total} scenes production-ready`;if($('#finalAssemblyStatus'))$('#finalAssemblyStatus').textContent=`Automatic production · ${ready}/${total} scenes ready${message?` · ${message}`:''}`;if(total)setFinalRenderProgress(Math.max(3,Math.min(88,8+Math.round((ready/total)*78))),message||`Building story timeline · ${ready}/${total} scenes ready`)}
function applyFinalVideoUi(p,ep,asset){
  const preview=$('#finalRenderPreview'),download=$('#downloadFinalVideo'),share=$('#shareFinalVideo'),placeholder=$('#finalVideoPlaceholder'),actions=$('#finalOutputActions'),hint=$('#finalOutputHint'),stage=$('#finalOutputStage');stage?.classList.toggle('has-final-video',Boolean(asset?.url));
  if(!preview||!download||!share)return;
  if(asset?.url){
    preview.muted=false;preview.volume=1;
    const current=preview.getAttribute('src')||'';
    if(current!==asset.url){preview.src=asset.url;try{preview.load()}catch{}}
    preview.classList.remove('hidden');placeholder?.classList.add('hidden');actions?.classList.remove('hidden');
    download.classList.remove('hidden');share.classList.remove('hidden');download.textContent=/mp4/i.test(asset.mime||'')?'Download MP4':'Download';
    preview.dataset.finalVideoReady='1';
    if(hint){const persistence=asset.persistence==='cloud'?'Saved to your CineTale account and this browser.':asset.persistence==='browser'?'Saved in this browser. Sign in before your next render to keep final videos with your CineTale account.':'Verified final file.';hint.textContent=`${persistence} · ${asset.duration?formatTime(asset.duration):'ready to play'}.`}
  }else{
    preview.pause?.();preview.removeAttribute('src');try{preview.load()}catch{}delete preview.dataset.finalVideoReady;preview.classList.add('hidden');
    actions?.classList.add('hidden');download.classList.add('hidden');share.classList.add('hidden');placeholder?.classList.remove('hidden');
    if(hint)hint.textContent='When production is ready, click Create final video above. CineTale will assemble and verify the finished file automatically.';
  }
}
async function restoreFinalVideoAsset(p,ep){
  if(!p?.finalVideoMeta)return;
  const key=finalVideoAssetKey(p,ep);
  if(finalVideoAssets.has(key)){finalVideoRestoreFailures.delete(key);applyFinalVideoUi(p,ep,finalVideoAssets.get(key));return}
  if(finalVideoRestoreInFlight.has(key))return;
  finalVideoRestoreInFlight.add(key);
  let localError=null,cloudError=null;
  try{
    const saved=await loadFinalVideoBlob(key).catch(e=>{localError=e;return null});
    if(saved?.blob){
      try{const duration=await verifyFinalVideoBlob(saved.blob);const persistence=p.finalVideoMeta?.storagePath?'cloud':'browser';const asset={blob:saved.blob,mime:saved.meta?.mime||saved.blob.type,filename:saved.meta?.filename||finalVideoFilename(p,saved.blob.type),url:URL.createObjectURL(saved.blob),duration,persistence};finalVideoAssets.set(key,asset);finalVideoRestoreFailures.delete(key);if(current()?.id===p.id)applyFinalVideoUi(p,ep,asset);return}catch(e){localError=e;console.warn('[CineTale final render] Browser copy is not playable; checking cloud copy',e)}
    }
    if(p.finalVideoMeta?.storagePath&&finalVideoStorageReady()){
      try{const blob=await downloadFinalVideoCloud(p.finalVideoMeta.storagePath);const duration=await verifyFinalVideoBlob(blob);const asset={blob,mime:p.finalVideoMeta.mime||blob.type,filename:p.finalVideoMeta.filename||finalVideoFilename(p,blob.type),url:URL.createObjectURL(blob),duration,persistence:'cloud'};finalVideoAssets.set(key,asset);finalVideoRestoreFailures.delete(key);await saveFinalVideoBlob(key,blob,p.finalVideoMeta).catch(()=>{});if(current()?.id===p.id)applyFinalVideoUi(p,ep,asset);return}catch(e){cloudError=e;console.warn('[CineTale final render] Cloud final video is not playable or unavailable',e)}
    }
    throw cloudError||localError||new Error(p.finalVideoMeta?.storagePath?'The saved final file could not be restored.':'The saved final file is not stored in this browser.');
  }catch(e){
    console.warn('[CineTale final render] Saved final video is not playable',e);finalVideoRestoreFailures.add(key);
    if(current()?.id===p.id){applyFinalVideoUi(p,ep,null);const status=$('#finalAssemblyStatus');if(status)status.textContent=p.finalVideoMeta?.storagePath?'The saved final video could not be restored from your account or this browser. Your scene clips are preserved; click Create final video to rebuild only the final file.':'The previous final file is not available in this browser. Your scene clips are preserved; click Create final video to rebuild only the final file.'}
  }finally{finalVideoRestoreInFlight.delete(key)}
}

function renderFinalAssembly(p,ep){
  const panel=$('#finalAssemblyPanel');if(!panel)return;renderProductionDependencyPanel(p,ep);const selected=selectedFinalScenes(ep),all=ep?.scenes||[],ready=selected.filter(x=>sceneStoryTimelineReady(p,x.scene)).length,total=selected.length,skipped=Math.max(0,all.length-total),cfg=formatConfig(p.format||'Episode'),job=p.autoFinalJob||null,approved=storyIsApproved(p,ep),inspection=state.studioInspectionStage==='final';
  panel.classList.toggle('inspection-open',inspection);
  let inspectionBar=panel.querySelector('.final-inspection-banner');
  if(inspection){
    if(!inspectionBar){inspectionBar=document.createElement('div');inspectionBar.className='final-inspection-banner';inspectionBar.innerHTML='<div><span class="kicker">READINESS INSPECTION</span><b>Final Assembly is open for review</b><small>Inspect every dependency here. Paid production remains protected until upstream requirements are ready.</small></div><button type="button" class="ghost" data-close-final-inspection>Back to Audio</button>';panel.prepend(inspectionBar)}
    inspectionBar.querySelector('[data-close-final-inspection]')?.addEventListener('click',closeStudioInspectionStage,{once:true});
  }else inspectionBar?.remove();
  panel.classList.toggle('final-stage-dormant',Boolean(approved&&total&&ready===0&&!state.autoFinalRunning&&!state.finalRenderRunning));
  $('#finalAssemblyTitle').textContent=`Final ${cfg.finalName}`;$('#finalReadiness').textContent=ready===total&&total?`${ready}/${total} scenes ready`:`Shot plans ready · ${ready}/${total} scenes cleared`;
  $('#finalAssemblyCopy').textContent=!total?(ep?.orphanedMediaRecovery?.count?`CineTale found ${ep.orphanedMediaRecovery.count} saved media record${ep.orphanedMediaRecovery.count===1?'':'s'}, but there is not enough trusted scene metadata to reattach them automatically. Do not generate new clips yet.`:`No scenes are selected. Include at least one scene.`):ready===total?`All selected scenes have complete story-shot timelines. Click Create final video — CineTale will assemble, verify, and show the finished episode below.`:`${Math.max(0,total-ready)} selected scene${total-ready===1?'':'s'} still need story-shot production. ${skipped?`${skipped} scene${skipped===1?' is':'s are'} intentionally skipped. `:''}Review production before starting. CineTale will show the genuinely missing paid work, preserve completed assets, and require confirmation before production begins.`;
  const assemblyAuthority=productionActionAuthority(p,ep);if(inspection&&assemblyAuthority.hardGate)$('#finalAssemblyCopy').textContent='Inspection only. Resolve the first highlighted dependency below; CineTale will preserve completed media and unlock production controls automatically when it is safe.';
  $('#finalAssemblyScenes').innerHTML=(all||[]).map((scene,i)=>{const included=scene.finalIncluded!==false,failed=job?.errors?.[String(i)];const productionReady=sceneStoryTimelineReady(p,scene),syncing=sceneSourceDurablyOwned(scene)&&!productionReady;const stateLabel=!included?'— SKIPPED':productionReady?'✓ READY':syncing?'◌ PRODUCING':failed?'! RETRY':scene.videoOperation?'◌ RENDERING':'○ PENDING';const cls=!included?'skipped':productionReady?'ready':failed?'failed':'pending';return `<label class="final-scene-item ${cls}"><input type="checkbox" data-final-scene-toggle="${i}" ${included?'checked':''}><span>${stateLabel}</span><b>${String(scene.number||i+1).padStart(2,'0')} · ${esc(scene.title||`Scene ${i+1}`)}</b><small>${Number(scene.durationSec)||0}s narrative beat · ${sceneCoveragePlan(scene,finalTimelineMode(p)).length} planned shots${failed?` · ${esc(failed)}`:''}</small></label>`}).join('')||'<div class="final-scene-item pending"><b>No scenes yet</b></div>';
  $$('[data-final-scene-toggle]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.finalSceneToggle),cb.checked));
  const prep=$('#prepareFinalAssembly'),preview=$('#previewFinalSequence'),download=$('#downloadAssemblyManifest'),render=$('#renderFinalVideo'),auto=$('#autoFinalVideo'),cancel=$('#cancelAutoFinalVideo'),autoCard=auto?.closest('.auto-final-card'),userActions=$('.final-user-actions'),outputStage=$('#finalOutputStage');
  const authority=productionActionAuthority(p,ep),hardBlocked=Boolean(authority.hardGate),key=finalVideoAssetKey(p,ep),hasPlayable=finalVideoAssets.has(key),restoreUnavailable=finalVideoRestoreFailures.has(key);
  if(prep)prep.disabled=!approved||!(total&&ready===total)||!authority.canCreateFinal;
  if(preview){preview.disabled=!ready||hardBlocked;preview.classList.toggle('hidden',hardBlocked||!ready)}
  if(download)download.classList.add('hidden');
  if(render)render.disabled=!approved||!(total&&ready===total)||!authority.canCreateFinal;
  const lifecycle=productionLifecycleUi(p);
  if(auto){
    auto.disabled=!approved||!total||hardBlocked||state.autoFinalRunning||state.finalRenderRunning;
    auto.textContent=lifecycle.active?lifecycle.buttonText:state.finalRenderRunning?'Creating final video…':job&&job.phase==='video'&&['partial','paused','needs-attention','stalled','auth-required','recovery-deferred'].includes(job.status)?(job.status==='auth-required'?'Sign in to resume':job.status==='recovery-deferred'?'Check provider jobs':'Resume production'):job&&job.phase==='sync'&&['partial','paused','needs-attention'].includes(job.status)?'Resume dialogue finishing':hasPlayable?'Recreate final video':restoreUnavailable?'Rebuild final video':(ready===total&&total?'Create final video':'Review & produce');
    auto.setAttribute('aria-disabled',String(auto.disabled));
    auto.title=hardBlocked?`Locked until ${authority.hardGate.label.toLowerCase()} is ready.`:'';
  }
  if(autoCard){const upstreamProductionAction=['video','sync'].includes(authority.firstAction),runningControls=Boolean(state.autoFinalRunning&&['video','sync'].includes(job?.phase||authority.firstAction));autoCard.classList.toggle('hidden',Boolean(hardBlocked||(upstreamProductionAction&&!runningControls)));}
  if(userActions)userActions.classList.toggle('hidden',hardBlocked&&!hasPlayable);
  if(outputStage)outputStage.classList.toggle('inspection-output-hidden',Boolean(hardBlocked&&!hasPlayable&&!p.finalVideoMeta));
  if(cancel)cancel.classList.toggle('hidden',!lifecycle.showPause);
  const status=$('#finalAssemblyStatus');status.classList.toggle('ready',ready===total&&total>0);let statusText='';
  const finalKey=finalVideoAssetKey(p,ep),hasPlayableFinal=finalVideoAssets.has(finalKey),restoreFailed=finalVideoRestoreFailures.has(finalKey);
  if(state.finalRenderRunning)statusText='Creating the final video now. This local render runs in real time and can take about as long as the target episode. Keep this tab open; the finished video will appear in the Final Video box below.';
  else if(hasPlayableFinal)statusText='Final video verified and ready. Play it below, then Download or Share.';
  else if(restoreFailed)statusText='The previous final file is not available in this browser. The ready scene clips are preserved. Click Rebuild final video to assemble only the final file again.';
  else if(p.finalVideoMeta?.createdAt)statusText='Restoring the previously rendered final video from this browser…';
  else if(lifecycle.checking){const graph=authority.graph;statusText=`Checking existing provider jobs only · ${graph.recovering} preserved job${graph.recovering===1?'':'s'} awaiting reconciliation. No new paid video is being submitted.`;}
  else if(state.autoFinalRunning){const phase=job?.phase==='sync'?'Dialogue finishing':'Video production';statusText=`${phase} is in progress${job?.stage?` · ${job.stage}`:''}. Completed paid media is saved and will not be regenerated.`}
  else if(job&&['partial','paused','needs-attention'].includes(job.status)){const failedCount=Object.keys(job.errors||{}).length;statusText=job.status==='needs-attention'?`Production needs attention with ${ready}/${total} scenes production-ready${failedCount?` and ${failedCount} item${failedCount===1?'':'s'} requiring review`:''}. Completed shot work is safe.`:job.phase==='sync'?`Dialogue finishing paused with ${ready}/${total} scenes production-ready. Resume only the missing synchronization work.`:`Production paused with ${authority.graph.sourceReady}/${authority.graph.plannedShots} source videos ready. Click Resume production to continue only missing video work.`}
  else if(!approved)statusText='Review and approve the complete story before starting production.';
  else if(hardBlocked)statusText=`Waiting on ${authority.hardGate.label.toLowerCase()}. Resolve the highlighted upstream requirement first; completed media remains preserved.`;
  else statusText=total&&ready===total?'Ready. Click Create final video. The finished verified file will appear directly below.':'Review the production estimate before starting. No paid generation begins until you confirm the missing work.';
  status.textContent=statusText;
  if(!state.finalRenderRunning){
    if(job&&lifecycle.showProgress&&total){const pct=Math.max(2,Math.min(88,Math.round((ready/total)*78)+8));setFinalRenderProgress(pct,job.stage||`Creating scene assets · ${ready}/${total} ready`)}
    else if(!lifecycle.showProgress)setFinalRenderProgress(null,'');
    if(p.finalVideoMeta&&!finalVideoAssets.has(finalVideoAssetKey(p,ep))&&!finalVideoRestoreFailures.has(finalVideoAssetKey(p,ep)))restoreFinalVideoAsset(p,ep).catch(()=>{});
    else if(!p.finalVideoMeta)applyFinalVideoUi(p,ep,null);
  }
}

function prepareFinalAssembly({silent=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('prepare the final production'))return false;const authority=productionActionAuthority(p,ep);if(authority.hardGate){if(!silent)toast(`Final assembly is protected until ${authority.hardGate.label.toLowerCase()} is ready.`);return false}const scenes=selectedFinalScenes(ep);if(!scenes.length||scenes.some(x=>!sceneStoryTimelineReady(p,x.scene))){if(!silent)toast('Finish every selected scene, including dialogue synchronization for speaking scenes, or use Create final video.');return false}const manifest=finalAssemblyManifest(p,ep);updateProjectById(p.id,x=>{x.finalAssembly=manifest;x.renderStatus='ready';x.videoStatus='ready';x.finalVideoMeta=null},{render:false});if(!silent)toast('Final scene order prepared.');return true}
function playVideoElement(video){return new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=()=>reject(new Error('A scene clip could not be played.'));video.play().catch(reject)})}
const previewSequenceLocks=new Set();
function previewSequenceKey(project,episode){return `${project?.id||''}:${episode?.id||episode?.number||''}`}
async function previewFinalSequence(){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
  const previewKey=previewSequenceKey(p,ep);previewSequenceLocks.add(previewKey);
  const selected=selectedFinalScenes(ep);
  const playable=selected.filter(({scene})=>sceneHasSpokenContent(scene)?sceneHasValidatedLipSync(p,scene):Boolean(scenePrimaryVideoUrl(scene,p))); 
  if(!playable.length){toast('No finished scene clips are ready to preview yet.');return}
  const waitingCount=selected.length-playable.length;
  $('#modalBody').innerHTML=`<div class="sequence-player"><div><span class="kicker">FINAL SEQUENCE PREVIEW</span><h2>${esc(p.title)}</h2><p>Read-only preview of finished scene assets. Preview never starts, retries, invalidates, or spends credits on dialogue synchronization.${waitingCount?` ${waitingCount} selected scene${waitingCount===1?' is':'s are'} not finished yet and ${waitingCount===1?'is':'are'} skipped.`:''}</p></div><video id="finalSequenceVideo" controls playsinline></video><div class="sequence-progress">${playable.map((x,i)=>`<span data-final-step="${i}">${String(x.scene.number||x.index+1).padStart(2,'0')} · ${esc(x.scene.title||`Scene ${x.index+1}`)}</span>`).join('')}</div><div class="modal-actions"><button class="ghost" id="sequenceClose">Close</button></div></div>`;
  $('#modal').classList.remove('hidden');
  const video=$('#finalSequenceVideo');
  $('#sequenceClose').onclick=()=>{try{video.pause()}catch{}previewSequenceLocks.delete(previewKey);closeModal()};
  for(let i=0;i<playable.length;i++){
    if($('#modal').classList.contains('hidden'))break;
    const {index}=playable[i];
    const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject),scene=liveEpisode?.scenes?.[index]||playable[i].scene;
    $$('[data-final-step]').forEach(x=>x.classList.toggle('active',Number(x.dataset.finalStep)===i));
    try{
      let previewUrl='';
      if(sceneHasSpokenContent(scene)){
        if(sceneHasValidatedLipSync(liveProject,scene))previewUrl=sceneValidatedSyncPlaybackUrl(scene,liveProject)||await hydrateSceneMedia(liveProject.id,liveEpisode.id||liveEpisode.number,index,'sync');
      }else previewUrl=scenePrimaryVideoUrl(scene,liveProject)||await hydrateSceneMedia(liveProject.id,liveEpisode.id||liveEpisode.number,index,'source');
      if(!previewUrl){console.warn('[CineTale preview] Finished durable asset is unavailable; skipping scene',{scene:index+1,title:scene?.title||''});continue}
      video.src=previewUrl;video.muted=false;video.load();
      await waitMediaMetadata(video);
      await playVideoElement(video);
    }catch(e){toast(e.message||'Preview playback failed.');break}
    finally{try{video.pause()}catch{}}
  }
  if($('#modal').classList.contains('hidden')){previewSequenceLocks.delete(previewKey)}
}

function chooseFinalRecordingMime(){const candidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=h264,aac','video/mp4'];return candidates.find(x=>window.MediaRecorder?.isTypeSupported?.(x))||''}
async function verifyFinalVideoBlob(blob){if(!blob?.size)throw new Error('The final video file was empty.');const testUrl=URL.createObjectURL(blob);try{const probe=document.createElement('video');probe.preload='metadata';probe.playsInline=true;probe.src=testUrl;await waitMediaMetadata(probe,{timeout:25000});const duration=Number(probe.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('The finished video could not be opened by this browser.');return duration}finally{URL.revokeObjectURL(testUrl)}}
function waitMediaMetadata(el,{timeout=20000}={}){return new Promise((resolve,reject)=>{if(Number.isFinite(el.duration)&&el.readyState>=1){resolve(el);return}let timer;const ok=()=>{cleanup();resolve(el)},bad=()=>{cleanup();reject(new Error('A media asset could not be loaded.'))},cleanup=()=>{clearTimeout(timer);el.removeEventListener('loadedmetadata',ok);el.removeEventListener('loadeddata',ok);el.removeEventListener('error',bad)};el.addEventListener('loadedmetadata',ok,{once:true});el.addEventListener('loadeddata',ok,{once:true});el.addEventListener('error',bad,{once:true});timer=setTimeout(()=>{cleanup();reject(new Error('A media asset took too long to load.'))},timeout);el.load()})}

async function loadMediaWithRetry(el,url,{attempts=3,timeout=22000,label='media'}={}){
  let last=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      el.src=url;
      await waitMediaMetadata(el,{timeout});
      if(!Number.isFinite(el.duration)||el.duration<=0)throw new Error(`${label} has no playable duration.`);
      return el;
    }catch(e){
      last=e;
      try{el.pause?.();el.removeAttribute('src');el.load?.()}catch{}
      if(attempt<attempts)await sleep(450*attempt);
    }
  }
  throw last||new Error(`${label} could not be loaded.`);
}

async function sceneCachedVoiceUrls(p,s){const urls=[];try{const items=await scenePlaybackItems(p,s);for(let i=0;i<items.length;i++){const key=sceneAudioItemKey(p,s,items[i],i),blob=await loadSceneAudioBlob(key);if(!blob)return [];let url=sceneAudioObjectUrls.get(key);if(!url){url=URL.createObjectURL(blob);sceneAudioObjectUrls.set(key,url)}urls.push(url)}}catch(e){console.warn('[CineTale final render] Cached approved voice unavailable',{message:e?.message||String(e)});return []}return urls}
function finalSceneTargetDuration(project,scene){const ep=episodeOf(project),selected=selectedFinalScenes(ep).map(x=>x.scene),target=Number(project?.targetRuntimeSec)||durationTargetSeconds(project?.duration),weights=selected.map(x=>Math.max(1,Number(x?.durationSec)||1)),weightSum=weights.reduce((a,b)=>a+b,0),sceneWeight=Math.max(1,Number(scene?.durationSec)||1);if(target>0&&weightSum>0)return Math.max(1,target*(sceneWeight/weightSum));return Math.max(1,Number(scene?.durationSec)||0)}
function drawVideoFrame(ctx,video,width,height){ctx.fillStyle='#0f0c20';ctx.fillRect(0,0,width,height);const vw=video.videoWidth||width,vh=video.videoHeight||height,scale=Math.min(width/vw,height/vh),dw=vw*scale,dh=vh*scale,dx=(width-dw)/2,dy=(height-dh)/2;ctx.drawImage(video,dx,dy,dw,dh)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function prepareFinalSceneAsset(project,scene,index,total){
  const sceneName=scene.title||`Scene ${index+1}`,coverageMode=finalTimelineMode(project);
  setFinalRenderProgress(3+Math.round((index/Math.max(1,total))*12),`Checking story timeline · scene ${index+1} of ${total} · ${sceneName}`);
  const ep=episodeOf(project),sceneIndex=Math.max(0,ep?.scenes?.indexOf(scene)??index),plan=ensureSceneCoverage(scene,coverageMode);
  await hydrateSceneMedia(project.id,ep?.id||ep?.number,sceneIndex,'source').catch(()=>null);
  if(sceneHasValidatedLipSync(project,scene))await hydrateSceneMedia(project.id,ep?.id||ep?.number,sceneIndex,'sync').catch(()=>null);
  for(const clip of coverageClips(scene)){
    await hydrateCoverageMedia(project.id,ep?.id||ep?.number,sceneIndex,clip.shotId).catch(()=>null);
    if(clip.syncStoragePath||clip.syncLocalMediaKey||clip.syncVideoUrl)await hydrateCoverageSyncMedia(project.id,ep?.id||ep?.number,sceneIndex,clip.shotId).catch(()=>null);
  }
  const liveProject=state.projects.find(x=>x.id===project.id)||project,liveScene=findEpisodeById(liveProject,ep?.id||ep?.number)?.scenes?.[sceneIndex]||scene,livePlan=ensureSceneCoverage(liveScene,coverageMode),entries=sceneAuthoritativeFinalVideoEntries(liveScene,liveProject);
  if(entries.length!==livePlan.length){const missing=livePlan.filter(shot=>!entries.some(entry=>String(entry.shotId)===String(shot.id)));throw new Error(`${sceneName} has ${entries.length}/${livePlan.length} finished story shots. Missing: ${missing.map(x=>`shot ${x.order}${x.speaking?' dialogue':''}`).join(', ')}. CineTale stopped instead of creating an incomplete story.`)}
  const videos=[];
  for(let sourceIndex=0;sourceIndex<entries.length;sourceIndex++){
    const entry=entries[sourceIndex],v=document.createElement('video');v.preload='auto';v.playsInline=true;v.crossOrigin='anonymous';v.muted=true;
    try{await loadMediaWithRetry(v,entry.url,{attempts:3,timeout:22000,label:`${sceneName} shot ${entry.order}`});videos.push({video:v,entry})}
    catch(e){throw new Error(`${sceneName} shot ${entry.order} is part of the locked story timeline but its saved media cannot be opened. CineTale stopped instead of skipping or substituting another clip.`)}
  }
  for(const item of videos){if(item.entry.speaking&&!item.entry.synchronized)throw new Error(`${sceneName} shot ${item.entry.order} contains dialogue but is not synchronized to its approved voice.`)}
  let narrationAsset=null;
  if(videos.some(x=>!x.entry.speaking)&&String(liveScene.narration||'').trim()){
    const narrationItems=(await scenePlaybackItems(liveProject,liveScene)).filter(x=>x.kind==='narration');
    if(narrationItems.length===1)narrationAsset=await getOrCreateSceneAudioAsset(liveProject,liveScene,narrationItems[0],0);
  }
  const editPlan=sceneEditPlan(liveProject,liveScene),editByShot=new Map(editPlan.map(x=>[String(x.shotId),x]));
  const clipDurations=videos.map(item=>{const media=Math.max(.25,Number(item.video?.duration)||0),planned=Math.max(0,Number(item.entry?.plannedDurationSec)||0),edit=editByShot.get(String(item.entry?.shotId||''))||{trimInSec:0,trimOutSec:0},available=Math.max(.25,media-Math.max(0,Number(edit.trimInSec)||0)-Math.max(0,Number(edit.trimOutSec)||0));return Math.max(.25,Math.min(available,planned>0?planned:available))}),sceneDuration=clipDurations.reduce((a,b)=>a+b,0);
  return {scene:liveScene,videos,clipDurations,sceneDuration,coverageMode,narrationAsset,editPlan,timelinePolicy:'auto-edited-planned-shot-story-timeline',audioPolicy:'validated-dialogue+narration+controlled-visual-silence'};
}
function clearSceneLipSyncForIntegrityRepair(scene={},reason=''){
  const source=scene.videoUrl||'';
  // Integrity repair invalidates only the synchronized derivative. The durable source remains
  // authoritative input and must not be thrown away or regenerated.
  resetSceneLipSyncOnly(scene,source);
  scene.lipSyncIntegrityRepairAt=new Date().toISOString();
  scene.lipSyncIntegrityReason=reason||'Duplicate synchronized media detected.';
}
async function mediaQuickFingerprint(url=''){
  const value=String(url||'').trim();if(!value||!globalThis.crypto?.subtle)return '';
  try{
    const r=await fetch(value,{headers:{Range:'bytes=0-524287'},cache:'no-store'});
    if(!r.ok&&r.status!==206)return '';
    const ab=await r.arrayBuffer();if(!ab.byteLength)return '';
    const sample=ab.byteLength>524288?ab.slice(0,524288):ab;
    const digest=await crypto.subtle.digest('SHA-256',sample);
    const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    return `${sample.byteLength}:${hex}`;
  }catch(e){console.warn('[CineTale integrity] Media fingerprint unavailable',e);return ''}
}
async function duplicateFinalMediaConflicts(project,episode,{content=true}={}){
  const selected=selectedFinalScenes(episode),conflicts=[],seen=new Map(),push=(type,key,item,other)=>{if(!key)return;const id=`${type}:${item.index}:${other.index}`;if(conflicts.some(x=>x.id===id))return;conflicts.push({id,type,key,index:item.index,scene:item.scene,otherIndex:other.index,otherScene:other.scene})};
  const check=(type,key,item)=>{if(!key)return;const prev=seen.get(`${type}:${key}`);if(prev)push(type,key,item,prev);else seen.set(`${type}:${key}`,item)};
  for(const item of selected){const s=item.scene;check('source-url',normalizedMediaUrl(s.videoUrl||''),item);if(sceneHasValidatedLipSync(project,s)){check('sync-id',String(s.lipSyncGenerationId||''),item);check('sync-url',normalizedMediaUrl(s.lipSyncVideoUrl||''),item);check('sync-remote',normalizedMediaUrl(s.lipSyncRemoteVideoUrl||''),item)}}
  if(!content)return conflicts;
  const fpCache=new Map(),fingerprint=async url=>{const k=normalizedMediaUrl(url||'');if(!k)return '';if(!fpCache.has(k))fpCache.set(k,mediaQuickFingerprint(k));return await fpCache.get(k)};
  const sourceSeen=new Map(),syncSeen=new Map();
  for(const item of selected){
    const s=item.scene,episodeId=episode?.id||episode?.number,sourceRuntime=sceneMediaRuntimeUrl(s,'source')||await hydrateSceneMedia(project.id,episodeId,item.index,'source').catch(()=>''),sourceFp=await fingerprint(sourceRuntime);
    if(sourceFp){const prev=sourceSeen.get(sourceFp);if(prev&&prev.runtime!==sourceRuntime)push('source-content',sourceFp,item,prev.item);else if(!prev)sourceSeen.set(sourceFp,{item,runtime:sourceRuntime})}
    if(sceneHasValidatedLipSync(project,s)){
      const syncRuntime=sceneValidatedSyncPlaybackUrl(s,project)||await hydrateSceneMedia(project.id,episodeId,item.index,'sync').catch(()=>''),syncFp=await fingerprint(syncRuntime);
      if(syncFp){const prev=syncSeen.get(syncFp);if(prev&&prev.runtime!==syncRuntime)push('sync-content',syncFp,item,prev.item);else if(!prev)syncSeen.set(syncFp,{item,runtime:syncRuntime})}
    }
  }
  return conflicts;
}
async function repairDuplicateFinalMedia(projectId,episodeId,tier,onProgress){
  let project=state.projects.find(x=>x.id===projectId),episode=findEpisodeById(project,episodeId);if(!project||!episode)return;
  let conflicts=await duplicateFinalMediaConflicts(project,episode,{content:true});
  const sourceRepair=[...new Set(conflicts.filter(x=>x.type.startsWith('source-')).map(x=>x.index))];
  for(const index of sourceRepair){const other=conflicts.find(x=>x.index===index&&x.type.startsWith('source-'));onProgress?.(`Repairing duplicate source media for scene ${index+1}…`);updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),s=e?.scenes?.[index];if(!s)return;s.videoUrl=null;s.videoOperation=null;s.videoQueuedAt=null;s.videoError=`CineTale detected that this scene shared the same source video as scene ${(other?.otherIndex??0)+1}. Only this duplicate scene is being regenerated.`;s.coverageClips=[];clearSceneLipSyncForIntegrityRepair(s,'Source video was duplicated across scenes.');x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});await submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress);await ensureAutoSceneVideo(projectId,episodeId,index,tier,onProgress)}
  project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId);
  for(const {index,scene} of selectedFinalScenes(episode)){if(scene?.videoUrl&&sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project,scene)){onProgress?.(`Rebuilding dialogue sync for scene ${scene.number||index+1}…`);await ensureSceneLipSync(project,scene,index,{quiet:true,allowSubmit:true});project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId)}}
  project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId);conflicts=await duplicateFinalMediaConflicts(project,episode,{content:true});
  const syncRepair=[...new Set(conflicts.filter(x=>x.type.startsWith('sync-')).map(x=>x.index))];
  for(const index of syncRepair){const other=conflicts.find(x=>x.index===index&&x.type.startsWith('sync-'));onProgress?.(`Repairing duplicated dialogue sync for scene ${index+1}…`);updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),s=e?.scenes?.[index];if(!s)return;clearSceneLipSyncForIntegrityRepair(s,`Synchronized output duplicated scene ${(other?.otherIndex??0)+1}.`);x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId);const scene=episode?.scenes?.[index];if(scene)await ensureSceneLipSync(project,scene,index,{quiet:true,allowSubmit:true})}
  project=state.projects.find(x=>x.id===projectId);episode=findEpisodeById(project,episodeId);const remaining=await duplicateFinalMediaConflicts(project,episode,{content:true});if(remaining.length){const c=remaining[0];throw new Error(`CineTale stopped final rendering because scenes ${c.otherIndex+1} and ${c.index+1} still resolve to the same ${c.type.startsWith('source-')?'source':'synchronized'} video. The duplicate was not hidden or repeated.`)}
}
async function playPreparedFinalScene({asset,index,total,canvas,ctx,audioContext,audioDestination,ambientGain}){
  const {scene,videos,clipDurations=[],sceneDuration,narrationAsset,editPlan=[]}=asset;
  const editByShot=new Map((editPlan||[]).map(x=>[String(x.shotId),x]));
  const videoGains=[];
  for(let i=0;i<videos.length;i++){
    const item=videos[i],video=item.video||item;
    try{
      const src=audioContext.createMediaElementSource(video),gain=audioContext.createGain();
      // Dialogue audio comes only from validated synchronized speaking clips. Non-speaking
      // story coverage may retain low-level natural ambience; unsynchronized speaking footage
      // is never admitted to the final timeline.
      gain.gain.value=0;src.connect(gain);gain.connect(audioDestination);videoGains.push(gain);video.muted=false;video.volume=1;
    }catch(e){console.warn('[CineTale final render] Video audio routing could not be connected',e);videoGains.push(null)}
  }
  let narrationSource=null,narrationGain=null,narrationStarted=false;
  if(narrationAsset?.blob){try{const ab=await narrationAsset.blob.arrayBuffer(),buffer=await audioContext.decodeAudioData(ab.slice(0));narrationSource=audioContext.createBufferSource();narrationSource.buffer=buffer;narrationGain=audioContext.createGain();narrationGain.gain.value=.9;narrationSource.connect(narrationGain);narrationGain.connect(audioDestination)}catch(e){console.warn('[CineTale final render] Narration track could not be decoded',e);narrationSource=null;narrationGain=null}}
  const started=performance.now();let raf=0,activeVideo=(videos[0]?.video||videos[0]),clipStartedAt=started,clipDuration=Math.max(.25,clipDurations[0]||Number(activeVideo?.duration)||.25);
  const paint=()=>{try{drawVideoFrame(ctx,activeVideo,canvas.width,canvas.height)}catch{}const now=performance.now(),clipElapsed=(now-clipStartedAt)/1000,clipRemaining=clipDuration-clipElapsed,edge=Math.max(0,Math.min(1,Math.max((.11-clipElapsed)/.11,clipRemaining<.14?(.14-clipRemaining)/.14:0)));if(edge>0){ctx.fillStyle=`rgba(8,6,20,${edge*.55})`;ctx.fillRect(0,0,canvas.width,canvas.height)}raf=requestAnimationFrame(paint)};paint();
  let elapsed=0;
  for(let clipIndex=0;clipIndex<videos.length;clipIndex++){
    const item=videos[clipIndex],active=item.video||item,duration=Math.max(.25,clipDurations[clipIndex]||Math.min(Number(active.duration)||.25,Number(item.entry?.plannedDurationSec)||Number(active.duration)||.25));activeVideo=active;clipStartedAt=performance.now();clipDuration=duration;
    for(let i=0;i<videoGains.length;i++)if(videoGains[i])videoGains[i].gain.value=i===clipIndex?(item.entry?.synchronized?1:0):0;
    if(narrationGain)narrationGain.gain.value=item.entry?.speaking?0:.9;
    if(!narrationStarted&&narrationSource&&!item.entry?.speaking){try{narrationSource.start();narrationStarted=true}catch{}}
    if(item.entry?.speaking&&narrationSource&&narrationStarted){try{narrationSource.stop()}catch{};narrationSource=null;narrationGain=null}
    try{
      const edit=editByShot.get(String(item.entry?.shotId||''))||{trimInSec:0};active.currentTime=Math.max(0,Math.min(Number(edit.trimInSec)||0,Math.max(0,(Number(active.duration)||0)-.25)));await active.play();
      await Promise.race([new Promise(resolve=>{const done=()=>{active.removeEventListener('ended',done);resolve()};active.addEventListener('ended',done,{once:true})}),sleep(duration*1000)]);active.pause();elapsed=(performance.now()-started)/1000;
    }catch(e){console.warn('[CineTale final render] Planned story shot playback failed',e);throw new Error(`Final render stopped because scene ${scene.number||index+1} shot ${item.entry?.order||clipIndex+1} could not play.`)}
    setFinalRenderProgress(16+Math.round(((index+(clipIndex+1)/Math.max(1,videos.length))/total)*82),`Rendering scene ${index+1} of ${total} · shot ${clipIndex+1}/${videos.length} · ${scene.title||'Untitled'}`)
  }
  cancelAnimationFrame(raf);videos.forEach(item=>(item.video||item).pause());videoGains.forEach(g=>{try{if(g)g.gain.value=0}catch{}});try{if(narrationSource&&narrationStarted)narrationSource.stop()}catch{};ctx.fillStyle='#080614';ctx.fillRect(0,0,canvas.width,canvas.height);await sleep(index<total-1?180:50)
}


async function createFinalVideo(){
  const p=current(),ep=episodeOf(p);if(!p||!ep||state.finalRenderRunning||state.autoFinalRunning)return;
  if(!requireApprovedStory('create the final video'))return;
  const authority=productionActionAuthority(p,ep);if(authority.hardGate){toast(`Production is protected: ${authority.hardGate.label} is not ready. Resolve the highlighted upstream requirement first.`);return}
  const selected=selectedFinalScenes(ep);
  if(!selected.length){toast('Select at least one scene for the final video.');return}
  const allReady=selected.every(({scene})=>sceneStoryTimelineReady(p,scene));
  if(!allReady){return createFinalVideoAutomatically()}
  const conflicts=await duplicateFinalMediaConflicts(p,ep,{content:true});
  if(conflicts.length){toast('CineTale found duplicated scene media and will repair only the affected scene before final rendering.');return createFinalVideoAutomatically()}
  if(!p.finalAssembly?.preparedAt&&!prepareFinalAssembly({silent:true}))return;
  const key=finalVideoAssetKey(p,ep);
  finalVideoRestoreFailures.delete(key);
  return renderFinalVideoFile({autoPrepared:true});
}
async function renderFinalVideoFile({autoPrepared=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('render the final video'))return;const authority=productionActionAuthority(p,ep);if(authority.hardGate){toast(`Final rendering is protected until ${authority.hardGate.label.toLowerCase()} is ready.`);return}const selected=selectedFinalScenes(ep).map(x=>x.scene),scenes=selected.filter(s=>sceneSourceDurablyOwned(s));if(!p.finalAssembly?.preparedAt){if(!prepareFinalAssembly({silent:true})){toast('The final scene order could not be prepared.');return}}if(!scenes.length||scenes.length!==selected.length){toast('Every selected scene needs a generated video clip before final rendering.');return}const notReady=selected.filter(scene=>!sceneStoryTimelineReady(p,scene));if(notReady.length){toast('Final rendering is waiting for dialogue synchronization to finish on every selected speaking scene.');return}const duplicateConflicts=await duplicateFinalMediaConflicts(p,ep,{content:true});if(duplicateConflicts.length){const c=duplicateConflicts[0];toast(`Final render stopped: scenes ${c.otherIndex+1} and ${c.index+1} share the same media. Use Create final video so CineTale can repair only the duplicate scene.`);return}if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('This browser cannot create a local final video. Use current Chrome, Edge or another MediaRecorder-capable browser.');return}const button=$('#renderFinalVideo'),mainButton=$('#autoFinalVideo'),priorStoragePath=p.finalVideoMeta?.storagePath||'';state.finalRenderRunning=true;state.finalRenderProjectId=p.id;if(button){button.disabled=true;button.textContent='Rendering…'}if(mainButton){mainButton.disabled=true;mainButton.textContent='Creating final video…'}setFinalRenderProgress(2,'Preparing final video · keep this tab open.',{force:true});let recorder,audioContext,stream,url;try{const prepared=[];for(let i=0;i<scenes.length;i++)prepared.push(await prepareFinalSceneAsset(p,scenes[i],i,scenes.length));const timelineValidation=validatePreparedFinalTimeline(p,scenes,prepared);const isShort=(p.format||'')==='Short',width=isShort?720:1280,height=isShort?1280:720,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#080614';ctx.fillRect(0,0,width,height);audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();const audioDestination=audioContext.createMediaStreamDestination(),ambientGain=audioContext.createGain();ambientGain.gain.value=.24;ambientGain.connect(audioDestination);stream=canvas.captureStream(30);for(const t of audioDestination.stream.getAudioTracks())stream.addTrack(t);const mime=chooseFinalRecordingMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:isShort?5500000:6500000}:undefined);const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Final recording failed.'))});recorder.start(1000);await sleep(220);for(let i=0;i<prepared.length;i++)await playPreparedFinalScene({asset:prepared[i],index:i,total:prepared.length,canvas,ctx,audioContext,audioDestination,ambientGain});recorder.stop();await stopped;const actualMime=recorder.mimeType||mime||'video/webm',blob=new Blob(chunks,{type:actualMime});const verifiedDuration=await verifyFinalVideoBlob(blob);const key=finalVideoAssetKey(p,ep),filename=finalVideoFilename(p,actualMime),createdAt=new Date().toISOString();url=URL.createObjectURL(blob);const old=finalVideoAssets.get(key);if(old?.url)URL.revokeObjectURL(old.url);const meta={createdAt,mime:actualMime,size:blob.size,filename,sceneCount:scenes.length,durationSec:verifiedDuration,durationMode:'auto-edited-planned-shot-story-timeline',pipelineVersion:13,timelineValidation,transitionPolicy:'dialogue-safe-auto-edit-v1',storagePath:null,storageStatus:finalVideoStorageReady()?'saving':'browser-only'};await saveFinalVideoBlob(key,blob,meta).catch(e=>console.warn('[CineTale final render] Browser persistence unavailable',e));let persistence='browser';if(finalVideoStorageReady()){setFinalRenderProgress(98,'Saving final video to your CineTale account…',{force:true});try{meta.storagePath=await uploadFinalVideoCloud(p,ep,blob,filename,createdAt);meta.storageStatus='saved';persistence='cloud';if(priorStoragePath&&priorStoragePath!==meta.storagePath)deleteFinalVideoCloudPaths([priorStoragePath]).catch(e=>console.warn('[CineTale final render] Previous cloud final could not be removed',e))}catch(e){meta.storageStatus='browser-only';meta.storageError=String(e?.message||e).slice(0,220);console.warn('[CineTale final render] Cloud persistence unavailable; browser copy retained',e)}}await saveFinalVideoBlob(key,blob,meta).catch(()=>{});const asset={blob,url,mime:actualMime,filename,duration:verifiedDuration,persistence};finalVideoAssets.set(key,asset);finalVideoRestoreFailures.delete(key);updateProjectById(p.id,x=>{x.finalVideoMeta=meta;x.renderStatus='final-video-ready';x.autoFinalJob=null},{render:false});setFinalRenderProgress(100,persistence==='cloud'?'Final video saved — play it below.':'Final video ready in this browser — play it below.',{force:true});if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderWorkflow(liveProject);renderFinalAssembly(liveProject,liveEpisode);applyFinalVideoUi(liveProject,liveEpisode,asset)}toast(persistence==='cloud'?'Final video created and saved to your CineTale account.':'Final video created. It is saved in this browser; sign in to keep future final videos with your account.');setTimeout(()=>setFinalRenderProgress(null,''),1200)}catch(e){console.error('[CineTale final render]',e);setFinalRenderProgress(null,'');autoFinalJobPatch(p.id,{status:'needs-attention',stage:'Final render needs attention',lastError:e.message||String(e)});toast(e.message||'Final video rendering failed.')}finally{try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{await audioContext?.close()}catch{}state.finalRenderRunning=false;state.finalRenderProjectId=null;if(button){button.disabled=false;button.textContent='Render full video'}if(mainButton){mainButton.disabled=false;mainButton.textContent='Create final video'}if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderFinalAssembly(liveProject,liveEpisode)}}}
function currentFinalVideoAsset(){const p=current(),ep=episodeOf(p);return p&&ep?finalVideoAssets.get(finalVideoAssetKey(p,ep)):null}
function downloadFinalVideoFile(){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const a=document.createElement('a');a.href=asset.url;a.download=asset.filename||finalVideoFilename(p,asset.mime);document.body.appendChild(a);a.click();a.remove()}
async function shareFinalVideoFile(){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const file=new File([asset.blob],asset.filename||finalVideoFilename(p,asset.mime),{type:asset.mime||asset.blob.type});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({title:p.title||'CineTale',text:`${p.title||'CineTale'} — created in CineTale`,files:[file]});return}catch(e){if(e?.name==='AbortError')return}}downloadFinalVideoFile();toast('Your browser cannot share video files directly, so CineTale downloaded the final video instead.')}
function publishFinalVideo(platform){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const destinations={youtube:'https://www.youtube.com/upload',instagram:'https://www.instagram.com/',tiktok:'https://www.tiktok.com/upload',facebook:'https://www.facebook.com/'};const url=destinations[platform];if(!url)return;downloadFinalVideoFile();window.open(url,'_blank','noopener,noreferrer');toast(`Final video downloaded. ${platform==='youtube'?'YouTube':platform==='instagram'?'Instagram':platform==='tiktok'?'TikTok':'Facebook'} opened so you can review and publish it.`)}
function downloadFinalAssemblyManifest(){const p=current(),ep=episodeOf(p);if(!p)return;const manifest=p.finalAssembly||finalAssemblyManifest(p,ep);const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(p.title||'cinetale').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-final-assembly.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function renderStudioAfterSceneMediaUpdate(index=null){
  const p=current(),ep=episodeOf(p),list=$('#sceneList');
  if(!p||!ep||!list){renderStudio();return}
  // Media completion is a scene-local event. Never remount the whole Studio just because one
  // provider job finished; doing so visibly reloads every <video> and caused cross-scene flicker.
  if(Number.isInteger(index)){
    const scene=ep.scenes?.[index],card=list.querySelector(`[data-scene-card-index="${index}"]`),surface=card?.querySelector('.scene-visual');
    if(scene&&card&&surface){
      const art=visualSrc(scene),existing=surface.querySelector('video[data-scene-video-preview]');
      if(scene.videoUrl){
        const desired=sceneStudioVideoUrl(scene,p);
        if(existing){
          const currentSrc=normalizedMediaUrl(existing.currentSrc||existing.getAttribute('src')||''),desiredSrc=normalizedMediaUrl(desired||'');
          const shouldBeSyncGated=sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(p,scene);
          const mountedSyncGated=existing.dataset.syncGated==='1';
          // v1.9.93 root-cause fix: once Finish clip produces a validated synchronized asset,
          // do not mutate the old preview node in place. That node owns permanent sync-gate listeners
          // which re-mute it on volumechange and has no native controls. Replacing this ONE player
          // gives the finished asset a clean <video controls> element with audio enabled.
          if(mountedSyncGated!==shouldBeSyncGated){
            const markup=sceneVideoMarkup(scene,art,scene.title||`Scene ${index+1}`,index,p),template=document.createElement('template');template.innerHTML=markup;const replacement=template.content.querySelector('video[data-scene-video-preview]');
            stopSceneVideoVoicePlayback(existing,{restoreProviderAudio:false});try{existing.pause()}catch{}
            if(replacement)existing.replaceWith(replacement);else surface.innerHTML=`${markup}<div class="asset-tag hidden" data-scene-media-status="${index}"></div>`;
          }else if(desired&&currentSrc!==desiredSrc){
            stopSceneVideoVoicePlayback(existing,{restoreProviderAudio:false});
            existing.src=desired;existing.load();
          }
        }else{
          surface.innerHTML=`${sceneVideoMarkup(scene,art,scene.title||`Scene ${index+1}`,index,p)}<div class="asset-tag hidden" data-scene-media-status="${index}"></div>`;
        }
        const button=card.querySelector(`[data-scene-video="${index}"]`);if(button){button.textContent=videoButtonLabel(scene,p);button.disabled=videoButtonDisabled(scene,false)}
        applySceneShotSelection(p,ep,index);bindSceneVideoVoicePlayback(p,ep);updateSceneMediaStatuses(p,ep);renderFinalAssembly(p,ep);return;
      }
      updateSceneMediaStatuses(p,ep);return;
    }
  }
  // Fall back to a full render only when the card is genuinely absent (navigation/schema change).
  renderStudio();
}

const videoPollers=new Map();
function videoPollKey(projectId,episodeId,sceneIndex,operation=''){return `${projectId}:${episodeId||'active'}:${sceneIndex}:${operation||'active'}`}
function videoElapsedLabel(startedAt){const sec=Math.max(0,Math.floor((Date.now()-Number(startedAt||Date.now()))/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`}
async function pollVideo(i,operation,button,{background=false}={}){
  const initial=current(),initialEp=episodeOf(initial);if(!initial||!initialEp)return;
  const projectId=initial.id,episodeId=initialEp.id||initialEp.number,key=videoPollKey(projectId,episodeId,i,operation);
  if(videoPollers.has(key))return videoPollers.get(key);
  const failTerminal=(error)=>{
    confirmedVideoOperations.delete(operation);
    const message=videoUserFailureMessage(error);
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=message;target.videoErrorCode=error?.code||'VIDEO_GENERATION_FAILED';target.videoErrorRetryable=Boolean(error?.retryable);target.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(target)}},{render:false});
    if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);
    return message;
  };
  const job=(async()=>{
    for(let attempt=0;attempt<72;attempt++){
      const live=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(live,episodeId),scene=liveEp?.scenes?.[i];
      if(!scene||scene.videoOperation!==operation)return;
      const started=scene.videoQueuedAt||Date.now();
      if(button&&!background){button.textContent=videoProgressCopy(started)}
      // Check immediately on the first pass. A finished/failed provider job must never sit in a
      // fake rendering state merely because CineTale is waiting for its next polling interval.
      if(attempt>0){const waitMs=attempt<4?6500:Math.min(15000,9000+attempt*250);await new Promise(r=>setTimeout(r,waitMs))}
      const d=await fetchVideoStatus(operation);
      const terminalError=videoStatusTerminalError(d);
      if(terminalError){const message=failTerminal(terminalError);throw Object.assign(new Error(message),{code:terminalError.code})}
      if(d.status==='ready'&&d.videoUrl){
        confirmedVideoOperations.delete(operation);
        if(!claimCompletedPrimaryVideo(projectId,episodeId,i,operation,d.videoUrl,{videoDurationSec:Number(d.durationSeconds)||0}))return;
        const liveNow=state.projects.find(x=>x.id===projectId),liveEpisode=findEpisodeById(liveNow,episodeId),targetNow=liveEpisode?.scenes?.[i];if(!targetNow||normalizedMediaUrl(targetNow.videoUrl||'')!==normalizedMediaUrl(d.videoUrl||''))return;
        await commitPrimarySceneVideo(projectId,episodeId,i,d.videoUrl,{operation,patch:{videoDurationSec:Number(d.durationSeconds)||targetNow.videoDurationSec||0},announce:false});
        const afterSource=state.projects.find(x=>x.id===projectId),afterEpisode=findEpisodeById(afterSource,episodeId),afterScene=afterEpisode?.scenes?.[i];
        if(afterSource&&afterScene&&sceneHasSpokenContent(afterScene)){
          let synced='';
          try{synced=await ensureSceneLipSync(afterSource,afterScene,i,{quiet:false,allowSubmit:true,propagateErrors:true})}
          catch(error){if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);throw error}
          const readyProject=state.projects.find(x=>x.id===projectId),readyEpisode=findEpisodeById(readyProject,episodeId),readyScene=readyEpisode?.scenes?.[i];
          if(!synced||!readyProject||!readyScene||!sceneHasValidatedLipSync(readyProject,readyScene)){if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);throw new Error(`Scene ${readyScene?.number||i+1} video was saved, but its approved dialogue could not be synchronized. The source video remains available for retry.`)}
          if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);
          toast(`Scene ${readyScene.number||i+1} video and dialogue are ready.`);
        }else{if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);toast(`Scene ${afterScene?.number||i+1} video is ready.`)}
        return;
      }
    }
    confirmedVideoOperations.delete(operation);
    const message='Video is taking longer than usual. CineTale kept the existing render job so another paid request cannot start accidentally.';
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[i];if(target?.videoOperation===operation){target.videoRecoveryError=message;target.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
    if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(i);
    throw Object.assign(new Error(message),{code:'VIDEO_STATUS_TIMEOUT'});
  })().finally(()=>videoPollers.delete(key));
  videoPollers.set(key,job);return job;
}
async function reconcileSavedVideoOperation(i,scene){
  const p=current(),ep=episodeOf(p);if(!p||!ep||!scene?.videoOperation)return;
  const operation=scene.videoOperation;
  if(confirmedVideoOperations.has(operation)||recoveringVideoOperations.has(operation))return;
  recoveringVideoOperations.add(operation);
  try{
    const d=await fetchVideoStatus(operation);
    if(d.status==='ready'&&d.videoUrl){
      claimCompletedPrimaryVideo(p.id,ep.id||ep.number,i,operation,d.videoUrl,{videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0});
      await commitPrimarySceneVideo(p.id,ep.id||ep.number,i,d.videoUrl,{operation:null,patch:{videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0},announce:false});toast('Saved video render recovered and stored safely.');return;
    }
    const terminalError=videoStatusTerminalError(d);
    if(terminalError){
      updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=videoUserFailureMessage(terminalError);target.videoErrorCode=terminalError.code||'VIDEO_GENERATION_FAILED';target.videoErrorRetryable=Boolean(terminalError.retryable);target.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(target)}});
      return;
    }
    if(d.status==='processing'||d.status==='pending'||d.status==='running'||d.done===false){
      if(!productionRecoveryAutoPollingAllowed(p)){updateProjectById(p.id,x=>{const e=findEpisodeById(x,ep.id||ep.number),target=e?.scenes?.[i];if(target?.videoOperation===operation){target.videoRecoveryState='deferred';target.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});return}
      confirmedVideoOperations.add(operation);
      renderStudio();
      pollVideo(i,operation,null,{background:true}).catch(e=>toast(e.message||'Video generation failed'));
      return;
    }
    updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoRecoveryError='CineTale could not confirm the saved render status yet. The existing job is preserved so another paid request cannot start accidentally.';target.videoRecoveryCheckedAt=new Date().toISOString()}});
  }catch(e){
    updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoRecoveryError='CineTale could not verify the saved render right now. The existing job is preserved and no replacement render was started.';target.videoRecoveryCheckedAt=new Date().toISOString()}});
  }finally{
    recoveringVideoOperations.delete(operation);
  }
}
function resumePendingVideoPolls(){
  const p=current(),ep=episodeOf(p);if(!p||!ep||!productionRecoveryAutoPollingAllowed(p))return;
  (ep.scenes||[]).forEach((s,i)=>{if(s.videoOperation)reconcileSavedVideoOperation(i,s)});
}

const coverageRecoveryPollers=new Map();
function coverageRecoveryKey(projectId,episodeId,sceneIndex,shotId,operation=''){return `${projectId}:${episodeId||'active'}:${sceneIndex}:${shotId}:${operation||'canonical'}`}
function clearCoverageTerminalState(projectId,episodeId,sceneIndex,shotId,operation,error){
  const message=videoUserFailureMessage(error);
  updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.operation=null;item.queuedAt=null;item.error=message;item.errorCode=error?.code||'VIDEO_GENERATION_FAILED';item.errorRetryable=Boolean(error?.retryable);item.failedAt=new Date().toISOString();item.videoRecoveryError=null;item.videoRecoveryCheckedAt=new Date().toISOString();compactCoverageShotRecords(scene,shotId)}},{render:false});
  if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(sceneIndex);
  return message;
}
async function pollSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation){
  const key=coverageRecoveryKey(projectId,episodeId,sceneIndex,shotId,operation);
  if(coverageRecoveryPollers.has(key))return coverageRecoveryPollers.get(key);
  const job=(async()=>{
    for(let attempt=0;attempt<72;attempt++){
      const live=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(live,episodeId),scene=ep?.scenes?.[sceneIndex],entry=coverageEntryForOperation(scene,shotId,operation);
      if(!entry)return;
      // A deferred recovery must stop even an already-scheduled background poller.
      // Recheck after sleep because recovery can become deferred while waiting.
      if(!productionRecoveryAutoPollingAllowed(live))return;
      if(attempt>0)await sleep(attempt<4?6500:Math.min(15000,9000+attempt*250));
      const refreshed=state.projects.find(x=>x.id===projectId);
      if(!productionRecoveryAutoPollingAllowed(refreshed))return;
      const d=await fetchVideoStatus(operation);
      const terminalError=videoStatusTerminalError(d);
      if(terminalError){clearCoverageTerminalState(projectId,episodeId,sceneIndex,shotId,operation,terminalError);return}
      if(d.status==='ready'&&d.videoUrl){
        if(!claimCompletedCoverageVideo(projectId,episodeId,sceneIndex,shotId,operation,d.videoUrl))return;
        if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(sceneIndex);
        try{const saved=await persistCoverageMediaUrl(projectId,episodeId,sceneIndex,shotId,d.videoUrl,{commit:false});updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntry(scene,shotId);if(item?.videoUrl===d.videoUrl){item.videoLocalMediaKey=saved.localKey;item.videoStoragePath=saved.storagePath;item.videoMediaPersistedAt=saved.persistedAt;item.videoMediaOwnership=saved.ownership;item.videoMediaExpired=false;item.videoProviderCompletedAt=item.videoProviderCompletedAt||new Date().toISOString();item.videoRecoveryState='ready';item.error=null;item.errorCode=null;item.errorRetryable=null;item.failedAt=null;item.videoRecoveryError=null;item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false})}
        catch(error){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntry(scene,shotId);if(item?.videoUrl===d.videoUrl){item.videoRecoveryState='save_failed';item.error=error?.message||'The finished shot could not be saved durably.';item.errorCode='VIDEO_ASSET_PERSIST_FAILED';item.failedAt=new Date().toISOString()}},{render:false})}
        if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(sceneIndex);return;
      }
    }
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryError='This saved video job is taking longer than usual. CineTale kept the existing job so another paid request cannot start accidentally.';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
    if(current()?.id===projectId)renderStudioAfterSceneMediaUpdate(sceneIndex);
  })().finally(()=>coverageRecoveryPollers.delete(key));
  coverageRecoveryPollers.set(key,job);return job;
}
async function reconcileSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation){
  if(!operation||!productionRecoveryAutoPollingAllowed(state.projects.find(x=>x.id===projectId)))return;
  const key=coverageRecoveryKey(projectId,episodeId,sceneIndex,shotId,operation);if(coverageRecoveryPollers.has(key))return;
  try{
    const d=await fetchVideoStatus(operation);
    if(!productionRecoveryAutoPollingAllowed(state.projects.find(x=>x.id===projectId)))return;
    const terminalError=videoStatusTerminalError(d);
    if(terminalError){clearCoverageTerminalState(projectId,episodeId,sceneIndex,shotId,operation,terminalError);return}
    if(d.status==='ready'&&d.videoUrl){await pollSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation);return}
    if(d.status==='processing'||d.status==='pending'||d.status==='running'||d.done===false){const live=state.projects.find(x=>x.id===projectId);if(!productionRecoveryAutoPollingAllowed(live)){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryState='deferred';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});return}pollSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation).catch(()=>{});return}
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryError='CineTale could not confirm this saved shot render yet. The existing job is preserved so another paid request cannot start accidentally.';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
  }catch(error){
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryError='CineTale could not verify this saved shot render right now. The existing job is preserved and no replacement render was started.';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
  }
}
function resumePendingCoverageVideoPolls(){
  const p=current(),ep=episodeOf(p);if(!p||!ep||!productionRecoveryAutoPollingAllowed(p))return;const episodeId=ep.id||ep.number;
  (ep.scenes||[]).forEach((scene,sceneIndex)=>{for(const entry of scene?.coverageClips||[])if(entry?.operation)reconcileSavedCoverageOperation(p.id,episodeId,sceneIndex,entry.shotId,entry.operation)});
}

async function reconcilePersistedVideoJobsOnOpen(projectId){
  const project=state.projects.find(x=>x.id===projectId);if(!project||!productionRecoveryAutoPollingAllowed(project))return;
  const tasks=[];
  for(const ep of project.episodes||[]){
    for(let i=0;i<(ep.scenes||[]).length;i++){
      const scene=ep.scenes[i];
      if(scene?.videoOperation)tasks.push({kind:'primary',episodeId:ep.id||ep.number,index:i,operation:scene.videoOperation});
      for(const entry of scene?.coverageClips||[])if(entry?.operation)tasks.push({kind:'coverage',episodeId:ep.id||ep.number,index:i,shotId:entry.shotId,operation:entry.operation});
    }
  }
  const seen=new Map();
  await Promise.allSettled(tasks.map(async task=>{
    let pending=seen.get(task.operation);if(!pending){pending=fetchVideoStatus(task.operation);seen.set(task.operation,pending)}
    let d;try{d=await pending}catch(error){return}
    if(!productionRecoveryAutoPollingAllowed(state.projects.find(x=>x.id===projectId)))return;
    const terminalError=videoStatusTerminalError(d);
    if(task.kind==='primary'){
      const live=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(live,task.episodeId),scene=ep?.scenes?.[task.index];
      if(!scene||scene.videoOperation!==task.operation)return;
      if(d.status==='ready'&&d.videoUrl){
        claimCompletedPrimaryVideo(projectId,task.episodeId,task.index,task.operation,d.videoUrl,{videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0});
        try{await commitPrimarySceneVideo(projectId,task.episodeId,task.index,d.videoUrl,{operation:null,patch:{videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0},announce:false})}catch(error){updateProjectById(projectId,x=>{const e=findEpisodeById(x,task.episodeId),t=e?.scenes?.[task.index];if(t?.videoOperation===task.operation){t.videoOperation=null;t.videoQueuedAt=null;t.videoError='The finished video could not be verified or saved. Your project is safe. Try this shot again when ready.';t.videoErrorCode='VIDEO_ASSET_PERSIST_FAILED';t.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(t)}},{render:false})}
      }else if(terminalError){
        confirmedVideoOperations.delete(task.operation);
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,task.episodeId),t=e?.scenes?.[task.index];if(t?.videoOperation===task.operation){t.videoOperation=null;t.videoQueuedAt=null;t.videoError=videoUserFailureMessage(terminalError);t.videoErrorCode=terminalError.code||'VIDEO_GENERATION_FAILED';t.videoErrorRetryable=Boolean(terminalError.retryable);t.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(t)}},{render:false});
      }
    }else{
      const live=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(live,task.episodeId),scene=ep?.scenes?.[task.index],entry=coverageEntryForOperation(scene,task.shotId,task.operation);
      if(!entry)return;
      if(d.status==='ready'&&d.videoUrl){
        if(!claimCompletedCoverageVideo(projectId,task.episodeId,task.index,task.shotId,task.operation,d.videoUrl))return;
        try{const saved=await persistCoverageMediaUrl(projectId,task.episodeId,task.index,task.shotId,d.videoUrl,{commit:false});updateProjectById(projectId,x=>{const e=findEpisodeById(x,task.episodeId),scene=e?.scenes?.[task.index],item=coverageEntry(scene,task.shotId);if(item?.videoUrl===d.videoUrl){item.videoLocalMediaKey=saved.localKey;item.videoStoragePath=saved.storagePath;item.videoMediaPersistedAt=saved.persistedAt;item.videoMediaOwnership=saved.ownership;item.videoMediaExpired=false;item.videoProviderCompletedAt=item.videoProviderCompletedAt||new Date().toISOString();item.videoRecoveryState='ready';item.error=null;item.errorCode=null;item.errorRetryable=null;item.failedAt=null}},{render:false})}catch(error){updateProjectById(projectId,x=>{const e=findEpisodeById(x,task.episodeId),scene=e?.scenes?.[task.index],item=coverageEntry(scene,task.shotId);if(item?.videoUrl===d.videoUrl){item.videoRecoveryState='save_failed';item.error=error?.message||'The finished shot could not be saved durably.';item.errorCode='VIDEO_ASSET_PERSIST_FAILED';item.failedAt=new Date().toISOString()}},{render:false})}
      }else if(terminalError){clearCoverageTerminalState(projectId,task.episodeId,task.index,task.shotId,task.operation,terminalError)}
      else if(d.status==='processing'||d.status==='pending'||d.status==='running'||d.done===false){pollSavedCoverageOperation(projectId,task.episodeId,task.index,task.shotId,task.operation).catch(()=>{})}
    }
  }));
  if(current()?.id===projectId)renderStudio();
}
function reconcileAllPersistedVideoJobs(){for(const p of state.projects||[])if(p?.id)reconcilePersistedVideoJobsOnOpen(p.id).catch(()=>{})}
async function finishSceneClip(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];
  syncDiag('retry-action-enter',p,s,{sceneIndex:i,userInitiated:true,allowSubmit:true,label:String(button?.textContent||'')});
  if(!s||!requireApprovedStory('finish dialogue'))return;
  if(!sceneSourceDurablyOwned(s)){toast('This scene does not have a durable source video yet. Generate the video clip first.');return}
  if(!sceneHasSpokenContent(s)){toast('This scene has no speaking dialogue to synchronize.');return}
  if(sceneHasValidatedLipSync(p,s)){if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);return}
  if(!sceneVideoProductionProvenanceValid(p,s)){syncDiag('gate-source-provenance-failed',p,s,{sceneIndex:i,userInitiated:true,allowSubmit:true});toast('This older source clip cannot be safely matched to the current character and shot identity. Regenerate this one clip once; CineTale will finish the approved dialogue automatically.');return}
  const old=button?.textContent||'Finish clip';
  if(button){button.disabled=true;button.dataset.finishRunning='1';button.textContent='Preparing dialogue…'}
  updateProjectById(p.id,x=>{const e=findEpisodeById(x,ep.id||ep.number)||episodeOf(x),t=e?.scenes?.[i];if(t){t.lipSyncAutoPending=true;t.lipSyncStatus='preparing';t.lipSyncError=null;t.lipSyncErrorCode=''}},{render:false});
  if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);
  try{
    const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject),liveScene=liveEpisode?.scenes?.[i]||s;
    const synced=await ensureSceneLipSync(liveProject,liveScene,i,{quiet:false,allowSubmit:true,propagateErrors:true,userInitiated:true});
    const doneProject=state.projects.find(x=>x.id===p.id),doneEpisode=findEpisodeById(doneProject,ep.id||ep.number)||episodeOf(doneProject),doneScene=doneEpisode?.scenes?.[i];
    if(!synced||!doneProject||!doneScene||!sceneHasValidatedLipSync(doneProject,doneScene))throw new Error('CineTale did not receive and validate a finished synchronized clip. Your existing source video was preserved.');
    updateProjectById(p.id,x=>{const e=findEpisodeById(x,ep.id||ep.number)||episodeOf(x),t=e?.scenes?.[i];if(t){t.lipSyncAutoPending=false;t.lipSyncError=null;t.lipSyncErrorCode=''}},{render:false});
    if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);
    toast(`Scene ${doneScene.number||i+1} finished with its approved voice.`);
  }catch(e){
    updateProjectById(p.id,x=>{const ep2=findEpisodeById(x,ep.id||ep.number)||episodeOf(x),t=ep2?.scenes?.[i];if(t){t.lipSyncAutoPending=false;t.lipSyncStatus='error';t.lipSyncError=e?.message||String(e);t.lipSyncErrorCode=e?.code||t.lipSyncErrorCode||'finish_clip_failed'}},{render:false});
    if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);
    toast(e?.message||'Finish clip could not complete.');
  }finally{
    if(button?.isConnected){delete button.dataset.finishRunning;button.disabled=false;const live=state.projects.find(x=>x.id===p.id),liveEp=findEpisodeById(live,ep.id||ep.number)||episodeOf(live),liveScene=liveEp?.scenes?.[i];button.textContent=liveScene?videoButtonLabel(liveScene,live):old}
  }
}
async function requestVideo(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s||!requireApprovedStory('generate video'))return;
  const old=button.textContent;button.disabled=true;
  try{
    if(s.videoOperation){toast('CineTale is checking the saved video render before starting another one.');reconcileSavedVideoOperation(i,s);return}
    if(s.videoUrl&&!sceneSourceDurablyOwned(s)&&s.videoProviderCompletedAt){button.textContent='Restoring finished video…';try{await hydrateSceneMedia(p.id,ep.id||ep.number,i,'source');const live=state.projects.find(x=>x.id===p.id),liveScene=findEpisodeById(live,ep.id||ep.number)?.scenes?.[i];if(sceneSourceDurablyOwned(liveScene)){toast('Finished video restored without starting another generation job.');return}}catch{}toast('The finished provider result could not be restored safely. CineTale did not start another paid video job.');return}
    // If CineTale already owns the correct source video, do not spend another paid video generation just
    // because dialogue synchronization is incomplete. Finish the existing shot with the exact
    // approved character voice, persist the synchronized MP4, then expose it as the playable clip.
    if(sceneSourceDurablyOwned(s)&&sceneHasSpokenContent(s)&&!sceneHasValidatedLipSync(p,s)&&sceneVideoProductionProvenanceValid(p,s)){
      // Source already exists. Dialogue finalization is automatic and must not spend another
      // video-generation credit or require a second user action.
      button.textContent='Finalizing dialogue…';
      scheduleSceneLipSyncAfterSourceReady(p.id,ep.id||ep.number,i,{announce:false});
      return;
    }
    button.textContent='Submitting…';
    const primaryShot=primaryCoverageShot(s,'balanced');
    const videoScene=sceneForVideoShot(s,primaryShot);
    const primaryMeta=speakingVideoMeta(primaryShot);
    const productionContract=videoProductionContract(p,ep,s,primaryShot);
    const d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:videoScene});
    if(d.status==='not_configured'){toast('Live video is off. Enable the configured video service in deployment settings and redeploy.');return}
    if(d.operation){
      confirmedVideoOperations.add(d.operation);
      bumpUsage('video');
      // Single-scene regeneration must not remount every other scene/video in Studio.
      // Persist only the requested scene state here; the existing DOM stays mounted while the
      // provider job runs. The completed scene is refreshed once its replacement is actually ready.
      updateProjectById(p.id,x=>{const e=findEpisodeById(x,ep.id||ep.number)||episodeOf(x),target=e?.scenes?.[i];if(!target)return;target.videoPendingPrimaryMeta={...primaryMeta};target.videoPendingProductionContract=productionContract;target.videoPendingSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);target.videoOperation=d.operation;target.videoQueuedAt=Date.now();target.videoError=null;target.videoPlaybackError=null;target.videoModel=d.model||null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoRoute='requested-quality';target.videoFallbackFrom=null;},{render:false});
      toast('Video rendering started. You can keep working while CineTale finishes it.');
      // Do not lock the interface while Gemini Omni renders. Poll in the background.
      pollVideo(i,d.operation,null,{background:true}).catch(e=>toast(e.message||'Video generation failed'));
      return;
    }
    if(d.videoUrl){
      bumpUsage('video');
      await commitPrimarySceneVideo(p.id,ep.id||ep.number,i,d.videoUrl,{patch:{...primaryMeta,videoProductionContract:productionContract,videoDurationSec:Number(d.durationSeconds)||s.videoDurationSec||0,videoSpeechGuide:Boolean(d.speaking||primaryMeta.videoPrimarySpeaking)},announce:false});
      let liveProject=state.projects.find(x=>x.id===p.id),liveEpisode=findEpisodeById(liveProject,ep.id||ep.number),liveScene=liveEpisode?.scenes?.[i];
      if(liveProject&&liveScene&&sceneHasSpokenContent(liveScene)){
        button.textContent='Finalizing dialogue…';
        let synced='';
        try{synced=await ensureSceneLipSync(liveProject,liveScene,i,{quiet:false,allowSubmit:true,propagateErrors:true})}
        catch(error){if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);throw error}
        liveProject=state.projects.find(x=>x.id===p.id);liveEpisode=findEpisodeById(liveProject,ep.id||ep.number);liveScene=liveEpisode?.scenes?.[i];
        if(!synced||!liveProject||!liveScene||!sceneHasValidatedLipSync(liveProject,liveScene)){if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);throw new Error(`Scene ${liveScene?.number||i+1} video was saved, but its approved dialogue could not be synchronized. The source video remains available for retry.`)}
        if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);
        toast(`Scene ${liveScene.number||i+1} video and dialogue are ready.`);
      }else{
        if(current()?.id===p.id)renderStudioAfterSceneMediaUpdate(i);
        toast('Scene video is saved and ready.');
      }
      return
    }
    toast('Video job submitted.');
  }catch(e){
    if(Number(e?.status)===429||e?.code==='VIDEO_QUOTA'){
      const retry=Math.max(20,Math.min(300,Number(e?.details?.retryAfterSeconds)||60));
      updateProjectById(p.id,x=>{const epx=findEpisodeById(x,ep.id||ep.number),target=epx?.scenes?.[i];if(target){target.videoRetryAt=Date.now()+retry*1000;target.videoError=videoQuotaMessage(e)}},{render:false});
      toast(`Video generation is temporarily limited. CineTale retried safely${normalizedTier(s.tier)!=='premium'?' using the configured efficient route':''}. Your scene is safe; try again in about ${retry} seconds.`);
      setTimeout(()=>{const live=state.projects.find(x=>x.id===p.id),liveEp=findEpisodeById(live,ep.id||ep.number),target=liveEp?.scenes?.[i];if(target&&Number(target.videoRetryAt||0)<=Date.now()){target.videoRetryAt=null;save();if(current()?.id===p.id)renderStudio()}},retry*1000+250);
    }else toast(e.message||'Video generation failed')
  }finally{
    button.disabled=false;
    // Keep this one button accurate without rebuilding the entire Studio. Full scene refresh
    // happens when the provider returns a new clip (or on the next deliberate navigation).
    const live=state.projects.find(x=>x.id===p.id),liveEp=findEpisodeById(live,ep.id||ep.number)||episodeOf(live),liveScene=liveEp?.scenes?.[i];
    button.textContent=liveScene?videoButtonLabel(liveScene,live):old;
  }
}

function autoFinalTier(mode){return mode==='fast'?'draft':mode==='cinematic'?'premium':'standard'}
function productionConcurrency(mode='balanced'){return mode==='cinematic'?2:3}
function videoQuotaMessage(error){const raw=String(error?.message||error||'').trim();if(Number(error?.status)===429||/quota|rate limit|too many requests|resource exhausted/i.test(raw)){const retrySec=Math.max(20,Math.min(300,Number(error?.details?.retryAfterSeconds)||60));state.autoVideoSubmissionBackoffUntil=Math.max(Number(state.autoVideoSubmissionBackoffUntil||0),Date.now()+retrySec*1000);if(/per day|daily|rpd|current quota/i.test(raw))return 'Video quota is currently exhausted. Completed clips are safe. Resume later or skip the remaining scene; CineTale will not silently submit a second paid job.';return 'Video generation is temporarily rate-limited. CineTale will protect completed work and retry at a safer pace.'}return raw||'Video generation failed.'}
async function waitForAutoVideoSubmissionSlot(onProgress){const windowMs=20000,maxPerWindow=3;while(true){const now=Date.now(),backoffUntil=Number(state.autoVideoSubmissionBackoffUntil||0);if(backoffUntil>now){const wait=backoffUntil-now;onProgress?.(`Video service is rate-limited · retrying safely in ${Math.ceil(wait/1000)}s`);await sleep(Math.min(wait,5000));if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');continue}state.autoVideoSubmissionTimes=state.autoVideoSubmissionTimes.filter(ts=>now-ts<windowMs);if(state.autoVideoSubmissionTimes.length<maxPerWindow){state.autoVideoSubmissionTimes.push(now);return}const wait=Math.max(700,windowMs-(now-state.autoVideoSubmissionTimes[0])+500);onProgress?.(`Preparing the next shot · ${Math.ceil(wait/1000)}s`);await sleep(Math.min(wait,3000));if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.')}}
function findEpisodeById(p,id){return (p?.episodes||[]).find(e=>String(e.id||e.number)===String(id))||episodeOf(p)}
async function waitForAutoVideo(projectId,episodeId,index,operation,onProgress,opts={}){
  const recoveryOnly=Boolean(opts?.recoveryOnly);
  let consecutiveErrors=0,recoveryPendingChecks=0,processingChecks=0;
  const maxAttempts=recoveryOnly?RECOVERY_ONLY_MAX_ATTEMPTS:96;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    if(triggerProductionAuthPause(projectId))throw new Error('Production paused because the creator session needs sign-in. Existing paid jobs were preserved.');
    if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused safely.');
    const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];
    if(!scene)throw new Error('A selected scene is no longer available.');
    if(!scene.videoOperation&&sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;
    onProgress?.(`${videoProgressCopy(scene.videoQueuedAt||Date.now()).replace('…','')} · scene ${scene.number||index+1}`);
    if(attempt>0)await sleep(recoveryOnly?RECOVERY_ONLY_POLL_MS:(attempt<6?4500:Math.min(10000,6500+attempt*120)));
    let d;
    try{d=await fetchVideoStatus(operation);consecutiveErrors=0}
    catch(e){consecutiveErrors++;if(consecutiveErrors<4){onProgress?.(`Temporary connection delay on scene ${scene.number||index+1}; checking again…`);continue}throw e}
    if(d?.status==='recovery_pending'){
      recoveryPendingChecks++;
      if(d.manualReviewRequired){const err=new Error('Google returned an unclassified status retrieval error. The original paid operation is preserved; automatic rechecks are paused for review.');err.code='RECOVERY_DEFERRED';throw err;}
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target?.videoOperation===operation){target.videoRecoveryState='recovering';target.videoRecoveryReason=d.recoveryReason||d.error||'provider-recovery';target.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
      if(!recoveryOnly&&triggerProductionStallPause(projectId,`Recovering scene ${scene.number||index+1}`))throw new Error('Production paused after no new completed media for 15 minutes. Existing paid jobs were preserved.');
      if(recoveryOnly&&recoveryPendingChecks>=RECOVERY_ONLY_MAX_ATTEMPTS){const err=new Error('Existing provider job is still pending. CineTale stopped checking for now; the provider operation was preserved and no replacement was submitted.');err.code='RECOVERY_DEFERRED';throw err}
      onProgress?.(`Recovering existing provider job · scene ${scene.number||index+1}…`);
      continue
    }
    if(d?.status==='processing'){
      processingChecks++;
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target?.videoOperation===operation){target.videoRecoveryState='generating';target.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
      if(recoveryOnly&&processingChecks>=RECOVERY_ONLY_MAX_ATTEMPTS){const err=new Error('Existing provider job is still processing. CineTale stopped checking for now; the provider operation was preserved and no replacement was submitted.');err.code='RECOVERY_DEFERRED';throw err}
    }
    const terminalError=videoStatusTerminalError(d);
    if(terminalError){
      const message=videoUserFailureMessage(terminalError);
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=message;target.videoErrorCode=terminalError.code||'VIDEO_GENERATION_FAILED';target.videoErrorRetryable=Boolean(terminalError.retryable);target.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(target)}},{render:false});
      throw new Error(message)
    }
    if(d.status==='ready'&&d.videoUrl){
      const liveNow=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(liveNow,episodeId),targetNow=liveEp?.scenes?.[index];
      claimCompletedPrimaryVideo(projectId,episodeId,index,operation,d.videoUrl,{videoDurationSec:Number(d.durationSeconds)||targetNow?.videoDurationSec||0});
      await commitPrimarySceneVideo(projectId,episodeId,index,d.videoUrl,{operation:null,patch:{videoDurationSec:Number(d.durationSeconds)||targetNow?.videoDurationSec||0},announce:false});
      return d.videoUrl
    }
  }
  if(recoveryOnly){const err=new Error('Recovery check ended without a completed provider result. CineTale preserved the operation and stopped polling; check again later.');err.code='RECOVERY_DEFERRED';throw err}
  throw new Error('Video is taking longer than expected. CineTale saved the pending work so it can be checked again safely.')
}

async function submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene could not be found.');assertSceneProductionLogic(p,scene,coverageModeFromAuto('balanced'));if(sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;if(scene.videoOperation)return scene.videoOperation;const legacyNeedsRefresh=sceneNeedsModernSource(p,scene);if(scene.videoUrl&&!legacyNeedsRefresh){const rescued=await hydrateSceneMedia(projectId,episodeId,index,'source');p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];if(rescued&&sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;}updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target){target.tier=tier;target.videoError=null}},{render:false});p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];const primaryShot=primaryCoverageShot(scene,coverageModeFromAuto('balanced')),videoScene=sceneForVideoShot(scene,primaryShot),primaryMeta=speakingVideoMeta(primaryShot),productionContract=videoProductionContract(p,ep,scene,primaryShot);onProgress?.(`Submitting scene ${scene.number||index+1}${primaryMeta.videoPrimarySpeaking?' · speaking shot':''}…`);await waitForAutoVideoSubmissionSlot(onProgress);let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:videoScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');if(d.videoUrl){bumpUsage('video');await commitPrimarySceneVideo(projectId,episodeId,index,d.videoUrl,{patch:{...primaryMeta,videoProductionContract:productionContract,videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0,videoSpeechGuide:Boolean(d.speaking||primaryMeta.videoPrimarySpeaking)},announce:false});return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a render job.');bumpUsage('video');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(!target)return;target.videoPendingPrimaryMeta={...primaryMeta};target.videoPendingProductionContract=productionContract;target.videoPendingSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);target.videoOperation=d.operation;target.videoQueuedAt=Date.now();target.videoModel=d.model||null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoRoute='requested-quality';target.videoFallbackFrom=null;target.videoError=null},{render:false});return d.operation}
async function ensureAutoSceneVideo(projectId,episodeId,index,tier,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene could not be found.');if(sceneSourceMatchesCurrentProduction(p,scene)){if(!sceneMediaRuntimeUrl(scene,'source'))await hydrateSceneMedia(projectId,episodeId,index,'source');return scene.videoUrl}const legacyNeedsRefresh=sceneNeedsModernSource(p,scene);if(scene.videoUrl&&!scene.videoOperation&&!legacyNeedsRefresh){const rescued=await hydrateSceneMedia(projectId,episodeId,index,'source');p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];if(rescued&&sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl}if(!scene.videoOperation)await submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];if(sceneSourceDurablyOwned(scene))return scene.videoUrl;if(!scene.videoOperation)throw new Error('The scene video job could not be started.');return waitForAutoVideo(projectId,episodeId,index,scene.videoOperation,onProgress)}

function coverageModeFromAuto(mode){return mode==='cinematic'?'cinematic':mode==='fast'?'fast':'balanced'}
function coverageEntry(scene,shotId){
  const matches=coverageClips(scene).filter(x=>x?.shotId===shotId);if(!matches.length)return null;
  const score=x=>{let n=0;if(coverageClipVideoUrl(x))n+=100;if(x?.syncVideoUrl||x?.syncRemoteVideoUrl||x?.syncLocalMediaKey)n+=80;if(x?.operation)n+=60;if(x?.syncOperation)n+=50;n+=Math.min(20,Number(x?.queuedAt||0)/1e12);n+=Math.min(10,Date.parse(x?.videoMediaPersistedAt||x?.syncMediaPersistedAt||x?.failedAt||0)||0)/1e12;return n};
  return matches.reduce((best,item)=>score(item)>=score(best)?item:best,matches[0])||null;
}
function coverageEntryForOperation(scene,shotId,operation){
  const matches=coverageClips(scene).filter(x=>x?.shotId===shotId);if(!matches.length)return null;
  if(operation){const exact=matches.find(x=>x?.operation===operation);if(exact)return exact;return null}
  return coverageEntry(scene,shotId);
}
function compactCoverageShotRecords(scene,shotId){
  if(!scene)return null;const clips=coverageClips(scene),matches=clips.filter(x=>x?.shotId===shotId);if(matches.length<=1)return matches[0]||null;
  const active=matches.filter(x=>x?.operation);if(active.length)return coverageEntry(scene,shotId);
  const best=coverageEntry(scene,shotId);scene.coverageClips=clips.filter(c=>c?.shotId!==shotId);if(best)scene.coverageClips.push(best);return best||null;
}
function upsertCoverageEntry(target,shotId,patch={}){
  if(!target)return null;const clips=Array.isArray(target.coverageClips)?target.coverageClips:[],existing=coverageEntry({coverageClips:clips},shotId)||{},merged={...existing,...patch,shotId};
  target.coverageClips=clips.filter(c=>c?.shotId!==shotId);target.coverageClips.push(merged);return merged;
}
async function waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,operation,onProgress,opts={}){
  const recoveryOnly=Boolean(opts?.recoveryOnly);
  let recoveryPendingChecks=0,processingChecks=0;
  const maxAttempts=recoveryOnly?RECOVERY_ONLY_MAX_ATTEMPTS:96;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    if(triggerProductionAuthPause(projectId))throw new Error('Production paused because the creator session needs sign-in. Existing paid jobs were preserved.');
    if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused safely.');
    let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex],entry=coverageEntry(scene,shot.id);
    if(coverageClipVideoUrl(entry))return entry.videoUrl;
    if(!scene)throw new Error('A scene disappeared while cinematic coverage was rendering.');
    onProgress?.(`${videoProgressCopy(entry?.queuedAt||Date.now()).replace('…','')} · shot ${shot.order} of scene ${scene.number||sceneIndex+1}`);
    if(attempt>0)await sleep(recoveryOnly?RECOVERY_ONLY_POLL_MS:(attempt<6?4500:Math.min(10000,6500+attempt*120)));
    const d=await fetchVideoStatus(operation);
    if(d?.status==='recovery_pending'){
      recoveryPendingChecks++;
      if(d.manualReviewRequired){const err=new Error('Google returned an unclassified status retrieval error. The original paid operation is preserved; automatic rechecks are paused for review.');err.code='RECOVERY_DEFERRED';throw err;}
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex],item=coverageEntry(target||{},shot.id);if(item?.operation===operation){item.videoRecoveryState='recovering';item.videoRecoveryReason=d.recoveryReason||d.error||'provider-recovery';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
      if(!recoveryOnly&&triggerProductionStallPause(projectId,`Recovering shot ${shot.order} of scene ${scene.number||sceneIndex+1}`))throw new Error('Production paused after no new completed media for 15 minutes. Existing paid jobs were preserved.');
      if(recoveryOnly&&recoveryPendingChecks>=RECOVERY_ONLY_MAX_ATTEMPTS){const err=new Error('Existing provider job is still pending. CineTale stopped checking for now; the provider operation was preserved and no replacement was submitted.');err.code='RECOVERY_DEFERRED';throw err}
      onProgress?.(`Recovering existing provider job · shot ${shot.order} of scene ${scene.number||sceneIndex+1}…`);
      continue
    }
    if(d?.status==='processing'){
      processingChecks++;
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex],item=coverageEntry(target||{},shot.id);if(item?.operation===operation){item.videoRecoveryState='generating';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
      if(recoveryOnly&&processingChecks>=RECOVERY_ONLY_MAX_ATTEMPTS){const err=new Error('Existing provider job is still processing. CineTale stopped checking for now; the provider operation was preserved and no replacement was submitted.');err.code='RECOVERY_DEFERRED';throw err}
    }
    const terminalError=videoStatusTerminalError(d);
    if(terminalError){
      const message=videoUserFailureMessage(terminalError);
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex],item=coverageEntry(target||{},shot.id);if(item?.operation===operation){item.operation=null;item.queuedAt=null;item.error=message;item.errorCode=terminalError.code||'VIDEO_GENERATION_FAILED';item.errorRetryable=Boolean(terminalError.retryable);item.failedAt=new Date().toISOString()}},{render:false});
      throw new Error(message)
    }
    if(d.status==='ready'&&d.videoUrl){
      claimCompletedCoverageVideo(projectId,episodeId,sceneIndex,shot.id,operation,d.videoUrl);
      const saved=await persistCoverageMediaUrl(projectId,episodeId,sceneIndex,shot.id,d.videoUrl,{commit:false});
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;target.coverageClips=Array.isArray(target.coverageClips)?target.coverageClips:[];const item=coverageEntry(target,shot.id),meta={videoUrl:d.videoUrl,videoProviderCompletedAt:new Date().toISOString(),videoRecoveryState:'ready',videoLocalMediaKey:saved.localKey,videoStoragePath:saved.storagePath,videoMediaPersistedAt:saved.persistedAt,videoMediaOwnership:saved.ownership,videoMediaExpired:false,operation:null,queuedAt:null,error:null,errorCode:null,errorRetryable:null,failedAt:null};upsertCoverageEntry(target,shot.id,{...item,order:shot.order,durationSec:Number(shot.targetClipSec)||0,...meta});x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
      return d.videoUrl
    }
  }
  if(recoveryOnly){const err=new Error('Recovery check ended without a completed provider result. CineTale preserved the operation and stopped polling; check again later.');err.code='RECOVERY_DEFERRED';throw err}
  throw new Error('A cinematic coverage shot is taking longer than expected. Completed work was saved so you can resume later.')
}

async function ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene)throw new Error('A selected scene could not be found.');assertSceneProductionLogic(p,scene,coverageModeFromAuto(mode));const plan=ensureSceneCoverage(scene,coverageModeFromAuto(mode)),shot=plan[shotIndex];if(!shot)return null;const primary=primaryCoverageShot(scene,coverageModeFromAuto(mode)),primaryId=scene.videoPrimaryShotId||primary?.id||plan[0]?.id;if(shot.id===primaryId)return ensureAutoSceneVideo(projectId,episodeId,sceneIndex,tier,onProgress);let entry=coverageEntry(scene,shot.id);if(coverageClipVideoUrl(entry))return entry.videoUrl;if(coverageSourceDurablyOwned(entry)){const rescued=await hydrateCoverageMedia(projectId,episodeId,sceneIndex,shot.id);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(rescued&&coverageClipVideoUrl(entry))return entry.videoUrl;if(coverageSourceDurablyOwned(entry))throw new Error(`Saved shot ${shot.order} for scene ${scene?.number||sceneIndex+1} could not be restored. CineTale will not spend credits regenerating a durable shot automatically.`)}else if(entry?.videoUrl&&!entry?.operation){const rescued=await hydrateCoverageMedia(projectId,episodeId,sceneIndex,shot.id);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(rescued&&coverageClipVideoUrl(entry))return entry.videoUrl;if(entry?.videoProviderCompletedAt)throw new Error(`Shot ${shot.order} already finished at the video service, but its saved result could not be restored. CineTale did not submit another paid generation job.`)}if(!entry?.operation){onProgress?.(`Planning shot ${shot.order}/${plan.length} for scene ${scene.number||sceneIndex+1}…`);await waitForAutoVideoSubmissionSlot(onProgress);const shotScene={...scene,coverageShot:shot,visual:shot.visual||scene.visual,camera:shot.camera||scene.camera,dialogue:shot.speaking&&shot.spokenLine?[`${shot.speaker||''}: ${shot.spokenLine}`]:[],narration:''};let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:shotScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');bumpUsage('video');if(d.videoUrl){const saved=await persistCoverageMediaUrl(projectId,episodeId,sceneIndex,shot.id,d.videoUrl,{commit:false});updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;upsertCoverageEntry(target,shot.id,{order:shot.order,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,videoUrl:d.videoUrl,videoProviderCompletedAt:new Date().toISOString(),videoRecoveryState:'ready',videoLocalMediaKey:saved.localKey,videoStoragePath:saved.storagePath,videoMediaPersistedAt:saved.persistedAt,videoMediaOwnership:saved.ownership,videoMediaExpired:false,operation:null,queuedAt:null,error:null,errorCode:null,errorRetryable:null,failedAt:null,durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a coverage render job.');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;upsertCoverageEntry(target,shot.id,{order:shot.order,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,operation:d.operation,queuedAt:Date.now(),error:null,errorCode:null,errorRetryable:null,failedAt:null,durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});entry={operation:d.operation}}
  p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(coverageClipVideoUrl(entry))return entry.videoUrl;if(!entry?.operation)throw new Error('The cinematic coverage job could not be started.');return waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,entry.operation,onProgress)}
async function ensureCinematicCoverage(projectId,episodeId,indices,tier,mode,onProgress){const coverageMode=coverageModeFromAuto(mode);if(coverageMode==='fast')return;for(const sceneIndex of indices){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene||scene.finalIncluded===false)continue;const target=coverageTargetCount(scene,coverageMode);for(let shotIndex=0;shotIndex<target;shotIndex++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');await ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress)}}}
function autoFinalLockKey(projectId){return `cinetale.final.lock.${projectId}`}
function acquireAutoFinalLock(projectId){const key=autoFinalLockKey(projectId),now=Date.now();try{const old=safeParse(localStorage.getItem(key),null);if(old&&now-Number(old.ts||0)<90000)return null;const token=uid('final');localStorage.setItem(key,JSON.stringify({token,ts:now}));return token}catch{return uid('final')}}
function releaseAutoFinalLock(projectId,token){try{const key=autoFinalLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(!old||old.token===token)localStorage.removeItem(key)}catch{}}
function cancelAutoFinalProduction(){if(!state.autoFinalRunning)return;state.autoFinalCancelRequested=true;state.autoFinalPauseReason='creator';const p=current();if(p)autoFinalJobPatch(p.id,{status:'paused',stage:'Pausing after the current provider check…'});toast('Pausing automatic production. Completed clips and existing provider jobs will be kept.')}
function productionExecutionLabel(mode='balanced'){
  return mode==='fast'?'Efficient':mode==='cinematic'?'Cinematic':'Balanced';
}
function productionReviewRows(project={},episode={},mode='balanced'){
  const coverageMode=coverageModeFromAuto(mode),rows=[],execution=productionExecutionLabel(mode);
  for(const {scene,index:sceneIndex} of selectedFinalScenes(episode)){
    const inv=sceneShotMediaInventory(project,scene,coverageMode);
    for(let i=0;i<inv.shots.length;i++){
      const item=inv.shots[i],shot=item.shot||{},sec=Math.max(0,Number(shot.durationSec||shot.targetClipSec||0));
      let status='Needs video',kind='generate';
      if(item.syncReady||item.state==='ready'){status='Reuse ready media';kind='reuse'}
      else if(item.recoveryPending){status='Recover saved provider result first';kind='recover'}
      else if(item.operation){status=project?.autoFinalJob?.status==='recovery-deferred'?'Existing provider job preserved · recovery pending':'Existing provider job preserved · checking status';kind='rendering'}
      else if(item.sourceDurable&&item.needsDialogue){status='Reuse video · finish dialogue sync';kind='dialogue'}
      else if(item.state==='recreate'){status='Replace expired/legacy clip once';kind='replace'}
      const routeLabel=kind==='generate'||kind==='replace'?execution:'—';
      rows.push({sceneIndex,sceneNumber:scene.number||sceneIndex+1,sceneTitle:scene.title||`Scene ${sceneIndex+1}`,shotOrder:shot.order||i+1,shotId:item.shotId,seconds:sec,status,kind,route:routeLabel,speaking:Boolean(shot.speaking)});
    }
  }
  return rows;
}
async function productionCostEstimate(mode,rows){
  const durations=rows.filter(r=>r.kind==='generate'||r.kind==='replace').map(r=>Math.max(.5,Number(r.seconds)||0));
  if(!durations.length)return {ok:true,known:true,estimatedUsd:0,billableSeconds:0,provider:'No new provider work',model:'—',resolution:'—',ratePerSecond:0,pricingSource:'none'};
  try{return await apiPost('/api/video-cost-estimate',{mode,durations})}
  catch(error){return {ok:false,known:false,error:error?.message||'Pricing estimate unavailable'}}
}
function openProductionReview(project={},episode={},initialMode='balanced'){
  let selectedMode=['fast','balanced','cinematic'].includes(initialMode)?initialMode:'balanced';
  $('#modal').classList.remove('hidden');
  return new Promise(resolve=>{
    let done=false,renderToken=0;
    const finish=value=>{if(done)return;done=true;closeModal();resolve(value)};
    const render=async()=>{
      const token=++renderToken,rows=productionReviewRows(project,episode,selectedMode),actual=actualProductionEstimate(project,episode,selectedMode),reuse=rows.filter(r=>r.kind==='reuse'||r.kind==='dialogue').length,recover=rows.filter(r=>r.kind==='recover'||r.kind==='rendering').length,newWork=rows.filter(r=>r.kind==='generate'||r.kind==='replace').length;
      const grouped=[];for(const row of rows){let g=grouped.find(x=>x.sceneIndex===row.sceneIndex);if(!g){g={sceneIndex:row.sceneIndex,sceneNumber:row.sceneNumber,sceneTitle:row.sceneTitle,rows:[]};grouped.push(g)}g.rows.push(row)}
      const strategyOptions=[
        {value:'fast',title:'Efficient',description:'Faster, lower-cost motion for routine coverage.'},
        {value:'balanced',title:'Balanced',description:'Strong quality with economical coverage where it fits.',badge:'Recommended'},
        {value:'cinematic',title:'Cinematic',description:'Highest-quality motion for story-critical moments.'}
      ];
      const recoveryLabel=project?.autoFinalJob?.status==='recovery-deferred'?'Check recovery again':`Resume recovery · ${recover} job${recover===1?'':'s'}`;
      $('#modalBody').innerHTML=`<div class="modal-form production-review-modal"><span class="kicker">PRODUCTION REVIEW</span><h2>Review missing work before spending credits</h2><p>CineTale will reuse durable media first and submit only work that is still genuinely missing. Nothing paid starts until you confirm below.</p><section class="production-strategy-card"><div class="production-strategy-heading"><div><b>Production strategy</b><small>Choose how CineTale balances speed, quality and cost.</small></div><span>${esc(productionExecutionLabel(selectedMode))}</span></div><div class="production-strategy-options">${strategyOptions.map(opt=>`<button type="button" class="production-strategy-option ${selectedMode===opt.value?'selected':''}" data-production-mode="${opt.value}"><span class="production-strategy-option-title">${esc(opt.title)}${opt.badge?`<em>${esc(opt.badge)}</em>`:''}</span><small>${esc(opt.description)}</small></button>`).join('')}</div></section><div class="production-review-summary five"><span><b>${rows.length}</b><small>Planned shots</small></span><span><b>${reuse}</b><small>Ready / preserved</small></span><span><b>${recover}</b><small>Recovery jobs</small></span><span><b>${newWork}</b><small>New videos</small></span><span><b>${Math.round(actual.missingVideoSeconds)}s</b><small>New video</small></span></div><div class="production-review-cost" id="productionReviewCost"><b>Checking configured video pricing…</b><span>CineTale is verifying the configured production route before showing an estimate.</span></div><div class="production-review-safety"><b>Cost protection</b><span>${recover?`${recover} existing provider/recovery item${recover===1?'':'s'} will be checked before any replacement. `:''}Provider failures will not silently create duplicate paid jobs. Existing durable media is reused before any new submission.${paidVideoGenerationAllowed()?'':' Development safety lock is ON: new paid video submissions are disabled, but existing jobs can still be recovered.'}</span></div><details class="production-review-routes" open><summary>Actual execution route</summary><p>${esc(productionExecutionLabel(selectedMode))}</p><small>${paidVideoGenerationAllowed()?'This is the route CineTale will submit if you confirm. It is no longer a planning-only suggestion.':'Development safety mode is active. CineTale may recover existing provider operations, but it will not submit new paid video generation.'}</small></details><div class="production-review-scenes">${grouped.map(g=>`<details ${g.sceneIndex===0?'open':''}><summary>Scene ${esc(g.sceneNumber)} · ${esc(g.sceneTitle)} <span>${g.rows.filter(r=>r.kind==='reuse'||r.kind==='dialogue').length}/${g.rows.length} reusable/ready</span></summary><div>${g.rows.map(r=>`<div class="production-review-shot ${esc(r.kind)}"><span>Shot ${esc(r.shotOrder)}${r.speaking?' · speaking':''}</span><b>${esc(r.status)}</b><small>${Math.round(r.seconds)}s${r.route!=='—'?` · ${esc(r.route)}`:''}</small></div>`).join('')}</div></details>`).join('')}</div>${recover?`<section class="production-recovery-action"><div><b>${recover} existing job${recover===1?'':'s'} can be safely checked</b><small>No replacement generation will start from this action.</small></div><button class="primary" id="productionReviewRecover" type="button">${esc(recoveryLabel)}</button></section>`:''}${newWork&&!paidVideoGenerationAllowed()?`<section class="production-generation-lock"><span aria-hidden="true">🔒</span><div><b>${newWork} new video${newWork===1?'':'s'} locked in Development Mode</b><small>${Math.round(actual.missingVideoSeconds)} sec of new video remains. This work is intentionally blocked while testing.</small></div></section>`:''}<div class="modal-actions production-review-actions"><button class="ghost" id="productionReviewCancel" type="button">Cancel</button>${paidVideoGenerationAllowed()?`<button class="primary" id="productionReviewConfirm" type="button">Generate ${newWork} missing video${newWork===1?'':'s'}</button>`:''}</div></div>`;
      $('#productionReviewCancel').onclick=()=>finish(null);$('#productionReviewRecover')?.addEventListener('click',()=>finish({confirmed:true,action:'recover',mode:selectedMode}));$('#productionReviewConfirm')?.addEventListener('click',()=>finish({confirmed:true,action:'generate',mode:selectedMode}));$$('[data-production-mode]').forEach(btn=>btn.addEventListener('click',()=>{const next=btn.dataset.productionMode;if(next&&next!==selectedMode){selectedMode=next;render()}}));
      const estimate=await productionCostEstimate(selectedMode,rows);if(done||token!==renderToken)return;const box=$('#productionReviewCost');if(!box)return;
      if(estimate?.known){const dollars=Number(estimate.estimatedUsd||0);box.classList.add('known');box.innerHTML=paidVideoGenerationAllowed()?`<b>Estimated video list price: ${dollars.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2})}</b><span>${Math.round(Number(estimate.billableSeconds)||0)} billable sec on the configured ${esc(productionExecutionLabel(selectedMode))} route.</span><small>Public list-price estimate only; taxes, account discounts, service changes, retries and billing rules can change the final charge. Pricing snapshot: ${esc(estimate.pricingAsOf||'current deployment')}.</small>`:`<b>Development mode: $0 new paid video generation will be submitted.</b><span>${recover} existing job${recover===1?'':'s'} may be recovered without replacement generation. ${newWork} genuinely new item${newWork===1?' remains':'s remain'} locked.</span><small>If paid production is enabled later, the current public list-price estimate for the ${newWork} new item${newWork===1?'':'s'} is ${dollars.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2})}.</small>`}
      else{box.classList.remove('known');box.innerHTML=`<b>Exact dollar estimate unavailable for this production route.</b><span>CineTale could not verify a public list price for the configured route.</span><small>You can still review shot counts and reuse before confirming; CineTale will not invent a price.</small>`}
    };
    render();
  });
}
function productionBatchProgress(project={},episode=episodeOf(project)){
  const graph=productionDependencyReadiness(project,episode);
  return {ready:graph.sourceReady,total:graph.plannedShots,remaining:Math.max(0,graph.plannedShots-graph.sourceReady)};
}
function updateProductionBatchProgressUi(projectId,episodeId,message=''){
  if(current()?.id!==projectId)return;
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),progress=productionBatchProgress(p,ep);
  if(p?.autoFinalJob?.status==='recovering'){if($('#finalAssemblyStatus'))$('#finalAssemblyStatus').textContent=`Checking preserved provider jobs · ${progress.ready}/${progress.total} videos ready`;setFinalRenderProgress(null,'');return;}
  if($('#finalAssemblyStatus'))$('#finalAssemblyStatus').textContent=`Production · ${progress.ready}/${progress.total} source videos ready${message?` · ${message}`:''}`;
  if(progress.total)setFinalRenderProgress(Math.max(3,Math.min(88,8+Math.round((progress.ready/progress.total)*78))),message||`Producing missing shots · ${progress.ready}/${progress.total} ready`)
}

async function recoverExistingProductionWork(projectId,episodeId,mode='balanced',lockToken=null){
  const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),coverageMode=coverageModeFromAuto(mode);if(!p||!ep){if(lockToken)releaseAutoFinalLock(projectId,lockToken);return}
  if(state.autoFinalRunning){if(lockToken)releaseAutoFinalLock(projectId,lockToken);toast('Production recovery is already running for this project.');return}
  const targets=[];
  for(const {scene,index:sceneIndex} of selectedFinalScenes(ep)){
    const plan=sceneCoveragePlan(scene,coverageMode),primary=primaryCoverageShot(scene,coverageMode),primaryId=String(scene.videoPrimaryShotId||primary?.id||plan[0]?.id||''),inv=sceneShotMediaInventory(p,scene,coverageMode);
    for(const item of inv.shots){if(item.sourceDurable)continue;if(item.operation||item.recoveryPending)targets.push({sceneIndex,shotId:String(item.shotId||''),primary:String(item.shotId||'')===primaryId,operation:item.operationId||'',recoveryPending:item.recoveryPending})}
  }
  if(!targets.length){if(lockToken)releaseAutoFinalLock(projectId,lockToken);toast('No existing provider jobs need recovery. New paid generation remains separate.');return}
  state.autoFinalRunning=true;state.autoFinalCancelRequested=false;state.autoFinalPauseReason='';const initial=productionBatchProgress(p,ep);
  autoFinalJobPatch(projectId,{phase:'video',status:'recovering',mode,stage:`Recovering ${targets.length} existing provider job${targets.length===1?'':'s'} · no new paid generation`,completedCount:initial.ready,totalCount:initial.total,lastError:'',resetProgressClock:true});
  try{
    const {errors}=await runPool(targets,2,async target=>{
      if(triggerProductionAuthPause(projectId))throw new Error('Recovery paused because sign-in is required.');
      let live=state.projects.find(x=>x.id===projectId),le=findEpisodeById(live,episodeId),scene=le?.scenes?.[target.sceneIndex];if(!scene)return;
      const plan=sceneCoveragePlan(scene,coverageMode),shot=plan.find(x=>String(x.id)===target.shotId);if(!shot)return;
      const label=`Recovering existing job · shot ${shot.order} of scene ${scene.number||target.sceneIndex+1}`;
      updateProductionBatchProgressUi(projectId,episodeId,label);
      if(target.operation){return target.primary?waitForAutoVideo(projectId,episodeId,target.sceneIndex,target.operation,msg=>{const lp=state.projects.find(x=>x.id===projectId),lep=findEpisodeById(lp,episodeId),progress=productionBatchProgress(lp,lep);autoFinalJobPatch(projectId,{phase:'video',status:'recovering',stage:msg,completedCount:progress.ready,totalCount:progress.total});updateProductionBatchProgressUi(projectId,episodeId,msg)},{recoveryOnly:true}):waitForCoverageVideo(projectId,episodeId,target.sceneIndex,shot,target.operation,msg=>{const lp=state.projects.find(x=>x.id===projectId),lep=findEpisodeById(lp,episodeId),progress=productionBatchProgress(lp,lep);autoFinalJobPatch(projectId,{phase:'video',status:'recovering',stage:msg,completedCount:progress.ready,totalCount:progress.total});updateProductionBatchProgressUi(projectId,episodeId,msg)},{recoveryOnly:true})}
      const restored=target.primary?await hydrateSceneMedia(projectId,episodeId,target.sceneIndex,'source'):await hydrateCoverageMedia(projectId,episodeId,target.sceneIndex,target.shotId);
      if(!restored)throw new Error(`Existing provider result for shot ${shot.order} of scene ${scene.number||target.sceneIndex+1} could not be restored. No replacement was submitted.`);
      return restored;
    });
    const live=state.projects.find(x=>x.id===projectId),lep=findEpisodeById(live,episodeId),progress=productionBatchProgress(live,lep),rows=productionReviewRows(live,lep,mode),remainingRecovery=rows.filter(r=>r.kind==='recover'||r.kind==='rendering').length;
    if(state.autoFinalPauseReason==='auth'){autoFinalJobPatch(projectId,{status:'auth-required',stage:`Sign in to continue recovery · ${progress.ready}/${progress.total} ready · existing jobs preserved`,completedCount:progress.ready,totalCount:progress.total});toast('Recovery paused safely because sign-in is required. No replacement jobs were submitted.');return}
    if(errors.length||remainingRecovery){const map={};for(const item of errors)map[`${item.item.sceneIndex}:${item.item.shotId}`]=String(item.error?.message||item.error);autoFinalJobPatch(projectId,{phase:'video',status:'recovery-deferred',stage:`Recovery check finished · ${progress.ready}/${progress.total} ready · ${remainingRecovery} provider job${remainingRecovery===1?'':'s'} still pending · automatic checking stopped`,completedCount:progress.ready,totalCount:progress.total,errors:map,lastError:errors[0]?String(errors[0].error?.message||errors[0].error):''});toast(`Recovery check finished. ${progress.ready}/${progress.total} videos are ready. ${remainingRecovery} provider job${remainingRecovery===1?' remains':'s remain'} pending; CineTale stopped polling and submitted no replacement jobs.`);return}
    autoFinalJobPatch(projectId,{phase:'video',status:'paused',stage:`Recovery complete · ${progress.ready}/${progress.total} ready · new paid generation remains ${paidVideoGenerationAllowed()?'available':'locked'}`,completedCount:progress.ready,totalCount:progress.total,errors:{},lastError:''});toast(`Existing provider-job recovery complete. ${progress.ready}/${progress.total} videos are ready. No replacement jobs were submitted.`)
  }catch(e){const live=state.projects.find(x=>x.id===projectId),lep=findEpisodeById(live,episodeId),progress=productionBatchProgress(live,lep);autoFinalJobPatch(projectId,{phase:'video',status:'paused',stage:`Recovery paused safely · ${progress.ready}/${progress.total} ready`,completedCount:progress.ready,totalCount:progress.total,lastError:String(e?.message||e)});toast('Recovery paused safely. Existing jobs and completed media were preserved; no new paid generation was submitted.')}
  finally{state.autoFinalRunning=false;state.autoFinalCancelRequested=false;if(lockToken)releaseAutoFinalLock(projectId,lockToken);if(current()?.id===projectId){const live=state.projects.find(x=>x.id===projectId),lep=findEpisodeById(live,episodeId);renderStudio();renderFinalAssembly(live,lep)}}
}
async function runProductionBatch({resume=false}={}){
  const p=current(),ep=episodeOf(p),button=$('#autoFinalVideo');
  let mode=resume?(p?.autoFinalJob?.mode||$('#autoFinalMode')?.value||'balanced'):($('#autoFinalMode')?.value||'balanced');
  if(!p||!ep||state.autoFinalRunning)return;
  if(!requireApprovedStory('start production'))return;
  const dependency=productionDependencyReadiness(p,ep),hardBlocked=dependency.nodes.find(n=>['voice','dialogue','shots'].includes(n.id)&&n.state!=='ready');
  if(hardBlocked){toast(`Production is protected: ${hardBlocked.label} is not ready. Resolve the highlighted upstream requirement first.`);return}
  const lock=acquireAutoFinalLock(p.id);if(!lock){toast('Production is already running for this project in this browser.');return}
  const selected=selectedFinalScenes(ep);if(!selected.length){releaseAutoFinalLock(p.id,lock);toast('Select at least one scene for production.');return}
  if(!resume){const review=await openProductionReview(p,ep,mode);if(!review?.confirmed){releaseAutoFinalLock(p.id,lock);return}mode=review.mode||mode;if($('#autoFinalMode'))$('#autoFinalMode').value=mode;if(review.action==='recover'){await recoverExistingProductionWork(p.id,ep.id||ep.number,mode,lock);return}if(review.action!=='generate'){releaseAutoFinalLock(p.id,lock);return}if(!paidVideoGenerationAllowed()){releaseAutoFinalLock(p.id,lock);toast('New paid video generation is locked in development mode. Existing-provider recovery remains available separately.');return}}
  const logic=episodeProductionLogicAudit(p,ep,coverageModeFromAuto(mode));if(!logic.ok){releaseAutoFinalLock(p.id,lock);const issue=logic.issues[0];toast(`Production paused before credits: Scene ${issue.sceneNumber} has a logic conflict. ${issue.message}`);return}
  const projectId=p.id,episodeId=ep.id||ep.number,tier=autoFinalTier(mode),coverageMode=coverageModeFromAuto(mode),work=[];
  for(const {index,scene} of selected){const plan=ensureSceneCoverage(scene,coverageMode);for(let shotIndex=0;shotIndex<plan.length;shotIndex++)work.push({sceneIndex:index,shotIndex})}
  state.autoFinalRunning=true;state.autoFinalCancelRequested=false;state.autoFinalPauseReason='';
  if(button){button.disabled=true;button.textContent=resume?'Resuming production…':'Starting production…'}
  const initial=productionBatchProgress(p,ep);
  autoFinalJobPatch(projectId,{phase:'video',status:'running',mode,startedAt:p.autoFinalJob?.startedAt||new Date().toISOString(),stage:'Checking saved and missing shot media…',sceneIndexes:selected.map(x=>x.index),errors:{},completedCount:initial.ready,totalCount:initial.total,lastError:''});
  try{
    renderFinalAssembly(p,ep);
    const pollIndices=work.filter(({sceneIndex,shotIndex})=>{const live=state.projects.find(x=>x.id===projectId),le=findEpisodeById(live,episodeId),scene=le?.scenes?.[sceneIndex],plan=sceneCoveragePlan(scene||{},coverageMode),shot=plan[shotIndex];if(!scene||!shot)return false;const inv=sceneShotMediaInventory(live,scene,coverageMode),entry=inv.shots.find(x=>String(x.shotId)===String(shot.id));return !entry?.sourceDurable});
    const {errors}=await runPool(pollIndices,productionConcurrency(mode),async item=>{
      if(triggerProductionAuthPause(projectId))throw new Error('Production paused because sign-in is required.');if(state.autoFinalCancelRequested)throw new Error('Production was paused safely.');
      try{return await ensureAutoCoverageShot(projectId,episodeId,item.sceneIndex,item.shotIndex,tier,mode,msg=>{const lp=state.projects.find(x=>x.id===projectId),le=findEpisodeById(lp,episodeId),progress=productionBatchProgress(lp,le);autoFinalJobPatch(projectId,{phase:'video',status:'running',stage:msg,completedCount:progress.ready,totalCount:progress.total});updateProductionBatchProgressUi(projectId,episodeId,msg)})}
      catch(e){throw e}
    });
    const live=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(live,episodeId),progress=productionBatchProgress(live,liveEp);
    if(state.autoFinalCancelRequested){if(state.autoFinalPauseReason==='auth'){autoFinalJobPatch(projectId,{phase:'video',status:'auth-required',stage:`Sign in to continue recovery · ${progress.ready}/${progress.total} source videos ready · existing jobs preserved`,completedCount:progress.ready,totalCount:progress.total});toast('Production paused safely because your session needs to be restored. Completed media and existing provider jobs were preserved.')}else if(state.autoFinalPauseReason==='stalled'){autoFinalJobPatch(projectId,{phase:'video',status:'stalled',stage:`Stalled safely · ${progress.ready}/${progress.total} source videos ready · existing jobs preserved`,completedCount:progress.ready,totalCount:progress.total});toast('Production paused automatically after no new completed media for 15 minutes. Existing paid jobs were preserved; no replacement jobs were started.')}else{autoFinalJobPatch(projectId,{phase:'video',status:'paused',stage:`Paused · ${progress.ready}/${progress.total} source videos ready`,completedCount:progress.ready,totalCount:progress.total});toast('Production paused. Completed videos were saved.')}return}
    if(errors.length||progress.remaining){const map={...(live?.autoFinalJob?.errors||{})};for(const item of errors)map[`${item.item.sceneIndex}:${item.item.shotIndex}`]=videoQuotaMessage(item.error);autoFinalJobPatch(projectId,{phase:'video',status:'needs-attention',stage:`Production paused · ${progress.ready}/${progress.total} source videos ready · ${progress.remaining} remaining`,completedCount:progress.ready,totalCount:progress.total,errors:map,lastError:errors[0]?videoQuotaMessage(errors[0].error):''});toast(`Production paused safely. ${progress.ready}/${progress.total} source videos are ready; ${progress.remaining} remain. Completed paid media was preserved.`);return}
    autoFinalJobPatch(projectId,{phase:'video',status:'complete',stage:`Video production complete · ${progress.ready}/${progress.total} source videos ready`,completedCount:progress.ready,totalCount:progress.total,errors:{},lastError:''});
    toast('Video production is complete. Next: finish dialogue synchronization for speaking shots.');
  }catch(e){
    const cur=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(cur,episodeId),progress=productionBatchProgress(cur,liveEp);
    autoFinalJobPatch(projectId,{phase:'video',status:'needs-attention',stage:`Production paused · ${progress.ready}/${progress.total} source videos ready`,completedCount:progress.ready,totalCount:progress.total,lastError:videoQuotaMessage(e)});
    toast(`Production paused safely. ${progress.ready}/${progress.total} source videos are ready. Completed work was preserved.`)
  }finally{
    state.autoFinalRunning=false;state.autoFinalCancelRequested=false;state.autoFinalPauseReason='';releaseAutoFinalLock(projectId,lock);if(button){button.disabled=false;button.textContent='Resume production'}if(current()?.id===projectId)renderStudio()
  }
}
async function finishDialogueSynchronizationBatch({resume=false}={}){
  const p=current(),ep=episodeOf(p),button=$('#autoFinalVideo');if(!p||!ep||state.autoFinalRunning)return;
  const authority=productionActionAuthority(p,ep);const video=authority.graph.nodes.find(n=>n.id==='video');if(video?.state!=='ready'){toast('Finish source-video production before dialogue synchronization.');return}
  const lock=acquireAutoFinalLock(p.id);if(!lock){toast('Production is already running for this project in this browser.');return}
  const projectId=p.id,episodeId=ep.id||ep.number,mode=p?.autoFinalJob?.mode||$('#autoFinalMode')?.value||'balanced',coverageMode=coverageModeFromAuto(mode),targets=[];
  for(const {index,scene} of selectedFinalScenes(ep)){const inv=sceneShotMediaInventory(p,scene,coverageMode);for(const item of inv.shots){if(item.shot?.speaking&&!item.syncReady)targets.push({sceneIndex:index,shotId:item.shotId})}}
  if(!targets.length){releaseAutoFinalLock(projectId,lock);clearAutoFinalJob(projectId);toast('Dialogue synchronization is already complete.');renderStudio();return}
  state.autoFinalRunning=true;state.autoFinalCancelRequested=false;if(button){button.disabled=true;button.textContent='Finishing dialogue…'}
  autoFinalJobPatch(projectId,{phase:'sync',status:'running',mode,stage:'Finishing speaking-shot dialogue synchronization…',errors:{},lastError:''});
  try{
    const {errors}=await runPool(targets,2,async item=>{if(state.autoFinalCancelRequested)throw new Error('Dialogue finishing was paused by the creator.');const live=state.projects.find(x=>x.id===projectId),le=findEpisodeById(live,episodeId),scene=le?.scenes?.[item.sceneIndex],shot=sceneCoveragePlan(scene||{},coverageMode).find(x=>String(x.id)===String(item.shotId));if(!scene||!shot)return;return ensureCoverageShotLipSync(projectId,episodeId,item.sceneIndex,shot,{onProgress:msg=>{autoFinalJobPatch(projectId,{phase:'sync',status:'running',stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)}})});
    const live=state.projects.find(x=>x.id===projectId),le=findEpisodeById(live,episodeId),graph=productionDependencyReadiness(live,le),sync=graph.nodes.find(n=>n.id==='sync');
    if(errors.length||sync?.state!=='ready'){const map={};for(const item of errors)map[`${item.item.sceneIndex}:${item.item.shotId}`]=String(item.error?.message||item.error);autoFinalJobPatch(projectId,{phase:'sync',status:'needs-attention',stage:`Dialogue finishing paused · ${graph.syncReady}/${graph.speakingTotal} speaking shots synchronized`,errors:map,lastError:errors[0]?String(errors[0].error?.message||errors[0].error):''});toast(`Dialogue finishing paused safely. ${graph.syncReady}/${graph.speakingTotal} speaking shots are synchronized.`);return}
    clearAutoFinalJob(projectId);toast('Dialogue synchronization is complete. Final assembly is now ready for review.');
  }catch(e){autoFinalJobPatch(projectId,{phase:'sync',status:'needs-attention',stage:'Dialogue finishing needs attention',lastError:String(e?.message||e)});toast('Dialogue finishing paused safely. Completed synchronized media was preserved.')}
  finally{state.autoFinalRunning=false;state.autoFinalCancelRequested=false;releaseAutoFinalLock(projectId,lock);if(button){button.disabled=false;button.textContent='Continue'}if(current()?.id===projectId)renderStudio()}
}
async function createFinalVideoAutomatically({resume=false}={}){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;const authority=productionActionAuthority(p,ep),action=authority.firstAction;
  if(action==='video')return runProductionBatch({resume});
  if(action==='sync')return finishDialogueSynchronizationBatch({resume});
  if(action==='final')return createFinalVideo();
  if(authority.graph.ready)return createFinalVideo();
  toast(`Finish ${authority.firstRecovery?.label||'the next production requirement'} first.`)
}
function maybeResumeAutoFinal(p){const job=p?.autoFinalJob;if(!p||!job||state.autoFinalRunning||job.status!=='running')return;if(state.autoFinalResumeScheduled.has(p.id))return;state.autoFinalResumeScheduled.add(p.id);setTimeout(()=>{state.autoFinalResumeScheduled.delete(p.id);if(current()?.id!==p.id||state.autoFinalRunning)return;if(job.phase==='sync')finishDialogueSynchronizationBatch({resume:true}).catch(()=>{});else runProductionBatch({resume:true}).catch(()=>{})},650)}
function episodeLockKey(projectId){return `cinetale.episode.lock.${projectId}`}
function acquireEpisodeLock(projectId){const key=episodeLockKey(projectId),now=Date.now();try{const old=safeParse(localStorage.getItem(key),null);if(old&&now-Number(old.ts||0)<120000)return null;const token=uid('lock');localStorage.setItem(key,JSON.stringify({token,ts:now}));return token}catch{return uid('lock')}}
function releaseEpisodeLock(projectId,token){try{const key=episodeLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(!old||old.token===token)localStorage.removeItem(key)}catch{}}
function setEpisodeCreateButtons(busy,label='Create next episode'){for(const b of [$('#newEpisodeBtn'),$('#continueEpisode')].filter(Boolean)){b.disabled=busy;b.textContent=busy?'Creating next episode…':(b.id==='newEpisodeBtn'?'+ Create next episode':'Create next episode')}}
async function createNextEpisode(){const p=current();if(!p){toast('Create a project first.');return}if((p.format||'Episode')!=='Episode'){toast(`${p.format||'This project'} is standalone. Only Episode projects create a next episode.`);return}if(state.episodeCreating){toast('The next episode is already being created.');return}const lock=acquireEpisodeLock(p.id);if(!lock){toast('The next episode is already being created in this browser.');return}state.episodeCreating=true;setEpisodeCreateButtons(true);const requestId=uid('next');try{const snapshot=structuredClone(p);const d=await apiPost('/api/generate-next',{project:snapshot,requestId});updateProject(x=>{ensureEpisodeIds(x);const ep=d.episode;ep.id=ep.id||`ep_${requestId}`;ep.continuityWarnings=Array.isArray(d.continuityWarnings)?d.continuityWarnings:[];ep.continuityAcknowledged=ep.continuityWarnings.length===0;if(x.episodes.some(e=>e.id===ep.id))return;x.episodes.push(ep);x.activeEpisode=ep.number;x.activeEpisodeId=ep.id;x.worldBible=x.worldBible||{};x.worldBible.canon=x.worldBible.canon||[];x.worldBible.canon.push(`Episode ${ep.number}: ${ep.synopsis}`)});toast((d.continuityWarnings||[]).length?`Episode ${d.episode.number} created with a continuity item to review.`:`Episode ${d.episode.number} created.`)}catch(e){toast(e.message||'Could not create the next episode.')}finally{state.episodeCreating=false;releaseEpisodeLock(p.id,lock);setEpisodeCreateButtons(false)}}
function renameEpisode(id){const p=current();if(!p)return;ensureEpisodeIds(p);const ep=p.episodes.find(e=>e.id===id);if(!ep)return;const name=prompt('Rename episode',ep.title||`Episode ${ep.number}`);if(name==null)return;const title=name.trim();if(!title){toast('Episode title cannot be blank.');return}updateProject(x=>{ensureEpisodeIds(x);const target=x.episodes.find(e=>e.id===id);if(target)target.title=title});toast('Episode renamed.')}
function duplicateEpisodeDraft(id){const p=current();if(!p)return;ensureEpisodeIds(p);const source=p.episodes.find(e=>e.id===id);if(!source)return;const n=Math.max(0,...p.episodes.map(e=>Number(e.number)||0))+1;const copy=structuredClone(source);copy.id=uid('ep');copy.number=n;copy.title=`${source.title||`Episode ${source.number}`} — Draft copy`;copy.scenes=(copy.scenes||[]).map((s,i)=>({...s,id:uid('scene'),number:i+1,image:null,imageMode:null,videoUrl:null,videoOperation:null}));updateProject(x=>{ensureEpisodeIds(x);x.episodes.push(copy);x.activeEpisodeId=copy.id;x.activeEpisode=copy.number});toast(`Draft copy created as Episode ${n}.`)}
function deleteEpisode(id){const p=current();if(!p)return;ensureEpisodeIds(p);const ep=p.episodes.find(e=>e.id===id);if(!ep)return;if(p.episodes.length<=1){toast('Keep at least one episode in the project.');return}if(!confirm(`Delete Episode ${ep.number}: ${ep.title}? This removes its saved scene assets from this browser.`))return;updateProject(x=>{ensureEpisodeIds(x);x.episodes=x.episodes.filter(e=>e.id!==id);if(x.activeEpisodeId===id){const next=x.episodes.at(-1);x.activeEpisodeId=next?.id||null;x.activeEpisode=next?.number||1}x.worldBible=x.worldBible||{};x.worldBible.canon=(x.worldBible.canon||[]).filter(c=>!String(c).startsWith(`Episode ${ep.number}: ${ep.synopsis}`))});toast('Episode deleted.')}
$('#newEpisodeBtn').onclick=()=>createNextEpisode();$('#continueEpisode').onclick=()=>createNextEpisode();
async function generateNextMissingVideo(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const i=(ep.scenes||[]).findIndex(s=>s.finalIncluded!==false&&!sceneSourceMatchesCurrentProduction(p,s));if(i<0){toast(`All selected scene videos in this ${formatConfig(p.format||'Episode').finalName} are ready.`);return}const sceneButton=document.querySelector(`[data-scene-video="${i}"]`);if(sceneButton)await requestVideo(i,sceneButton);else toast('Open the scene and generate its video.')}
$('#nextStepAction').onclick=e=>{const b=e.currentTarget;if(b.dataset.nextView){setView(b.dataset.nextView);return}if(b.dataset.nextAction==='resolve-voices'){openVoiceResolutionFromStage('audio');return}if(b.dataset.nextAction==='review-story'){$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(/^stage-/.test(b.dataset.nextAction||'')){$('#studioStageGate')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(b.dataset.nextAction==='storyboard'){generateAllScenes(b);return}if(b.dataset.nextAction==='narrate'){narrateEpisode();return}if(b.dataset.nextAction==='video'){generateNextMissingVideo();return}if(b.dataset.nextAction==='scroll-production'){document.querySelector('.production-dependency-panel, #finalAssemblyPanel')?.scrollIntoView({behavior:'smooth',block:'center'});return}if(b.dataset.nextAction==='finish-production'){runProductionBatch({resume:false});return}if(b.dataset.nextAction==='assemble'){prepareFinalAssembly();return}if(b.dataset.nextAction==='render-final'){createFinalVideo();return}if(b.dataset.nextAction==='preview-final'){const a=currentFinalVideoAsset(),v=$('#finalRenderPreview');if(a?.url&&v){v.scrollIntoView({behavior:'smooth',block:'center'});v.play().catch(()=>{})}else previewFinalSequence();return}};
$('#editFullStory').onclick=()=>openFullStoryEditor();$('#rebuildFullStory').onclick=()=>rebuildLegacyStoryReview();$('#approveFullStory').onclick=()=>approveCurrentStory();
$('#generateAllPortraits').onclick=e=>generateAllCharacters(e.currentTarget);
$('#previewFinalSequence').onclick=()=>previewFinalSequence();$('#prepareFinalAssembly').onclick=()=>prepareFinalAssembly();$('#autoFinalVideo').onclick=()=>createFinalVideo();$('#cancelAutoFinalVideo').onclick=()=>cancelAutoFinalProduction();$('#renderFinalVideo').onclick=()=>renderFinalVideoFile();$('#downloadFinalVideo').onclick=()=>downloadFinalVideoFile();$('#shareFinalVideo').onclick=()=>shareFinalVideoFile();$$('[data-publish-platform]').forEach(b=>b.onclick=()=>publishFinalVideo(b.dataset.publishPlatform));$('#downloadAssemblyManifest').onclick=()=>downloadFinalAssemblyManifest();


function voiceLabel(v,key){
  const labels=v?.labels||{};const aliases={accent:['accent','region','locale'],age:['age'],gender:['gender','sex','voice_gender'],use:['use_case','usecase','use','category'],language:['language','languages'],tone:['tone','style','descriptive','description']};
  for(const k of aliases[key]||[key]){const val=labels[k];if(val!=null&&String(val).trim())return String(val).trim()}
  return '';
}
const VOICE_LANGUAGE_NAMES={
  en:'English',hi:'Hindi',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ar:'Arabic',zh:'Mandarin Chinese','zh-cn':'Mandarin Chinese','zh-tw':'Mandarin Chinese',yue:'Cantonese',ja:'Japanese',ko:'Korean',bn:'Bengali',pa:'Punjabi',gu:'Gujarati',mr:'Marathi',ta:'Tamil',te:'Telugu',kn:'Kannada',ml:'Malayalam',ur:'Urdu',ne:'Nepali',sa:'Sanskrit',od:'Odia',or:'Odia',as:'Assamese',th:'Thai',vi:'Vietnamese',id:'Indonesian',ms:'Malay',fil:'Filipino / Tagalog',tl:'Filipino / Tagalog',sw:'Swahili',ru:'Russian',pl:'Polish',tr:'Turkish',fa:'Persian / Farsi',he:'Hebrew'
};
function voiceLanguageName(value=''){
  const raw=String(value||'').trim();if(!raw)return '';
  const low=raw.toLowerCase().replace('_','-');if(VOICE_LANGUAGE_NAMES[low])return VOICE_LANGUAGE_NAMES[low];
  const primary=low.split('-')[0];if(VOICE_LANGUAGE_NAMES[primary])return VOICE_LANGUAGE_NAMES[primary];
  const aliases={english:'English',hindi:'Hindi',spanish:'Spanish','español':'Spanish',french:'French','français':'French',german:'German','deutsch':'German',italian:'Italian',portuguese:'Portuguese',arabic:'Arabic',mandarin:'Mandarin Chinese','mandarin chinese':'Mandarin Chinese',chinese:'Mandarin Chinese',cantonese:'Cantonese',japanese:'Japanese',korean:'Korean',marathi:'Marathi',tamil:'Tamil',telugu:'Telugu',malayalam:'Malayalam',bengali:'Bengali',punjabi:'Punjabi',urdu:'Urdu'};
  if(aliases[low])return aliases[low];
  if(/^[a-z]{2,3}$/.test(primary)){try{const dn=new Intl.DisplayNames(['en'],{type:'language'}),name=dn.of(primary);if(name&&name.toLowerCase()!==primary)return name}catch{}}
  return raw.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
const VOICE_FILTER_PRESETS={
  accent:['Indian / South Asian','American','British','Australian','New Zealand','Irish','Scottish','Nigerian','South African','Kenyan','Mexican','Argentinian','Colombian','Spain Spanish','Brazilian Portuguese','European Portuguese','French','German','Italian','Russian','Mandarin / Mainland China','Cantonese / Hong Kong','Singapore','Japanese','Korean','Arabic','Neutral / International'],
  age:['Child','Teen','Young adult','Adult','Mature'],
  gender:['Feminine','Masculine','Neutral'],
  use:['Character','Conversational','Narration','Documentary / Educational','Commercial','General'],
  language:['English','Hindi','Spanish','French','German','Italian','Portuguese','Arabic','Mandarin Chinese','Cantonese','Japanese','Korean','Bengali','Punjabi','Gujarati','Marathi','Tamil','Telugu','Kannada','Malayalam','Urdu','Multilingual / unspecified'],
  tone:['Natural','Warm','Calm','Energetic','Conversational','Deep / Authoritative','Dramatic','Playful','Intimate','Polished']
};
function voiceMetadata(v){
  const meta=v?.meta||{};
  const verifiedLanguages=(Array.isArray(meta.verifiedLanguages)?meta.verifiedLanguages:(Array.isArray(v?.verified_languages)?v.verified_languages.map(x=>x?.language||x?.locale||''):[])).map(voiceLanguageName).filter(Boolean);
  const declaredLanguages=(Array.isArray(meta.declaredLanguages)?meta.declaredLanguages:[]).map(voiceLanguageName).filter(Boolean);
  const rawLanguages=Array.isArray(meta.languages)?meta.languages:[];
  const languages=[...new Set(rawLanguages.map(voiceLanguageName).filter(Boolean))];
  const primaryLanguage=voiceLanguageName(meta.language||voiceLabel(v,'language'));
  if(primaryLanguage&&primaryLanguage!=='Multilingual / unspecified'&&!languages.includes(primaryLanguage))languages.unshift(primaryLanguage);
  const strictLanguages=[...new Set([...(Array.isArray(meta.strictLanguages)?meta.strictLanguages:[]),...verifiedLanguages,...declaredLanguages].map(voiceLanguageName).filter(Boolean))];
  return {
    accent:meta.accent||voiceLabel(v,'accent'),accentSource:meta.accentSource||'',
    age:meta.age||voiceLabel(v,'age'),gender:meta.presentation||voiceLabel(v,'gender'),use:meta.use||voiceLabel(v,'use')||v.category||'',
    language:primaryLanguage||languages[0]||'',languages,strictLanguages,verifiedLanguages,declaredLanguages,languageSource:meta.languageSource||'',
    tone:meta.tone||voiceLabel(v,'tone')||'Natural',ageVerified:meta.ageVerified===true,ageVerificationKnown:Object.prototype.hasOwnProperty.call(meta,'ageVerified')||Boolean(meta.ageSource),ageSource:meta.ageSource||'',model:meta.model||'',locales:(Array.isArray(meta.locales)?meta.locales:[]).map(normalizeVoiceLocale).filter(Boolean),locale:normalizeVoiceLocale(meta.locale||voiceLabel(v,'accent')),baseLocale:normalizeVoiceLocale(meta.baseLocale||meta.locale||''),baseLanguage:voiceLanguageName(meta.baseLanguage||meta.language||''),provider:meta.provider||v.provider||'elevenlabs',providerVoiceId:meta.providerVoiceId||v.providerVoiceId||v.voice_id||''
  };
}
function normalizeVoiceAge(value=''){const v=String(value||'').toLowerCase();if(!v||/unknown|unverified|unspecified|not verified|not specified/.test(v))return '';if(/child|kid|preteen/.test(v))return 'Child';if(/teen|adolescent/.test(v))return 'Teen';if(/young/.test(v))return 'Young adult';if(/mature|senior|older|old/.test(v))return 'Mature';if(/adult/.test(v))return 'Adult';return ''}
function voiceAgeCompatible(requested='',actual=''){
  const a=normalizeVoiceAge(requested),b=normalizeVoiceAge(actual);if(!a)return true;if(!b)return false;if(a===b)return true;
  const near={Teen:['Young adult'],'Young adult':['Teen','Adult'],Adult:['Young adult','Mature'],Mature:['Adult']};
  return (near[a]||[]).includes(b);
}
function voiceAgeHardCompatible(requested='',actual=''){
  const a=normalizeVoiceAge(requested),b=normalizeVoiceAge(actual);if(!a)return true;if(!b)return false;
  if(a==='Child')return b==='Child';
  if(a==='Teen')return b==='Teen'||b==='Young adult';
  if(a==='Young adult')return b==='Young adult'||b==='Teen'||b==='Adult';
  if(a==='Adult')return b==='Adult'||b==='Young adult'||b==='Mature';
  if(a==='Mature')return b==='Mature'||b==='Adult';
  return a===b;
}
function voiceAgeRequirementVerified(meta={},requested=''){
  const age=normalizeVoiceAge(requested);if(!age)return true;
  if(!voiceAgeHardCompatible(age,meta?.age))return false;
  // Youth identity is a hard production constraint: provider metadata must explicitly verify it.
  // Adult-range matching may use provider-declared age bands, but Child/Teen never rely on inference.
  if(['Child','Teen'].includes(age)&&meta?.ageVerificationKnown)return Boolean(meta?.ageVerified);
  return true;
}
function voiceProviderCapabilityRank(v={},c={},p={}){
  const m=voiceMetadata(v),intent=voiceAutoIntent(c,p);let score=0;
  if(intent.languages.length&&intent.languages.every(x=>voiceLanguageMatches(m,x,true)))score+=40;
  if(intent.locale&&voiceLocaleMatches(m,intent.locale)){score+=30;if(normalizeVoiceLocale(m.baseLocale||m.locale)===normalizeVoiceLocale(intent.locale))score+=10}
  if(intent.age&&voiceAgeRequirementVerified(m,intent.age))score+=['Child','Teen'].includes(intent.age)?45:18;
  if(intent.presentation&&m.gender===intent.presentation)score+=12;
  if(['verified','provider-catalog','provider-model'].includes(String(m.languageSource||'')))score+=8;
  if(voicePreviewUsesCatalogSample(v))score+=2;
  return score;
}
function voiceLanguageMatches(meta,requested='',strict=false){
  const want=voiceLanguageName(requested);if(!want)return true;
  const langs=(strict?(meta?.strictLanguages||[]):(meta?.languages?.length?meta.languages:[meta?.language].filter(Boolean))).map(voiceLanguageName);
  return langs.includes(want);
}
function splitVoiceLanguages(raw=''){return [...new Set(String(raw||'').split(/[,;+|]/).map(x=>voiceLanguageName(x.trim())).filter(x=>x&&x!=='Multilingual / unspecified'))]}
function normalizeVoiceLocale(value=''){const raw=String(value||'').trim().replace('_','-');if(!raw)return '';const m=raw.match(/^([a-z]{2,3})(?:-([a-z]{2}))?$/i);if(!m)return '';return m[2]?`${m[1].toLowerCase()}-${m[2].toUpperCase()}`:m[1].toLowerCase()}
function projectVoiceLocale(p={}){
  const langs=projectVoiceLanguages(p),primary=langs[0]||'',ctx=`${p.regionCommunity||''} ${p.culturalContext||''} ${p.eraPlace||''} ${p.worldBible?.globalContext?.regionCommunity||''} ${p.worldBible?.globalContext?.eraPlace||''}`.toLowerCase();
  const fixed={Hindi:'hi-IN',Malayalam:'ml-IN',Tamil:'ta-IN',Telugu:'te-IN',Kannada:'kn-IN',Bengali:'bn-IN',Marathi:'mr-IN',Punjabi:'pa-IN',Gujarati:'gu-IN',Urdu:'ur-IN',Odia:'or-IN',Japanese:'ja-JP',Korean:'ko-KR',Hebrew:'he-IL',Thai:'th-TH',Vietnamese:'vi-VN',Indonesian:'id-ID',German:'de-DE',Italian:'it-IT'};if(fixed[primary])return fixed[primary];
  if(primary==='English'){if(/\b(india|indian)\b/.test(ctx))return 'en-IN';if(/\b(united kingdom|britain|british|england|scotland|wales)\b/.test(ctx))return 'en-GB';if(/\b(australia|australian)\b/.test(ctx))return 'en-AU';if(/\b(canada|canadian)\b/.test(ctx))return 'en-CA';if(/\b(united states|usa|american)\b/.test(ctx))return 'en-US';}
  if(primary==='Spanish'){if(/\b(mexico|mexican)\b/.test(ctx))return 'es-MX';if(/\b(spain|spanish|castilian)\b/.test(ctx))return 'es-ES';if(/\b(argentina|argentinian)\b/.test(ctx))return 'es-AR';if(/\b(colombia|colombian)\b/.test(ctx))return 'es-CO';}
  if(primary==='Portuguese'){if(/\b(brazil|brazilian)\b/.test(ctx))return 'pt-BR';if(/\b(portugal|portuguese)\b/.test(ctx))return 'pt-PT';}
  if(primary==='French'){if(/\b(canada|quebec|québec|canadian)\b/.test(ctx))return 'fr-CA';if(/\b(france|french)\b/.test(ctx))return 'fr-FR';}
  if(primary==='Arabic'){if(/\b(uae|united arab emirates|emirati)\b/.test(ctx))return 'ar-AE';if(/\b(saudi|saudi arabia)\b/.test(ctx))return 'ar-SA';if(/\b(egypt|egyptian)\b/.test(ctx))return 'ar-EG';}
  if(primary==='Mandarin Chinese'){if(/\b(taiwan|taiwanese)\b/.test(ctx))return 'zh-TW';if(/\b(china|mainland|beijing|shanghai)\b/.test(ctx))return 'zh-CN';}
  if(primary==='Cantonese'){return 'yue-HK'}
  return '';
}
function voiceLocaleMatches(meta={},wanted=''){const target=normalizeVoiceLocale(wanted);if(!target)return true;const locales=(meta.locales||[]).map(normalizeVoiceLocale).filter(Boolean);if(locales.includes(target))return true;const lang=target.split('-')[0],sameLang=locales.some(x=>x.split('-')[0]===lang);return !locales.length?false:sameLang&&target.length<=3}
function projectVoiceLanguages(p={}){return splitVoiceLanguages(p.language||p.storyLanguage||'')}
function characterRequiredVoiceLanguages(p={},c={}){
  // Only explicit dialogue/voice language direction or the selected project language participates.
  // Culture, religion, ethnicity, name and appearance never infer a voice language.
  const explicit=c.dialogueLanguages||c.voiceLanguages||'';
  const own=splitVoiceLanguages(explicit);return own.length?own:projectVoiceLanguages(p);
}
function characterTargetVoiceAge(c={}){
  const n=Number(String(c.age||'').match(/\d+/)?.[0]||NaN);if(Number.isFinite(n)){if(n<=12)return 'Child';if(n<=17)return 'Teen';if(n<=30)return 'Young adult';if(n>=55)return 'Mature';return 'Adult'}
  return normalizeVoiceAge(c.age||'');
}
function explicitCharacterVoicePresentation(c={}){
  const explicit=String(c.voicePresentation||c.gender||c.pronouns||'').trim().toLowerCase();
  if(/\b(she\s*\/\s*her|she|her|hers|female|woman|girl|feminine)\b/.test(explicit))return 'Feminine';
  if(/\b(he\s*\/\s*him|he|him|his|male|man|boy|masculine)\b/.test(explicit))return 'Masculine';
  if(/\b(they\s*\/\s*them|they|them|theirs|nonbinary|non-binary|neutral|androgynous)\b/.test(explicit))return 'Neutral';
  return '';
}
function characterVoiceArchetype(c={}){
  const t=`${c.characterType||''} ${c.type||''} ${c.role||''} ${c.voice||''}`.toLowerCase();
  if(/robot|android|ai\b|synthetic/.test(t))return 'synthetic';
  if(/creature|animal|dragon|monster|alien|spirit|ghost/.test(t))return 'nonhuman';
  if(/narrator|storyteller/.test(t))return 'narrator';
  return 'human';
}
function genreVoiceToneHints(p={}){
  const t=`${p.genre||''} ${(p.genres||[]).join?.(' ')||''}`.toLowerCase();const out=[];
  if(/comedy|humor|funny/.test(t))out.push('Playful');
  if(/horror|thriller|mystery|suspense/.test(t))out.push('Intimate','Calm');
  if(/fantasy|myth|epic/.test(t))out.push('Dramatic','Warm');
  if(/documentary|educational/.test(t))out.push('Calm','Natural');
  if(/romance|family|drama/.test(t))out.push('Warm','Natural');
  return [...new Set(out)];
}
const LEGACY_VOICE_SEMANTIC_CUES={
  // These cues are ONLY a compatibility fallback for older projects that pre-date structured voiceIntent.
  // New/updated stories should carry canonical voiceIntent enums so production logic is language-independent.
  Confident:[
    'confident','assured','brave','bold','courageous','courage','decisive','self-assured',
    'साहसी','निडर','आत्मविश्वासी','दृढ़','वीर','बहादुर','तेजस्वी',
    'seguro','valiente','confiado','audaz','assuré','courageux','confiant','mutig','selbstbewusst','coraggioso','sicuro',
    'شجاع','واثق','勇敢','自信','勇ましい','自信のある','용감','자신감'
  ],
  Focused:[
    'focused','disciplined','alert','protective','precise','controlled','determined','serious','attentive',
    'केंद्रित','अनुशासित','सतर्क','रक्षक','संयमित','दृढ़निश्चयी','गंभीर','सजग','तीक्ष्ण',
    'enfocado','disciplinado','alerta','protector','concentré','discipliné','attentif','fokussiert','diszipliniert','aufmerksam',
    'منضبط','يقظ','مركز','专注','警觉','集中','規律正しい','집중','규율'
  ],
  Warm:[
    'warm','kind','kindly','compassionate','compassion','reassuring','loving','affectionate','nurturing','caring',
    'वात्सल्यपूर्ण','स्नेही','करुणामयी','दयालु','ममतामयी','प्रेमपूर्ण','अपनापन','सहृदय',
    'cálido','amable','cariñoso','compasivo','chaleureux','bienveillant','affectueux','warmherzig','liebevoll','premuroso','affettuoso',
    'دافئ','حنون','عطوف','温暖','亲切','温かい','優しい','따뜻','다정'
  ],
  Calm:[
    'calm','serene','peaceful','grounded','measured','composed','tranquil','restrained',
    'शांत','शान्त','सौम्य','स्थिर','संयत','धैर्यवान','प्रशांत','शीतल',
    'calmo','sereno','tranquilo','calme','serein','paisible','ruhig','gelassen','tranquillo','sereno',
    'هادئ','رزين','平静','沉着','穏やか','落ち着','차분','침착'
  ],
  Gentle:[
    'gentle','soft-spoken','soft spoken','tender','delicate','soothing','mild',
    'कोमल','मृदु','नम्र','सौम्य','मुलायम','सहज',
    'suave','tierno','dulce','doux','tendre','sanft','zart','dolce','gentile',
    'لطيف','رقيق','温柔','柔和','優しい','穏やか','부드럽','온화'
  ],
  Energetic:[
    'energetic','lively','excited','spirited','active','enthusiastic','dynamic',
    'ऊर्जावान','उत्साही','चुस्त','फुर्तीला','जोशीला','जीवंत','स्फूर्तिवान',
    'enérgico','animado','entusiasta','énergique','vif','enthousiaste','energisch','lebhaft','energico','vivace',
    'نشيط','حماسي','精力充沛','活跃','元気','活発','활기','열정'
  ],
  Playful:[
    'playful','mischievous','witty','cheerful','funny','humorous','humourous',
    'चंचल','शरारती','हँसमुख','खिलंदड़ा','विनोदी','मजाकिया',
    'juguetón','travieso','divertido','espiègle','joueur','malicieux','verspielt','schelmisch','giocoso','birichino',
    'مرح','مشاكس','顽皮','俏皮','遊び心','いたずら','장난','유쾌'
  ],
  Intimate:[
    'intimate','vulnerable','quiet','understated','personal','confiding',
    'आत्मीय','अंतरंग','धीमा','संकोची','निजी','मन की बात',
    'íntimo','vulnerable','íntima','intime','vulnérable','vertraulich','intim','intimo','vulnerabile',
    'حميمي','شخصي','亲密','私密','親密','内面的','친밀','개인적'
  ],
  Mysterious:[
    'mysterious','enigmatic','secretive','uncanny','eerie','cryptic',
    'रहस्यमय','गूढ़','रहस्यपूर्ण','अनजाना','अलौकिक',
    'misterioso','enigmático','mystérieux','énigmatique','geheimnisvoll','misterioso','enigmatico',
    'غامض','神秘','诡秘','神秘的','謎めいた','신비','수수께끼'
  ],
  Dramatic:[
    'dramatic','intense','heroic','epic','commanding','powerful',
    'नाटकीय','तीव्र','वीर','महाकाव्यात्मक','प्रभावशाली','ओजस्वी',
    'dramático','intenso','heroico','dramatique','intense','héroïque','dramatisch','intensiv','eroico','drammatico',
    'درامي','بطولي','戏剧性','强烈','劇的','英雄的','극적','강렬'
  ]
};
function legacyCharacterVoiceSemanticHints(p={},c={}){
  const text=`${c.voice||''} ${c.voiceCustomDirection||''} ${c.personality||''} ${c.role||''} ${c.background||''} ${c.appearance||''} ${characterContextText(p,c)||''}`.toLocaleLowerCase();
  const out=[];
  for(const [label,cues] of Object.entries(LEGACY_VOICE_SEMANTIC_CUES)){
    if(cues.some(cue=>text.includes(String(cue).toLocaleLowerCase())))out.push(label);
    if(out.length>=4)break;
  }
  return out;
}
function characterVoiceToneHints(p={},c={}){
  // Structured intent is the canonical path. This makes new story-generated characters language-independent:
  // the story model writes stable performance enums while user-facing character prose can remain in any language.
  const structured=Array.isArray(c.voiceIntent?.performanceHints)?c.voiceIntent.performanceHints:[];
  const allowed=new Set(Object.keys(VOICE_PERFORMANCE));
  const canonical=structured.map(x=>String(x||'').trim()).filter(x=>allowed.has(x));
  if(canonical.length)return [...new Set(canonical)].slice(0,4);

  // Older saved projects may not have voiceIntent. Recover conservatively through a reusable multilingual
  // semantic compatibility layer rather than an English-only regex or character-specific exception.
  const legacy=legacyCharacterVoiceSemanticHints(p,c).filter(x=>allowed.has(x));
  if(legacy.length)return [...new Set(legacy)].slice(0,4);

  // If neither explicit structured intent nor a supported legacy semantic cue exists, do not invent one.
  // Scene audioDirection can still carry moment-to-moment emotion while the recurring baseline stays Natural.
  return ['Natural'];
}
function characterVoiceRequirement(p={},c={}){
  const languages=characterRequiredVoiceLanguages(p,c),locale=projectVoiceLocale(p),age=characterTargetVoiceAge(c),presentation=explicitCharacterVoicePresentation(c),archetype=characterVoiceArchetype(c),toneHints=characterVoiceToneHints(p,c);
  const provenance={
    languages:(c.dialogueLanguages||c.voiceLanguages)?'character':'project',
    locale:locale?'project/story context':'unspecified',
    age:c.age?'character':'unspecified',
    presentation:(c.voicePresentation||c.gender||c.pronouns)?'character':'unspecified',
    tone:(c.voice||c.voiceCustomDirection||c.personality)?'character/story':'project genre fallback'
  };
  return {languages,locale,age,presentation,archetype,toneHints,accentDirection:String(c.voiceAccentDirection||'').trim(),provenance};
}
function characterAutoPerformance(p={},c={}){
  const hints=characterVoiceToneHints(p,c);
  const allowed=new Set(Object.keys(VOICE_PERFORMANCE));
  return hints.find(x=>allowed.has(x))||'Natural';
}
function characterAutoPace(p={},c={}){
  const requested=String(c.voiceIntent?.pace||'').trim();
  if(['Natural','Relaxed','Quick'].includes(requested))return requested;
  const text=`${c.voice||''} ${c.personality||''} ${c.voiceIntent?.delivery||''}`.toLowerCase();
  if(/quick|fast[- ]paced|rapid|brisk|urgent/.test(text))return 'Quick';
  if(/relaxed|slow|measured|unhurried|serene/.test(text))return 'Relaxed';
  return 'Natural';
}
function voiceSuitableForCharacter(v,c={},p={}){
  const m=voiceMetadata(v),langs=characterRequiredVoiceLanguages(p,c),age=characterTargetVoiceAge(c),presentation=explicitCharacterVoicePresentation(c),archetype=characterVoiceArchetype(c);
  if(langs.length&&!langs.every(x=>voiceLanguageMatches(m,x,true)))return false;
  const locale=projectVoiceLocale(p);if(locale&&!voiceLocaleMatches(m,locale))return false;
  if(archetype==='human'&&age&&!voiceAgeRequirementVerified(m,age))return false;
  if(presentation&&m.gender&&m.gender!=='Neutral'&&m.gender!==presentation)return false;
  return true;
}
function voiceSuitableForNarrator(v,p={}){
  const m=voiceMetadata(v),langs=projectVoiceLanguages(p);if(langs.length&&!langs.every(x=>voiceLanguageMatches(m,x,true)))return false;const locale=projectVoiceLocale(p);if(locale&&!voiceLocaleMatches(m,locale))return false;
  return true;
}
function voiceLockRequirementSignature(c={},p={}){
  const intent=voiceAutoIntent(c,p);
  return JSON.stringify({voiceId:String(c.voiceId||''),languages:intent.languages,locale:intent.locale||'',age:intent.age||'',presentation:intent.presentation||'',archetype:intent.archetype||'',accentDirection:intent.accentDirection||'',toneHints:intent.toneHints||[]});
}
function voiceSuitabilityReasons(v,c={},p={}){
  const reasons=[];if(!v){reasons.push('Voice is no longer available in the connected library.');return reasons}
  const m=voiceMetadata(v),langs=characterRequiredVoiceLanguages(p,c),age=characterTargetVoiceAge(c),presentation=explicitCharacterVoicePresentation(c),archetype=characterVoiceArchetype(c);
  if(langs.length&&!langs.every(x=>voiceLanguageMatches(m,x,true)))reasons.push(`Language mismatch · needs ${langs.join(' + ')}.`);
  const locale=projectVoiceLocale(p);if(locale&&!voiceLocaleMatches(m,locale))reasons.push(`Locale/accent mismatch · needs ${locale}; voice locale is ${(m.locales||[]).join(' / ')||m.accent||'unverified'}.`);
  if(archetype==='human'&&age&&!voiceAgeRequirementVerified(m,age))reasons.push(`${['Child','Teen'].includes(age)&&voiceAgeHardCompatible(age,m.age)&&!m.ageVerified?'Age not verified by provider':`Age mismatch · needs ${age}, voice is ${normalizeVoiceAge(m.age)||'unverified'}`}.`);
  if(presentation&&m.gender&&m.gender!=='Neutral'&&m.gender!==presentation)reasons.push(`Presentation mismatch · needs ${presentation}, voice is ${m.gender}.`);
  return reasons;
}
function narratorVoiceSuitabilityReasons(v,p={}){
  const reasons=[];if(!v){reasons.push('Narrator voice is no longer available in the connected library.');return reasons}
  const m=voiceMetadata(v),langs=projectVoiceLanguages(p);if(langs.length&&!langs.every(x=>voiceLanguageMatches(m,x,true)))reasons.push(`Narrator language mismatch · needs ${langs.join(' + ')}.`);const locale=projectVoiceLocale(p);if(locale&&!voiceLocaleMatches(m,locale))reasons.push(`Narrator locale/accent mismatch · needs ${locale}.`);return reasons;
}
function voiceLockAuditNeedsReview(c={},p={}){
  if(!c.voiceLocked||!c.voiceId)return false;const r=c.voiceLockReview;if(!r||!['needs-review','unverified'].includes(r.status))return false;const sig=voiceLockRequirementSignature(c,p);return r.signature===sig&&!r.acknowledged;
}
function voiceLockAuditAcknowledged(c={},p={}){
  if(!c.voiceLocked||!c.voiceId)return false;const r=c.voiceLockReview;if(!r||!['needs-review','unverified'].includes(r.status))return false;return r.signature===voiceLockRequirementSignature(c,p)&&Boolean(r.acknowledged);
}
function voiceLockAuditPending(c={},p={}){
  if(!c.voiceLocked||!c.voiceId)return false;const r=c.voiceLockReview,sig=voiceLockRequirementSignature(c,p);return !r||r.signature!==sig||r.status==='checking';
}
function voiceLockAuditUnverified(c={},p={}){
  if(!c.voiceLocked||!c.voiceId)return false;const r=c.voiceLockReview;return Boolean(r&&r.status==='unverified'&&r.signature===voiceLockRequirementSignature(c,p)&&!r.acknowledged);
}
function narratorVoiceAuditPending(p={}){
  if(!p.narratorVoiceLocked||!p.narratorVoiceId)return false;const sig=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}),r=p.narratorVoiceLockReview;return !r||r.signature!==sig||r.status==='checking';
}
function characterVoiceProductionState(c={},p={}){
  if(!c)return {code:'missing-character',blocking:true,ready:false,issue:'Character voice requirements are unavailable.'};
  const name=String(c.name||'Character'),locked=Boolean(c.voiceLocked&&c.voiceId),review=c.voiceLockReview||{},signature=locked?voiceLockRequirementSignature(c,p):'';
  if(locked){
    if(!review.status||review.signature!==signature||review.status==='checking')return {code:'locked-audit-pending',blocking:true,ready:false,issue:`${name}: locked voice audit is still pending`,review};
    if(['needs-review','unverified'].includes(review.status)&&!review.acknowledged)return {code:review.status==='unverified'?'locked-verification-unavailable':'locked-needs-review',blocking:true,ready:false,issue:review.status==='unverified'?`${name}: locked voice could not be verified`:`${name}: locked voice needs review`,review};
    if(['needs-review','unverified'].includes(review.status)&&review.acknowledged)return {code:'ready-approved-override',blocking:false,ready:true,issue:'',review};
    if(review.status==='ok')return {code:'ready-locked',blocking:false,ready:true,issue:'',review};
    return {code:'locked-audit-pending',blocking:true,ready:false,issue:`${name}: locked voice audit is still pending`,review};
  }
  if(!c.voiceId||c.voiceAutoDecision?.noSuitableVoice)return {code:'unresolved-no-match',blocking:true,ready:false,issue:`${name}: no suitable dialogue voice assigned`,review:null};
  return {code:'ready-auto',blocking:false,ready:true,issue:'',review:null};
}
function narratorVoiceProductionState(p={}){
  const locked=Boolean(p.narratorVoiceLocked&&p.narratorVoiceId),review=p.narratorVoiceLockReview||{};
  if(locked){
    const signature=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)});
    if(!review.status||review.signature!==signature||review.status==='checking')return {code:'locked-audit-pending',blocking:true,ready:false,issue:'Narrator: locked voice audit is still pending',review};
    if(['needs-review','unverified'].includes(review.status)&&!review.acknowledged)return {code:review.status==='unverified'?'locked-verification-unavailable':'locked-needs-review',blocking:true,ready:false,issue:review.status==='unverified'?'Narrator: locked voice could not be verified':'Narrator: locked voice needs review',review};
    if(['needs-review','unverified'].includes(review.status)&&review.acknowledged)return {code:'ready-approved-override',blocking:false,ready:true,issue:'',review};
    if(review.status==='ok')return {code:'ready-locked',blocking:false,ready:true,issue:'',review};
    return {code:'locked-audit-pending',blocking:true,ready:false,issue:'Narrator: locked voice audit is still pending',review};
  }
  if(!p.narratorVoiceId)return {code:'unresolved-no-match',blocking:true,ready:false,issue:'Narrator: no suitable voice assigned',review:null};
  return {code:'ready-auto',blocking:false,ready:true,issue:'',review:null};
}
function speakingCharacterIndexes(p={},ep=episodeOf(p)){
  const set=new Set();for(const scene of ep?.scenes||[]){const entries=dialogueEntries(scene.dialogue);for(let i=0;i<entries.length;i++){const idx=resolveDialogueCharacterIndex(p,scene,entries[i],i);if(idx>=0)set.add(idx)}}return [...set];
}
function voiceProductionReadiness(p={},ep=episodeOf(p),scope='audio'){
  const characterIndexes=scope==='cast'?(p.characters||[]).map((_,i)=>i):speakingCharacterIndexes(p,ep),characters=[];
  for(const index of characterIndexes){const c=p.characters?.[index];if(!c)continue;const state=characterVoiceProductionState(c,p);if(scope==='cast'){if(['locked-audit-pending','locked-verification-unavailable','locked-needs-review'].includes(state.code))characters.push({index,c,state})}else if(state.blocking)characters.push({index,c,state})}
  const hasNarration=scope==='audio'&&(ep?.scenes||[]).some(s=>String(s.narration||'').trim()),narrator=hasNarration?narratorVoiceProductionState(p):null;
  const issues=[...characters.map(x=>x.state.issue),...(narrator?.blocking?[narrator.issue]:[])];
  return {scope,characters,narrator,issues,blocking:issues.length>0,ready:issues.length===0};
}
function castVoiceReviewIssues(p={}){
  return voiceProductionReadiness(p,episodeOf(p),'cast').characters.map(x=>({c:x.c,index:x.index,review:x.c.voiceLockReview,pending:x.state.code==='locked-audit-pending',state:x.state}));
}
function audioVoiceReadinessIssues(p={},ep=episodeOf(p)){return voiceProductionReadiness(p,ep,'audio').issues}
function projectNeedsLockedVoiceAudit(p={}){
  for(const c of p.characters||[]){
    if(!c?.voiceLocked||!c.voiceId)continue;
    const r=c.voiceLockReview||{},sig=voiceLockRequirementSignature(c,p);
    if(r.signature!==sig||!['ok','needs-review','unverified'].includes(r.status))return true;
  }
  if(p.narratorVoiceLocked&&p.narratorVoiceId){
    const sig=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}),r=p.narratorVoiceLockReview||{};
    if(r.signature!==sig||!['ok','needs-review','unverified'].includes(r.status))return true;
  }
  return false;
}
async function auditLockedVoicesForProject(project){
  const p=project||current();if(!p?.id||!projectNeedsLockedVoiceAudit(p))return;const key=`${p.id}:${p.updatedAt||''}`;
  if(state.voiceLockAuditScheduled.has(key)){
    const deadline=Date.now()+VOICE_LOCK_AUDIT_TIMEOUT_MS+500;
    while(state.voiceLockAuditScheduled.has(key)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
    return;
  }
  state.voiceLockAuditScheduled.add(key);
  let changed=false;
  const startedAt=new Date().toISOString();
  const markChecking=()=>{
    for(const c of p.characters||[]){if(!c?.voiceLocked||!c.voiceId)continue;const signature=voiceLockRequirementSignature(c,p),old=c.voiceLockReview||{};if(old.signature!==signature||!['ok','needs-review','unverified'].includes(old.status)){c.voiceLockReview={status:'checking',signature,voiceId:c.voiceId,voiceName:c.voiceName||'',reasons:[],startedAt,acknowledged:false};changed=true}}
    if(p.narratorVoiceLocked&&p.narratorVoiceId){const signature=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}),old=p.narratorVoiceLockReview||{};if(old.signature!==signature||!['ok','needs-review','unverified'].includes(old.status)){p.narratorVoiceLockReview={status:'checking',signature,voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||'',reasons:[],startedAt,acknowledged:false};changed=true}}
    if(changed){save();renderCharacters();renderStudioStageGate?.(p,episodeOf(p));changed=false}
  };
  const markUnavailable=(message='Voice verification could not be completed. Review this locked voice before continuing.')=>{
    for(const c of p.characters||[]){if(!c?.voiceLocked||!c.voiceId)continue;const signature=voiceLockRequirementSignature(c,p),old=c.voiceLockReview||{};if(old.signature!==signature||old.status!=='checking')continue;c.voiceLockReview={status:'unverified',signature,voiceId:c.voiceId,voiceName:c.voiceName||'',reasons:[message],auditedAt:new Date().toISOString(),acknowledged:false,retryable:true};changed=true}
    if(p.narratorVoiceLocked&&p.narratorVoiceId){const signature=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}),old=p.narratorVoiceLockReview||{};if(old.signature===signature&&old.status==='checking'){p.narratorVoiceLockReview={status:'unverified',signature,voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||'',reasons:[message],auditedAt:new Date().toISOString(),acknowledged:false,retryable:true};changed=true}}
  };
  try{
    markChecking();
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('VOICE_AUDIT_TIMEOUT')),VOICE_LOCK_AUDIT_TIMEOUT_MS));
    const d=await Promise.race([voiceCatalog(),timeout]),all=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));
    for(const c of p.characters||[]){
      if(!c?.voiceLocked||!c.voiceId){if(c?.voiceLockReview){delete c.voiceLockReview;changed=true}continue}
      const voice=all.find(v=>v.voice_id===c.voiceId),signature=voiceLockRequirementSignature(c,p),reasons=voiceSuitabilityReasons(voice,c,p),old=c.voiceLockReview||{};
      if(reasons.length){const acknowledged=Boolean(old.acknowledged&&old.signature===signature),voiceName=c.voiceName||voice?.name||'',same=old.status==='needs-review'&&old.signature===signature&&String(old.voiceId||'')===String(c.voiceId||'')&&String(old.voiceName||'')===String(voiceName)&&JSON.stringify(old.reasons||[])===JSON.stringify(reasons)&&Boolean(old.acknowledged)===acknowledged;if(!same){c.voiceLockReview={status:'needs-review',signature,voiceId:c.voiceId,voiceName,reasons,auditedAt:new Date().toISOString(),acknowledged,acknowledgedAt:acknowledged?old.acknowledgedAt||new Date().toISOString():null};changed=true}}
      else if(old.status!=='ok'||old.signature!==signature||String(old.voiceId||'')!==String(c.voiceId||'')){c.voiceLockReview={status:'ok',signature,voiceId:c.voiceId,voiceName:c.voiceName||voice?.name||'',reasons:[],auditedAt:new Date().toISOString(),acknowledged:false};changed=true}
    }
    if(p.narratorVoiceLocked&&p.narratorVoiceId){const voice=all.find(v=>v.voice_id===p.narratorVoiceId),signature=JSON.stringify({voiceId:p.narratorVoiceId,languages:projectVoiceLanguages(p)}),reasons=narratorVoiceSuitabilityReasons(voice,p),old=p.narratorVoiceLockReview||{};if(reasons.length){const acknowledged=Boolean(old.acknowledged&&old.signature===signature),voiceName=p.narratorVoiceName||voice?.name||'',same=old.status==='needs-review'&&old.signature===signature&&String(old.voiceId||'')===String(p.narratorVoiceId||'')&&String(old.voiceName||'')===String(voiceName)&&JSON.stringify(old.reasons||[])===JSON.stringify(reasons)&&Boolean(old.acknowledged)===acknowledged;if(!same){p.narratorVoiceLockReview={status:'needs-review',signature,voiceId:p.narratorVoiceId,voiceName,reasons,auditedAt:new Date().toISOString(),acknowledged,acknowledgedAt:acknowledged?old.acknowledgedAt||new Date().toISOString():null};changed=true}}else if(old.status!=='ok'||old.signature!==signature||String(old.voiceId||'')!==String(p.narratorVoiceId||'')){p.narratorVoiceLockReview={status:'ok',signature,voiceId:p.narratorVoiceId,voiceName:p.narratorVoiceName||voice?.name||'',reasons:[],auditedAt:new Date().toISOString(),acknowledged:false};changed=true}}
    else if(p.narratorVoiceLockReview){delete p.narratorVoiceLockReview;changed=true}
  }catch(e){
    console.warn('[CineTale voice] Locked voice audit unavailable',e);
    markUnavailable(e?.message==='VOICE_AUDIT_TIMEOUT'?'Voice verification timed out. Review this locked voice before continuing.':'Voice verification is temporarily unavailable. Review this locked voice before continuing.');
  }finally{
    state.voiceLockAuditScheduled.delete(key);
    if(changed){p.updatedAt=new Date().toISOString();save();renderCharacters();renderStudioStageGate?.(p,episodeOf(p));void pushCloudWorkspace()}
  }
}
function scheduleLockedVoiceAudit(project){const p=project||current();if(!p?.id||!projectNeedsLockedVoiceAudit(p))return;queueMicrotask(()=>auditLockedVoicesForProject(p));}
function characterVoicePreviewLine(p={},characterOrIndex=0){
  const index=typeof characterOrIndex==='number'?characterOrIndex:(p.characters||[]).indexOf(characterOrIndex),c=(p.characters||[])[index];if(!c)return '';
  for(const ep of p.episodes||[]){for(const scene of ep.scenes||[]){const entries=dialogueEntries(scene.dialogue);for(let i=0;i<entries.length;i++){const e=entries[i],idx=resolveDialogueCharacterIndex(p,scene,e,i);if(idx===index){const line=String(e.spokenLine||e.line||e.text||'').trim();if(line)return line.slice(0,220)}}}}
  return String(c.name||'').trim();
}
function uniqueVoiceValues(voices,key){const values=key==='language'?voices.flatMap(v=>voiceMetadata(v).languages||[]):voices.map(v=>voiceMetadata(v)[key]);return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).slice(0,120)}
function voiceFilterValues(voices,key){
  const values=[...new Set([...(VOICE_FILTER_PRESETS[key]||[]),...uniqueVoiceValues(voices,key)])];
  if(key==='age'){
    const order=['Child','Teen','Young adult','Adult','Mature'];
    return values.sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);return a.localeCompare(b)});
  }
  return values.sort((a,b)=>a.localeCompare(b));
}
function voiceFilterBar(voices,prefix){
  const opts=(key,label)=>`<label class="voice-filter-field"><span>${label}</span><select id="${prefix}${key}"><option value="">All</option>${voiceFilterValues(voices,key.toLowerCase()).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>`;
  return `<div class="voice-library-head"><div><b>Browse all voices</b><small>${voices.length} voices available from your connected library. Filters narrow the list exactly. If there is no exact match, CineTale will tell you instead of silently showing unrelated voices.</small></div><label class="voice-search"><span>Search</span><input id="${prefix}Search" placeholder="Search name, accent, tone, language…"></label></div><div class="voice-filter-grid six">${opts('Accent','Accent / region')}${opts('Age','Age feel')}${opts('Gender','Filter by voice presentation')}${opts('Use','Use case')}${opts('Language','Language')}${opts('Tone','Tone / style')}</div><div class="voice-active-filters" id="${prefix}ActiveFilters"></div><div class="voice-filter-note" id="${prefix}FilterNote"></div>`;
}

function voiceManualReviewAssessment(v,c={},p={}){
  const m=voiceMetadata(v),intent=voiceAutoIntent(c,p),issues=[],hardIssues=[],strengths=[];let penalty=0;
  const hard=(msg,amount)=>{issues.push(msg);hardIssues.push(msg);penalty+=amount};
  if(intent.languages.length){
    const ok=intent.languages.every(x=>voiceLanguageMatches(m,x,true)),base=voiceLanguageName(m.baseLanguage||m.language);
    if(ok){strengths.push(base&&intent.languages.includes(base)?`Native/base language matches ${intent.languages.join(' + ')}`:`Supports ${intent.languages.join(' + ')} through verified locale metadata`);}
    else hard(`Language mismatch · needs ${intent.languages.join(' + ')}`,100);
  }
  if(intent.locale){
    if(voiceLocaleMatches(m,intent.locale))strengths.push(`Locale matches ${intent.locale}`);
    else if((m.locales||[]).length)hard(`Locale mismatch · needs ${intent.locale}`,24);
    else hard(`Locale not verified for ${intent.locale}`,18);
  }
  if(intent.archetype==='human'&&intent.age){
    const actual=normalizeVoiceAge(m.age);
    if(actual===intent.age&&voiceAgeRequirementVerified(m,intent.age))strengths.push(`Age matches ${intent.age}${['Child','Teen'].includes(intent.age)?' · verified':''}`);
    else if(['Child','Teen'].includes(intent.age)&&actual===intent.age&&!m.ageVerified)hard('Age not verified by provider',28);
    else if(!actual)hard('Age not verified by provider',28);
    else if(intent.age==='Child'&&actual==='Teen')hard('Age mismatch · Teen instead of Child',22);
    else if(intent.age==='Child'&&actual==='Young adult')hard('Age mismatch · Young adult instead of Child',40);
    else if(intent.age==='Child'&&actual==='Adult')hard('Age mismatch · Adult instead of Child',52);
    else if(intent.age==='Child'&&actual==='Mature')hard('Age mismatch · Mature instead of Child',65);
    else hard(`Age mismatch · ${actual} instead of ${intent.age}`,34);
  }
  if(intent.presentation){
    const actual=String(m.gender||'').trim();
    if(actual===intent.presentation)strengths.push(`Presentation matches ${intent.presentation}`);
    else if(!actual||actual==='Neutral')hard(`Presentation not verified · needs ${intent.presentation}`,18);
    else hard(`Presentation mismatch · ${actual} instead of ${intent.presentation}`,30);
  }
  const toneHints=characterVoiceToneHints(p||{},c);
  if(toneHints.length&&toneHints.some(x=>String(m.tone||'').toLowerCase().includes(String(x).toLowerCase())))strengths.push(`Tone supports ${toneHints[0]}`);
  const fitPercent=Math.max(0,Math.min(100,100-penalty));
  const score=(fitPercent*1000)+voiceMatchScore(v,c,p);
  const tier=hardIssues.length?'blocked':issues.length===0?'recommended':fitPercent>=80?'close':fitPercent>=60?'review':'weak';
  return {score,fitPercent,tier,issues,hardIssues,strengths,productionSafe:hardIssues.length===0};
}
function bestVoiceManualAlternatives(voices=[],c={},p={},limit=5){
  const intent=voiceAutoIntent(c,p);
  return voices.map(v=>({v,review:voiceManualReviewAssessment(v,c,p)}))
    .filter(({v,review})=>{
      const m=voiceMetadata(v);
      if(intent.languages.length&&!intent.languages.every(x=>voiceLanguageMatches(m,x,true)))return false;
      if(review.fitPercent<45)return false;
      return true;
    })
    .sort((a,b)=>b.review.fitPercent-a.review.fitPercent||b.review.score-a.review.score||String(a.v.name||'').localeCompare(String(b.v.name||'')))
    .slice(0,Math.max(1,limit));
}
function voicePreviewUsesCatalogSample(v){return Boolean(String(v?.preview_url||v?.previewUrl||'').trim())}
async function previewVoiceCandidate(v,text,options={}){
  const sample=String(v?.preview_url||v?.previewUrl||'').trim();
  if(sample){await playAudioUrl(sample);return {mode:'catalog-sample',__cached:true}}
  const key=JSON.stringify({voiceId:v?.voice_id||'',text:String(text||'').trim(),kind:options.kind||'dialogue',direction:options.direction||'',language:options.language||current()?.language||'English',speakerProfile:options.speakerProfile||''});
  const cached=voiceAuditionCache.get(key);
  if(cached?.audio){await playAudioUrl(cached.audio);return {...cached,__cached:true}}
  const d=await speakText(text,v?.voice_id||'',options);
  if(d?.mode==='ai'&&d.audio)voiceAuditionCache.set(key,d);
  return d;
}

function voiceTargetCapabilityLabel(v,c={},p={}){
  const m=voiceMetadata(v),wanted=characterRequiredVoiceLanguages(p,c);if(!wanted.length)return '';
  const supported=wanted.filter(x=>voiceLanguageMatches(m,x,true));if(!supported.length)return '';
  const base=voiceLanguageName(m.baseLanguage||m.language),locale=projectVoiceLocale(p),localeOk=locale&&voiceLocaleMatches(m,locale);
  const mode=base&&supported.includes(base)?'base voice':'multilingual support';
  return `✓ ${supported.join(' + ')} supported${localeOk&&locale?` · ${locale}`:''} · ${mode}`;
}
function voiceResolverInsight(voices=[],c={},p={},exactRanked=[],bestAlternatives=[]){
  const target=voiceAutoIntentSummary(c,p),exact=exactRanked[0]?.v||null,alt=bestAlternatives[0]||null;
  if(exact){const m=voiceMetadata(exact);return `<div class="voice-resolver-insight exact"><span>✦ CINETALE VOICE RESOLVER</span><b>Production-safe match found</b><small>${esc(exact.name)} satisfies the hard character requirements (${esc(target)}). CineTale can use this automatically; you do not need to browse the full library.</small><em>${esc(voiceTargetCapabilityLabel(exact,c,p)||`${m.provider||'Provider'} metadata verified`)}</em></div>`}
  const age=characterTargetVoiceAge(c),altName=alt?.v?.name||'',altIssues=alt?.review?.hardIssues||alt?.review?.issues||[];
  const reason=altIssues.length?altIssues.join(' · '):age?`No provider-verified ${age} match is currently available.`:'No exact provider match is currently available.';
  const unresolved=reason.replace(/[.\s]+$/,'');
  return `<div class="voice-resolver-insight blocked"><span>✦ CINETALE VOICE RESOLVER</span><b>No production-safe automatic match</b><small>CineTale checked ${voices.length} connected voices against ${esc(target)}. <b>Unresolved requirement:</b> ${esc(unresolved)}.${altName?` <b>Closest review-only option:</b> ${esc(altName)}.`:''}</small><strong>Recommended next step: keep Auto targeting on. CineTale will use a verified exact match automatically when one is available; production stays protected until then.</strong><em>Ranking uses metadata only from providers; no credits were used. Manual override is optional and stays secondary; CineTale will never label an unverified voice as an exact match.</em></div>`;
}
function voiceRow(v,selectedId='',suggested=false,prefix='voice',review=null,context=null){
  const m=voiceMetadata(v);const ageDisplay=normalizeVoiceAge(m.age)||(/unverified|unknown/i.test(String(m.age||''))?'Age not verified by provider':m.age);const targetCapability=context?.character?voiceTargetCapabilityLabel(v,context.character,context.project||{}):'';const languageDisplay=targetCapability?(m.baseLanguage||m.language||'Multilingual'):(m.language||'');const meta=[m.accent,ageDisplay,m.gender,languageDisplay,m.use||v.category,m.tone].filter(Boolean).join(' · ')||v.category||'Voice';
  const search=`${voiceHaystack(v)} ${m.provider} ${m.accent} ${m.age} ${m.gender} ${m.use} ${m.language} ${m.tone}`.toLowerCase();
  const selected=selectedId===v.voice_id,verifiedYouth=(m.ageVerified&&['Child','Teen'].includes(normalizeVoiceAge(m.age)))?`<span class="voice-age-verified">✓ Verified ${esc(normalizeVoiceAge(m.age))}</span>`:'',issueCopy=review?.issues?.length?`<div class="voice-manual-warnings">${review.issues.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';
  const tier=review?.tier||'',fit=Number.isFinite(Number(review?.fitPercent))?Math.max(0,Math.min(100,Math.round(Number(review.fitPercent)))):null,reviewBadge=review?`<span class="voice-review-badge ${esc(tier)}">${review?.hardIssues?.length?'Review only · not production-safe':tier==='recommended'?'Recommended by CineTale':`${fit}% fit`}</span>`:'';
  return `<div class="voice-option-row ${selected?'selected':''}" data-voice-row data-voice-id="${esc(v.voice_id)}" data-search="${esc(search)}" data-accent="${esc(m.accent)}" data-age="${esc(m.age)}" data-gender="${esc(m.gender)}" data-use="${esc(m.use)}" data-language="${esc(m.language)}" data-languages="${esc((m.languages||[]).join("|"))}" data-strict-languages="${esc((m.strictLanguages||[]).join("|"))}" data-language-source="${esc(m.languageSource||'')}" data-tone="${esc(m.tone)}" data-review-score="${Number(review?.score||0)}" data-review-fit="${Number(review?.fitPercent||0)}" data-production-safe="${review?.productionSafe===false?'false':'true'}"><div class="voice-option-main"><span class="voice-orb">${esc((v.name||'V').trim().slice(0,1).toUpperCase())}</span><div class="voice-option-copy"><div class="voice-option-title"><b>${esc(v.name)}</b>${suggested?'<span class="voice-recommended">Recommended</span>':''}${verifiedYouth}${reviewBadge}<span class="voice-selected-badge ${selected?'':'hidden'}">✓ Selected & locked</span><span class="voice-playing-badge hidden">◉ Playing preview</span></div><small>${esc(meta)}</small>${targetCapability?`<div class="voice-target-capability">${esc(targetCapability)}</div>`:''}${review?`<div class="voice-preview-cost-note">${voicePreviewUsesCatalogSample(v)?'Catalog sample available · no new voice generation for this preview':'Preview generates only when you press Listen · repeated playback is cached in this browser session'}</div>`:''}${issueCopy}</div></div><div class="voice-option-actions"><button type="button" class="ghost tiny preview-voice-btn" data-preview-${prefix}="${esc(v.voice_id)}">▶ Listen</button><button type="button" class="ghost tiny use-voice-btn ${selected?'selected-action':''}" data-use-${prefix}="${esc(v.voice_id)}" data-${prefix}-name="${esc(v.name)}">${selected?'✓ Locked':review?.hardIssues?.length?'Override & lock':review?.issues?.length?'Approve & lock':'Use & lock'}</button></div></div>`;
}
function setVoicePreviewState(prefix,id,playing){
  const list=$(`#${prefix}VoiceList`);if(!list)return;
  list.querySelectorAll('[data-voice-row]').forEach(row=>{const active=playing&&row.dataset.voiceId===id;row.classList.toggle('previewing',active);const badge=row.querySelector('.voice-playing-badge');if(badge)badge.classList.toggle('hidden',!active);const btn=row.querySelector(`[data-preview-${prefix}]`);if(btn){btn.textContent=active?'◼ Playing…':'▶ Listen';btn.classList.toggle('playing-action',active)}});
}
function setVoiceSelectedState(prefix,id,name=''){
  const list=$(`#${prefix}VoiceList`);if(!list)return;
  list.dataset.selectedVoiceId=id||'';list.dataset.selectedVoiceName=name||'';
  list.querySelectorAll('[data-voice-row]').forEach(row=>{const active=row.dataset.voiceId===id;row.classList.toggle('selected',active);const badge=row.querySelector('.voice-selected-badge');if(badge)badge.classList.toggle('hidden',!active);const btn=row.querySelector(`[data-use-${prefix}]`);if(btn){btn.textContent=active?'✓ Locked':'Use & lock';btn.classList.toggle('selected-action',active)}});
  const current=list.closest('.voice-studio')?.querySelector('.voice-current b');if(current&&name)current.textContent=name;
  const lock=list.closest('.voice-studio')?.querySelector('.voice-lock-state');if(lock){lock.classList.remove('auto');lock.classList.add('locked');lock.textContent=prefix==='narrator'?'● Narrator locked':'● Voice locked'}
}
function seedVoiceFilters(prefix,{character=null,project=null,narrator=false}={}){
  const setIfPresent=(suffix,value)=>{if(!value)return;const el=$(`#${prefix}${suffix}`);if(!el)return;if([...el.options].some(o=>o.value===value))el.value=value};
  const langs=character?characterRequiredVoiceLanguages(project||{},character):projectVoiceLanguages(project||{});
  setIfPresent('Language',langs[0]||'');
  if(character){setIfPresent('Age',characterTargetVoiceAge(character));setIfPresent('Gender',explicitCharacterVoicePresentation(character));}
  if(narrator)setIfPresent('Use','Narration');
}
function bindVoiceFilters(prefix,{character=null,project=null,voices=[]}={}){
  const search=$(`#${prefix}Search`),accent=$(`#${prefix}Accent`),age=$(`#${prefix}Age`),gender=$(`#${prefix}Gender`),use=$(`#${prefix}Use`),language=$(`#${prefix}Language`),tone=$(`#${prefix}Tone`),list=$(`#${prefix}VoiceList`),count=$(`#${prefix}VoiceCount`),note=$(`#${prefix}FilterNote`),active=$(`#${prefix}ActiveFilters`);if(!list)return;
  const controlledFallbacks=character?controlledVoiceFallbacks(voices,character,project||{}):[];
  const controlledFallbackIds=new Set(controlledFallbacks.map(x=>String(x.v?.voice_id||'')));
  const controlledFallbackAges=[...new Set(controlledFallbacks.map(x=>normalizeVoiceAge(voiceMetadata(x.v).age)).filter(Boolean))];
  let safeFallbackMode=false,manualReviewMode=false,manualReviewExpanded=false;
  const filters=[['Accent / region',accent,'accent'],['Age',age,'age'],['Presentation',gender,'gender'],['Use case',use,'use'],['Language',language,'language'],['Tone',tone,'tone']];
  const clean=s=>String(s||'').trim().toLowerCase();
  const rowLanguages=row=>String(row.dataset.strictLanguages||'').split('|').map(clean).filter(Boolean);
  const exact=(row,el,key)=>{if(!el?.value)return true;if(key==='language')return rowLanguages(row).includes(clean(voiceLanguageName(el.value)));return clean(row.dataset[key])===clean(el.value)};
  const clearFallback=row=>{row.classList.remove('closest-match');row.querySelector('.voice-closest-badge')?.remove()};
  const markFallback=row=>{row.classList.add('closest-match');const title=row.querySelector('.voice-option-title');if(title&&!title.querySelector('.voice-closest-badge'))title.insertAdjacentHTML('beforeend','<span class="voice-closest-badge">Closest suitable</span>')};
  const renderChips=()=>{if(!active)return;const chips=[];for(const [label,el] of filters)if(el?.value)chips.push(`<button type="button" class="voice-filter-chip" data-clear-filter="${el.id}"><span>${esc(label)}:</span> ${esc(el.value)} ×</button>`);if((search?.value||'').trim())chips.push(`<button type="button" class="voice-filter-chip" data-clear-filter="${search.id}"><span>Search:</span> ${esc(search.value.trim())} ×</button>`);active.innerHTML=chips.length?`${chips.join('')}<button type="button" class="voice-clear-filters" data-clear-all-voice-filters>Clear all</button>`:'';active.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>{safeFallbackMode=false;manualReviewMode=false;const el=$(`#${b.dataset.clearFilter}`);if(el){el.value='';apply()}});active.querySelector('[data-clear-all-voice-filters]')?.addEventListener('click',()=>{safeFallbackMode=false;manualReviewMode=false;if(search)search.value='';for(const [,el] of filters)if(el)el.value='';apply()})};
  const relaxTo=(keep)=>{safeFallbackMode=false;manualReviewMode=false;for(const [,el,key] of filters)if(el&&key!==keep)el.value='';if(search)search.value='';apply()};
  const openSafeFallbacks=()=>{safeFallbackMode=true;manualReviewMode=false;if(search)search.value='';for(const [,el,key] of filters){if(!el)continue;if(['accent','use','tone'].includes(key))el.value=''}if(age&&controlledFallbackAges.length&&[...age.options].some(o=>o.value===controlledFallbackAges[0]))age.value=controlledFallbackAges[0];apply()};
  const closeSafeFallbacks=()=>{safeFallbackMode=false;manualReviewMode=false;seedVoiceFilters(prefix,{character,project});apply()};
  const hardSuitable=row=>{
    if(language?.value&&!rowLanguages(row).includes(clean(voiceLanguageName(language.value))))return false;
    if(age?.value&&!voiceAgeHardCompatible(age.value,row.dataset.age))return false;
    if(gender?.value){const g=clean(row.dataset.gender),want=clean(gender.value);if(g&&g!=='neutral'&&g!==want)return false}
    return true;
  };
  const closestRows=(rows,q)=>{const weights={language:100,age:45,gender:25,accent:12,use:6,tone:5};return rows.filter(hardSuitable).map(row=>{let score=0,matched=0;for(const [,el,key] of filters){if(!el?.value)continue;let ok=key==='language'?rowLanguages(row).includes(clean(voiceLanguageName(el.value))):key==='age'?voiceAgeHardCompatible(el.value,row.dataset.age):clean(row.dataset[key])===clean(el.value);if(ok){score+=weights[key]||1;matched++}}if(q&&row.dataset.search.includes(q)){score+=3;matched++}return {row,score,matched}}).filter(x=>x.matched>0).sort((a,b)=>b.score-a.score||b.matched-a.matched||String(a.row.dataset.search).localeCompare(String(b.row.dataset.search))).slice(0,4)};
  const apply=()=>{const q=clean(search?.value);const rows=[...list.querySelectorAll('[data-voice-row]')];let visible=0;
    if(safeFallbackMode){
      rows.forEach(row=>{clearFallback(row);const ok=controlledFallbackIds.has(String(row.dataset.voiceId||''))&&(!q||row.dataset.search.includes(q));row.classList.toggle('hidden',!ok);if(ok){visible++;markFallback(row);const btn=row.querySelector(`[data-use-${prefix}]`);if(btn&&!btn.classList.contains('selected-action'))btn.textContent='Approve & lock'}});
      renderChips();
      const intent=voiceAutoIntent(character||{},project||{}),fallbackAges=controlledFallbackAges;
      if(count)count.textContent=`${visible} controlled alternative${visible===1?'':'s'} shown · ${rows.length} total voices`;
      if(note){const ageText=intent.age&&fallbackAges.length?`Age relaxed from ${intent.age} → ${fallbackAges.join(' / ')}.`:'A narrowly controlled fallback is being reviewed.';note.innerHTML=`<div class="voice-no-match safe-fallback-review"><b>Reviewing controlled alternatives</b><span>${esc(ageText)} Language${intent.locale?', locale':''}${intent.presentation?', and presentation':''} remain protected. Nothing is assigned unless you explicitly approve a voice.</span><div><button type="button" class="ghost tiny" data-exit-safe-fallback>Return to exact target</button></div></div>`;note.querySelector('[data-exit-safe-fallback]')?.addEventListener('click',closeSafeFallbacks)}
      return;
    }
    if(manualReviewMode&&character){
      const ranked=rows.sort((a,b)=>Number(b.dataset.reviewFit||0)-Number(a.dataset.reviewFit||0)||Number(b.dataset.reviewScore||0)-Number(a.dataset.reviewScore||0)||String(a.dataset.search).localeCompare(String(b.dataset.search)));
      ranked.forEach(row=>list.appendChild(row));
      const eligible=ranked.filter(row=>Number(row.dataset.reviewFit||0)>=45);const target=manualReviewExpanded?eligible.slice(0,3):eligible.slice(0,1);
      const targetIds=new Set(target.map(row=>row.dataset.voiceId));
      rows.forEach(row=>{clearFallback(row);const btn=row.querySelector(`[data-use-${prefix}]`);if(btn&&!btn.classList.contains('selected-action'))btn.textContent=row.dataset.productionSafe==='false'?'Override & lock':'Approve & lock';const ok=targetIds.has(row.dataset.voiceId)&&(!q||row.dataset.search.includes(q));row.classList.toggle('hidden',!ok);if(ok)visible++});
      renderChips();if(count)count.textContent=manualReviewExpanded?`${visible} review-only option${visible===1?'':'s'} · metadata ranked · ${rows.length} total voices`:`1 closest review-only option · ${rows.length} total voices`;
      if(note)note.innerHTML=`<div class="voice-no-match manual-review"><b>${manualReviewExpanded?'Additional review-only options':'Closest review-only fallback · optional'}</b><span>${manualReviewExpanded?'CineTale is showing up to three closest metadata matches for deliberate manual review.':'CineTale is showing only the single closest fallback. It is not production-safe unless every hard requirement is verified.'} Warnings show every known mismatch. Provider-unverified age is never treated as Child automatically.</span><span class="voice-safe-gap">Browsing and ranking use catalog metadata only. Credits are used only when a provider must synthesize a preview after you press Listen. Provider sample audio, when available, is played directly. Repeated generated previews are cached for this browser session.</span><div><button type="button" class="ghost tiny" data-toggle-manual-review>${manualReviewExpanded?'Show closest only':'See 2 more review-only options'}</button><button type="button" class="ghost tiny" data-exit-manual-review>Return to exact target</button></div></div>`;
      note?.querySelector('[data-toggle-manual-review]')?.addEventListener('click',()=>{manualReviewExpanded=!manualReviewExpanded;apply()});
      note?.querySelector('[data-exit-manual-review]')?.addEventListener('click',()=>{manualReviewMode=false;manualReviewExpanded=false;seedVoiceFilters(prefix,{character,project});apply()});return;
    }
    rows.forEach(row=>{clearFallback(row);const btn=row.querySelector(`[data-use-${prefix}]`);if(btn&&!btn.classList.contains('selected-action'))btn.textContent='Use & lock';const ok=(!q||row.dataset.search.includes(q))&&filters.every(([,el,key])=>exact(row,el,key));row.classList.toggle('hidden',!ok);if(ok)visible++});renderChips();const hasCriteria=Boolean(q||filters.some(([,el])=>el?.value));let fallback=[];if(visible===0&&hasCriteria){fallback=closestRows(rows,q);for(const x of fallback){x.row.classList.remove('hidden');markFallback(x.row)}}
    if(visible===0&&hasCriteria&&character&&!controlledFallbacks.length){manualReviewMode=true;manualReviewExpanded=false;if(search)search.value='';for(const [,el] of filters)if(el)el.value='';return apply()}
    if(count)count.textContent=visible?`${visible} exact match${visible===1?'':'es'} · ${rows.length} total voices`:fallback.length?`0 exact matches · ${fallback.length} suitable alternative${fallback.length===1?'':'s'} shown · ${rows.length} total voices`:`0 suitable matches · ${rows.length} total voices`;
    if(note){if(visible===0&&hasCriteria){const lang=language?.value,reg=accent?.value,hasSameLanguage=lang&&rows.some(r=>rowLanguages(r).includes(clean(voiceLanguageName(lang)))),hasCompatibleAge=age?.value&&rows.some(r=>voiceAgeHardCompatible(age.value,r.dataset.age));
      const safeAction=character&&controlledFallbacks.length?`<button type="button" class="ghost tiny" data-review-safe-fallbacks>Review safe alternatives (${controlledFallbacks.length})</button>`:'';
      const noSafeCopy=character&&!controlledFallbacks.length?'<span class="voice-safe-gap">No controlled age fallback is available for this target. Record/upload an authorized voice, connect a suitable provider, or keep the character unresolved.</span>':'';
      const genericActions=!character?`${hasSameLanguage?'<button type="button" class="ghost tiny" data-relax="language">Broaden to same language</button>':''}${hasCompatibleAge?'<button type="button" class="ghost tiny" data-relax="age">Show same age range</button>':''}${reg?'<button type="button" class="ghost tiny" data-relax="accent">Show same region</button>':''}`:'';
      note.innerHTML=`<div class="voice-no-match"><b>${fallback.length?'No exact voice matches every selected filter.':'No suitable voice found in the current library.'}</b><span>${fallback.length?'Only voices that still satisfy the selected language capability, safe age range and presentation are shown below. Accent and tone may be broadened, but language and child-safety gates are not silently relaxed.':'CineTale will not recommend an unrelated adult or different-language voice just to fill the slot.'}</span>${noSafeCopy}<div>${safeAction}${genericActions}<button type="button" class="ghost tiny" data-relax="all">Review closest fallback</button></div></div>`;
      note.querySelector('[data-review-safe-fallbacks]')?.addEventListener('click',openSafeFallbacks);
      note.querySelectorAll('[data-relax]').forEach(b=>b.onclick=()=>b.dataset.relax==='all'?(()=>{safeFallbackMode=false;if(character){manualReviewMode=true;manualReviewExpanded=false;if(search)search.value='';for(const [,el] of filters)if(el)el.value='';apply()}else{manualReviewMode=false;if(search)search.value='';for(const [,el] of filters)if(el)el.value='';apply()}})():relaxTo(b.dataset.relax));
    }else note.innerHTML='';}
  };
  if(search)search.addEventListener('input',apply);
  filters.map(x=>x[1]).filter(Boolean).forEach(el=>el.addEventListener('change',()=>{safeFallbackMode=false;manualReviewMode=false;apply()}));apply();
}
async function openNarratorVoicePicker(){
  const p=current();if(!p){toast('Create a project first.');return}
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Narrator Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];const perf=p.narratorPerformance||'Warm',pace=p.narratorPace||'Natural';
    const narratorRanked=voices.filter(v=>voiceSuitableForNarrator(v,p));const narratorSuggested=new Set(narratorRanked.slice(0,5).map(v=>v.voice_id));const rows=voices.map(v=>voiceRow(v,p.narratorVoiceId,narratorSuggested.has(v.voice_id)&&!p.narratorVoiceLocked,'narrator')).join('');
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio narrator-studio"><div class="voice-studio-head"><div><small>NARRATOR VOICE</small><h2>${esc(p.title||'Project narrator')}</h2><p>Choose one narrator for the whole project. Browse your full voice library by accent, age feel and use case, then shape performance without changing voice identity.</p></div><div class="voice-lock-state ${p.narratorVoiceLocked?'locked':'auto'}">${p.narratorVoiceLocked?'● Narrator locked':'◇ Auto narrator'}</div></div><div class="personal-voice-entry"><button type="button" class="ghost" id="personalVoiceBtn">🎙 Record / upload my voice</button><small>Create a reusable personal voice only after explicit authorization. CineTale never creates a clone silently.</small></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="narratorPerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="narratorPace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Accent / regional direction · optional</span><input id="narratorAccentDirection" value="${esc(p.narratorAccentDirection||'')}" placeholder="e.g. Indian English, Nigerian English, Mexican Spanish, London English"><small>Best results come from choosing a matching voice; this note fine-tunes delivery when supported.</small></label><label class="field"><span>Custom narration direction · optional</span><input id="narratorCustomDirection" value="${esc(p.narratorCustomDirection||'')}" placeholder="e.g. intimate, warm, restrained, never trailer-like"></label><label class="field"><span>Preview line</span><input id="narratorPreviewLine" value="${esc(p.narratorPreviewLine||'Some stories begin with a door. This one begins with a sound behind it.')}" /></label><div class="voice-current narrator-current ${p.narratorVoiceLocked?'locked':'auto'}"><span>${p.narratorVoiceLocked?'Current narrator':'Auto narrator'}</span><b>${esc(p.narratorVoiceName||d.narratorVoiceName||(p.narratorAutoDecision?.noSuitableVoice?'No suitable narrator match yet':'CineTale will choose the best suitable narrator'))}</b><small>${p.narratorVoiceLocked?'This narrator stays fixed across the entire project.':p.narratorVoiceId?'Auto matched to the project language and narration use case.':`Auto target · ${esc(projectVoiceLanguages(p).join(' + ')||'project language')}`}</small></div>${voiceFilterBar(voices,'narrator')}<div class="voice-list" id="narratorVoiceList">${rows}</div><div class="voice-list-count" id="narratorVoiceCount"></div><div class="modal-actions split"><button type="button" class="ghost" id="narratorAuto">Reset to Auto</button><div><button type="button" class="ghost" id="narratorCancel">Close</button><button type="button" class="primary" id="narratorSaveSettings">Save narrator settings</button></div></div></div>`;
    seedVoiceFilters('narrator',{project:p,narrator:true});bindVoiceFilters('narrator',{project:p,voices});
    const previewOptions=()=>({kind:'narration',direction:[VOICE_PERFORMANCE[$('#narratorPerformance').value]||VOICE_PERFORMANCE.Warm,VOICE_PACE[$('#narratorPace').value]||VOICE_PACE.Natural,$('#narratorAccentDirection').value.trim(),$('#narratorCustomDirection').value.trim(),'restrained storyteller; avoid trailer voice'].filter(Boolean).join('. '),language:p.language,speakerProfile:['project narrator',$('#narratorAccentDirection').value.trim()].filter(Boolean).join('. ')});
    $('#narratorCancel').onclick=closeModal;
    $('#narratorSaveSettings').onclick=()=>{updateProject(x=>{x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator performance settings saved.')};
    $('#narratorAuto').onclick=()=>{updateProject(x=>{x.narratorVoiceId='';x.narratorVoiceName='';x.narratorVoiceLocked=false;x.narratorAutoDecision=null;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator reset to Auto.')};
    $$('[data-preview-narrator]').forEach(b=>b.onclick=async()=>{const id=b.dataset.previewNarrator;setVoicePreviewState('narrator',id,true);$$('[data-preview-narrator]').forEach(x=>x.disabled=x!==b);try{await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',id,previewOptions())}catch{}finally{setVoicePreviewState('narrator',id,false);$$('[data-preview-narrator]').forEach(x=>x.disabled=false)}});
    $$('[data-use-narrator]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useNarrator,name=b.dataset.narratorName;updateProject(x=>{x.narratorVoiceId=id;x.narratorVoiceName=name;x.narratorVoiceLocked=true;x.narratorAutoDecision=null;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});setVoiceSelectedState('narrator',id,name);toast(`${name} locked as project narrator.`);try{setVoicePreviewState('narrator',id,true);await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',id,previewOptions())}catch{}finally{setVoicePreviewState('narrator',id,false)}});
  }catch(e){toast('Narrator voice catalog could not be loaded.');}
}

async function openVoicePicker(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];const perf=c.voicePerformanceMode==='manual'?(c.voicePerformance||'Natural'):characterAutoPerformance(p,c),pace=c.voicePaceMode==='manual'?(c.voicePace||'Natural'):characterAutoPace(p,c);
    const ranked=[...voices].filter(v=>voiceSuitableForCharacter(v,c,p)).map(v=>({v,score:voiceMatchScore(v,c,p)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));const suggestedIds=new Set(ranked.slice(0,Math.min(5,ranked.length)).map(x=>x.v.voice_id));
    const reviewedVoices=voices.map(v=>({v,review:voiceManualReviewAssessment(v,c,p)})).sort((a,b)=>b.review.fitPercent-a.review.fitPercent||b.review.score-a.review.score||a.v.name.localeCompare(b.v.name));const bestAlternatives=bestVoiceManualAlternatives(voices,c,p,3);
    const rows=reviewedVoices.map(({v,review})=>voiceRow(v,c.voiceId,suggestedIds.has(v.voice_id)&&!c.voiceLocked,'voice',review,{character:c,project:p})).join('');
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio"><div class="voice-studio-head"><div><small>CHARACTER VOICE</small><h2>${esc(c.name)}</h2><p>CineTale resolves the voice automatically when provider metadata verifies every hard requirement. If no safe exact match exists, it shows only the closest review options and explains the unresolved constraint; the full library stays optional.</p></div><div class="voice-lock-state ${c.voiceLocked?'locked':'auto'}">${c.voiceLocked?'● Voice locked':'◇ Auto targeting'}</div></div><div class="personal-voice-entry"><button type="button" class="ghost" id="personalVoiceBtn">🎙 Record / upload my voice</button><small>Create a reusable personal voice only after explicit authorization. CineTale never creates a clone silently.</small></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="voicePerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="voicePace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Accent / regional direction · optional</span><input id="voiceAccentDirection" value="${esc(c.voiceAccentDirection||'')}" placeholder="e.g. Indian English, Cantonese/Hong Kong, Nigerian English"><small>Choose a voice with the matching accent when available; this note fine-tunes delivery without inferring accent from ethnicity or name.</small></label><label class="field"><span>Custom delivery direction · optional</span><input id="voiceCustomDirection" value="${esc(c.voiceCustomDirection||'')}" placeholder="e.g. slightly breathless, understated, dry humor"></label><label class="field"><span>Preview line</span><input id="voicePreviewLine" value="${esc(c.voicePreviewLine||characterVoicePreviewLine(p,index))}"></label><div class="voice-current ${c.voiceLocked?'locked':'auto'}"><span>${c.voiceLocked?'Current voice':'Auto targeting'}</span><b>${esc(c.voiceName||(c.voiceAutoDecision?.noSuitableVoice?'No suitable library match yet':'CineTale will choose the best suitable match'))}</b><small>${c.voiceLocked?'This voice stays fixed across scenes and future episodes.':esc(voiceAutoDecisionSummary(c,p))}</small>${!c.voiceLocked&&c.voiceId&&c.voiceAutoDecision?.matches?.length?`<em class="voice-auto-why">Why this voice: ${esc(c.voiceAutoDecision.matches.slice(0,4).join(' · '))}</em>`:''}${c.voiceLocked&&voices.find(v=>v.voice_id===c.voiceId)&&!voiceSuitableForCharacter(voices.find(v=>v.voice_id===c.voiceId),c,p)?'<em class="voice-suitability-warning">This locked voice no longer matches the character’s current language/age requirements. Preview it or choose another voice before approving the cast.</em>':''}</div>${voiceResolverInsight(voices,c,p,ranked,bestAlternatives)}<details class="voice-advanced-filters"><summary>Advanced manual filters · ${voices.length} connected voices</summary>${voiceFilterBar(voices,'voice')}</details><div class="voice-list" id="voiceVoiceList">${rows}</div><div class="voice-list-count" id="voiceVoiceCount"></div><div class="modal-actions split"><button type="button" class="ghost" id="voiceAuto">Reset to Auto</button><div><button type="button" class="ghost" id="voiceCancel">Close</button><button type="button" class="primary" id="voiceSaveSettings">Save voice settings</button></div></div></div>`;
    seedVoiceFilters('voice',{character:c,project:p});bindVoiceFilters('voice',{character:c,project:p,voices});
    const voiceList=$('#voiceVoiceList');if(voiceList){voiceList.dataset.selectedVoiceId=c.voiceId||'';voiceList.dataset.selectedVoiceName=c.voiceName||''}
    const previewOptions=()=>({kind:'dialogue',direction:[VOICE_PERFORMANCE[$('#voicePerformance').value]||VOICE_PERFORMANCE.Natural,VOICE_PACE[$('#voicePace').value]||VOICE_PACE.Natural,$('#voiceAccentDirection').value.trim(),$('#voiceCustomDirection').value.trim()].filter(Boolean).join('. '),language:p.language,speakerProfile:[c.age,c.personality,c.voice,$('#voiceAccentDirection').value.trim()].filter(Boolean).join('. ')});
    $('#voiceCancel').onclick=closeModal;
    $('#personalVoiceBtn').onclick=()=>openPersonalVoiceStudio(index);
    $('#voiceSaveSettings').onclick=()=>{const list=$('#voiceVoiceList'),selectedId=list?.dataset.selectedVoiceId||'',selectedName=list?.dataset.selectedVoiceName||'';updateProject(x=>{const t=x.characters[index];if(selectedId){applyCharacterVoiceSelection(x,index,{voiceId:selectedId,voiceName:selectedName||t.voiceName||'Selected voice',mode:'custom',locked:true});t.voiceAutoDecision=null}t.voicePerformance=$('#voicePerformance').value;t.voicePerformanceMode='manual';t.voicePace=$('#voicePace').value;t.voicePaceMode='manual';t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();scheduleLockedVoiceAudit(current());void pushCloudWorkspace();const live=current()?.characters?.[index];closeModal();resumeAutomaticDialogueFinalizationSoon();toast(live?.voiceId===selectedId&&selectedId?`${live.voiceName||selectedName} saved and locked to ${live.name}.`:'Voice performance settings saved. CineTale will refresh affected dialogue automatically.')};
    $('#voiceAuto').onclick=()=>{updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:'',voiceName:'',mode:'auto',locked:false});t.voiceAutoDecision=null;t.voicePerformance=$('#voicePerformance').value;t.voicePerformanceMode='manual';t.voicePace=$('#voicePace').value;t.voicePaceMode='manual';t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();void pushCloudWorkspace();closeModal();resumeAutomaticDialogueFinalizationSoon();toast(`${c.name} reset to Auto targeting. CineTale will refresh affected dialogue automatically.`)};
    $$('[data-preview-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.previewVoice,chosen=voices.find(v=>v.voice_id===id);setVoicePreviewState('voice',id,true);$$('[data-preview-voice]').forEach(x=>x.disabled=x!==b);try{await previewVoiceCandidate(chosen,$('#voicePreviewLine').value.trim()||characterVoicePreviewLine(p,index)||c.name,previewOptions())}catch{}finally{setVoicePreviewState('voice',id,false);$$('[data-preview-voice]').forEach(x=>x.disabled=false)}});
    $$('[data-use-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useVoice,name=b.dataset.voiceName,chosen=voices.find(v=>v.voice_id===id),review=chosen?voiceManualReviewAssessment(chosen,c,p):null;if(review?.issues?.length){const hard=review?.hardIssues?.length;const ok=confirm(`${hard?'This voice is NOT production-safe for the current hard requirements.':'This is a manual voice override'} for ${c.name}.\n\n${review.issues.map(x=>`• ${x}`).join('\n')}\n\nCineTale will not treat this as an exact match. ${hard?'Override the safety recommendation and lock this voice anyway?':'Use and lock this voice anyway?'}`);if(!ok)return}updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:id,voiceName:name,mode:'custom',locked:true});t.voiceAutoDecision=null;t.voiceManualOverride=review?.issues?.length?{approvedAt:new Date().toISOString(),issues:[...review.issues],target:voiceAutoIntent(c,p),provider:voiceMetadata(chosen).provider||'',voiceId:id}:null;if(review?.issues?.length){t.voiceLockReview={status:'needs-review',signature:voiceLockRequirementSignature(t,x),voiceId:id,voiceName:name,reasons:[...review.issues],auditedAt:new Date().toISOString(),acknowledged:true,acknowledgedAt:new Date().toISOString()}}t.voicePerformance=$('#voicePerformance').value;t.voicePerformanceMode='manual';t.voicePace=$('#voicePace').value;t.voicePaceMode='manual';t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();setVoiceSelectedState('voice',id,name);scheduleLockedVoiceAudit(current());void pushCloudWorkspace();resumeAutomaticDialogueFinalizationSoon();const live=current()?.characters?.[index];if(live?.voiceId!==id||!live?.voiceLocked){toast('Voice selection could not be persisted. Please try again.');return}toast(`${name} saved and locked to ${live.name}. It will remain after closing or refreshing. No new preview was generated. Affected dialogue will refresh automatically.`)});
  }catch(e){toast('Voice catalog could not be loaded.');}
}

async function openPersonalVoiceStudio(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;
  let sampleData='',sampleName='',recorder=null,stream=null,chunks=[];
  const stopTracks=()=>{try{stream?.getTracks().forEach(t=>t.stop())}catch{}stream=null};
  $('#modalBody').innerHTML=`<div class="modal-form personal-voice-studio"><span class="kicker">PERSONAL VOICE</span><h2>Record or upload your voice</h2><p>Create a reusable voice for ${esc(c.name)}. The audio sample is sent to the configured voice provider only after you confirm authorization.</p><label class="field"><span>Voice name</span><input id="personalVoiceName" value="${esc(`${c.name} · Personal voice`)}" maxlength="80"></label><div class="personal-voice-source"><button type="button" class="primary" id="personalVoiceRecord">● Start recording</button><button type="button" class="ghost" id="personalVoiceUpload">Upload audio</button><input class="hidden" id="personalVoiceFile" type="file" accept="audio/*"></div><div class="personal-voice-sample" id="personalVoiceSample"><b>No sample selected yet</b><small>Use a clear recording in a quiet room. You can preview it before creating the reusable voice.</small><audio id="personalVoicePreview" controls class="hidden"></audio></div><label class="field"><span>Whose voice is this?</span><select id="personalVoiceBasis"><option value="self">My own voice</option><option value="authorized-adult">Another adult who explicitly authorized this use</option><option value="authorized-minor">A minor whose parent/guardian or authorized representative approved this use</option></select></label><label class="consent-check"><input type="checkbox" id="personalVoiceConsent"><span>I confirm this is my voice, or I have explicit permission to create and use a reusable voice from this recording.</span></label><label class="consent-check hidden" id="personalVoiceMinorWrap"><input type="checkbox" id="personalVoiceMinorConsent"><span>I confirm I am the parent/guardian or otherwise authorized to approve use of this minor’s voice.</span></label><div class="privacy-note"><b>Consent & privacy</b><span>CineTale will not create the voice until the required confirmations are checked. CineTale does not keep the raw sample in your project after creation.</span></div><div id="personalVoiceStatus" class="settings-note">Ready to record or upload a sample.</div><div class="modal-actions"><button type="button" class="ghost" id="personalVoiceCancel">Cancel</button><button type="button" class="primary" id="personalVoiceCreate" disabled>Create reusable personal voice</button></div></div>`;
  $('#modal').classList.remove('hidden');
  const status=$('#personalVoiceStatus'),preview=$('#personalVoicePreview'),record=$('#personalVoiceRecord'),file=$('#personalVoiceFile'),basis=$('#personalVoiceBasis'),consent=$('#personalVoiceConsent'),minor=$('#personalVoiceMinorConsent'),minorWrap=$('#personalVoiceMinorWrap'),create=$('#personalVoiceCreate');
  const sync=()=>{const needsMinor=basis.value==='authorized-minor';minorWrap.classList.toggle('hidden',!needsMinor);create.disabled=!(sampleData&&consent.checked&&(!needsMinor||minor.checked));};
  const setSample=(data,name)=>{sampleData=data;sampleName=name;preview.src=data;preview.classList.remove('hidden');$('#personalVoiceSample b').textContent=name||'Voice sample ready';status.textContent='Sample ready. Preview it, then confirm authorization.';sync()};
  $('#personalVoiceUpload').onclick=()=>file.click();file.onchange=async()=>{const f=file.files?.[0];if(!f)return;if(!String(f.type||'').startsWith('audio/')){toast('Choose an audio file.');return}if(f.size>20*1024*1024){toast('Use an audio file under 20 MB.');return}setSample(await audioBlobToDataUrl(f),f.name)};
  record.onclick=async()=>{if(recorder?.state==='recording'){recorder.stop();record.textContent='● Start recording';return}try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported?.(x));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onstop=async()=>{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});stopTracks();if(blob.size)setSample(await audioBlobToDataUrl(blob),'Recorded voice sample');record.textContent='● Start recording'};recorder.start(500);record.textContent='■ Stop recording';status.textContent='Recording… speak naturally for at least several sentences.'}catch(e){stopTracks();toast('Microphone could not start. Check browser permission or upload a recording instead.')}};
  basis.onchange=sync;consent.onchange=sync;minor.onchange=sync;
  $('#personalVoiceCancel').onclick=()=>{try{if(recorder?.state==='recording')recorder.stop()}catch{}stopTracks();closeModal()};
  create.onclick=async()=>{if(create.disabled)return;const old=create.textContent;create.disabled=true;create.textContent='Creating voice…';status.textContent='Creating your reusable voice securely…';try{const d=await apiPost('/api/create-personal-voice',{name:$('#personalVoiceName').value.trim()||`${c.name} · Personal voice`,audio:sampleData,consentConfirmed:true,authorizationBasis:basis.value,minorAuthorization:basis.value!=='authorized-minor'||minor.checked});if(d.requiresVerification){status.textContent='The connected voice service created the voice but requires verification before it can be used. Complete the required verification with the connected voice service, then reopen Voice Studio.';toast('Voice created; provider verification is required.');return}updateProject(x=>{const t=x.characters[index];t.voiceId=d.voiceId;t.voiceName=$('#personalVoiceName').value.trim()||`${c.name} · Personal voice`;t.voiceMode='personal';t.voiceLocked=true;t.voiceAutoDecision=null;t.voiceConsent={confirmed:true,basis:basis.value,minorAuthorization:basis.value==='authorized-minor'?minor.checked:false,confirmedAt:new Date().toISOString(),provider:'elevenlabs'};invalidateSpeakingSyncForCharacterVoiceChange(x,index);invalidateStudioStages(x,'cast');if(t.voiceLockReview)delete t.voiceLockReview});clearAudioPreviewCache();voiceCatalogCache=null;scheduleLockedVoiceAudit(current());void pushCloudWorkspace();resumeAutomaticDialogueFinalizationSoon();stopTracks();closeModal();renderCharacters();toast('Personal voice created and locked to this character. Production readiness will be recalculated.')}catch(e){status.textContent=e.message||'Personal voice creation failed.';toast(e.message||'Personal voice creation failed.')}finally{create.disabled=false;create.textContent=old;sync()}};
  sync();
}

function deleteCharacter(index){const p=current(),c=p?.characters?.[index];if(!c)return;if(!confirm(`Remove ${c.name} from the recurring cast? Existing scene text is not rewritten automatically.`))return;updateProject(x=>{x.characters=(x.characters||[]).filter((_,i)=>i!==index);invalidateStudioStages(x,'cast')});toast(`${c.name} removed from cast.`)}

function openCharacterEditor(index=null){
  const p=current();if(!p){toast('Create a project first.');return}
  const c=index===null?{name:'',role:'',age:'',appearance:'',background:'',personality:'',voice:'',pronouns:'',voicePresentation:'',voicePerformance:'Natural',voicePerformanceMode:'auto',voicePace:'Natural',voicePaceMode:'auto',voiceCustomDirection:'',voiceLocked:false,voiceMode:'auto',languages:'',wardrobe:'',locked:true,visualStyleOverride:'project',customVisualStyle:'',entityType:'fictional-person',sacredIdentity:'',representationMode:'project',canonicalVisualCues:[]}:structuredClone(p.characters[index]);
  c.visualStyleOverride=c.visualStyleOverride||'project';
  $('#modalBody').innerHTML=`<form class="modal-form" id="characterForm"><h2>${index===null?'Add character':'Edit character'}</h2><p>Describe the character naturally. Identity Lock preserves who the character is while visual style can follow the project or use an override.</p><div class="field-grid two"><label class="field"><span>Name</span><input id="cfName" value="${esc(c.name)}" required></label><label class="field"><span>Role</span><input id="cfRole" value="${esc(c.role)}" placeholder="Lead, ally, narrator…"></label></div><div class="field-grid two"><label class="field"><span>Age / presentation</span><input id="cfAge" value="${esc(c.age)}" placeholder="Any age or fictional presentation"></label><label class="field"><span>Language(s)</span><input id="cfLanguages" value="${esc(c.languages)}" placeholder="Any language, dialect, mix"></label></div><div class="field-grid two"><label class="field"><span>Pronouns · optional</span><input id="cfPronouns" value="${esc(c.pronouns||'')}" placeholder="e.g. she/her, he/him, they/them"><small>Used for character consistency and Auto Voice when explicitly provided.</small></label><label class="field"><span>Auto Voice presentation · optional</span><select id="cfVoicePresentation"><option value="" ${!c.voicePresentation?'selected':''}>Not specified — do not infer</option><option value="Feminine" ${c.voicePresentation==='Feminine'?'selected':''}>Feminine</option><option value="Masculine" ${c.voicePresentation==='Masculine'?'selected':''}>Masculine</option><option value="Neutral" ${c.voicePresentation==='Neutral'?'selected':''}>Neutral</option></select><small>Used only when you explicitly set it. CineTale does not infer voice presentation from a name, culture, religion or appearance. Manual voice selection still overrides it.</small></label></div><label class="field"><span>Appearance</span><textarea id="cfAppearance" placeholder="Describe anything…">${esc(c.appearance)}</textarea></label><label class="field"><span>Culture / background / origin</span><input id="cfBackground" value="${esc(c.background)}" placeholder="Optional; any culture, ethnicity, nationality, fictional origin…"></label><div class="field-grid two sacred-character-fields"><label class="field"><span>Character type</span><select id="cfEntityType"><option value="fictional-person" ${c.entityType==='fictional-person'?'selected':''}>Fictional person</option><option value="historical-figure" ${c.entityType==='historical-figure'?'selected':''}>Historical figure</option><option value="folklore-figure" ${c.entityType==='folklore-figure'?'selected':''}>Folklore figure</option><option value="mythological-figure" ${c.entityType==='mythological-figure'?'selected':''}>Mythological figure</option><option value="sacred-figure" ${c.entityType==='sacred-figure'?'selected':''}>Sacred / divine figure</option><option value="creature" ${c.entityType==='creature'?'selected':''}>Creature / nonhuman</option></select></label><label class="field"><span>Representation</span><select id="cfRepresentationMode"><option value="project" ${!c.representationMode||c.representationMode==='project'?'selected':''}>Use project setting</option><option value="symbolic" ${c.representationMode==='symbolic'?'selected':''}>Symbolic / unseen</option><option value="idol" ${c.representationMode==='idol'?'selected':''}>Sacred icon / idol</option><option value="visible-divine" ${c.representationMode==='visible-divine'?'selected':''}>Visible divine character</option><option value="traditional-mythological" ${c.representationMode==='traditional-mythological'?'selected':''}>Traditional mythological</option></select></label></div><label class="field"><span>Sacred / canonical identity · optional</span><input id="cfSacredIdentity" value="${esc(c.sacredIdentity||'')}" placeholder="e.g. Lord Ganesha (Vighnaharta), Goddess Durga"><small>Use for sacred/mythological figures so CineTale preserves recognizable identity rather than rendering a generic person.</small></label><label class="field"><span>Canonical visual cues · optional</span><input id="cfCanonicalVisualCues" value="${esc(Array.isArray(c.canonicalVisualCues)?c.canonicalVisualCues.join('; '):(c.canonicalVisualCues||''))}" placeholder="e.g. elephant head; curved trunk; traditional ornaments; warm devotional presence"></label><div class="field-grid two"><label class="field"><span>Visual style override</span><select id="cfVisualStyle">${visualStyleOptions(c.visualStyleOverride,true)}</select><small>Use project style for a consistent production, or deliberately give this character another rendering style.</small></label><label class="field ${c.visualStyleOverride==='custom'?'':'hidden'}" id="cfCustomStyleWrap"><span>Custom character style</span><input id="cfCustomStyle" value="${esc(c.customVisualStyle||'')}" placeholder="Describe any visual treatment"></label></div><label class="field"><span>Personality</span><input id="cfPersonality" value="${esc(c.personality)}"></label><label class="field"><span>Voice direction</span><input id="cfVoice" value="${esc(c.voice)}" placeholder="Accent, tone, age impression, pace, texture…"></label><label class="field"><span>Wardrobe / continuity</span><input id="cfWardrobe" value="${esc(c.wardrobe)}"></label><div class="identity-note"><b>Identity Lock</b><span>When regenerating this character, CineTale can reuse the current portrait as a reference so style changes preserve the same person.</span></div><div class="modal-actions"><button type="button" class="ghost" id="characterCancel">Cancel</button><button class="primary" type="submit">Save character</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#characterCancel').onclick=closeModal;
  $('#cfVisualStyle').onchange=e=>$('#cfCustomStyleWrap').classList.toggle('hidden',e.target.value!=='custom');
  $('#characterForm').onsubmit=e=>{e.preventDefault();const item={...c,id:c.id||uid('c'),name:$('#cfName').value.trim(),role:$('#cfRole').value.trim(),age:$('#cfAge').value.trim(),pronouns:$('#cfPronouns').value.trim(),voicePresentation:$('#cfVoicePresentation').value,languages:$('#cfLanguages').value.trim(),appearance:$('#cfAppearance').value.trim(),background:$('#cfBackground').value.trim(),entityType:$('#cfEntityType').value,sacredIdentity:$('#cfSacredIdentity').value.trim(),representationMode:$('#cfRepresentationMode').value,canonicalVisualCues:$('#cfCanonicalVisualCues').value.split(';').map(x=>x.trim()).filter(Boolean),visualStyleOverride:$('#cfVisualStyle').value,customVisualStyle:$('#cfCustomStyle').value.trim(),personality:$('#cfPersonality').value.trim(),voice:$('#cfVoice').value.trim(),wardrobe:$('#cfWardrobe').value.trim(),locked:true};updateProject(p=>{p.characters=p.characters||[];const previous=index===null?null:p.characters[index],before=previous?voiceLockRequirementSignature(previous,p):'';delete item.voiceLockReview;if(index===null)p.characters.push(item);else{p.characters[index]=item;const after=voiceLockRequirementSignature(item,p);if(before!==after){if(!item.voiceLocked){applyCharacterVoiceSelection(p,index,{voiceId:'',voiceName:'',mode:'auto',locked:false});item.voiceAutoDecision=null}invalidateSpeakingSyncForCharacterVoiceChange(p,index)}}invalidateStudioStages(p,'cast')});closeModal();scheduleLockedVoiceAudit(current());scheduleAutoVoiceWarmup(current());toast('Character saved. CineTale recalculated story-derived voice requirements and Cast Review is required again before production.')}
}
$('#addCharacterBtn').onclick=()=>openCharacterEditor(null);
function openImage(a){$('#modalBody').innerHTML=`<img class="preview-image" src="${a.image}" alt="${esc(a.name)}"><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">${esc(a.kind)}</p>`;$('#modal').classList.remove('hidden')}
async function openLibraryAsset(a){if(a.finalVideoProjectId){const p=state.projects.find(x=>x.id===a.finalVideoProjectId);if(!p){toast('This final video project is no longer available.');return}const ep=episodeOf(p),key=finalVideoAssetKey(p,ep);let asset=finalVideoAssets.get(key);if(!asset){await restoreFinalVideoAsset(p,ep);asset=finalVideoAssets.get(key)}if(!asset){toast(p.finalVideoMeta?.storagePath?'The final video could not be restored. Open Studio to retry or rebuild only the final file.':'The browser-local final video is unavailable. Open Studio to rebuild only the final file.');return}$('#modalBody').innerHTML=`<video class="preview-image" src="${esc(asset.url)}" controls playsinline autoplay></video><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">Final video · ${esc(asset.mime||'video')}</p><div class="modal-actions"><button class="primary" id="libraryDownloadFinal">Download</button><button class="ghost" id="libraryShareFinal">Share</button></div>`;$('#modal').classList.remove('hidden');$('#libraryDownloadFinal').onclick=()=>{const link=document.createElement('a');link.href=asset.url;link.download=asset.filename;link.click()};$('#libraryShareFinal').onclick=async()=>{const file=new File([asset.blob],asset.filename,{type:asset.mime||asset.blob.type});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:p.title,files:[file]}).catch(()=>{});else toast('File sharing is unavailable in this browser. Use Download instead.')};return}if(a.video){$('#modalBody').innerHTML=`<video class="preview-image" controls playsinline autoplay preload="none" src="${esc(a.video)}"></video><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">Video clip</p>`;$('#modal').classList.remove('hidden');return}if(a.assembly){const clips=(a.assembly.scenes||[]).map(x=>`<li>${esc(x.title)} · ${x.videoUrl?'ready':'missing'}</li>`).join('');$('#modalBody').innerHTML=`<h2>${esc(a.name)}</h2><p>Final assembly manifest prepared.</p><ol>${clips}</ol>`;$('#modal').classList.remove('hidden');return}openImage(a)}
function closeModal(){stopActiveScenePreview();if(activeAudio){try{activeAudio.pause();activeAudio.currentTime=0}catch{}activeAudio=null}$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}const modalCloseButton=$('#modalClose');if(modalCloseButton){modalCloseButton.type='button';modalCloseButton.setAttribute('aria-label','Close');modalCloseButton.onclick=e=>{e.preventDefault();e.stopPropagation();closeModal()}}$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal')?.classList.contains('hidden'))closeModal()});

$('#exportProject').onclick=()=>{const p=current();if(!p)return;const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(p.title||'cinetale-project').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$$('#libraryTabs [data-library-tab]').forEach(b=>b.onclick=()=>{state.libraryTab=b.dataset.libraryTab;renderLibrary()});$('#libraryNewStory').onclick=()=>setView('create');
function cloudHealthSummary(){
  if(!authUser())return {symbol:'○',label:'not signed in',detail:'Sign in to verify cross-device cloud workspace sync.',needsSetup:false};
  const status=state.cloudSync.status;
  if(status==='synced')return {symbol:'●',label:'synced',detail:state.cloudSync.lastSyncedAt?`Last synced ${new Date(state.cloudSync.lastSyncedAt).toLocaleString()}.`:'Signed-in workspace is connected.',needsSetup:false};
  if(status==='unavailable')return {symbol:'○',label:'setup required',detail:'The Supabase cinetale_workspaces table is not installed yet.',needsSetup:true};
  if(status==='error'){const permission=cloudPermissionError({status:0,message:state.cloudSync.lastError});return {symbol:'○',label:permission?'permission repair required':'sync error',detail:permission?'The workspace table exists, but authenticated PostgREST privileges or RLS policies need repair. Copy and run the cloud setup SQL once more.':(state.cloudSync.lastError||'Cloud workspace sync failed.'),needsSetup:permission};}
  return {symbol:'◐',label:status==='syncing'?'checking':'browser safety copy',detail:'Browser autosave remains active.',needsSetup:false};
}
function renderSystemHealth(d){
  const labels={story:'Story intelligence',image:'Visual generation',voice:'Voice generation',video:'Video generation'};
  const base=Object.entries(d.services||{}).map(([k,v])=>`${v?'●':'○'} ${labels[k]}: <b>${v?'configured':'not configured'}</b>`).join('<br>');
  const cloud=cloudHealthSummary();
  // Normal creators get capability-level health only. Provider/model/route diagnostics are an
  // owner concern and must not leak into the production UI.
  if(!isOwnerMode()){
    const cloudSection=`<br><br><b>Workspace</b><br>${cloud.symbol} Account sync: <b>${cloud.needsSetup?'browser backup active':esc(cloud.label)}</b><br><span class="health-hint">${cloud.needsSetup?'Your browser safety copy remains active.':esc(cloud.detail)}</span><br>${paidVideoGenerationAllowed()?'●':'○'} Paid video generation: <b>${paidVideoGenerationAllowed()?'enabled':'locked for development'}</b>`;
    $('#healthResult').innerHTML=base+cloudSection+`<br><br><span class="health-hint">App build: <b>v${APP_VERSION}</b></span>`;
    const cloudBtn=$('#copyCloudSetupBtn');if(cloudBtn)cloudBtn.classList.add('hidden');
    return;
  }
  const vp=d.providers?.voice||{};
  const voiceLive=state.voiceVerification.status==='ready';
  const voiceLabel=voiceLive?`verified live${state.voiceVerification.model?` · ${esc(state.voiceVerification.model)}`:''}`:(vp.reachable?'catalog ready · speech not live-verified':vp.status==='unreachable'?'configured · live catalog check unavailable':'configured');
  const voiceDetail=d.services?.voice?`<br><span class="health-hint">ElevenLabs: <b>${voiceLabel}</b>${state.voiceVerification.voiceName?` · ${esc(state.voiceVerification.voiceName)}`:''}${vp.defaultVoiceConfigured?'':' · default character voice auto-select'}${vp.narratorVoiceConfigured?'':' · narrator auto-select'}</span>`:'';
  const voiceWarnings=(d.warnings||[]).length?`<br><span class="health-hint">${(d.warnings||[]).map(esc).join('<br>')}</span>`:'';
  const backupVerified=state.backupVisualVerification.status==='ready'||(state.providerHealth.visual?.provider==='openai'&&state.providerHealth.visual?.status==='ready')||(state.providerHealth.visual?.route==='backup'&&state.providerHealth.visual?.status==='ready');
  const openAILabel=d.resilience?.openAIVisual?(backupVerified?`verified live${state.backupVisualVerification.model?` · ${esc(state.backupVisualVerification.model)}`:''}`:'configured · not live-verified yet'):'not configured';
  const geminiLabel=d.resilience?.geminiVisual?'configured':'not configured';
  const primaryLabel=d.resilience?.visualPrimary==='openai'?'OpenAI':d.resilience?.visualPrimary==='gemini'?'Gemini':'none';
  const resilience=`<br><br><b>Visual routes</b><br>${d.resilience?.openAIVisual?'●':'○'} OpenAI visual route: ${openAILabel}<br>${d.resilience?.geminiVisual?'●':'○'} Gemini visual route: ${geminiLabel}<br><span class="health-hint">Preferred live route: <b>${primaryLabel}</b>. CineTale automatically tries the other configured route on a retryable failure.</span><br>${d.resilience?.videoFallback?'●':'○'} Video fallback: ${d.resilience?.videoFallback?'ready':'not configured'}`;
  const live=state.providerHealth.visual;
  const session=`<br><br><b>This session</b><br>App build: <b>v${APP_VERSION}</b><br>Visual status: ${esc(live?.status||'unknown')}${live?.route?` · ${esc(live.route)} route`:''}${live?.lastMessage?`<br>${esc(live.lastMessage)}`:''}`;
  const cloudSection=`<br><br><b>Cloud workspace</b><br>${cloud.symbol} Profile sync: <b>${esc(cloud.label)}</b><br><span class="health-hint">${esc(cloud.detail)}</span>`;
  const cloudBtn=$('#copyCloudSetupBtn');if(cloudBtn){cloudBtn.classList.toggle('hidden',!cloud.needsSetup);cloudBtn.textContent=cloud.label==='permission repair required'?'Copy cloud repair SQL':'Copy cloud setup SQL';}
  $('#healthResult').innerHTML=base+voiceDetail+voiceWarnings+resilience+cloudSection+session;
}
async function runSystemHealth(){
  const box=$('#healthResult');if(box)box.textContent='Checking…';
  try{const r=await fetch('/api/health');const d=await r.json();if(!r.ok)throw new Error(d.error||'System check failed.');renderSystemHealth(d)}catch{if(box)box.textContent='System check unavailable.'}
}
$('#healthCheckBtn').onclick=runSystemHealth;
$('#verifyBackupVisualBtn').onclick=async()=>{
  const b=$('#verifyBackupVisualBtn'),old=b.textContent;b.disabled=true;b.textContent='Verifying…';
  try{
    const r=await fetch('/api/verify-visual-fallback',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Backup visual verification failed.');
    state.backupVisualVerification={status:'ready',model:d.model||'',verifiedAt:d.verifiedAt||new Date().toISOString(),lastError:''};sessionStorage.setItem(visualVerificationKey,JSON.stringify(state.backupVisualVerification));
    state.providerHealth.visual={status:'ready',route:'primary',provider:'openai',lastSuccessAt:new Date().toISOString(),lastErrorAt:null,lastMessage:`OpenAI visual route verified live${d.model?` with ${d.model}`:''}.`};
    toast('OpenAI visual route verified live.');await runSystemHealth();
  }catch(e){state.backupVisualVerification={status:'error',model:'',verifiedAt:null,lastError:e.message||String(e)};sessionStorage.setItem(visualVerificationKey,JSON.stringify(state.backupVisualVerification));toast(e.message||'Visual verification failed.');await runSystemHealth()}finally{b.disabled=false;b.textContent=old}
};
$('#verifyVoiceBtn').onclick=async()=>{
  const b=$('#verifyVoiceBtn'),old=b.textContent;b.disabled=true;b.textContent='Verifying…';
  try{
    const r=await fetch('/api/verify-voice',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Voice verification failed.');
    state.voiceVerification={status:'ready',model:d.model||'',voiceName:d.voiceName||'',verifiedAt:d.verifiedAt||new Date().toISOString(),lastError:''};sessionStorage.setItem(voiceVerificationKey,JSON.stringify(state.voiceVerification));
    toast(`ElevenLabs voice verified live${d.voiceName?` with ${d.voiceName}`:''}.`);await runSystemHealth();
  }catch(e){state.voiceVerification={status:'error',model:'',voiceName:'',verifiedAt:null,lastError:e.message||String(e)};sessionStorage.setItem(voiceVerificationKey,JSON.stringify(state.voiceVerification));toast(e.message||'Voice verification failed.');await runSystemHealth()}finally{b.disabled=false;b.textContent=old}
};
$('#copyCloudSetupBtn').onclick=async()=>{
  try{const r=await fetch('/SUPABASE_WORKSPACE_SETUP.sql');if(!r.ok)throw new Error('Cloud setup SQL is not available in this deployment.');const sql=await r.text();await navigator.clipboard.writeText(sql);toast('Cloud workspace setup/repair SQL copied. Run it in your Supabase SQL Editor, then return and click Check system.')}catch(e){toast(e.message||'Could not copy cloud setup SQL.')}
};
const refreshSyncDiagBtn=$('#refreshSyncDiagnosticBtn');if(refreshSyncDiagBtn)refreshSyncDiagBtn.onclick=()=>{syncDiag('manual-snapshot',current(),episodeOf(current())?.scenes?.[0]||null,{players:syncPlayerDiagnostics()});renderSyncDiagnostics()};
const clearSyncDiagBtn=$('#clearSyncDiagnosticBtn');if(clearSyncDiagBtn)clearSyncDiagBtn.onclick=()=>{syncDiagnosticEvents=[];sessionStorage.removeItem(syncDiagnosticKey);renderSyncDiagnostics();toast('Sync diagnostic trace cleared.')};
const copySyncDiagBtn=$('#copySyncDiagnosticBtn');if(copySyncDiagBtn)copySyncDiagBtn.onclick=async()=>{try{renderSyncDiagnostics();await navigator.clipboard.writeText(JSON.stringify(syncDiagnosticReport(),null,2));toast('Sync diagnostic report copied.')}catch(e){toast(e.message||'Could not copy diagnostic report.')}};
renderSyncDiagnostics();
const ownerCheckBtn=$('#ownerCheckBtn');if(ownerCheckBtn)ownerCheckBtn.onclick=async()=>{try{const code=$('#ownerCode')?.value||'';const r=await fetch('/api/owner',{headers:{'x-owner-code':code}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unauthorized');state.ownerAccess={resolved:true,isOwner:true,configured:true,source:'code'};applyOwnerMode();renderSyncDiagnostics();const out=$('#ownerResult');if(out){out.textContent='Owner access enabled for this session.';out.classList.remove('hidden')}toast('Owner diagnostics unlocked.')}catch(e){toast(e.message||'Owner access could not be unlocked.')}};

for(const p of state.projects){p.format=normalizedFormat(p.requestedFormat||p.format,'Episode');p.requestedFormat=p.requestedFormat||p.format;p.targetRuntimeSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration);ensureEpisodeIds(p);ensureCharacterIdentityIds(p);p.languageScope=p.languageScope||'entire-story';p.culturalTreatment=p.culturalTreatment||'auto';p.sacredRepresentation=p.sacredRepresentation||'auto';p.culturalContext=p.culturalContext||'';p.regionCommunity=p.regionCommunity||p.worldBible?.globalContext?.regionCommunity||'';p.beliefContext=p.beliefContext||'';p.traditionContext=p.traditionContext||p.worldBible?.globalContext?.traditionContext||'';p.eraPlace=p.eraPlace||p.worldBible?.globalContext?.eraPlace||'';p.culturalGrounding=p.culturalGrounding||p.worldBible?.globalContext?.grounding||'grounded';p.languageBehavior=p.languageBehavior||p.worldBible?.globalContext?.languageBehavior||'natural';p.productionProfile=p.productionProfile||'balanced';ensurePersistentWorld(p);p.narratorPerformance=p.narratorPerformance||'Warm';p.narratorPace=p.narratorPace||'Natural';if(p.narratorVoiceLocked==null)p.narratorVoiceLocked=false;for(const c of p.characters||[]){c.voicePerformance=c.voicePerformance||'Natural';c.voicePerformanceMode=c.voicePerformanceMode||'auto';c.voicePace=c.voicePace||'Natural';c.voicePaceMode=c.voicePaceMode||'auto';c.voiceMode=c.voiceMode||(c.voiceId?'auto':'auto');if(c.voiceLocked==null)c.voiceLocked=false;c.entityType=c.entityType||'fictional-person';c.representationMode=c.representationMode||'project';c.canonicalVisualCues=Array.isArray(c.canonicalVisualCues)?c.canonicalVisualCues:[]}normalizeProjectIdentityBindings(p);migrateValidatedLipSyncSignatures(p);migrateProjectShotTimelines(p);recoverPersistedModernPrimaryVideoProvenance(p)}save();
queueMicrotask(reconcileAllPersistedVideoJobs);

$('#accountButton')?.addEventListener('click',()=>openAccountModal('signin'));$('#settingsAccountBtn')?.addEventListener('click',()=>openAccountModal('signin'));$('#settingsSignOutBtn')?.addEventListener('click',signOutAccount);
$('#deleteProfileWorkspaceBtn')?.addEventListener('click',deleteProfileWorkspace);
$('#exportWorkspaceBtn')?.addEventListener('click',exportWorkspace);$('#importWorkspaceBtn')?.addEventListener('click',()=>$('#importWorkspaceFile').click());$('#importWorkspaceFile')?.addEventListener('change',e=>{importWorkspaceFile(e.target.files?.[0]);e.target.value=''});
$('#clearLocalDataBtn')?.addEventListener('click',()=>{if(!confirm('Clear CineTale projects and saved stories from this browser only? Your signed-in cloud profile will not be deleted. Export a backup first if you might need this local copy.'))return;if(!confirm('Remove the browser-local copy now?'))return;state.cloudSync.applying=true;state.projects=[];state.savedStories=[];state.currentId=null;localStorage.removeItem(storageKey);localStorage.removeItem(savedStoriesKey);localStorage.removeItem(currentKey);state.cloudSync.applying=false;renderAll();toast(authUser()&&state.cloudSync.status==='synced'?'Local copy cleared. Reload or sign in on another device to restore from your profile.':'Local CineTale workspace cleared.')});
// Scene action buttons are bound directly during renderStudio; this avoids a swallowed Finish clip pointer event.
const projectsGrid=$('#projectsGrid');
if(projectsGrid){
  // Use pointerdown on the persistent grid so a cloud-sync rerender cannot swallow the user's click
  // between mouse-down and click. Keyboard activation remains on click.
  projectsGrid.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const opener=e.target.closest?.('[data-project]');
    if(!opener||!projectsGrid.contains(opener))return;
    e.preventDefault();
    openProject(opener.dataset.project);
  },true);
  projectsGrid.addEventListener('click',e=>{
    const opener=e.target.closest?.('[data-project]');
    if(!opener||!projectsGrid.contains(opener))return;
    if(e.detail!==0)return; // physical pointer already handled on pointerdown
    openProject(opener.dataset.project);
  });
}
$('#projectSearch')?.addEventListener('input',e=>{state.projectSearch=e.target.value;renderProjects()});$('#projectStatusFilter')?.addEventListener('change',e=>{state.projectStatusFilter=e.target.value;renderProjects()});$('#projectSort')?.addEventListener('change',e=>{state.projectSort=e.target.value;renderProjects()});
document.documentElement.dataset.cinetaleVersion=APP_VERSION;
window.__CINETaleBuild=APP_VERSION;
loadAuthConfig();

renderAll();
requestAnimationFrame(updateNavIndicator);
if(document.fonts?.ready)document.fonts.ready.then(()=>requestAnimationFrame(updateNavIndicator));
try{new ResizeObserver(()=>requestAnimationFrame(updateNavIndicator)).observe($('.nav'))}catch{}
