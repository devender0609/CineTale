import {ensureSceneCoverage,coverageTargetCount,coverageSummary,coverageLogicAudit,repairCoverageLogic} from './lib/production.js';
const APP_VERSION = '1.12.4';
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
  authConfig:null, authSession:safeParse(localStorage.getItem(authSessionKey), null),
  autoFinalRunning:false, finalRenderRunning:false, finalRenderProjectId:null, autoFinalCancelRequested:false, autoFinalResumeScheduled:new Set(), autoVideoSubmissionTimes:[],
  cloudSync:{status:'local',loading:false,applying:false,timer:null,lastError:'',lastSyncedAt:null},
  portraitJobs:new Map(),
  visualCooldownUntil:0, lastVisualErrorCode:'',
  providerHealth:{visual:{status:'unknown',route:'',lastSuccessAt:null,lastErrorAt:null,lastMessage:''}},
  backupVisualVerification:safeParse(sessionStorage.getItem(visualVerificationKey),{status:'unknown',model:'',verifiedAt:null,lastError:''}),
  voiceVerification:safeParse(sessionStorage.getItem(voiceVerificationKey),{status:'unknown',model:'',voiceName:'',verifiedAt:null,lastError:''}),
  ownerAccess:{resolved:false,isOwner:false,configured:false,source:''},
  projectNavigation:{locked:false,id:null,epoch:0,unlockTimer:null}
};

function safeParse(s,f){try{return JSON.parse(s)||f}catch{return f}}
function authUser(){return state.authSession?.user||null}
function authDisplayName(){const u=authUser();if(!u)return '';return String(u.user_metadata?.display_name||u.email?.split('@')[0]||'Creator').trim()}
function authInitials(){const n=authDisplayName();return (n||'ME').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'ME'}
async function loadAuthConfig(){try{const r=await fetch('/api/auth-config');state.authConfig=await r.json()}catch{state.authConfig={configured:false,requireAuth:false}}await restoreAuthFromUrl();await refreshAuthIfNeeded();await syncWorkspaceAfterAuth();await resolveOwnerAccess();renderAccountState();applyOwnerMode()}
function saveAuthSession(session){state.authSession=session||null;if(session)localStorage.setItem(authSessionKey,JSON.stringify(session));else localStorage.removeItem(authSessionKey);if(!session)state.ownerAccess={resolved:true,isOwner:false,configured:state.ownerAccess?.configured||false,source:''};renderAccountState();queueMicrotask(()=>applyOwnerMode())}
function authErrorMessage(err){const raw=String(err?.message||err||'Account request failed.').trim();if(/invalid login credentials/i.test(raw))return 'Email or password is incorrect.';if(/email not confirmed/i.test(raw))return 'Please confirm your email before signing in.';if(/user already registered|already been registered/i.test(raw))return 'An account already exists for this email. Try signing in instead.';if(/password.*weak|password.*short|least 8/i.test(raw))return 'Use a stronger password with at least 8 characters.';if(/rate limit|too many requests/i.test(raw))return 'Too many account attempts. Please wait a little and try again.';return raw}
function authInline(message='',kind='error'){const box=$('#authMessage');if(!box)return;box.textContent=message;box.className=`auth-message ${kind}`;box.classList.toggle('hidden',!message)}
function parseAuthHash(){const h=new URLSearchParams(location.hash.replace(/^#/,''));if(!h.get('access_token'))return null;return {access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:Number(h.get('expires_in')||0),expires_at:Math.floor(Date.now()/1000)+Number(h.get('expires_in')||0),token_type:h.get('token_type')||'bearer',type:h.get('type')||'',user:null}}
async function restoreAuthFromUrl(){const partial=parseAuthHash();if(!partial||!state.authConfig?.configured)return;try{const d=await supabaseAuth('user',{method:'GET',token:partial.access_token});partial.user=d;saveAuthSession(partial);history.replaceState({},document.title,location.pathname+location.search);if(partial.type==='recovery')setTimeout(()=>openPasswordResetModal(),0);else toast(`Signed in as ${authDisplayName()}.`)}catch(e){console.warn('[CineTale auth] OAuth callback could not be restored',e)}}
async function refreshAuthIfNeeded(){const s=state.authSession;if(!s?.refresh_token||!state.authConfig?.configured)return;const now=Math.floor(Date.now()/1000);if(Number(s.expires_at||0)>now+60)return;try{const d=await supabaseAuth('token?grant_type=refresh_token',{body:{refresh_token:s.refresh_token}});saveAuthSession(d)}catch{saveAuthSession(null)}}
function renderAccountState(){const u=authUser(),configured=Boolean(state.authConfig?.configured);const text=$('#accountButtonText'),dot=$('#accountDot'),avatar=$('#avatarButton'),badge=$('#accountBadge'),summary=$('#accountSummary'),copy=$('#accountSettingsCopy'),signIn=$('#settingsAccountBtn'),signOut=$('#settingsSignOutBtn'),deleteProfile=$('#deleteProfileWorkspaceBtn');if(text)text.textContent=u?authDisplayName():(configured?'Sign in':'Guest');if(dot)dot.classList.toggle('signed-in',Boolean(u));if(avatar)avatar.textContent=authInitials();if(badge)badge.textContent=u?'Signed in':'Guest';if(summary)summary.innerHTML=u?`<b>${esc(authDisplayName())}</b><span>${esc(u.email||'Creator account')}</span>`:`<b>Guest workspace</b><span>Your projects are stored in this browser.</span>`;if(copy)copy.textContent=u?(state.cloudSync.status==='synced'?'Signed in · workspace synced to your profile.':state.cloudSync.status==='unavailable'?'Signed in · browser save active; cloud workspace table is not configured yet.':'Signed in · CineTale is syncing your workspace.'):'Continue as a guest or sign in to your creator profile.';if(signIn){signIn.textContent=u?'Account details':'Sign in / create account';signIn.classList.toggle('ghost',Boolean(u));signIn.classList.toggle('primary',!u)}if(signOut)signOut.classList.toggle('hidden',!u);if(deleteProfile)deleteProfile.classList.toggle('hidden',!u)}
async function supabaseAuth(path,{method='POST',body,token}={}){const c=state.authConfig;if(!c?.configured)throw new Error('Cloud sign-in is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.');const base=String(c.url||'').replace(/\/+$/,'');const r=await fetch(`${base}/auth/v1/${path}`,{method,headers:{apikey:c.anonKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.message||d.error_description||d.error||'Account request failed.');return d}

async function supabaseWorkspace(path,{method='GET',body,prefer}={}){
  const c=state.authConfig,token=state.authSession?.access_token;if(!c?.configured||!token)throw new Error('Cloud workspace requires sign-in.');
  const base=String(c.url||'').replace(/\/+$/,'');
  const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:c.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let d=null;try{d=text?JSON.parse(text):null}catch{d=text}
  if(!r.ok){const err=new Error(d?.message||d?.details||d?.hint||`Cloud workspace request failed (${r.status}).`);err.status=r.status;err.details=d;throw err}
  return d;
}
function cloudPayload(){return {schemaVersion:2,projects:persistableProjects(),savedStories:state.savedStories||[],currentId:state.currentId||null}}
function voiceSelectionStamp(c={}){return new Date(c.voiceSelectionUpdatedAt||0).getTime()||0}
function mergeCharacterVoiceSelections(base={},other={}){
  const b=structuredClone(base||{}),others=Array.isArray(other?.characters)?other.characters:[];
  if(!Array.isArray(b.characters))return b;
  b.characters=b.characters.map((c,i)=>{
    const alt=others.find(x=>x?.id&&c?.id&&x.id===c.id)||others.find(x=>normalizeName(x?.name)===normalizeName(c?.name))||others[i];
    if(!alt||voiceSelectionStamp(alt)<=voiceSelectionStamp(c))return c;
    for(const key of ['voiceId','voiceName','voiceMode','voiceLocked','voiceSelectionUpdatedAt','voiceRevision','voicePerformance','voicePace','voiceAccentDirection','voiceCustomDirection','voicePreviewLine','voiceConsent']){
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
    state.cloudSync.applying=true;state.projects=resolved.projects;state.savedStories=resolved.savedStories;
    const navigationActive=state.projectNavigation.locked||state.projectNavigation.epoch!==syncEpoch;
    const preferredId=navigationActive?state.projectNavigation.id:selectedBeforeSync;
    state.currentId=preferredId&&resolved.projects.some(p=>p.id===preferredId)?preferredId:(resolved.currentId&&resolved.projects.some(p=>p.id===resolved.currentId)?resolved.currentId:(resolved.projects[0]?.id||null));
    localStorage.setItem(storageKey,JSON.stringify(persistableProjects()));localStorage.setItem(savedStoriesKey,JSON.stringify(state.savedStories));if(state.currentId)localStorage.setItem(currentKey,state.currentId);else localStorage.removeItem(currentKey);state.cloudSync.applying=false;
    await pushCloudWorkspace();
    // A project navigation already owns the UI; do not replace its live target mid-click.
    if(!state.projectNavigation.locked)renderAll();else{renderAccountState();renderStudio()}
  }catch(err){state.cloudSync.applying=false;if(cloudUnavailable(err)){state.cloudSync.status='unavailable';state.cloudSync.lastError='Cloud workspace table not configured.';console.warn('[CineTale cloud] Optional cloud workspace table is not configured.',err)}else{state.cloudSync.status='error';state.cloudSync.lastError=err.message||String(err);console.warn('[CineTale cloud] Workspace sync failed',err)}}finally{state.cloudSync.loading=false;renderAccountState()}
}
async function pushCloudWorkspace(){
  if(state.cloudSync.applying||!authUser()||!state.authConfig?.configured||state.cloudSync.status==='unavailable')return;
  try{await supabaseWorkspace('cinetale_workspaces?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:authUser().id,payload:cloudPayload(),updated_at:new Date().toISOString()}});state.cloudSync.status='synced';state.cloudSync.lastError='';state.cloudSync.lastSyncedAt=new Date().toISOString();renderAccountState()}catch(err){if(cloudUnavailable(err)){state.cloudSync.status='unavailable';state.cloudSync.lastError='Cloud workspace table not configured.'}else{state.cloudSync.status='error';state.cloudSync.lastError=err.message||String(err)}console.warn('[CineTale cloud] Save failed',err);renderAccountState()}
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
async function importWorkspaceFile(file){if(!file)return;let d;try{d=JSON.parse(await file.text())}catch{toast('That file is not a valid CineTale JSON backup.');return}if(!Array.isArray(d.projects)||!Array.isArray(d.savedStories)){toast('This backup does not contain the expected CineTale workspace data.');return}if(!confirm(`Import ${d.projects.length} projects and ${d.savedStories.length} saved stories? This will replace the current browser workspace.`))return;state.projects=d.projects;state.savedStories=d.savedStories;state.currentId=state.projects[0]?.id||null;save();renderAll();toast('Workspace backup imported.')}
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
function sceneMediaDecodeShieldMarkup(art='',title='Scene video'){return `<div class="scene-media-decode-shield" data-scene-media-shield="1" aria-hidden="true">${art?`<img src="${esc(art)}" alt="">`:'<div class="scene-media-decode-blank"></div>'}</div>`}
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
function inferCharacterVoicePresentation(p,c={}){
  const explicit=String(c.voicePresentation||c.gender||c.pronouns||'').trim().toLowerCase();
  const parse=t=>{if(/\b(she\s*\/\s*her|she|her|hers|female|woman|girl|feminine)\b/.test(t))return 'Feminine';if(/\b(he\s*\/\s*him|he|him|his|male|man|boy|masculine)\b/.test(t))return 'Masculine';if(/\b(they\s*\/\s*them|they|them|theirs|nonbinary|non-binary|neutral|androgynous)\b/.test(t))return 'Neutral';return ''};
  return parse(explicit)||parse(characterContextText(p,c));
}
function voiceMatchScore(v,c={},p=null){
  const h=voiceHaystack(v),profile=`${c.age||''} ${c.voice||''} ${c.role||''} ${c.appearance||''} ${c.personality||''}`.toLowerCase();let score=0;
  const wanted=inferCharacterVoicePresentation(p,c),actual=voiceMetadata(v).gender;
  if(wanted){if(actual===wanted)score+=12;else if(actual&&actual!=='Neutral')score-=8;else if(actual==='Neutral')score-=2}
  if(/girl|woman|female|mother|grandmother|aunt|sister/.test(profile)&&/female|woman|girl|feminine/.test(h))score+=5;
  if(/boy|man|male|father|grandfather|uncle|brother/.test(profile)&&/male|man|boy|masculine/.test(h))score+=5;
  const age=Number(String(c.age||'').match(/\d+/)?.[0]||NaN);
  if(Number.isFinite(age)&&age<18&&/young|teen|youth|child/.test(h))score+=4;
  if(Number.isFinite(age)&&age>=55&&/old|older|mature|senior/.test(h))score+=4;
  if(/warm/.test(profile)&&/warm/.test(h))score+=2;if(/calm/.test(profile)&&/calm/.test(h))score+=2;if(/bright|energetic/.test(profile)&&/bright|energetic/.test(h))score+=2;
  return score;
}
function clearAudioPreviewCache(){audioPreviewCache.clear();audioRequestInFlight.clear();if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}}
function applyCharacterVoiceSelection(project,index,{voiceId='',voiceName='',mode='custom',locked=true}={}){
  const target=project?.characters?.[index];if(!target)return;
  target.voiceId=voiceId;target.voiceName=voiceName;target.voiceMode=mode;target.voiceLocked=!!locked;target.voiceSelectionUpdatedAt=new Date().toISOString();target.voiceRevision=Number(target.voiceRevision||0)+1;
}
async function ensureCharacterVoice(p,index){
  const c=p?.characters?.[index];if(!c)return null;
  if(c.voiceId&&c.voiceLocked)return {voiceId:c.voiceId,voiceName:c.voiceName||c.voice||'Assigned voice'};
  const d=await voiceCatalog();const all=(d.voices||[]).filter(v=>v.voice_id&&!String(v.voice_id).startsWith('browser-'));
  if(!all.length)return c.voiceId?{voiceId:c.voiceId,voiceName:c.voiceName||c.voice||'Assigned voice'}:null;
  const wanted=inferCharacterVoicePresentation(p,c),currentVoice=c.voiceId?all.find(v=>v.voice_id===c.voiceId):null,currentPresentation=currentVoice?voiceMetadata(currentVoice).gender:'';
  const autoVoiceStillFits=Boolean(c.voiceId&&(!wanted||currentPresentation===wanted||(!currentPresentation&&wanted==='Neutral')));
  if(autoVoiceStillFits)return {voiceId:c.voiceId,voiceName:c.voiceName||currentVoice?.name||c.voice||'Assigned voice'};
  const used=new Set((p.characters||[]).filter((_,i)=>i!==index).map(x=>x.voiceId).filter(Boolean));if(p.narratorVoiceId)used.add(p.narratorVoiceId);
  const available=all.filter(v=>!used.has(v.voice_id));const voices=available.length?available:all;
  const ranked=voices.map(v=>({v,score:voiceMatchScore(v,c,p)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));
  const bestScore=ranked[0]?.score||0;const pool=ranked.filter(x=>x.score===bestScore).map(x=>x.v);const pick=pool[hashString(c.name||index)%pool.length]||ranked[0].v;
  updateProject(x=>{const target=x.characters?.[index];if(target&&!target.voiceLocked){applyCharacterVoiceSelection(x,index,{voiceId:pick.voice_id,voiceName:pick.name,mode:'auto',locked:false});target.voicePerformance=target.voicePerformance||'Natural';target.voicePace=target.voicePace||'Natural'}});
  clearAudioPreviewCache();
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
  return [perf,pace,c.voiceAccentDirection,c.voice,c.voiceCustomDirection].filter(Boolean).join('. ');
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
  return `<div class="scene-copy"><div class="scene-kicker">${p.format==='Movie'&&s.act?`${esc(s.act)} · `:''}SCENE ${String(s.number||i+1).padStart(2,'0')} · ${Number(s.durationSec)||0}s story beat</div><h3>${esc(s.title)}</h3><p>${esc(s.visual||s.purpose||'')}</p><div class="dialogue scene-dialogue-box"><span>${esc(selectedShotDialogueDisplay(s))}</span><button class="dialogue-edit-btn" data-scene-edit="${i}" data-selected-shot-id="${esc(shot?.id||'')}" type="button">Edit performance</button></div>${audioChip}<div class="scene-meta"><span>🎵 ${esc(s.music||'Open music direction')}</span><span>🔊 ${esc(s.sfx||'Open SFX direction')}</span><span>🎥 ${esc(s.camera||'Open camera direction')}</span></div></div>`;
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
function updateProject(fn){const p=current();if(!p)return;fn(p);p.updatedAt=new Date().toISOString();save();renderAll()}
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

function apiPost(url,body,{headers={}}={}){return fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(d.error||'Request failed');err.status=r.status;err.code=d.errorCode||d.code||'';err.details=d;if(url==='/api/generate-image'){state.lastVisualErrorCode=err.code||'';const attempts=Array.isArray(d.providerAttempts)?d.providerAttempts:[];const triedBackup=attempts.some(x=>x?.provider==='openai');const triedPrimary=attempts.some(x=>x?.provider==='gemini');const detail=triedBackup&&triedPrimary?'Primary and backup visual routes were both attempted.':triedBackup?'Backup visual route was attempted.':triedPrimary?'Primary visual route was attempted.':'';if(err.code==='VISUAL_QUOTA')setVisualCooldown(d.retryAfterSec||60,`${d.error||'Visual generation temporarily limited.'}${detail?' '+detail:''}`);else state.providerHealth.visual={...state.providerHealth.visual,status:'error',lastErrorAt:new Date().toISOString(),lastMessage:`${d.error||'Visual generation failed.'}${detail?' '+detail:''}`}}throw err}if(url==='/api/generate-image')noteVisualSuccess(d);return d})}
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
function renderCharacters(){const p=current(),grid=$('#characterGrid');if(!p){grid.innerHTML=`<div class="empty-state surface" style="grid-column:1/-1"><div class="empty-orb">◎</div><h2>No cast yet</h2><p>Create a project first, then build or edit its recurring characters.</p><button class="primary" data-create-cast>Start a project</button></div>`;grid.querySelector('[data-create-cast]')?.addEventListener('click',()=>setView('create'));return}
  const productionLocked=!storyIsApproved(p,episodeOf(p));const allPortraits=$('#generateAllPortraits');if(allPortraits){allPortraits.disabled=productionLocked||visualGenerationBlocked();allPortraits.title=productionLocked?'Approve the complete story first':visualGenerationBlocked()?visualBlockedMessage():'';allPortraits.textContent=visualGenerationBlocked()?'Visuals paused':'Generate all portraits'}
  grid.innerHTML=(p.characters||[]).map((c,i)=>{const job=state.portraitJobs.get(`${p.id}:${i}`),portrait=visualSrc(c);return `<article class="character-card surface ${job?'portrait-job-active':''}"><div class="character-portrait">${portrait?`<img src="${portrait}" alt="${esc(c.name)}">`:`<div class="initials">${esc((c.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</div>`}${job?`<div class="portrait-job-overlay"><span class="spinner dark"></span><b>${esc(job.label||'Creating portrait…')}</b><small>${esc(job.detail||'CineTale will update this card automatically when it is ready.')}</small></div>`:''}<div class="identity-lock">● ${c.locked!==false?'identity locked':'editable identity'}</div></div><h3>${esc(c.name)}</h3><div class="char-role">${esc(c.role||'Character')} · ${esc(c.age||'Age open')}</div><div class="char-tags"><span>${esc(c.languages||'Language open')}</span><span>${esc(c.background||'Background open')}</span><span>${esc(c.visualStyleOverride&&c.visualStyleOverride!=='project'?styleLabel(c.visualStyleOverride):styleLabel(p.visualStylePreset||'cinematic-realistic'))}</span>${isSacredCharacter(p,c)?`<span class="sacred-tag">✦ ${esc(c.sacredIdentity||'Sacred figure')}</span>`:''}</div><div class="char-desc">${esc(c.appearance||'Appearance open to creator direction.')}</div><div class="voice-assignment"><span class="voice-state-dot ${c.voiceLocked?'locked':'auto'}"></span><div><small>${c.voiceLocked?'Voice locked':'Voice'}</small><b>${esc(c.voiceName||'Auto on first listen')}</b><em>${esc(c.voicePerformance||'Natural')} · ${esc(c.voicePace||'Natural')} pace</em></div></div><div class="button-row"><button class="ghost" data-edit-character="${i}">Edit</button><button class="ghost" data-voice-character="${i}">Voice studio</button><button class="primary small" data-generate-character="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the complete story first':esc(visualBlockedMessage())}"`:''}>${visualGenerationBlocked()?'Visuals paused':hasVisual(c)?'Regenerate':'Generate portrait'}</button><button class="ghost danger" data-delete-character="${i}" aria-label="Remove ${esc(c.name)} from cast">Remove</button></div></article>`}).join('');
  $$('[data-edit-character]').forEach(b=>b.onclick=()=>openCharacterEditor(Number(b.dataset.editCharacter)));
  $$('[data-generate-character]').forEach(b=>b.onclick=()=>openPortraitSetup(Number(b.dataset.generateCharacter)));
  $$('[data-voice-character]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.voiceCharacter)));$$('[data-delete-character]').forEach(b=>b.onclick=()=>deleteCharacter(Number(b.dataset.deleteCharacter)));
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
function renderStoryReview(p,ep){const panel=$('#storyReviewPanel');if(!panel)return;const text=storyTextOf(p,ep),hasReview=hasStoryReview(p,ep),approved=storyIsApproved(p,ep),cfg=formatConfig(p?.format||'Episode'),continuityWarnings=Array.isArray(ep?.continuityWarnings)?ep.continuityWarnings:[],continuityBlocked=continuityWarnings.length&&!ep?.continuityAcknowledged;const status=$('#storyReviewStatus'),legacy=$('#storyReviewLegacy'),edit=$('#editFullStory'),rebuild=$('#rebuildFullStory'),approve=$('#approveFullStory'),body=$('#storyReviewText'),meta=$('#storyReviewMeta');panel.classList.toggle('is-approved',Boolean(approved&&hasReview));$('#storyReviewTitle').textContent=approved&&hasReview?'Story approved':`Review the complete ${cfg.title.toLowerCase()}`;$('#storyReviewCopy').textContent=approved&&hasReview?'Your approved story is locked to the current production plan. Edit only when you intend to rebuild that plan.':hasReview?'Read and approve the complete narrative before generating portraits, storyboards, audio or video.':'This older project does not yet contain a full narrative review. Existing production remains available, or you can rebuild a complete story review.';status.textContent=hasReview?(approved?'Approved':'Needs review'):'Legacy project';status.classList.toggle('approved',approved&&hasReview);legacy.classList.toggle('hidden',hasReview);edit.classList.toggle('hidden',!hasReview);rebuild.classList.toggle('hidden',hasReview);approve.classList.toggle('hidden',!hasReview||approved);body.classList.toggle('empty',!hasReview);body.innerHTML=hasReview?storyParagraphHtml(text):`<p>${esc(ep?.synopsis||p?.logline||'No full narrative is stored in this older project.')}</p>`;const words=storyWordCount(text),targetSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration),estimateSec=narrativeEstimateSeconds(ep),runtimeFit=targetSec&&estimateSec?estimateSec/targetSec:1,runtimeNote=targetSec&&estimateSec?`<span class="${runtimeFit<.75||runtimeFit>1.35?'runtime-mismatch':''}">≈${formatTime(estimateSec)} narrative · ${formatTime(targetSec)} target</span>`:'';meta.innerHTML=hasReview?`<span>${words.toLocaleString()} words</span><span>${esc(p.language||'Language open')}</span><span>${esc(p.audience||'Audience open')}</span><span>${esc(p.duration||'Runtime open')}</span>${runtimeNote}`:`<span>${esc(cfg.title)}</span><span>Created before Story Review</span>`;let guard=panel.querySelector('.continuity-guard');if(guard)guard.remove();if(continuityWarnings.length){guard=document.createElement('div');guard.className=`continuity-guard ${continuityBlocked?'blocking':'acknowledged'}`;guard.innerHTML=`<div><b>${continuityBlocked?'Continuity conflict needs review':'Continuity change acknowledged'}</b><span>${continuityWarnings.map(w=>esc(w.message||'A recurring series detail may have changed.')).join(' · ')}</span></div>${continuityBlocked?'<button type="button" class="ghost" id="ackContinuityChanges">Accept intentional changes</button>':''}`;body.parentElement?.insertBefore(guard,body);if(continuityBlocked){approve.disabled=true;approve.title='Review the continuity conflict first.';setTimeout(()=>{const b=$('#ackContinuityChanges');if(b)b.onclick=()=>{updateProject(x=>{const e=episodeOf(x);if(e)e.continuityAcknowledged=true});toast('Continuity change acknowledged. Review the story once more before approval.')}},0)}}else{approve.disabled=false;approve.title=''}}
function approveCurrentStory(){const p=current(),ep=episodeOf(p);if(!p||!ep||!hasStoryReview(p,ep))return;updateProject(x=>{const e=episodeOf(x);e.storyApproved=true;e.storyApprovedAt=new Date().toISOString()});toast('Story approved. Production tools are ready.')}
async function rebuildStoryReviewFromText(text,button){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const source=String(text||'').trim();if(source.length<80){toast('Add more of the story before rebuilding the production plan.');return}const hasAssets=assetStats(p).total>0||Boolean(p.finalAssembly)||Boolean(p.finalVideoMeta);if(hasAssets&&!confirm('Rebuilding from this story will replace the current cast and scene plan and clear generated production assets for this project. Continue?'))return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Rebuilding story…'}try{const d=await apiPost('/api/generate-plan',projectGenerationInput(p,source,'full-story'));const next=d.plan;next.format=normalizedFormat(p.requestedFormat||p.format,'Story');next.requestedFormat=next.format;next.duration=p.duration||next.duration||formatConfig(next.format).defaultDuration;next.targetRuntimeSec=durationTargetSeconds(next.duration)||Number(next.targetRuntimeSec)||0;next.id=p.id;next.createdAt=p.createdAt;next.updatedAt=new Date().toISOString();next.archived=p.archived;ensureEpisodeIds(next);next.activeEpisode=1;next.activeEpisodeId=next.episodes[0]?.id||null;if(next.episodes[0])next.episodes[0].storyApproved=false;const idx=state.projects.findIndex(x=>x.id===p.id);state.projects[idx]=next;state.currentId=next.id;save();renderAll();setView('studio');toast('Story rebuilt. Review the complete narrative before production.')}catch(e){toast(e.message||'Could not rebuild the story.')}finally{if(button){button.disabled=false;button.textContent=old||'Save & rebuild'}}}
function openFullStoryEditor(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const text=storyTextOf(p,ep)||legacyStorySeed(p,ep);$('#modalBody').innerHTML=`<form class="modal-form" id="fullStoryEditorForm"><span class="kicker">STORY REVIEW</span><h2>Edit the complete story</h2><p>Changes are rebuilt into the cast and scene plan so production stays aligned with the story. Nothing is generated until you confirm below.</p><label class="field"><span>Complete story</span><textarea class="story-edit-area" id="fullStoryEditorText" required>${esc(text)}</textarea><small>Keep character names, relationships, cultural context and the ending exactly as you want them.</small></label><div class="modal-actions"><button type="button" class="ghost" id="fullStoryEditorCancel">Cancel</button><button type="submit" class="primary">Save & rebuild plan</button></div></form>`;$('#modal').classList.remove('hidden');$('#fullStoryEditorCancel').onclick=closeModal;$('#fullStoryEditorForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter,txt=$('#fullStoryEditorText').value;closeModal();await rebuildStoryReviewFromText(txt,b)}}
function rebuildLegacyStoryReview(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;rebuildStoryReviewFromText(legacyStorySeed(p,ep),$('#rebuildFullStory'))}
function requireApprovedStory(action='continue'){const p=current(),ep=episodeOf(p);if(storyIsApproved(p,ep))return true;toast(`Review and approve the complete story before you ${action}.`);$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return false}
function workflowTarget(workflow){
  const key=String(workflow||'').trim();
  if(key==='script')return document.querySelector('#storyReviewPanel');
  if(key==='characters'){setView('characters');return null}
  if(key==='storyboard'||key==='voice'||key==='video')return document.querySelector('#sceneProductionTitle')||document.querySelector('#sceneList');
  if(key==='render')return document.querySelector('#finalAssemblyPanel');
  return null;
}
function bindWorkflowNavigation(){
  const flow=document.querySelector('#workflow');if(!flow||flow.__cinetaleWorkflowBound)return;
  flow.addEventListener('click',event=>{
    const step=event.target?.closest?.('[data-workflow]');if(!step||!flow.contains(step))return;
    const target=workflowTarget(step.dataset.workflow);
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  });
  flow.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const step=event.target?.closest?.('[data-workflow]');if(!step)return;event.preventDefault();step.click();
  });
  flow.querySelectorAll('[data-workflow]').forEach(step=>{step.setAttribute('role','button');step.setAttribute('tabindex','0')});
  flow.__cinetaleWorkflowBound=true;
}
function renderWorkflow(p){const cfg=formatConfig(p?.format||'Episode'),a=assetStats(p),ep=episodeOf(p),approved=storyIsApproved(p,ep),steps=$$('#workflow .workflow-step');steps.forEach(x=>x.classList.remove('done','active'));cfg.journey.forEach((label,i)=>{const t=$(`#wf${i+1}Title`),sub=$(`#wf${i+1}Sub`);if(t)t.textContent=label;if(sub)sub.textContent=cfg.journeySubs[i]||''});let next;if($('#wf1Sub'))$('#wf1Sub').textContent=approved?'Approved':'Review';if(!approved){steps[0]?.classList.add('active');next={title:'Review the complete story',text:'Read, edit if needed, and approve the full narrative before production credits are used.',label:'Review story',action:'review-story'}}else{steps[0]?.classList.add('done');next={title:'Review your cast',text:'Generate or review the recurring characters needed for this production.',label:'Review cast',view:'characters'};if(a.charDone){steps[1]?.classList.add('done');next={title:cfg.title==='Movie'?'Build acts & scenes':'Build the storyboard',text:cfg.title==='Movie'?'Visualize the key scenes across the movie structure.':'Turn each scene into a visual frame while identity references are ready.',label:'Create storyboard',action:'storyboard'}}else steps[1]?.classList.add('active');if(a.sceneDone){steps[2]?.classList.add('done');next={title:'Preview audio',text:`Listen through the ${cfg.finalName} before spending on video generation.`,label:'Preview audio',action:'narrate'}}else if(a.charDone)steps[2]?.classList.add('active');if(p.narrationPlayed){steps[3]?.classList.add('done');next=a.videos>0&&!a.videoDone?{title:`Finish ${cfg.finalName}`,text:'CineTale will keep finished synchronized scenes, rebuild only legacy or missing clips, finish dialogue automatically, and assemble the final video.',label:`Finish ${cfg.finalName}`,action:'finish-production'}:{title:'Generate video',text:'Your story, cast and audio preview are ready for scene rendering.',label:'Generate video',action:'video'}}else if(a.sceneDone)steps[3]?.classList.add('active');if(a.videoDone||p.videoStatus==='ready'){steps[4]?.classList.add('done');next={title:`Prepare final ${cfg.finalName}`,text:`All scene clips are ready. Preview the sequence and lock the final scene order.`,label:'Prepare final',action:'assemble'}}else if(p.narrationPlayed)steps[4]?.classList.add('active');if(p.renderStatus==='ready'||p.renderStatus==='final-video-ready'||p.finalVideoMeta){steps[5]?.classList.add('done');next=p.finalVideoMeta?{title:`Final ${cfg.finalName} ready`,text:'Your single-file final video is ready to download or share.',label:'View final',action:'preview-final'}:{title:`${cfg.title} assembly ready`,text:'The scene order is locked. Render one final video file from the verified synchronized scene media.',label:'Render full video',action:'render-final'}}}const card=$('#nextStepCard');if(card){$('#nextStepTitle').textContent=next.title;$('#nextStepText').textContent=next.text;const b=$('#nextStepAction');b.textContent=next.label;b.dataset.nextView=next.view||'';b.dataset.nextAction=next.action||''}}
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
  return {ok:issues.length===0,issues,scenes,revision:'v1.12.4-system-integrity'};
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
    let state='planned';
    if(shot?.speaking&&syncReady)state='ready';
    else if(!shot?.speaking&&sourceDurable)state='ready';
    else if(operation)state='rendering';
    else if(dialogueOperation)state='syncing';
    else if(sourceDurable&&shot?.speaking&&dialogueError)state='sync-error';
    else if(sourceDurable&&shot?.speaking)state='dialogue';
    else if(recoveryPending)state='recover';
    else if(expiredOrLegacy)state='recreate';
    return {shot,shotId,primary,entry,state,sourceDurable,syncReady,operation:Boolean(operation),dialogueOperation:Boolean(dialogueOperation),dialogueError,providerCompleted,recoveryPending,expiredOrLegacy,needsVideo:!sourceDurable&&!recoveryPending,needsDialogue:Boolean(shot?.speaking&&sourceDurable&&!syncReady)};
  });
  return {plan,shots,total:shots.length,ready:shots.filter(x=>x.state==='ready').length,preserved:shots.filter(x=>x.sourceDurable||x.syncReady).length,needsVideo:shots.filter(x=>x.needsVideo&&!x.operation).length,rendering:shots.filter(x=>x.operation).length,needsDialogue:shots.filter(x=>x.needsDialogue).length,recreate:shots.filter(x=>x.state==='recreate').length};
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
    if(video.readyState>=2)ready();else loading();
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
  const text=legacyIdentity?'This older clip needs to be recreated once.':unsafeRecovered?'Dialogue sync must be rebuilt':failed?`Dialogue sync needs attention · ${scene.lipSyncError||'Open owner diagnostics for details.'}`:waiting?'Dialogue sync queued':preparing?'Preparing approved dialogue…':'Finishing dialogue…';
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
  const studioContent=$('#studioContent');if(studioContent){studioContent.classList.toggle('story-pending',productionLocked);studioContent.classList.toggle('story-approved',!productionLocked)}
  const sceneList=$('#sceneList');
  if(sceneList&&!sceneList.__cinetaleSceneVideoActionBound){sceneList.addEventListener('click',event=>{const button=event.target?.closest?.('[data-scene-video]');if(!button||!sceneList.contains(button))return;handleSceneVideoActionClick(button,event)});sceneList.__cinetaleSceneVideoActionBound=true}
  const openSceneIndex=Math.max(0,Math.min(scenes.length-1,Number(p.studioOpenSceneIndex)||0)),guidedMode=String(p.controlMode||'Guided')!=='Director';
  const sceneMarkup=scenes.map((s,i)=>{const art=visualSrc(s),plan=sceneCoveragePlan(s,finalTimelineMode(p)),readyCount=sceneShotMediaInventory(p,s,finalTimelineMode(p)).ready;return `<article class="scene-card surface ${guidedMode?(i===openSceneIndex?'studio-scene-open':'studio-scene-collapsed'):'studio-scene-open show-advanced'}" data-scene-card-index="${i}"><button class="scene-compact-header" data-scene-expand="${i}" type="button"><span><small>SCENE ${String(s.number||i+1).padStart(2,'0')}</small><b>${esc(s.title||`Scene ${i+1}`)}</b><em>${Number(s.durationSec)||0}s · ${plan.length} shots · ${readyCount}/${plan.length} ready</em></span><i>${i===openSceneIndex||!guidedMode?'−':'+'}</i></button><div class="scene-expanded-body"><div class="scene-media-column"><div class="scene-visual ${mediaAspectClass(p)}">${videoOperationConfirmed(s)?(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder scene-video-rendering"><b>Rendering…</b><span>CineTale is creating the replacement clip.</span></div>`):videoOperationRecovering(s)?(s.videoUrl?sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p):(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder scene-video-rendering"><b>Checking saved render…</b><span>CineTale is verifying whether the previous video job is still active.</span></div>`)):s.videoUrl?((s.videoMediaExpired||sceneSourceMediaHydrationPending(s))&&!sceneMediaRuntimeUrl(s,'source')&&!sceneMediaRuntimeUrl(s,'sync')?(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder"><b>${String(s.number||i+1).padStart(2,'0')}</b><span>${s.videoMediaExpired?'Video needs regeneration':'Restoring video'}</span></div>`):sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p)):art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder"><b>${String(s.number||i+1).padStart(2,'0')}</b><span>Storyboard pending</span></div>`}<div class="asset-tag ${s.videoUrl?'hidden':''}" data-scene-media-status="${i}">${s.videoMediaExpired?'Regenerate clip once':s.videoUrl?'':videoOperationConfirmed(s)?videoProgressCopy(s.videoQueuedAt):videoOperationRecovering(s)?'Checking saved render':s.videoError?'Video needs retry':art?(s._visualPersisting?'Saving safely…':(s.imageMode==='ai'?'Generated art':'Preview art')):'Not generated'}</div></div><div class="scene-media-support">${sceneSyncStateUi(p,s)}${coverageUi(s)}${sceneFinalToggleUi(s,i)}</div></div>${sceneCopyUi(p,s,i)}<div class="scene-guided-actions"><button class="primary small" data-scene-guided-art="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the story first':esc(visualBlockedMessage())}"`:''}>${hasVisual(s)?'Refresh storyboard':'Create storyboard'}</button><button class="ghost small" data-scene-preview="${i}" ${hasVisual(s)?'':'disabled'} type="button">Preview scene</button></div>${sceneShotTimelineUi(p,s)}<div class="scene-actions"><div class="scene-action-buttons"><button class="primary small" data-scene-art="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the story first':esc(visualBlockedMessage())}"`:''}>${visualGenerationBlocked()?'Visuals paused':hasVisual(s)?'Regenerate art':'Generate art'}</button><button class="ghost" data-scene-listen="${i}" ${(productionLocked||selectedShotListenState(s).disabled)?`disabled title="${productionLocked?'Approve the story first':esc(selectedShotListenState(s).title)}"`:`title="${esc(selectedShotListenState(s).title)}"`}>${selectedShotListenState(s).label}</button><button class="ghost" data-scene-video="${i}" ${videoButtonDisabled(s,productionLocked,p)?`disabled title="${productionLocked?'Approve the story first':'Google video generation is temporarily limited. Try again shortly.'}"`:''}>${videoButtonLabel(s,p)}</button></div><div class="scene-production-controls"><label class="scene-quality-control" title="${esc(tierHint(s.tier))}"><span>Video quality</span><select data-scene-tier="${i}"><option value="draft" ${normalizedTier(s.tier)==='draft'?'selected':''}>Draft preview</option><option value="standard" ${normalizedTier(s.tier)==='standard'?'selected':''}>Standard</option><option value="premium" ${normalizedTier(s.tier)==='premium'?'selected':''}>Premium / Cinematic</option></select></label><label class="scene-quality-control" title="Controls camera composition for video generation. Safe framing is recommended for normal scenes."><span>Framing</span><select data-scene-framing="${i}"><option value="safe" ${normalizedFraming(s.framing)==='safe'?'selected':''}>Safe framing</option><option value="auto" ${normalizedFraming(s.framing)==='auto'?'selected':''}>Auto</option><option value="medium" ${normalizedFraming(s.framing)==='medium'?'selected':''}>Medium shot</option><option value="close" ${normalizedFraming(s.framing)==='close'?'selected':''}>Close-up</option><option value="wide" ${normalizedFraming(s.framing)==='wide'?'selected':''}>Wide shot</option></select></label></div></div><button class="ghost scene-advanced-toggle" data-scene-advanced="${i}" type="button">${guidedMode?'Advanced shot controls':'Hide advanced controls'}</button></div></article>`}).join('');
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
  $$('[data-scene-guided-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneGuidedArt),b));$$('[data-scene-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneArt),b));$$('[data-scene-listen]').forEach(b=>b.onclick=()=>listenScene(Number(b.dataset.sceneListen),b));$$('[data-scene-video]').forEach(b=>b.onclick=e=>{e?.stopPropagation?.();handleSceneVideoActionClick(b,e)});$$('[data-scene-edit]').forEach(b=>b.onclick=()=>openSceneAudioEditor(Number(b.dataset.sceneEdit),b.dataset.selectedShotId||''));$$('[data-scene-voice]').forEach(b=>b.onclick=()=>{const p=current(),s=episodeOf(p)?.scenes?.[Number(b.dataset.sceneVoice)],idx=selectedShotVoiceCharacterIndex(p,s);if(idx>=0)openVoicePicker(idx);else openNarratorVoicePicker()});$$('[data-scene-tier]').forEach(sel=>sel.onchange=()=>setSceneTier(Number(sel.dataset.sceneTier),sel.value));$$('[data-scene-framing]').forEach(sel=>sel.onchange=()=>setSceneFraming(Number(sel.dataset.sceneFraming),sel.value));$$('[data-scene-final-include]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.sceneFinalInclude),cb.checked));$$('.scene-shot-card[data-shot-id]').forEach(card=>card.onclick=()=>{const host=card.closest('[data-scene-card-index]');if(host)selectSceneShot(Number(host.dataset.sceneCardIndex),card.dataset.shotId)});$$('[data-scene-preview]').forEach(button=>button.onclick=()=>{const host=button.closest('[data-scene-card-index]');if(host)previewSceneSequence(Number(host.dataset.sceneCardIndex),button)});$$('[data-scene-logic-repair]').forEach(button=>button.onclick=e=>{e?.stopPropagation?.();const host=button.closest('[data-scene-card-index]');if(host)repairSceneProductionLogic(Number(host.dataset.sceneCardIndex))});applySceneShotSelection(p,ep);bindSceneVideoVoicePlayback(p,ep);authorizeUnsyncedSpeakingScenesOnStudioOpen(p,ep);updateSceneMediaStatuses(p,ep);renderFinalAssembly(p,ep);renderWorkflow(p);resumePendingVideoPolls();resumePendingCoverageVideoPolls();maybeResumeAutoFinal(p);scheduleStudioLipSyncWarmup(p,ep);scheduleStudioCoverageSyncWarmup(p,ep)
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
function userSafeLipSyncError(error){const raw=String(error?.message||error||'').trim(),code=String(error?.code||error?.details?.errorCode||'').trim();if(code==='provider_access_blocked'||/<html|Cloudflare|Sorry, you have been blocked|cf-error-details/i.test(raw))return {message:'Dialogue synchronization is temporarily unavailable. Your generated video and approved voice are safe; retry synchronization later.',code:'provider_access_blocked'};return {message:raw||'Dialogue synchronization could not finish. Your source video remains safe.',code};}
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
        // the muted Veo source forever even though the provider job had already been accepted.
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
    const markSceneMediaLoading=()=>{video.dataset.sceneMediaLoading='1';surface?.classList.remove('media-loaded','media-error');const guard=shield();if(guard)guard.hidden=false};
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
    if(video.readyState>=2)markSceneMediaLoaded();else markSceneMediaLoading();
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
      recoverMountedSceneMedia(video,index,liveProject,liveScene,failed).then(recovered=>{
        if(recovered)return;
        if(failedValidatedSync){if(current()?.id===liveProject.id)renderStudioAfterSceneMediaUpdate(index);return}
        updateProjectById(liveProject.id,x=>{const e=episodeOf(x),t=e?.scenes?.[index];if(t){t.videoMediaExpired=true;t.videoPlaybackError='The saved source video is no longer available. Regenerate this clip once; CineTale will save the replacement durably.'}},{render:false});
        if(current()?.id===liveProject.id)renderStudioAfterSceneMediaUpdate(index);
      }).catch(e=>console.warn('[CineTale scene media] Recovery probe failed',e));
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
    const resolvedVoiceId=c?.voiceId||assigned?.voiceId||'';const characterDirection=c?characterVoiceDirection(c):'';items.push({text,voiceId:resolvedVoiceId,characterId:c?.id||'',speakerName:c?.name||speaker,kind:'dialogue',direction:[direction,characterDirection].filter(Boolean).join('. '),speakerProfile:c?[c.name,c.age,c.personality,c.voice,c.voicePerformance,c.voicePace,c.voiceName].filter(Boolean).join('. '):speaker});
  }
  return items;
}
async function playSceneAudio(p,s,{dialogueOnly=false}={}){
  const items=await scenePlaybackItems(p,s);if(!items.length)return false;
  const narration=items.filter(x=>x.kind==='narration'),dialogue=items.filter(x=>x.kind==='dialogue');
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
  const direction=[sceneAudioDirection(s),c?characterVoiceDirection(c):''].filter(Boolean).join('. ');
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
  try{for(const s of (ep.scenes||[]))await playSceneAudio(p,s);updateProject(x=>x.narrationPlayed=true);toast(`${formatConfig(p.format||'Episode').title} audio preview complete.`)}catch{}
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
  $('#sceneAudioForm').onsubmit=e=>{e.preventDefault();const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);updateProject(x=>{const target=episodeOf(x)?.scenes?.[index];if(!target)return;target.narration=$('#sceneNarration').value.trim();target.dialogue=dialogue;target.audioDirection=$('#sceneAudioDirection').value.trim();target.narrationStyle=$('#sceneNarrationStyle').value.trim();bindSceneDialogueCharacters(x,target,{preserveExisting:true})});closeModal();toast('Scene dialogue and delivery saved. Character voice identity remains linked across scenes.')};
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
        const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:false});await up.text().catch(()=> '');
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
    const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:false});await up.text().catch(()=> '');const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob();if(!await playableVideoBlob(verifiedBlob))throw new Error('The account-saved coverage copy could not be reopened as playable video.');ownership='cloud';
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
    const up=await supabaseStorageObject(storagePath,{method:'POST',body:blob,contentType:blob.type||'video/mp4',upsert:false});await up.text().catch(()=> '');const verify=await supabaseStorageObject(storagePath,{method:'GET'}),verifiedBlob=await verify.blob();if(!await playableVideoBlob(verifiedBlob))throw new Error('The account-saved synchronized speaking shot could not be reopened as playable video.');ownership='cloud';
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
function autoFinalJobPatch(projectId,patch={}){updateProjectById(projectId,x=>{x.autoFinalJob={...(x.autoFinalJob||{}),...patch,updatedAt:new Date().toISOString()}},{render:false});if(state.autoFinalRunning){try{const key=autoFinalLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(old)localStorage.setItem(key,JSON.stringify({...old,ts:Date.now()}))}catch{}}}
function clearAutoFinalJob(projectId){updateProjectById(projectId,x=>{x.autoFinalJob=null},{render:false})}
function isTransientStatus(status){return [408,425,429,500,502,503,504].includes(Number(status))}
async function fetchVideoStatus(operation,{retries=4}={}){let last;for(let attempt=0;attempt<=retries;attempt++){try{const cacheBust=`${Date.now()}-${attempt}`;const r=await fetch(`/api/video-status?operation=${encodeURIComponent(operation)}&_=${cacheBust}`,{cache:'no-store',headers:{'cache-control':'no-cache','pragma':'no-cache'}});const d=await r.json().catch(()=>({}));if(r.ok)return d;last=new Error(d.error||`Video status failed (${r.status})`);if(!isTransientStatus(r.status)||attempt===retries)throw last}catch(e){last=e;if(attempt===retries)throw e}await sleep(Math.min(10000,1200*Math.pow(2,attempt)))}throw last||new Error('Video status failed')}
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
  const panel=$('#finalAssemblyPanel');if(!panel)return;const selected=selectedFinalScenes(ep),all=ep?.scenes||[],ready=selected.filter(x=>sceneStoryTimelineReady(p,x.scene)).length,total=selected.length,skipped=Math.max(0,all.length-total),cfg=formatConfig(p.format||'Episode'),job=p.autoFinalJob||null,approved=storyIsApproved(p,ep);
  panel.classList.toggle('final-stage-dormant',Boolean(approved&&total&&ready===0&&!state.autoFinalRunning&&!state.finalRenderRunning));
  $('#finalAssemblyTitle').textContent=`Final ${cfg.finalName}`;$('#finalReadiness').textContent=`${ready} / ${total} scenes production-ready`;
  $('#finalAssemblyCopy').textContent=!total?(ep?.orphanedMediaRecovery?.count?`CineTale found ${ep.orphanedMediaRecovery.count} saved media record${ep.orphanedMediaRecovery.count===1?'':'s'}, but there is not enough trusted scene metadata to reattach them automatically. Do not generate new clips yet.`:`No scenes are selected. Include at least one scene.`):ready===total?`All selected scenes have complete story-shot timelines. Click Create final video — CineTale will assemble, verify, and show the finished episode below.`:`${Math.max(0,total-ready)} selected scene${total-ready===1?'':'s'} still need story-shot production. ${skipped?`${skipped} scene${skipped===1?' is':'s are'} intentionally skipped. `:''}Review production before starting. CineTale will show the genuinely missing paid work, preserve completed assets, and require confirmation before production begins.`;
  $('#finalAssemblyScenes').innerHTML=(all||[]).map((scene,i)=>{const included=scene.finalIncluded!==false,failed=job?.errors?.[String(i)];const productionReady=sceneStoryTimelineReady(p,scene),syncing=sceneSourceDurablyOwned(scene)&&!productionReady;const stateLabel=!included?'— SKIPPED':productionReady?'✓ READY':syncing?'◌ PRODUCING':failed?'! RETRY':scene.videoOperation?'◌ RENDERING':'○ PENDING';const cls=!included?'skipped':productionReady?'ready':failed?'failed':'pending';return `<label class="final-scene-item ${cls}"><input type="checkbox" data-final-scene-toggle="${i}" ${included?'checked':''}><span>${stateLabel}</span><b>${String(scene.number||i+1).padStart(2,'0')} · ${esc(scene.title||`Scene ${i+1}`)}</b><small>${Number(scene.durationSec)||0}s narrative beat · ${sceneCoveragePlan(scene,finalTimelineMode(p)).length} planned shots${failed?` · ${esc(failed)}`:''}</small></label>`}).join('')||'<div class="final-scene-item pending"><b>No scenes yet</b></div>';
  $$('[data-final-scene-toggle]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.finalSceneToggle),cb.checked));
  const prep=$('#prepareFinalAssembly'),preview=$('#previewFinalSequence'),download=$('#downloadAssemblyManifest'),render=$('#renderFinalVideo'),auto=$('#autoFinalVideo'),cancel=$('#cancelAutoFinalVideo');
  if(prep)prep.disabled=!approved||!(total&&ready===total);
  if(preview)preview.disabled=!ready;
  if(download)download.classList.add('hidden');
  if(render)render.disabled=!approved||!(total&&ready===total);
  if(auto){
    const key=finalVideoAssetKey(p,ep),hasPlayable=finalVideoAssets.has(key),restoreFailed=finalVideoRestoreFailures.has(key);
    auto.disabled=!approved||!total||state.autoFinalRunning||state.finalRenderRunning;
    auto.textContent=state.autoFinalRunning?'Building story timeline…':state.finalRenderRunning?'Creating final video…':job&&['partial','paused','needs-attention'].includes(job.status)?'Resume final video':hasPlayable?'Recreate final video':restoreFailed?'Rebuild final video':(ready===total&&total?'Create final video':'Review & produce');
  }
  if(cancel)cancel.classList.toggle('hidden',!state.autoFinalRunning);
  const status=$('#finalAssemblyStatus');status.classList.toggle('ready',ready===total&&total>0);let statusText='';
  const finalKey=finalVideoAssetKey(p,ep),hasPlayableFinal=finalVideoAssets.has(finalKey),restoreFailed=finalVideoRestoreFailures.has(finalKey);
  if(state.finalRenderRunning)statusText='Creating the final video now. This local render runs in real time and can take about as long as the target episode. Keep this tab open; the finished video will appear in the Final Video box below.';
  else if(hasPlayableFinal)statusText='Final video verified and ready. Play it below, then Download or Share.';
  else if(restoreFailed)statusText='The previous final file is not available in this browser. The ready scene clips are preserved. Click Rebuild final video to assemble only the final file again.';
  else if(p.finalVideoMeta?.createdAt)statusText='Restoring the previously rendered final video from this browser…';
  else if(state.autoFinalRunning){const done=job?.completedCount??ready;statusText=`Building final story · ${done}/${total} scenes production-ready${job?.stage?` · ${job.stage}`:''}. Completed shots and synchronized dialogue are saved.`}
  else if(job&&['partial','paused','needs-attention'].includes(job.status)){const failedCount=Object.keys(job.errors||{}).length;statusText=job.status==='needs-attention'?`Production needs attention with ${ready}/${total} scenes production-ready${failedCount?` and ${failedCount} item${failedCount===1?'':'s'} requiring review`:''}. Completed shot work is safe.`:`Production paused with ${ready}/${total} scenes production-ready. Click Resume final video to continue only missing shots or dialogue work.`}
  else if(!approved)statusText='Review and approve the complete story before starting production.';
  else statusText=total&&ready===total?'Ready. Click Create final video. The finished verified file will appear directly below.':'Review the production estimate before starting. No paid generation begins until you confirm the missing work.';
  status.textContent=statusText;
  if(!state.finalRenderRunning){
    if(job&&state.autoFinalRunning&&total){const pct=Math.max(2,Math.min(88,Math.round((ready/total)*78)+8));setFinalRenderProgress(pct,job.stage||`Creating scene assets · ${ready}/${total} ready`)}
    else if(!state.autoFinalRunning)setFinalRenderProgress(null,'');
    if(p.finalVideoMeta&&!finalVideoAssets.has(finalVideoAssetKey(p,ep))&&!finalVideoRestoreFailures.has(finalVideoAssetKey(p,ep)))restoreFinalVideoAsset(p,ep).catch(()=>{});
    else if(!p.finalVideoMeta)applyFinalVideoUi(p,ep,null);
  }
}

function prepareFinalAssembly({silent=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('prepare the final production'))return false;const scenes=selectedFinalScenes(ep);if(!scenes.length||scenes.some(x=>!sceneStoryTimelineReady(p,x.scene))){if(!silent)toast('Finish every selected scene, including dialogue synchronization for speaking scenes, or use Create final video.');return false}const manifest=finalAssemblyManifest(p,ep);updateProjectById(p.id,x=>{x.finalAssembly=manifest;x.renderStatus='ready';x.videoStatus='ready';x.finalVideoMeta=null},{render:false});if(!silent)toast('Final scene order prepared.');return true}
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
async function renderFinalVideoFile({autoPrepared=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('render the final video'))return;const selected=selectedFinalScenes(ep).map(x=>x.scene),scenes=selected.filter(s=>sceneSourceDurablyOwned(s));if(!p.finalAssembly?.preparedAt){if(!prepareFinalAssembly({silent:true})){toast('The final scene order could not be prepared.');return}}if(!scenes.length||scenes.length!==selected.length){toast('Every selected scene needs a generated video clip before final rendering.');return}const notReady=selected.filter(scene=>!sceneStoryTimelineReady(p,scene));if(notReady.length){toast('Final rendering is waiting for dialogue synchronization to finish on every selected speaking scene.');return}const duplicateConflicts=await duplicateFinalMediaConflicts(p,ep,{content:true});if(duplicateConflicts.length){const c=duplicateConflicts[0];toast(`Final render stopped: scenes ${c.otherIndex+1} and ${c.index+1} share the same media. Use Create final video so CineTale can repair only the duplicate scene.`);return}if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('This browser cannot create a local final video. Use current Chrome, Edge or another MediaRecorder-capable browser.');return}const button=$('#renderFinalVideo'),mainButton=$('#autoFinalVideo'),priorStoragePath=p.finalVideoMeta?.storagePath||'';state.finalRenderRunning=true;state.finalRenderProjectId=p.id;if(button){button.disabled=true;button.textContent='Rendering…'}if(mainButton){mainButton.disabled=true;mainButton.textContent='Creating final video…'}setFinalRenderProgress(2,'Preparing final video · keep this tab open.',{force:true});let recorder,audioContext,stream,url;try{const prepared=[];for(let i=0;i<scenes.length;i++)prepared.push(await prepareFinalSceneAsset(p,scenes[i],i,scenes.length));const timelineValidation=validatePreparedFinalTimeline(p,scenes,prepared);const isShort=(p.format||'')==='Short',width=isShort?720:1280,height=isShort?1280:720,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#080614';ctx.fillRect(0,0,width,height);audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();const audioDestination=audioContext.createMediaStreamDestination(),ambientGain=audioContext.createGain();ambientGain.gain.value=.24;ambientGain.connect(audioDestination);stream=canvas.captureStream(30);for(const t of audioDestination.stream.getAudioTracks())stream.addTrack(t);const mime=chooseFinalRecordingMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:isShort?5500000:6500000}:undefined);const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Final recording failed.'))});recorder.start(1000);await sleep(220);for(let i=0;i<prepared.length;i++)await playPreparedFinalScene({asset:prepared[i],index:i,total:prepared.length,canvas,ctx,audioContext,audioDestination,ambientGain});recorder.stop();await stopped;const actualMime=recorder.mimeType||mime||'video/webm',blob=new Blob(chunks,{type:actualMime});const verifiedDuration=await verifyFinalVideoBlob(blob);const key=finalVideoAssetKey(p,ep),filename=finalVideoFilename(p,actualMime),createdAt=new Date().toISOString();url=URL.createObjectURL(blob);const old=finalVideoAssets.get(key);if(old?.url)URL.revokeObjectURL(old.url);const meta={createdAt,mime:actualMime,size:blob.size,filename,sceneCount:scenes.length,durationSec:verifiedDuration,durationMode:'auto-edited-planned-shot-story-timeline',pipelineVersion:13,timelineValidation,transitionPolicy:'dialogue-safe-auto-edit-v1',storagePath:null,storageStatus:finalVideoStorageReady()?'saving':'browser-only'};await saveFinalVideoBlob(key,blob,meta).catch(e=>console.warn('[CineTale final render] Browser persistence unavailable',e));let persistence='browser';if(finalVideoStorageReady()){setFinalRenderProgress(98,'Saving final video to your CineTale account…',{force:true});try{meta.storagePath=await uploadFinalVideoCloud(p,ep,blob,filename,createdAt);meta.storageStatus='saved';persistence='cloud';if(priorStoragePath&&priorStoragePath!==meta.storagePath)deleteFinalVideoCloudPaths([priorStoragePath]).catch(e=>console.warn('[CineTale final render] Previous cloud final could not be removed',e))}catch(e){meta.storageStatus='browser-only';meta.storageError=String(e?.message||e).slice(0,220);console.warn('[CineTale final render] Cloud persistence unavailable; browser copy retained',e)}}await saveFinalVideoBlob(key,blob,meta).catch(()=>{});const asset={blob,url,mime:actualMime,filename,duration:verifiedDuration,persistence};finalVideoAssets.set(key,asset);finalVideoRestoreFailures.delete(key);updateProjectById(p.id,x=>{x.finalVideoMeta=meta;x.renderStatus='final-video-ready';x.autoFinalJob=null},{render:false});setFinalRenderProgress(100,persistence==='cloud'?'Final video saved — play it below.':'Final video ready in this browser — play it below.',{force:true});if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderWorkflow(liveProject);renderFinalAssembly(liveProject,liveEpisode);applyFinalVideoUi(liveProject,liveEpisode,asset)}toast(persistence==='cloud'?'Final video created and saved to your CineTale account.':'Final video created. It is saved in this browser; sign in to keep future final videos with your account.');setTimeout(()=>setFinalRenderProgress(null,''),1200)}catch(e){console.error('[CineTale final render]',e);setFinalRenderProgress(null,'');autoFinalJobPatch(p.id,{status:'needs-attention',stage:'Final render needs attention',lastError:e.message||String(e)});toast(e.message||'Final video rendering failed.')}finally{try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{await audioContext?.close()}catch{}state.finalRenderRunning=false;state.finalRenderProjectId=null;if(button){button.disabled=false;button.textContent='Render full video'}if(mainButton){mainButton.disabled=false;mainButton.textContent='Create final video'}if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderFinalAssembly(liveProject,liveEpisode)}}}
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
function videoPollKey(projectId,episodeId,sceneIndex){return `${projectId}:${episodeId||'active'}:${sceneIndex}`}
function videoElapsedLabel(startedAt){const sec=Math.max(0,Math.floor((Date.now()-Number(startedAt||Date.now()))/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`}
async function pollVideo(i,operation,button,{background=false}={}){
  const initial=current(),initialEp=episodeOf(initial);if(!initial||!initialEp)return;
  const projectId=initial.id,episodeId=initialEp.id||initialEp.number,key=videoPollKey(projectId,episodeId,i);
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
      const d=await fetchVideoStatus(operation,{retries:2});
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
    const d=await fetchVideoStatus(operation,{retries:1});
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
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
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
      if(attempt>0)await sleep(attempt<4?6500:Math.min(15000,9000+attempt*250));
      const d=await fetchVideoStatus(operation,{retries:2});
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
  if(!operation)return;
  const key=coverageRecoveryKey(projectId,episodeId,sceneIndex,shotId,operation);if(coverageRecoveryPollers.has(key))return;
  try{
    const d=await fetchVideoStatus(operation,{retries:1});
    const terminalError=videoStatusTerminalError(d);
    if(terminalError){clearCoverageTerminalState(projectId,episodeId,sceneIndex,shotId,operation,terminalError);return}
    if(d.status==='ready'&&d.videoUrl){await pollSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation);return}
    if(d.status==='processing'||d.status==='pending'||d.status==='running'||d.done===false){pollSavedCoverageOperation(projectId,episodeId,sceneIndex,shotId,operation).catch(()=>{});return}
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryError='CineTale could not confirm this saved shot render yet. The existing job is preserved so another paid request cannot start accidentally.';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
  }catch(error){
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),scene=e?.scenes?.[sceneIndex],item=coverageEntryForOperation(scene,shotId,operation);if(item){item.videoRecoveryError='CineTale could not verify this saved shot render right now. The existing job is preserved and no replacement render was started.';item.videoRecoveryCheckedAt=new Date().toISOString()}},{render:false});
  }
}
function resumePendingCoverageVideoPolls(){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;const episodeId=ep.id||ep.number;
  (ep.scenes||[]).forEach((scene,sceneIndex)=>{for(const entry of scene?.coverageClips||[])if(entry?.operation)reconcileSavedCoverageOperation(p.id,episodeId,sceneIndex,entry.shotId,entry.operation)});
}

async function reconcilePersistedVideoJobsOnOpen(projectId){
  const project=state.projects.find(x=>x.id===projectId);if(!project)return;
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
    let pending=seen.get(task.operation);if(!pending){pending=fetchVideoStatus(task.operation,{retries:1});seen.set(task.operation,pending)}
    let d;try{d=await pending}catch(error){return}
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
    // If CineTale already owns the correct source video, do not spend another Veo generation just
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
    const d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:normalizedTier(s.tier)!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:videoScene});
    if(d.status==='not_configured'){toast('Live video is off. In Vercel set ENABLE_LIVE_VIDEO=true; CineTale will use your existing GEMINI_API_KEY for Veo.');return}
    if(d.operation){
      confirmedVideoOperations.add(d.operation);
      bumpUsage('video');
      // Single-scene regeneration must not remount every other scene/video in Studio.
      // Persist only the requested scene state here; the existing DOM stays mounted while the
      // provider job runs. The completed scene is refreshed once its replacement is actually ready.
      updateProjectById(p.id,x=>{const e=findEpisodeById(x,ep.id||ep.number)||episodeOf(x),target=e?.scenes?.[i];if(!target)return;target.videoPendingPrimaryMeta={...primaryMeta};target.videoPendingProductionContract=productionContract;target.videoPendingSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);target.videoOperation=d.operation;target.videoQueuedAt=Date.now();target.videoError=null;target.videoPlaybackError=null;target.videoModel=d.model||null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoRoute=d.fallbackFrom?'efficient-fallback':'requested-quality';target.videoFallbackFrom=d.fallbackFrom||null;},{render:false});
      toast('Video rendering started. You can keep working while CineTale finishes it.');
      // Do not lock the interface while Veo renders. Poll in the background.
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
      toast(`Google video generation is temporarily limited. CineTale retried safely${normalizedTier(s.tier)!=='premium'?' and tried the efficient Veo route':''}. Your scene is safe; try again in about ${retry} seconds.`);
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
function videoQuotaMessage(error){const raw=String(error?.message||error||'').trim();if(Number(error?.status)===429||/quota|rate limit|too many requests|resource exhausted/i.test(raw)){if(/per day|daily|rpd|current quota/i.test(raw))return 'Video quota is currently exhausted. Completed clips are safe. Resume later, skip the remaining scene, or use an efficient fallback when available.';return 'Video generation is temporarily rate-limited. CineTale will protect completed work and retry at a safer pace.'}return raw||'Video generation failed.'}
async function waitForAutoVideoSubmissionSlot(onProgress){const windowMs=60000,maxPerWindow=2;while(true){const now=Date.now();state.autoVideoSubmissionTimes=state.autoVideoSubmissionTimes.filter(ts=>now-ts<windowMs);if(state.autoVideoSubmissionTimes.length<maxPerWindow){state.autoVideoSubmissionTimes.push(now);return}const wait=Math.max(900,windowMs-(now-state.autoVideoSubmissionTimes[0])+800);onProgress?.(`Preparing next scene · starts in ${Math.ceil(wait/1000)}s`);await sleep(Math.min(wait,5000));if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.')}}
function findEpisodeById(p,id){return (p?.episodes||[]).find(e=>String(e.id||e.number)===String(id))||episodeOf(p)}
async function waitForAutoVideo(projectId,episodeId,index,operation,onProgress){let consecutiveErrors=0;for(let attempt=0;attempt<96;attempt++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene is no longer available.');if(!scene.videoOperation&&sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;onProgress?.(`${videoProgressCopy(scene.videoQueuedAt||Date.now()).replace('…','')} · scene ${scene.number||index+1}`);if(attempt>0)await sleep(attempt<6?4500:Math.min(10000,6500+attempt*120));let d;try{d=await fetchVideoStatus(operation,{retries:3});consecutiveErrors=0}catch(e){consecutiveErrors++;if(consecutiveErrors<4){onProgress?.(`Temporary connection delay on scene ${scene.number||index+1}; checking again…`);continue}throw e}const terminalError=videoStatusTerminalError(d);if(terminalError){const message=videoUserFailureMessage(terminalError);updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=message;target.videoErrorCode=terminalError.code||'VIDEO_GENERATION_FAILED';target.videoErrorRetryable=Boolean(terminalError.retryable);target.videoFailedAt=new Date().toISOString();clearPendingPrimaryVideoState(target)}},{render:false});throw new Error(message)}if(d.status==='ready'&&d.videoUrl){const liveNow=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(liveNow,episodeId),targetNow=liveEp?.scenes?.[index];claimCompletedPrimaryVideo(projectId,episodeId,index,operation,d.videoUrl,{videoDurationSec:Number(d.durationSeconds)||targetNow?.videoDurationSec||0});await commitPrimarySceneVideo(projectId,episodeId,index,d.videoUrl,{operation:null,patch:{videoDurationSec:Number(d.durationSeconds)||targetNow?.videoDurationSec||0},announce:false});return d.videoUrl}}throw new Error('Video is taking longer than expected. CineTale saved the pending work so it can be checked again safely.')}

async function submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene could not be found.');assertSceneProductionLogic(p,scene,coverageModeFromAuto('balanced'));if(sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;if(scene.videoOperation)return scene.videoOperation;const legacyNeedsRefresh=sceneNeedsModernSource(p,scene);if(scene.videoUrl&&!legacyNeedsRefresh){const rescued=await hydrateSceneMedia(projectId,episodeId,index,'source');p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];if(rescued&&sceneSourceMatchesCurrentProduction(p,scene))return scene.videoUrl;}updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target){target.tier=tier;target.videoError=null}},{render:false});p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];const primaryShot=primaryCoverageShot(scene,coverageModeFromAuto('balanced')),videoScene=sceneForVideoShot(scene,primaryShot),primaryMeta=speakingVideoMeta(primaryShot),productionContract=videoProductionContract(p,ep,scene,primaryShot);onProgress?.(`Submitting scene ${scene.number||index+1}${primaryMeta.videoPrimarySpeaking?' · speaking shot':''}…`);await waitForAutoVideoSubmissionSlot(onProgress);let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:tier!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:videoScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');if(d.videoUrl){bumpUsage('video');await commitPrimarySceneVideo(projectId,episodeId,index,d.videoUrl,{patch:{...primaryMeta,videoProductionContract:productionContract,videoDurationSec:Number(d.durationSeconds)||scene.videoDurationSec||0,videoSpeechGuide:Boolean(d.speaking||primaryMeta.videoPrimarySpeaking)},announce:false});return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a render job.');bumpUsage('video');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(!target)return;target.videoPendingPrimaryMeta={...primaryMeta};target.videoPendingProductionContract=productionContract;target.videoPendingSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);target.videoOperation=d.operation;target.videoQueuedAt=Date.now();target.videoModel=d.model||null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoRoute=d.fallbackFrom?'efficient-fallback':'requested-quality';target.videoFallbackFrom=d.fallbackFrom||null;target.videoError=null},{render:false});return d.operation}
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
async function waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,operation,onProgress){for(let attempt=0;attempt<96;attempt++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex],entry=coverageEntry(scene,shot.id);if(coverageClipVideoUrl(entry))return entry.videoUrl;if(!scene)throw new Error('A scene disappeared while cinematic coverage was rendering.');onProgress?.(`${videoProgressCopy(entry?.queuedAt||Date.now()).replace('…','')} · shot ${shot.order} of scene ${scene.number||sceneIndex+1}`);if(attempt>0)await sleep(attempt<6?4500:Math.min(10000,6500+attempt*120));const d=await fetchVideoStatus(operation,{retries:3});const terminalError=videoStatusTerminalError(d);if(terminalError){const message=videoUserFailureMessage(terminalError);updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex],item=coverageEntry(target||{},shot.id);if(item?.operation===operation){item.operation=null;item.queuedAt=null;item.error=message;item.errorCode=terminalError.code||'VIDEO_GENERATION_FAILED';item.errorRetryable=Boolean(terminalError.retryable);item.failedAt=new Date().toISOString()}},{render:false});throw new Error(message)}if(d.status==='ready'&&d.videoUrl){claimCompletedCoverageVideo(projectId,episodeId,sceneIndex,shot.id,operation,d.videoUrl);const saved=await persistCoverageMediaUrl(projectId,episodeId,sceneIndex,shot.id,d.videoUrl,{commit:false});updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;target.coverageClips=Array.isArray(target.coverageClips)?target.coverageClips:[];const item=coverageEntry(target,shot.id),meta={videoUrl:d.videoUrl,videoProviderCompletedAt:new Date().toISOString(),videoRecoveryState:'ready',videoLocalMediaKey:saved.localKey,videoStoragePath:saved.storagePath,videoMediaPersistedAt:saved.persistedAt,videoMediaOwnership:saved.ownership,videoMediaExpired:false,operation:null,queuedAt:null,error:null,errorCode:null,errorRetryable:null,failedAt:null};upsertCoverageEntry(target,shot.id,{...item,order:shot.order,durationSec:Number(shot.targetClipSec)||0,...meta});x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});return d.videoUrl}}throw new Error('A cinematic coverage shot is taking longer than expected. Completed work was saved so you can resume later.')}

async function ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene)throw new Error('A selected scene could not be found.');assertSceneProductionLogic(p,scene,coverageModeFromAuto(mode));const plan=ensureSceneCoverage(scene,coverageModeFromAuto(mode)),shot=plan[shotIndex];if(!shot)return null;const primary=primaryCoverageShot(scene,coverageModeFromAuto(mode)),primaryId=scene.videoPrimaryShotId||primary?.id||plan[0]?.id;if(shot.id===primaryId)return ensureAutoSceneVideo(projectId,episodeId,sceneIndex,tier,onProgress);let entry=coverageEntry(scene,shot.id);if(coverageClipVideoUrl(entry))return entry.videoUrl;if(coverageSourceDurablyOwned(entry)){const rescued=await hydrateCoverageMedia(projectId,episodeId,sceneIndex,shot.id);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(rescued&&coverageClipVideoUrl(entry))return entry.videoUrl;if(coverageSourceDurablyOwned(entry))throw new Error(`Saved shot ${shot.order} for scene ${scene?.number||sceneIndex+1} could not be restored. CineTale will not spend credits regenerating a durable shot automatically.`)}else if(entry?.videoUrl&&!entry?.operation){const rescued=await hydrateCoverageMedia(projectId,episodeId,sceneIndex,shot.id);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(rescued&&coverageClipVideoUrl(entry))return entry.videoUrl;if(entry?.videoProviderCompletedAt)throw new Error(`Shot ${shot.order} already finished at the video service, but its saved result could not be restored. CineTale did not submit another paid generation job.`)}if(!entry?.operation){onProgress?.(`Planning shot ${shot.order}/${plan.length} for scene ${scene.number||sceneIndex+1}…`);await waitForAutoVideoSubmissionSlot(onProgress);const shotScene={...scene,coverageShot:shot,visual:shot.visual||scene.visual,camera:shot.camera||scene.camera,dialogue:shot.speaking&&shot.spokenLine?[`${shot.speaker||''}: ${shot.spokenLine}`]:[],narration:''};let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:tier!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,culturalContext:p.culturalContext,regionCommunity:p.regionCommunity,beliefContext:p.beliefContext,traditionContext:p.traditionContext,eraPlace:p.eraPlace,culturalGrounding:p.culturalGrounding,languageBehavior:p.languageBehavior,productionProfile:p.productionProfile,characters:p.characters,worldBible:p.worldBible},scene:shotScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');bumpUsage('video');if(d.videoUrl){const saved=await persistCoverageMediaUrl(projectId,episodeId,sceneIndex,shot.id,d.videoUrl,{commit:false});updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;upsertCoverageEntry(target,shot.id,{order:shot.order,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,videoUrl:d.videoUrl,videoProviderCompletedAt:new Date().toISOString(),videoRecoveryState:'ready',videoLocalMediaKey:saved.localKey,videoStoragePath:saved.storagePath,videoMediaPersistedAt:saved.persistedAt,videoMediaOwnership:saved.ownership,videoMediaExpired:false,operation:null,queuedAt:null,error:null,errorCode:null,errorRetryable:null,failedAt:null,durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a coverage render job.');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;upsertCoverageEntry(target,shot.id,{order:shot.order,startSec:Number(shot.startSec)||0,endSec:Number(shot.endSec)||0,plannedDurationSec:Number(shot.durationSec)||0,operation:d.operation,queuedAt:Date.now(),error:null,errorCode:null,errorRetryable:null,failedAt:null,durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});entry={operation:d.operation}}
  p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(coverageClipVideoUrl(entry))return entry.videoUrl;if(!entry?.operation)throw new Error('The cinematic coverage job could not be started.');return waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,entry.operation,onProgress)}
async function ensureCinematicCoverage(projectId,episodeId,indices,tier,mode,onProgress){const coverageMode=coverageModeFromAuto(mode);if(coverageMode==='fast')return;for(const sceneIndex of indices){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene||scene.finalIncluded===false)continue;const target=coverageTargetCount(scene,coverageMode);for(let shotIndex=0;shotIndex<target;shotIndex++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');await ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress)}}}
function autoFinalLockKey(projectId){return `cinetale.final.lock.${projectId}`}
function acquireAutoFinalLock(projectId){const key=autoFinalLockKey(projectId),now=Date.now();try{const old=safeParse(localStorage.getItem(key),null);if(old&&now-Number(old.ts||0)<90000)return null;const token=uid('final');localStorage.setItem(key,JSON.stringify({token,ts:now}));return token}catch{return uid('final')}}
function releaseAutoFinalLock(projectId,token){try{const key=autoFinalLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(!old||old.token===token)localStorage.removeItem(key)}catch{}}
function cancelAutoFinalProduction(){if(!state.autoFinalRunning)return;state.autoFinalCancelRequested=true;const p=current();if(p)autoFinalJobPatch(p.id,{status:'paused',stage:'Pausing after the current provider check…'});toast('Pausing automatic production. Completed clips will be kept.')}
async function createFinalVideoAutomatically({resume=false}={}){const p=current(),ep=episodeOf(p),button=$('#autoFinalVideo'),mode=resume?(p?.autoFinalJob?.mode||$('#autoFinalMode')?.value||'balanced'):($('#autoFinalMode')?.value||'balanced');if(!p||!ep||state.autoFinalRunning)return;if(!requireApprovedStory('create the final video'))return;const logic=episodeProductionLogicAudit(p,ep,coverageModeFromAuto(mode));if(!logic.ok){const issue=logic.issues[0];toast(`Production paused before credits: Scene ${issue.sceneNumber} has a logic conflict. ${issue.message}`);return;}const lock=acquireAutoFinalLock(p.id);if(!lock){toast('Automatic final production is already running for this project in this browser.');return}const selected=selectedFinalScenes(ep);if(!selected.length){releaseAutoFinalLock(p.id,lock);toast('Select at least one scene for the final video.');return}const missing=selected.filter(x=>!sceneSourceMatchesCurrentProduction(p,x.scene));const label=mode==='fast'?'Fast / efficient':mode==='cinematic'?'Cinematic':'Balanced',coverageMode=coverageModeFromAuto(mode),inventories=selected.map(x=>sceneShotMediaInventory(p,x.scene,coverageMode)),plannedShots=inventories.reduce((n,x)=>n+x.total,0),preservedShots=inventories.reduce((n,x)=>n+x.preserved,0),missingShots=inventories.reduce((n,x)=>n+x.needsVideo,0),dialogueShots=inventories.reduce((n,x)=>n+x.needsDialogue,0),expiredShots=inventories.reduce((n,x)=>n+x.recreate,0);if(!resume){const actual=actualProductionEstimate(p,ep,mode);const routePlan=smartProductionPlan(p,ep);const msg=`Start production?

${selected.length} selected scene${selected.length===1?'':'s'} · ${plannedShots} planned story shots.

CURRENT PAID WORK
${actual.missingVideo} missing video shot${actual.missingVideo===1?'':'s'} · about ${Math.round(actual.missingVideoSeconds)} sec of new video${dialogueShots?` · ${dialogueShots} existing speaking shot${dialogueShots===1?'':'s'} need dialogue finishing`:''}${expiredShots?` · ${expiredShots} expired legacy clip${expiredShots===1?'':'s'} will be replaced once`:''}.

COST-SAVING PLAN
${routePlan.artMotion} art-motion suggestions · ${routePlan.economyVideo} economy-video suggestions · ${routePlan.standardVideo} standard-video suggestions. These route suggestions are advisory until actually used by production.

Completed durable media will be reused. Provider failures do not trigger silent duplicate generation. Continue?`;if(!confirm(msg)){releaseAutoFinalLock(p.id,lock);return}}state.autoFinalRunning=true;state.autoFinalCancelRequested=false;if(button){button.disabled=true;button.textContent='Creating final video…'}const projectId=p.id,episodeId=ep.id||ep.number,tier=autoFinalTier(mode),indices=selected.map(x=>x.index);autoFinalJobPatch(projectId,{status:'running',mode,startedAt:p.autoFinalJob?.startedAt||new Date().toISOString(),stage:'Submitting missing scene videos…',sceneIndexes:indices,errors:{},completedCount:selected.length-missing.length});try{renderFinalAssembly(p,ep);for(const {index} of missing){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');try{await submitAutoSceneVideo(projectId,episodeId,index,tier,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)})}catch(e){updateProjectById(projectId,x=>{const job=x.autoFinalJob||{};job.errors={...(job.errors||{}),[String(index)]:videoQuotaMessage(e)};x.autoFinalJob=job},{render:false})}await sleep(180)}const liveAfterSubmit=state.projects.find(x=>x.id===projectId),liveEpAfter=findEpisodeById(liveAfterSubmit,episodeId),pollIndices=indices.filter(i=>{const s=liveEpAfter?.scenes?.[i];return s&&s.finalIncluded!==false&&!sceneSourceMatchesCurrentProduction(liveAfterSubmit,s)});const {errors}=await runPool(pollIndices,2,async index=>{const live=state.projects.find(x=>x.id===projectId),e=findEpisodeById(live,episodeId),s=e?.scenes?.[index];if(!s)return;return ensureAutoSceneVideo(projectId,episodeId,index,tier,msg=>{const now=state.projects.find(x=>x.id===projectId),ne=findEpisodeById(now,episodeId),r=selectedFinalScenes(ne).filter(x=>sceneSourceMatchesCurrentProduction(now,x.scene)).length;autoFinalJobPatch(projectId,{stage:msg,completedCount:r});updateAutoFinalProgressUi(projectId,episodeId,msg)})});if(errors.length){updateProjectById(projectId,x=>{const job=x.autoFinalJob||{};const map={...(job.errors||{})};for(const item of errors)map[String(item.item)]=videoQuotaMessage(item.error);x.autoFinalJob={...job,status:'needs-attention',errors:map,stage:'Some clips need attention'}},{render:false})}const live=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(live,episodeId),selectedNow=selectedFinalScenes(liveEp),remaining=selectedNow.filter(x=>!sceneSourceMatchesCurrentProduction(live,x.scene));if(state.autoFinalCancelRequested){autoFinalJobPatch(projectId,{status:'paused',stage:'Paused — completed clips were saved',completedCount:selectedNow.length-remaining.length});toast('Automatic production paused. Completed clips were saved.');return}if(remaining.length){autoFinalJobPatch(projectId,{status:'needs-attention',stage:`${remaining.length} selected clip${remaining.length===1?'':'s'} still need attention`,completedCount:selectedNow.length-remaining.length});throw new Error(`${remaining.length} selected clip${remaining.length===1?'':'s'} could not finish. Completed work was saved. Resume later to retry only the missing work, or uncheck a scene to render without it.`)}
// Integrity gate: two different scenes must never silently share the same source or synchronized file.
// Repair only the later duplicate scene, preserving all unique READY work.
await repairDuplicateFinalMedia(projectId,episodeId,tier,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)});
const integrityProject=state.projects.find(x=>x.id===projectId),integrityEpisode=findEpisodeById(integrityProject,episodeId);
// A generated source video is not production-ready when the scene contains speech.
// Final assembly must wait for the canonical synchronized asset before any final render starts.
const syncTargets=selectedFinalScenes(integrityEpisode).filter(x=>sceneSourceDurablyOwned(x.scene)&&sceneHasSpokenContent(x.scene)&&!sceneHasValidatedLipSync(integrityProject,x.scene));
for(const {index} of syncTargets){
  if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');
  const lp=state.projects.find(x=>x.id===projectId),le=findEpisodeById(lp,episodeId),ls=le?.scenes?.[index];
  if(!lp||!ls||sceneHasValidatedLipSync(lp,ls))continue;
  const syncedUrl=await ensureAutoFinalDialogueSync(projectId,episodeId,index,{onProgress:label=>{autoFinalJobPatch(projectId,{status:'running',stage:label});updateAutoFinalProgressUi(projectId,episodeId,label)}});
  const after=state.projects.find(x=>x.id===projectId),afterEp=findEpisodeById(after,episodeId),afterScene=afterEp?.scenes?.[index];
  if(!syncedUrl||!after||!afterScene||!sceneHasValidatedLipSync(after,afterScene))throw new Error(`Scene ${afterScene?.number||index+1} dialogue synchronization could not be validated.`);
}
const productionProject=state.projects.find(x=>x.id===projectId),productionEpisode=findEpisodeById(productionProject,episodeId),notProductionReady=selectedFinalScenes(productionEpisode).filter(x=>!sceneProductionReady(productionProject,x.scene));
if(notProductionReady.length){autoFinalJobPatch(projectId,{status:'needs-attention',stage:`${notProductionReady.length} selected scene${notProductionReady.length===1?'':'s'} still need production finishing`});throw new Error('Final rendering is waiting for every selected speaking scene to have a validated synchronized video. No finished synchronized scene will be regenerated.');}
autoFinalJobPatch(projectId,{stage:'Building the story shot timeline…'});for(const sceneIndex of indices){await ensureSceneShotTimelineReady(projectId,episodeId,sceneIndex,tier,mode,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)})}const refreshed=state.projects.find(x=>x.id===projectId),refreshedEp=findEpisodeById(refreshed,episodeId);const manifest=finalAssemblyManifest(refreshed,refreshedEp);updateProjectById(projectId,x=>{x.finalAssembly=manifest;x.renderStatus='ready';x.videoStatus='ready';x.finalVideoMeta=null;x.autoFinalJob={...(x.autoFinalJob||{}),status:'rendering-final',stage:'All clips ready · preparing final file',completedCount:selectedNow.length,errors:{}}},{render:false});if(current()?.id!==projectId){autoFinalJobPatch(projectId,{status:'paused',stage:'All clips are ready. Open the project to render the final file.'});toast('All selected clips are ready. Return to the project and resume to render the final video.');return}renderStudio();await renderFinalVideoFile()}catch(e){console.error('[CineTale auto final]',e);const cur=state.projects.find(x=>x.id===projectId);if(cur?.autoFinalJob?.status==='running')autoFinalJobPatch(projectId,{status:'needs-attention',stage:'Automatic production needs attention',lastError:e.message||String(e)});toast(e.message||'Automatic final video could not be completed.')}finally{state.autoFinalRunning=false;state.autoFinalCancelRequested=false;releaseAutoFinalLock(projectId,lock);if(button){button.disabled=false;button.textContent='Create final video automatically'}if(current()?.id===projectId){const live=state.projects.find(x=>x.id===projectId);if(live?.finalVideoMeta){const liveEp=findEpisodeById(live,episodeId)||episodeOf(live);renderWorkflow(live);renderFinalAssembly(live,liveEp);const asset=finalVideoAssets.get(finalVideoAssetKey(live,liveEp));if(asset)applyFinalVideoUi(live,liveEp,asset)}else renderStudio()}}}
function maybeResumeAutoFinal(p){const job=p?.autoFinalJob;if(!p||!job||state.autoFinalRunning||!['running','rendering-final'].includes(job.status))return;if(state.autoFinalResumeScheduled.has(p.id))return;state.autoFinalResumeScheduled.add(p.id);setTimeout(()=>{state.autoFinalResumeScheduled.delete(p.id);if(current()?.id===p.id&&!state.autoFinalRunning)createFinalVideoAutomatically({resume:true}).catch(()=>{})},650)}
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
$('#nextStepAction').onclick=e=>{const b=e.currentTarget;if(b.dataset.nextView){setView(b.dataset.nextView);return}if(b.dataset.nextAction==='review-story'){$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(b.dataset.nextAction==='storyboard'){generateAllScenes(b);return}if(b.dataset.nextAction==='narrate'){narrateEpisode();return}if(b.dataset.nextAction==='video'){generateNextMissingVideo();return}if(b.dataset.nextAction==='finish-production'){createFinalVideoAutomatically({resume:false});return}if(b.dataset.nextAction==='assemble'){prepareFinalAssembly();return}if(b.dataset.nextAction==='render-final'){createFinalVideo();return}if(b.dataset.nextAction==='preview-final'){const a=currentFinalVideoAsset(),v=$('#finalRenderPreview');if(a?.url&&v){v.scrollIntoView({behavior:'smooth',block:'center'});v.play().catch(()=>{})}else previewFinalSequence();return}};
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
  return aliases[low]||raw.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
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
  return {accent:meta.accent||voiceLabel(v,'accent'),age:meta.age||voiceLabel(v,'age'),gender:meta.presentation||voiceLabel(v,'gender'),use:meta.use||voiceLabel(v,'use')||v.category||'',language:voiceLanguageName(meta.language||voiceLabel(v,'language')),tone:meta.tone||voiceLabel(v,'tone')||'Natural'};
}
function uniqueVoiceValues(voices,key){return [...new Set(voices.map(v=>voiceMetadata(v)[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).slice(0,120)}
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
function voiceRow(v,selectedId='',suggested=false,prefix='voice'){
  const m=voiceMetadata(v);const meta=[m.accent,m.age,m.gender,m.language,m.use||v.category,m.tone].filter(Boolean).join(' · ')||v.category||'Voice';
  const search=`${voiceHaystack(v)} ${m.accent} ${m.age} ${m.gender} ${m.use} ${m.language} ${m.tone}`.toLowerCase();
  const selected=selectedId===v.voice_id;
  return `<div class="voice-option-row ${selected?'selected':''}" data-voice-row data-voice-id="${esc(v.voice_id)}" data-search="${esc(search)}" data-accent="${esc(m.accent)}" data-age="${esc(m.age)}" data-gender="${esc(m.gender)}" data-use="${esc(m.use)}" data-language="${esc(m.language)}" data-tone="${esc(m.tone)}"><div class="voice-option-main"><span class="voice-orb">${esc((v.name||'V').trim().slice(0,1).toUpperCase())}</span><div class="voice-option-copy"><div class="voice-option-title"><b>${esc(v.name)}</b>${suggested?'<span class="voice-recommended">Recommended</span>':''}<span class="voice-selected-badge ${selected?'':'hidden'}">✓ Selected & locked</span><span class="voice-playing-badge hidden">◉ Playing preview</span></div><small>${esc(meta)}</small></div></div><div class="voice-option-actions"><button type="button" class="ghost tiny preview-voice-btn" data-preview-${prefix}="${esc(v.voice_id)}">▶ Preview</button><button type="button" class="ghost tiny use-voice-btn ${selected?'selected-action':''}" data-use-${prefix}="${esc(v.voice_id)}" data-${prefix}-name="${esc(v.name)}">${selected?'✓ Locked':'Use & lock'}</button></div></div>`;
}
function setVoicePreviewState(prefix,id,playing){
  const list=$(`#${prefix}VoiceList`);if(!list)return;
  list.querySelectorAll('[data-voice-row]').forEach(row=>{const active=playing&&row.dataset.voiceId===id;row.classList.toggle('previewing',active);const badge=row.querySelector('.voice-playing-badge');if(badge)badge.classList.toggle('hidden',!active);const btn=row.querySelector(`[data-preview-${prefix}]`);if(btn){btn.textContent=active?'◼ Playing…':'▶ Preview';btn.classList.toggle('playing-action',active)}});
}
function setVoiceSelectedState(prefix,id,name=''){
  const list=$(`#${prefix}VoiceList`);if(!list)return;
  list.dataset.selectedVoiceId=id||'';list.dataset.selectedVoiceName=name||'';
  list.querySelectorAll('[data-voice-row]').forEach(row=>{const active=row.dataset.voiceId===id;row.classList.toggle('selected',active);const badge=row.querySelector('.voice-selected-badge');if(badge)badge.classList.toggle('hidden',!active);const btn=row.querySelector(`[data-use-${prefix}]`);if(btn){btn.textContent=active?'✓ Locked':'Use & lock';btn.classList.toggle('selected-action',active)}});
  const current=list.closest('.voice-studio')?.querySelector('.voice-current b');if(current&&name)current.textContent=name;
  const lock=list.closest('.voice-studio')?.querySelector('.voice-lock-state');if(lock){lock.classList.remove('auto');lock.classList.add('locked');lock.textContent=prefix==='narrator'?'● Narrator locked':'● Voice locked'}
}
function bindVoiceFilters(prefix){
  const search=$(`#${prefix}Search`),accent=$(`#${prefix}Accent`),age=$(`#${prefix}Age`),gender=$(`#${prefix}Gender`),use=$(`#${prefix}Use`),language=$(`#${prefix}Language`),tone=$(`#${prefix}Tone`),list=$(`#${prefix}VoiceList`),count=$(`#${prefix}VoiceCount`),note=$(`#${prefix}FilterNote`),active=$(`#${prefix}ActiveFilters`);if(!list)return;
  const filters=[['Accent / region',accent,'accent'],['Age',age,'age'],['Presentation',gender,'gender'],['Use case',use,'use'],['Language',language,'language'],['Tone',tone,'tone']];
  const clean=s=>String(s||'').trim().toLowerCase();
  const exact=(row,el,key)=>!el?.value||clean(row.dataset[key])===clean(el.value);
  const clearFallback=row=>{row.classList.remove('closest-match');row.querySelector('.voice-closest-badge')?.remove()};
  const markFallback=row=>{row.classList.add('closest-match');const title=row.querySelector('.voice-option-title');if(title&&!title.querySelector('.voice-closest-badge'))title.insertAdjacentHTML('beforeend','<span class="voice-closest-badge">Closest available</span>')};
  const renderChips=()=>{if(!active)return;const chips=[];for(const [label,el] of filters)if(el?.value)chips.push(`<button type="button" class="voice-filter-chip" data-clear-filter="${el.id}"><span>${esc(label)}:</span> ${esc(el.value)} ×</button>`);if((search?.value||'').trim())chips.push(`<button type="button" class="voice-filter-chip" data-clear-filter="${search.id}"><span>Search:</span> ${esc(search.value.trim())} ×</button>`);active.innerHTML=chips.length?`${chips.join('')}<button type="button" class="voice-clear-filters" data-clear-all-voice-filters>Clear all</button>`:'';active.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>{const el=$(`#${b.dataset.clearFilter}`);if(el){el.value='';apply()}});active.querySelector('[data-clear-all-voice-filters]')?.addEventListener('click',()=>{if(search)search.value='';for(const [,el] of filters)if(el)el.value='';apply()})};
  const relaxTo=(keep)=>{for(const [,el,key] of filters)if(el&&key!==keep)el.value='';if(search)search.value='';apply()};
  const closestRows=(rows,q)=>{const weights={accent:5,language:5,age:3,use:3,gender:2,tone:2};return rows.map(row=>{let score=0,matched=0;for(const [,el,key] of filters){if(!el?.value)continue;if(clean(row.dataset[key])===clean(el.value)){score+=weights[key]||1;matched++}}if(q&&row.dataset.search.includes(q)){score+=2;matched++}return {row,score,matched}}).filter(x=>x.matched>0).sort((a,b)=>b.score-a.score||b.matched-a.matched||String(a.row.dataset.search).localeCompare(String(b.row.dataset.search))).slice(0,4)};
  const apply=()=>{const q=clean(search?.value);const rows=[...list.querySelectorAll('[data-voice-row]')];let visible=0;rows.forEach(row=>{clearFallback(row);const ok=(!q||row.dataset.search.includes(q))&&filters.every(([,el,key])=>exact(row,el,key));row.classList.toggle('hidden',!ok);if(ok)visible++});renderChips();const hasCriteria=Boolean(q||filters.some(([,el])=>el?.value));let fallback=[];if(visible===0&&hasCriteria){fallback=closestRows(rows,q);for(const x of fallback){x.row.classList.remove('hidden');markFallback(x.row)}}if(count)count.textContent=visible?`${visible} exact match${visible===1?'':'es'} · ${rows.length} total voices`:fallback.length?`0 exact matches · ${fallback.length} closest shown · ${rows.length} total voices`:`0 exact matches · ${rows.length} total voices`;
    if(note){if(visible===0&&hasCriteria){const lang=language?.value,reg=accent?.value;note.innerHTML=`<div class="voice-no-match"><b>No exact voice matches every selected filter.</b><span>${fallback.length?'Showing the closest available voices below, ranked by the filters that do match. They are alternatives, not exact matches.':'No close alternatives are tagged in the connected library.'}</span><div>${lang?'<button type="button" class="ghost tiny" data-relax="language">Show same language</button>':''}${reg?'<button type="button" class="ghost tiny" data-relax="accent">Show same region</button>':''}<button type="button" class="ghost tiny" data-relax="all">Clear filters</button></div></div>`;note.querySelectorAll('[data-relax]').forEach(b=>b.onclick=()=>b.dataset.relax==='all'?(()=>{if(search)search.value='';for(const [,el] of filters)if(el)el.value='';apply()})():relaxTo(b.dataset.relax));}else note.innerHTML='';}
  };
  [search,...filters.map(x=>x[1])].filter(Boolean).forEach(el=>el.addEventListener(el.tagName==='INPUT'?'input':'change',apply));apply();
}
async function openNarratorVoicePicker(){
  const p=current();if(!p){toast('Create a project first.');return}
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Narrator Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];const perf=p.narratorPerformance||'Warm',pace=p.narratorPace||'Natural';
    const rows=voices.map((v,vi)=>voiceRow(v,p.narratorVoiceId,(v.voice_id===d.narratorVoiceId||vi===0)&&!p.narratorVoiceLocked,'narrator')).join('');
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio narrator-studio"><div class="voice-studio-head"><div><small>NARRATOR VOICE</small><h2>${esc(p.title||'Project narrator')}</h2><p>Choose one narrator for the whole project. Browse your full voice library by accent, age feel and use case, then shape performance without changing voice identity.</p></div><div class="voice-lock-state ${p.narratorVoiceLocked?'locked':'auto'}">${p.narratorVoiceLocked?'● Narrator locked':'◇ Auto narrator'}</div></div><div class="personal-voice-entry"><button type="button" class="ghost" id="personalVoiceBtn">🎙 Record / upload my voice</button><small>Create a reusable personal voice only after explicit authorization. CineTale never creates a clone silently.</small></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="narratorPerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="narratorPace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Accent / regional direction · optional</span><input id="narratorAccentDirection" value="${esc(p.narratorAccentDirection||'')}" placeholder="e.g. Indian English, Nigerian English, Mexican Spanish, London English"><small>Best results come from choosing a matching voice; this note fine-tunes delivery when supported.</small></label><label class="field"><span>Custom narration direction · optional</span><input id="narratorCustomDirection" value="${esc(p.narratorCustomDirection||'')}" placeholder="e.g. intimate, warm, restrained, never trailer-like"></label><label class="field"><span>Preview line</span><input id="narratorPreviewLine" value="${esc(p.narratorPreviewLine||'Some stories begin with a door. This one begins with a sound behind it.')}" /></label><div class="voice-current narrator-current"><span>Current narrator</span><b>${esc(p.narratorVoiceName||d.narratorVoiceName||'Auto — CineTale chooses on first listen')}</b><small>${p.narratorVoiceLocked?'This narrator stays fixed across the entire project.':'Auto can choose a suitable project narrator on first listen.'}</small></div>${voiceFilterBar(voices,'narrator')}<div class="voice-list" id="narratorVoiceList">${rows}</div><div class="voice-list-count" id="narratorVoiceCount"></div><div class="modal-actions split"><button type="button" class="ghost" id="narratorAuto">Reset to Auto</button><div><button type="button" class="ghost" id="narratorCancel">Close</button><button type="button" class="primary" id="narratorSaveSettings">Save narrator settings</button></div></div></div>`;
    bindVoiceFilters('narrator');
    const previewOptions=()=>({kind:'narration',direction:[VOICE_PERFORMANCE[$('#narratorPerformance').value]||VOICE_PERFORMANCE.Warm,VOICE_PACE[$('#narratorPace').value]||VOICE_PACE.Natural,$('#narratorAccentDirection').value.trim(),$('#narratorCustomDirection').value.trim(),'restrained storyteller; avoid trailer voice'].filter(Boolean).join('. '),language:p.language,speakerProfile:['project narrator',$('#narratorAccentDirection').value.trim()].filter(Boolean).join('. ')});
    $('#narratorCancel').onclick=closeModal;
    $('#narratorSaveSettings').onclick=()=>{updateProject(x=>{x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator performance settings saved.')};
    $('#narratorAuto').onclick=()=>{updateProject(x=>{x.narratorVoiceId='';x.narratorVoiceName='';x.narratorVoiceLocked=false;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});closeModal();toast('Narrator reset to Auto.')};
    $$('[data-preview-narrator]').forEach(b=>b.onclick=async()=>{const id=b.dataset.previewNarrator;setVoicePreviewState('narrator',id,true);$$('[data-preview-narrator]').forEach(x=>x.disabled=x!==b);try{await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',id,previewOptions())}catch{}finally{setVoicePreviewState('narrator',id,false);$$('[data-preview-narrator]').forEach(x=>x.disabled=false)}});
    $$('[data-use-narrator]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useNarrator,name=b.dataset.narratorName;updateProject(x=>{x.narratorVoiceId=id;x.narratorVoiceName=name;x.narratorVoiceLocked=true;x.narratorPerformance=$('#narratorPerformance').value;x.narratorPace=$('#narratorPace').value;x.narratorAccentDirection=$('#narratorAccentDirection').value.trim();x.narratorCustomDirection=$('#narratorCustomDirection').value.trim();x.narratorPreviewLine=$('#narratorPreviewLine').value.trim()});setVoiceSelectedState('narrator',id,name);toast(`${name} locked as project narrator.`);try{setVoicePreviewState('narrator',id,true);await speakText($('#narratorPreviewLine').value.trim()||'This is the project narrator.',id,previewOptions())}catch{}finally{setVoicePreviewState('narrator',id,false)}});
  }catch(e){toast('Narrator voice catalog could not be loaded.');}
}

async function openVoicePicker(index){
  const p=current(),c=p?.characters?.[index];if(!c)return;
  $('#modalBody').innerHTML='<div class="modal-form"><h2>Voice Studio</h2><p>Loading available voices…</p></div>';$('#modal').classList.remove('hidden');
  try{
    const d=await voiceCatalog();const voices=d.voices||[];const perf=c.voicePerformance||'Natural',pace=c.voicePace||'Natural';
    const ranked=[...voices].map(v=>({v,score:voiceMatchScore(v,c,p)})).sort((a,b)=>b.score-a.score||a.v.name.localeCompare(b.v.name));const suggestedIds=new Set(ranked.slice(0,Math.min(5,ranked.length)).map(x=>x.v.voice_id));
    const rows=voices.map(v=>voiceRow(v,c.voiceId,suggestedIds.has(v.voice_id)&&!c.voiceLocked,'voice')).join('');
    $('#modalBody').innerHTML=`<div class="modal-form voice-studio"><div class="voice-studio-head"><div><small>CHARACTER VOICE</small><h2>${esc(c.name)}</h2><p>CineTale recommends voices from the character profile and story context. A manual “Use & lock” choice always overrides Auto Voice and stays fixed until you reset it.</p></div><div class="voice-lock-state ${c.voiceLocked?'locked':'auto'}">${c.voiceLocked?'● Voice locked':'◇ Auto voice'}</div></div><div class="personal-voice-entry"><button type="button" class="ghost" id="personalVoiceBtn">🎙 Record / upload my voice</button><small>Create a reusable personal voice only after explicit authorization. CineTale never creates a clone silently.</small></div><div class="voice-settings-grid"><label class="field"><span>Performance</span><select id="voicePerformance">${Object.keys(VOICE_PERFORMANCE).map(x=>`<option ${x===perf?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Pace</span><select id="voicePace">${['Natural','Relaxed','Quick'].map(x=>`<option ${x===pace?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field"><span>Accent / regional direction · optional</span><input id="voiceAccentDirection" value="${esc(c.voiceAccentDirection||'')}" placeholder="e.g. Indian English, Cantonese/Hong Kong, Nigerian English"><small>Choose a voice with the matching accent when available; this note fine-tunes delivery without inferring accent from ethnicity or name.</small></label><label class="field"><span>Custom delivery direction · optional</span><input id="voiceCustomDirection" value="${esc(c.voiceCustomDirection||'')}" placeholder="e.g. slightly breathless, understated, dry humor"></label><label class="field"><span>Preview line</span><input id="voicePreviewLine" value="${esc(c.voicePreviewLine||`Hi... I'm ${c.name}.`)}"></label><div class="voice-current"><span>Current voice</span><b>${esc(c.voiceName||'Auto — CineTale chooses on first listen')}</b><small>${c.voiceLocked?'This voice stays fixed across scenes and future episodes.':'CineTale has not been explicitly locked to a creator-approved voice.'}</small></div>${voiceFilterBar(voices,'voice')}<div class="voice-list" id="voiceVoiceList">${rows}</div><div class="voice-list-count" id="voiceVoiceCount"></div><div class="modal-actions split"><button type="button" class="ghost" id="voiceAuto">Reset to Auto</button><div><button type="button" class="ghost" id="voiceCancel">Close</button><button type="button" class="primary" id="voiceSaveSettings">Save voice settings</button></div></div></div>`;
    bindVoiceFilters('voice');
    const voiceList=$('#voiceVoiceList');if(voiceList){voiceList.dataset.selectedVoiceId=c.voiceId||'';voiceList.dataset.selectedVoiceName=c.voiceName||''}
    const previewOptions=()=>({kind:'dialogue',direction:[VOICE_PERFORMANCE[$('#voicePerformance').value]||VOICE_PERFORMANCE.Natural,VOICE_PACE[$('#voicePace').value]||VOICE_PACE.Natural,$('#voiceAccentDirection').value.trim(),$('#voiceCustomDirection').value.trim()].filter(Boolean).join('. '),language:p.language,speakerProfile:[c.age,c.personality,c.voice,$('#voiceAccentDirection').value.trim()].filter(Boolean).join('. ')});
    $('#voiceCancel').onclick=closeModal;
    $('#personalVoiceBtn').onclick=()=>openPersonalVoiceStudio(index);
    $('#voiceSaveSettings').onclick=()=>{const list=$('#voiceVoiceList'),selectedId=list?.dataset.selectedVoiceId||'',selectedName=list?.dataset.selectedVoiceName||'';updateProject(x=>{const t=x.characters[index];if(selectedId)applyCharacterVoiceSelection(x,index,{voiceId:selectedId,voiceName:selectedName||t.voiceName||'Selected voice',mode:'custom',locked:true});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();void pushCloudWorkspace();const live=current()?.characters?.[index];closeModal();resumeAutomaticDialogueFinalizationSoon();toast(live?.voiceId===selectedId&&selectedId?`${live.voiceName||selectedName} saved and locked to ${live.name}.`:'Voice performance settings saved. CineTale will refresh affected dialogue automatically.')};
    $('#voiceAuto').onclick=()=>{updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:'',voiceName:'',mode:'auto',locked:false});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();void pushCloudWorkspace();closeModal();resumeAutomaticDialogueFinalizationSoon();toast(`${c.name} reset to Auto voice. CineTale will refresh affected dialogue automatically.`)};
    $$('[data-preview-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.previewVoice;setVoicePreviewState('voice',id,true);$$('[data-preview-voice]').forEach(x=>x.disabled=x!==b);try{await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,id,previewOptions())}catch{}finally{setVoicePreviewState('voice',id,false);$$('[data-preview-voice]').forEach(x=>x.disabled=false)}});
    $$('[data-use-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useVoice,name=b.dataset.voiceName;updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:id,voiceName:name,mode:'custom',locked:true});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim();invalidateSpeakingSyncForCharacterVoiceChange(x,index)});clearAudioPreviewCache();setVoiceSelectedState('voice',id,name);void pushCloudWorkspace();resumeAutomaticDialogueFinalizationSoon();const live=current()?.characters?.[index];if(live?.voiceId!==id||!live?.voiceLocked){toast('Voice selection could not be persisted. Please try again.');return}toast(`${name} saved and locked to ${live.name}. It will remain after closing or refreshing. Affected dialogue will refresh automatically.`);try{setVoicePreviewState('voice',id,true);await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,id,previewOptions())}catch{}finally{setVoicePreviewState('voice',id,false)}});
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
  create.onclick=async()=>{if(create.disabled)return;const old=create.textContent;create.disabled=true;create.textContent='Creating voice…';status.textContent='Creating your reusable voice securely…';try{const d=await apiPost('/api/create-personal-voice',{name:$('#personalVoiceName').value.trim()||`${c.name} · Personal voice`,audio:sampleData,consentConfirmed:true,authorizationBasis:basis.value,minorAuthorization:basis.value!=='authorized-minor'||minor.checked});if(d.requiresVerification){status.textContent='ElevenLabs created the voice but requires provider verification before it can be used. Complete that verification in ElevenLabs, then reopen Voice Studio.';toast('Voice created; provider verification is required.');return}updateProject(x=>{const t=x.characters[index];t.voiceId=d.voiceId;t.voiceName=$('#personalVoiceName').value.trim()||`${c.name} · Personal voice`;t.voiceMode='personal';t.voiceLocked=true;t.voiceConsent={confirmed:true,basis:basis.value,minorAuthorization:basis.value==='authorized-minor'?minor.checked:false,confirmedAt:new Date().toISOString(),provider:'elevenlabs'}});stopTracks();closeModal();toast('Personal voice created and locked to this character.')}catch(e){status.textContent=e.message||'Personal voice creation failed.';toast(e.message||'Personal voice creation failed.')}finally{create.disabled=false;create.textContent=old;sync()}};
  sync();
}

function deleteCharacter(index){const p=current(),c=p?.characters?.[index];if(!c)return;if(!confirm(`Remove ${c.name} from the recurring cast? Existing scene text is not rewritten automatically.`))return;updateProject(x=>{x.characters=(x.characters||[]).filter((_,i)=>i!==index)});toast(`${c.name} removed from cast.`)}

function openCharacterEditor(index=null){
  const p=current();if(!p){toast('Create a project first.');return}
  const c=index===null?{name:'',role:'',age:'',appearance:'',background:'',personality:'',voice:'',pronouns:'',voicePresentation:'',voicePerformance:'Natural',voicePace:'Natural',voiceCustomDirection:'',voiceLocked:false,voiceMode:'auto',languages:'',wardrobe:'',locked:true,visualStyleOverride:'project',customVisualStyle:'',entityType:'fictional-person',sacredIdentity:'',representationMode:'project',canonicalVisualCues:[]}:structuredClone(p.characters[index]);
  c.visualStyleOverride=c.visualStyleOverride||'project';
  $('#modalBody').innerHTML=`<form class="modal-form" id="characterForm"><h2>${index===null?'Add character':'Edit character'}</h2><p>Describe the character naturally. Identity Lock preserves who the character is while visual style can follow the project or use an override.</p><div class="field-grid two"><label class="field"><span>Name</span><input id="cfName" value="${esc(c.name)}" required></label><label class="field"><span>Role</span><input id="cfRole" value="${esc(c.role)}" placeholder="Lead, ally, narrator…"></label></div><div class="field-grid two"><label class="field"><span>Age / presentation</span><input id="cfAge" value="${esc(c.age)}" placeholder="Any age or fictional presentation"></label><label class="field"><span>Language(s)</span><input id="cfLanguages" value="${esc(c.languages)}" placeholder="Any language, dialect, mix"></label></div><div class="field-grid two"><label class="field"><span>Pronouns · optional</span><input id="cfPronouns" value="${esc(c.pronouns||'')}" placeholder="e.g. she/her, he/him, they/them"><small>Used for character consistency and Auto Voice when explicitly provided.</small></label><label class="field"><span>Auto Voice presentation · optional</span><select id="cfVoicePresentation"><option value="" ${!c.voicePresentation?'selected':''}>Infer from character/story</option><option value="Feminine" ${c.voicePresentation==='Feminine'?'selected':''}>Feminine</option><option value="Masculine" ${c.voicePresentation==='Masculine'?'selected':''}>Masculine</option><option value="Neutral" ${c.voicePresentation==='Neutral'?'selected':''}>Neutral</option></select><small>Manual voice selection still overrides this setting.</small></label></div><label class="field"><span>Appearance</span><textarea id="cfAppearance" placeholder="Describe anything…">${esc(c.appearance)}</textarea></label><label class="field"><span>Culture / background / origin</span><input id="cfBackground" value="${esc(c.background)}" placeholder="Optional; any culture, ethnicity, nationality, fictional origin…"></label><div class="field-grid two sacred-character-fields"><label class="field"><span>Character type</span><select id="cfEntityType"><option value="fictional-person" ${c.entityType==='fictional-person'?'selected':''}>Fictional person</option><option value="historical-figure" ${c.entityType==='historical-figure'?'selected':''}>Historical figure</option><option value="folklore-figure" ${c.entityType==='folklore-figure'?'selected':''}>Folklore figure</option><option value="mythological-figure" ${c.entityType==='mythological-figure'?'selected':''}>Mythological figure</option><option value="sacred-figure" ${c.entityType==='sacred-figure'?'selected':''}>Sacred / divine figure</option><option value="creature" ${c.entityType==='creature'?'selected':''}>Creature / nonhuman</option></select></label><label class="field"><span>Representation</span><select id="cfRepresentationMode"><option value="project" ${!c.representationMode||c.representationMode==='project'?'selected':''}>Use project setting</option><option value="symbolic" ${c.representationMode==='symbolic'?'selected':''}>Symbolic / unseen</option><option value="idol" ${c.representationMode==='idol'?'selected':''}>Sacred icon / idol</option><option value="visible-divine" ${c.representationMode==='visible-divine'?'selected':''}>Visible divine character</option><option value="traditional-mythological" ${c.representationMode==='traditional-mythological'?'selected':''}>Traditional mythological</option></select></label></div><label class="field"><span>Sacred / canonical identity · optional</span><input id="cfSacredIdentity" value="${esc(c.sacredIdentity||'')}" placeholder="e.g. Lord Ganesha (Vighnaharta), Goddess Durga"><small>Use for sacred/mythological figures so CineTale preserves recognizable identity rather than rendering a generic person.</small></label><label class="field"><span>Canonical visual cues · optional</span><input id="cfCanonicalVisualCues" value="${esc(Array.isArray(c.canonicalVisualCues)?c.canonicalVisualCues.join('; '):(c.canonicalVisualCues||''))}" placeholder="e.g. elephant head; curved trunk; traditional ornaments; warm devotional presence"></label><div class="field-grid two"><label class="field"><span>Visual style override</span><select id="cfVisualStyle">${visualStyleOptions(c.visualStyleOverride,true)}</select><small>Use project style for a consistent production, or deliberately give this character another rendering style.</small></label><label class="field ${c.visualStyleOverride==='custom'?'':'hidden'}" id="cfCustomStyleWrap"><span>Custom character style</span><input id="cfCustomStyle" value="${esc(c.customVisualStyle||'')}" placeholder="Describe any visual treatment"></label></div><label class="field"><span>Personality</span><input id="cfPersonality" value="${esc(c.personality)}"></label><label class="field"><span>Voice direction</span><input id="cfVoice" value="${esc(c.voice)}" placeholder="Accent, tone, age impression, pace, texture…"></label><label class="field"><span>Wardrobe / continuity</span><input id="cfWardrobe" value="${esc(c.wardrobe)}"></label><div class="identity-note"><b>Identity Lock</b><span>When regenerating this character, CineTale can reuse the current portrait as a reference so style changes preserve the same person.</span></div><div class="modal-actions"><button type="button" class="ghost" id="characterCancel">Cancel</button><button class="primary" type="submit">Save character</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#characterCancel').onclick=closeModal;
  $('#cfVisualStyle').onchange=e=>$('#cfCustomStyleWrap').classList.toggle('hidden',e.target.value!=='custom');
  $('#characterForm').onsubmit=e=>{e.preventDefault();const item={...c,id:c.id||uid('c'),name:$('#cfName').value.trim(),role:$('#cfRole').value.trim(),age:$('#cfAge').value.trim(),pronouns:$('#cfPronouns').value.trim(),voicePresentation:$('#cfVoicePresentation').value,languages:$('#cfLanguages').value.trim(),appearance:$('#cfAppearance').value.trim(),background:$('#cfBackground').value.trim(),entityType:$('#cfEntityType').value,sacredIdentity:$('#cfSacredIdentity').value.trim(),representationMode:$('#cfRepresentationMode').value,canonicalVisualCues:$('#cfCanonicalVisualCues').value.split(';').map(x=>x.trim()).filter(Boolean),visualStyleOverride:$('#cfVisualStyle').value,customVisualStyle:$('#cfCustomStyle').value.trim(),personality:$('#cfPersonality').value.trim(),voice:$('#cfVoice').value.trim(),wardrobe:$('#cfWardrobe').value.trim(),locked:true};updateProject(p=>{p.characters=p.characters||[];if(index===null)p.characters.push(item);else p.characters[index]=item});closeModal();toast('Character saved.')}
}
$('#addCharacterBtn').onclick=()=>openCharacterEditor(null);
function openImage(a){$('#modalBody').innerHTML=`<img class="preview-image" src="${a.image}" alt="${esc(a.name)}"><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">${esc(a.kind)}</p>`;$('#modal').classList.remove('hidden')}
async function openLibraryAsset(a){if(a.finalVideoProjectId){const p=state.projects.find(x=>x.id===a.finalVideoProjectId);if(!p){toast('This final video project is no longer available.');return}const ep=episodeOf(p),key=finalVideoAssetKey(p,ep);let asset=finalVideoAssets.get(key);if(!asset){await restoreFinalVideoAsset(p,ep);asset=finalVideoAssets.get(key)}if(!asset){toast(p.finalVideoMeta?.storagePath?'The final video could not be restored. Open Studio to retry or rebuild only the final file.':'The browser-local final video is unavailable. Open Studio to rebuild only the final file.');return}$('#modalBody').innerHTML=`<video class="preview-image" src="${esc(asset.url)}" controls playsinline autoplay></video><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">Final video · ${esc(asset.mime||'video')}</p><div class="modal-actions"><button class="primary" id="libraryDownloadFinal">Download</button><button class="ghost" id="libraryShareFinal">Share</button></div>`;$('#modal').classList.remove('hidden');$('#libraryDownloadFinal').onclick=()=>{const link=document.createElement('a');link.href=asset.url;link.download=asset.filename;link.click()};$('#libraryShareFinal').onclick=async()=>{const file=new File([asset.blob],asset.filename,{type:asset.mime||asset.blob.type});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:p.title,files:[file]}).catch(()=>{});else toast('File sharing is unavailable in this browser. Use Download instead.')};return}if(a.video){$('#modalBody').innerHTML=`<video class="preview-image" controls playsinline autoplay preload="none" src="${esc(a.video)}"></video><h2>${esc(a.name)}</h2><p style="color:var(--text-2)">Video clip</p>`;$('#modal').classList.remove('hidden');return}if(a.assembly){const clips=(a.assembly.scenes||[]).map(x=>`<li>${esc(x.title)} · ${x.videoUrl?'ready':'missing'}</li>`).join('');$('#modalBody').innerHTML=`<h2>${esc(a.name)}</h2><p>Final assembly manifest prepared.</p><ol>${clips}</ol>`;$('#modal').classList.remove('hidden');return}openImage(a)}
function closeModal(){stopActiveScenePreview();$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}const modalCloseButton=$('#modalClose');if(modalCloseButton){modalCloseButton.type='button';modalCloseButton.setAttribute('aria-label','Close');modalCloseButton.onclick=e=>{e.preventDefault();e.stopPropagation();closeModal()}}$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal')?.classList.contains('hidden'))closeModal()});

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
    const cloudSection=`<br><br><b>Workspace</b><br>${cloud.symbol} Account sync: <b>${cloud.needsSetup?'browser backup active':esc(cloud.label)}</b><br><span class="health-hint">${cloud.needsSetup?'Your browser safety copy remains active.':esc(cloud.detail)}</span>`;
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

for(const p of state.projects){p.format=normalizedFormat(p.requestedFormat||p.format,'Episode');p.requestedFormat=p.requestedFormat||p.format;p.targetRuntimeSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration);ensureEpisodeIds(p);ensureCharacterIdentityIds(p);p.languageScope=p.languageScope||'entire-story';p.culturalTreatment=p.culturalTreatment||'auto';p.sacredRepresentation=p.sacredRepresentation||'auto';p.culturalContext=p.culturalContext||'';p.regionCommunity=p.regionCommunity||p.worldBible?.globalContext?.regionCommunity||'';p.beliefContext=p.beliefContext||'';p.traditionContext=p.traditionContext||p.worldBible?.globalContext?.traditionContext||'';p.eraPlace=p.eraPlace||p.worldBible?.globalContext?.eraPlace||'';p.culturalGrounding=p.culturalGrounding||p.worldBible?.globalContext?.grounding||'grounded';p.languageBehavior=p.languageBehavior||p.worldBible?.globalContext?.languageBehavior||'natural';p.productionProfile=p.productionProfile||'balanced';ensurePersistentWorld(p);p.narratorPerformance=p.narratorPerformance||'Warm';p.narratorPace=p.narratorPace||'Natural';if(p.narratorVoiceLocked==null)p.narratorVoiceLocked=false;for(const c of p.characters||[]){c.voicePerformance=c.voicePerformance||'Natural';c.voicePace=c.voicePace||'Natural';c.voiceMode=c.voiceMode||(c.voiceId?'auto':'auto');if(c.voiceLocked==null)c.voiceLocked=false;c.entityType=c.entityType||'fictional-person';c.representationMode=c.representationMode||'project';c.canonicalVisualCues=Array.isArray(c.canonicalVisualCues)?c.canonicalVisualCues:[]}normalizeProjectIdentityBindings(p);migrateValidatedLipSyncSignatures(p);migrateProjectShotTimelines(p);recoverPersistedModernPrimaryVideoProvenance(p)}save();
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
