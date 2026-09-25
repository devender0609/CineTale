import {ensureSceneCoverage,coverageTargetCount,coverageSummary} from './lib/production.js';
const APP_VERSION = '1.9.77';
const LIP_SYNC_PIPELINE_REV = 'v1.9.67-scene-semantic-signature';
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
    // Once a profile already has a cloud workspace, treat it as authoritative. This prevents
    // a stale browser copy from resurrecting projects the user deleted on another device.
    const resolved=cloud?{projects:Array.isArray(cloud.projects)?cloud.projects:[],savedStories:Array.isArray(cloud.savedStories)?cloud.savedStories:[],currentId:cloud.currentId||null}:local;
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
function normalizeName(value=''){return String(value||'').toLowerCase().replace(/[^a-z0-9\p{L}]+/gu,' ').trim()}
function normalizeSpeakerAlias(value=''){return normalizeName(value).replace(/^(mr|mrs|ms|miss|dr|prof|sir|lady)\s+/,'').trim()}
function ensureCharacterIdentityIds(p){if(!p)return p;p.characters=Array.isArray(p.characters)?p.characters:[];for(const c of p.characters)c.id=c.id||uid('c');return p}
function embeddedDialogueCharacterId(entry){return entry&&typeof entry==='object'?String(entry.characterId||entry.character_id||entry.speakerId||entry.speaker_id||'').trim():''}
function characterIndexById(p,id=''){const key=String(id||'').trim();return key?(p?.characters||[]).findIndex(c=>String(c?.id||'')===key):-1}
function sceneDialogueBindingAt(scene,index){const b=Array.isArray(scene?.dialogueBindings)?scene.dialogueBindings[index]:null;return b&&typeof b==='object'?b:null}
function sceneAtIdentity(episode,index,sceneId=''){const scenes=episode?.scenes||[];const wanted=String(sceneId||'').trim();if(wanted)return scenes.find(x=>String(x?.id||'')===wanted)||null;return scenes[index]||null}
function resolveDialogueCharacterIndex(p,scene,entry,lineIndex=-1){
  ensureCharacterIdentityIds(p);
  const embeddedId=embeddedDialogueCharacterId(entry),binding=lineIndex>=0?sceneDialogueBindingAt(scene,lineIndex):null;
  const stableId=embeddedId||String(binding?.characterId||'').trim();
  const byId=characterIndexById(p,stableId);if(byId>=0)return byId;
  const {speaker}=dialogueParts(entry);return characterIndexForSpeaker(p,speaker);
}
function bindSceneDialogueCharacters(p,scene,{preserveExisting=true}={}){
  if(!p||!scene)return scene;ensureCharacterIdentityIds(p);
  const entries=dialogueEntries(scene.dialogue),previous=Array.isArray(scene.dialogueBindings)?scene.dialogueBindings:[];
  scene.dialogueBindings=entries.map((entry,i)=>{
    const {speaker}=dialogueParts(entry),embeddedId=embeddedDialogueCharacterId(entry);
    let idx=characterIndexById(p,embeddedId);if(idx<0)idx=characterIndexForSpeaker(p,speaker);
    if(idx<0&&preserveExisting){const prev=previous[i];if(prev?.characterId&&normalizeSpeakerAlias(prev.speakerLabel||'')===normalizeSpeakerAlias(speaker)){const prior=characterIndexById(p,prev.characterId);if(prior>=0)idx=prior}}
    const characterId=idx>=0?p.characters[idx].id:'',prev=previous[i];const unchanged=prev&&String(prev.characterId||'')===String(characterId||'')&&normalizeSpeakerAlias(prev.speakerLabel||'')===normalizeSpeakerAlias(speaker||'');
    return {characterId,speakerLabel:speaker||'',boundAt:unchanged&&prev.boundAt?prev.boundAt:new Date().toISOString()};
  });
  return scene;
}
function normalizeProjectIdentityBindings(p){
  if(!p)return p;ensureCharacterIdentityIds(p);
  for(const ep of p.episodes||[])for(const scene of ep.scenes||[])bindSceneDialogueCharacters(p,scene,{preserveExisting:true});
  return p;
}
function hashString(value=''){let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
let voiceCatalogCache=null;
const audioPreviewCache=new Map();
const audioRequestInFlight=new Map();
let activeAudio=null;
const finalVideoAssets=new Map();
const finalVideoDbName='cinetale.final.video.v1';
const finalVideoRestoreFailures=new Set();
const finalVideoRestoreInFlight=new Set();
let finalRenderProgressState={at:0,percent:null,text:''};
const visualAssetDbName='cinetale.visual.assets.v1';
const visualAssetUrls=new Map();
const visualAssetLoads=new Map();
const visualAssetMissing=new Set();

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
  Episode:{title:'Episode',explainer:'Build an ongoing series. Only Episode mode creates Episode 2, 3 and beyond.',ideaHint:'One sentence is enough. CineTale builds the world, recurring cast and first episode around it.',durationHint:'Target episode runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','15–20 minutes','Custom'],defaultDuration:'2–3 minutes',createLabel:'Create episode',unitLabel:'EPISODE',runtimeLabel:'estimated episode runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final episode'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Series memory',sceneTitle:'Scene production',finalName:'episode'},
  Short:{title:'Short',explainer:'One self-contained short-form video. No episodes or continuation controls.',ideaHint:'One sentence is enough. CineTale builds a compact beginning-to-end short around it.',durationHint:'Target finished short runtime.',durations:['15–30 seconds','30–60 seconds','60–90 seconds','2–3 minutes','Custom'],defaultDuration:'30–60 seconds',createLabel:'Create short',unitLabel:'SHORT',runtimeLabel:'estimated short runtime',journey:['Idea','Cast','Scenes','Audio','Video','Final short'],journeySubs:['Ready','If needed','Shots','Preview','Generate','Prepare'],memoryTitle:'Creative notes',sceneTitle:'Short scenes',finalName:'short'},
  Story:{title:'Story',explainer:'One complete standalone story with a real ending. No automatic Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete standalone story around it.',durationHint:'Target finished story runtime.',durations:['2–3 minutes','5 minutes','8–10 minutes','10–15 minutes','Custom'],defaultDuration:'5 minutes',createLabel:'Create story',unitLabel:'STORY',runtimeLabel:'estimated story runtime',journey:['Story','Cast','Storyboard','Audio','Video','Final story'],journeySubs:['Ready','Portraits','Scenes','Preview','Generate','Prepare'],memoryTitle:'Story memory',sceneTitle:'Story scenes',finalName:'story'},
  Movie:{title:'Movie',explainer:'A standalone movie structure with acts and scenes. It does not create Episode 2.',ideaHint:'One sentence is enough. CineTale builds a complete movie arc with acts, cast and key scenes.',durationHint:'Target movie runtime. Longer movies require more production assets.',durations:['10–15 minutes','20–30 minutes','45–60 minutes','90 minutes','Custom'],defaultDuration:'20–30 minutes',createLabel:'Create movie',unitLabel:'MOVIE',runtimeLabel:'estimated movie runtime',journey:['Concept','Cast','Acts & scenes','Audio','Video','Final movie'],journeySubs:['Ready','Portraits','Structure','Preview','Generate','Prepare'],memoryTitle:'Movie continuity',sceneTitle:'Movie scenes',finalName:'movie'}
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
function culturalPrompt(p){const t=p?.culturalTreatment||'auto',context=String(p?.culturalContext||'').trim();const map={auto:'Infer cultural, historical, folklore or sacred context from the full story rather than a name alone. Distinguish an ordinary person from a sacred or mythological figure using the complete prompt and genre.', 'culturally-faithful':'Use culturally faithful details, avoid stereotypes, and preserve geography, clothing, architecture, customs and symbolism only when relevant to the story.', traditional:'Use a traditional treatment grounded in the requested culture and period; avoid generic or unrelated styling.', 'historically-grounded':'Prioritize historically plausible clothing, objects, architecture and social context for the requested time and place.', 'reverent-devotional':'Use a reverent devotional treatment. When a sacred figure is clearly intended, preserve respectful sacred identity, atmosphere and established high-level symbolism without caricature or turning the figure into an unrelated ordinary person.', 'sacred-cinematic':'Use a reverent sacred-cinematic treatment with culturally grounded symbolism and luminous spiritual atmosphere while preserving the figure’s intended sacred identity.', inspired:'Use a respectful inspired reinterpretation while keeping the source culture recognizable and avoiding stereotypes.', 'modern-retelling':'Use a respectful modern retelling; retain the core cultural or mythological identity while updating setting or styling only where the creator intends.'};const base=map[t]||map.auto;return context?`${base} Creator cultural/place/tradition context: ${context}. Preserve it across story, characters, wardrobe, architecture, objects, images, video, sound and language without turning it into a stereotype.`:base}
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
function save(){for(const p of state.projects||[])normalizeProjectIdentityBindings(p);const projectPayload=JSON.stringify(persistableProjects());const projectsSaved=safeLocalSet(storageKey,projectPayload);if(!projectsSaved)console.warn('[CineTale storage] Project JSON exceeded browser storage. Cloud sync and in-memory state remain active.');safeLocalSet(savedStoriesKey,JSON.stringify(state.savedStories||[]));if(state.currentId)safeLocalSet(currentKey,state.currentId);else try{localStorage.removeItem(currentKey)}catch{}scheduleCloudSave();return projectsSaved}
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
function apiPost(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(d.error||'Request failed');err.status=r.status;err.code=d.errorCode||d.code||'';err.details=d;if(url==='/api/generate-image'){state.lastVisualErrorCode=err.code||'';const attempts=Array.isArray(d.providerAttempts)?d.providerAttempts:[];const triedBackup=attempts.some(x=>x?.provider==='openai');const triedPrimary=attempts.some(x=>x?.provider==='gemini');const detail=triedBackup&&triedPrimary?'Primary and backup visual routes were both attempted.':triedBackup?'Backup visual route was attempted.':triedPrimary?'Primary visual route was attempted.':'';if(err.code==='VISUAL_QUOTA')setVisualCooldown(d.retryAfterSec||60,`${d.error||'Visual generation temporarily limited.'}${detail?' '+detail:''}`);else state.providerHealth.visual={...state.providerHealth.visual,status:'error',lastErrorAt:new Date().toISOString(),lastMessage:`${d.error||'Visual generation failed.'}${detail?' '+detail:''}`}}throw err}if(url==='/api/generate-image')noteVisualSuccess(d);return d})}
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
  const map={english:'en-US',spanish:'es-ES',hindi:'hi-IN',french:'fr-FR',german:'de-DE',italian:'it-IT',portuguese:'pt-BR',arabic:'ar-SA',japanese:'ja-JP',korean:'ko-KR','mandarin chinese':'zh-CN',cantonese:'zh-HK',tamil:'ta-IN',telugu:'te-IN',kannada:'kn-IN',malayalam:'ml-IN',marathi:'mr-IN',bengali:'bn-IN',gujarati:'gu-IN',punjabi:'pa-IN',urdu:'ur-PK',assamese:'as-IN',odia:'or-IN',nepali:'ne-NP',sinhala:'si-LK',thai:'th-TH',vietnamese:'vi-VN',indonesian:'id-ID',malay:'ms-MY',filipino:'fil-PH','filipino / tagalog':'fil-PH',swahili:'sw-KE',russian:'ru-RU',ukrainian:'uk-UA',polish:'pl-PL',turkish:'tr-TR',dutch:'nl-NL',greek:'el-GR',hebrew:'he-IL','persian / farsi':'fa-IR',persian:'fa-IR',farsi:'fa-IR'};
  return map[first]||navigator.language||document.documentElement.lang||'en';
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
function startEditSetup(){const p=current();if(!p){toast('Create a project first.');return}state.editingProjectId=p.id;state.storySource=p.storySource||'idea';applyStorySourceUI();$('#idea').value=p.idea||p.logline||'';pickerState.genre=String(p.genre||'Mystery').split(/\s*\+\s*/).filter(Boolean);pickerState.language=String(p.language||'English').split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language');applyAudienceValue(p.audience||'Teen (13–17)');setSelectValue('#duration',p.duration||'2–3 minutes');setSelectValue('#castSize',p.castSize||'auto');setSelectValue('#visualStylePreset',p.visualStylePreset||'cinematic-realistic');$('#customStyle').value=p.customVisualStyle||'';$('#customStyleWrap').classList.toggle('hidden',$('#visualStylePreset').value!=='custom');setSelectValue('#languageScope',p.languageScope||'entire-story');setSelectValue('#culturalTreatment',p.culturalTreatment||'auto');setSelectValue('#sacredRepresentation',p.sacredRepresentation||'auto');$('#languageDirection').value=p.languageDirection||'';if($('#culturalContext'))$('#culturalContext').value=p.culturalContext||'';setSelectValue('#continuityStrength',p.continuityStrength||'strict');state.format=p.format||'Episode';applyFormatUI(false);setSelectValue('#duration',p.duration||formatConfig().defaultDuration);state.controlMode=p.controlMode||'Guided';$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.control===state.controlMode));$('#directorFields').classList.toggle('hidden',state.controlMode!=='Director');$('#editSetupBanner').classList.remove('hidden');$('#saveSetupOnly').classList.remove('hidden');$('#createButton span').textContent=`Rebuild ${formatConfig().title.toLowerCase()}`;setView('create');}
function cancelEditSetup(){state.editingProjectId=null;$('#editSetupBanner').classList.add('hidden');$('#saveSetupOnly').classList.add('hidden');$('#createButton span').textContent=formatConfig().createLabel}
function creativeDiversityContext(){return (state.projects||[]).slice(0,12).map(p=>({title:p.title||'',format:p.format||'',genre:p.genre||'',logline:p.logline||'',world:p.worldBible?.premise||'',characters:(p.characters||[]).map(c=>c.name).filter(Boolean).slice(0,8),episodeTitles:(p.episodes||[]).map(e=>e.title).filter(Boolean).slice(0,4),storySignature:String(p.episodes?.[0]?.storyText||'').replace(/\s+/g,' ').slice(0,320)}))}
function setupInput(){const visualStylePreset=$('#visualStylePreset').value,customVisualStyle=$('#customStyle').value.trim();return {idea:$('#idea').value.trim(),storySource:state.storySource||'idea',inputMethod:state.storyInputMethod||'text',format:state.format,genre:$('#genre').value.trim(),audience:audienceValue(),duration:$('#duration').value,castSize:$('#castSize').value,style:stylePromptFromPreset(visualStylePreset,customVisualStyle),visualStylePreset,customVisualStyle,language:$('#language').value.trim(),languageScope:$('#languageScope').value,culturalTreatment:$('#culturalTreatment').value,sacredRepresentation:$('#sacredRepresentation')?.value||'auto',languageDirection:$('#languageDirection').value.trim(),culturalContext:$('#culturalContext')?.value.trim()||'',continuityStrength:$('#continuityStrength').value,controlMode:state.controlMode,characterDirection:$('#characterDirection')?.value.trim(),voiceDirection:$('#voiceDirection')?.value.trim(),soundDirection:$('#soundDirection')?.value.trim(),diversityContext:(state.storySource||'idea')==='idea'?creativeDiversityContext():[]}}
const manageBtn=$('#studioManageBtn'),manageMenu=$('#studioManageMenu');
function closeStudioManage(){manageMenu?.classList.add('hidden');manageBtn?.setAttribute('aria-expanded','false')}
if(manageBtn&&manageMenu){manageBtn.onclick=e=>{e.stopPropagation();const opening=manageMenu.classList.contains('hidden');manageMenu.classList.toggle('hidden',!opening);manageBtn.setAttribute('aria-expanded',String(opening))};manageMenu.addEventListener('click',()=>closeStudioManage());document.addEventListener('click',e=>{if(!e.target.closest('.studio-manage-wrap'))closeStudioManage()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeStudioManage()})}
$('#narratorVoiceBtn').onclick=()=>openNarratorVoicePicker();
function storyDraftTitle(text=''){const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return 'Untitled story';const first=clean.split(/[.!?]/)[0].trim();return first.length>64?first.slice(0,61).trim()+'…':first}
function saveStoryDraftFromCreate(){const input=setupInput();if(String(input.idea||'').trim().length<8){toast('Add a little more of your story before saving it.');return}const item={id:uid('story'),title:storyDraftTitle(input.idea),idea:input.idea,storySource:input.storySource,format:input.format,genre:input.genre,audience:input.audience,duration:input.duration,language:input.language,visualStylePreset:input.visualStylePreset,customVisualStyle:input.customVisualStyle,languageScope:input.languageScope,culturalTreatment:input.culturalTreatment,sacredRepresentation:input.sacredRepresentation,languageDirection:input.languageDirection,culturalContext:input.culturalContext,continuityStrength:input.continuityStrength,controlMode:input.controlMode,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};state.savedStories.unshift(item);save();renderLibrary();toast('Saved to My Stories — no generation credits used.')}
function loadSavedStory(id){const d=(state.savedStories||[]).find(x=>x.id===id);if(!d)return;state.editingProjectId=null;state.storySource=d.storySource||'full-story';applyStorySourceUI();$('#idea').value=d.idea||'';pickerState.genre=String(d.genre||'Mystery').split(/\s*\+\s*/).filter(Boolean);pickerState.language=String(d.language||'English').split(/\s*\+\s*/).filter(Boolean);syncPicker('genre');syncPicker('language');applyAudienceValue(d.audience||'Teen (13–17)');state.format=d.format||'Story';applyFormatUI(false);setSelectValue('#duration',d.duration||formatConfig().defaultDuration);setSelectValue('#visualStylePreset',d.visualStylePreset||'cinematic-realistic');$('#customStyle').value=d.customVisualStyle||'';$('#customStyleWrap').classList.toggle('hidden',$('#visualStylePreset').value!=='custom');setSelectValue('#languageScope',d.languageScope||'entire-story');setSelectValue('#culturalTreatment',d.culturalTreatment||'auto');setSelectValue('#sacredRepresentation',d.sacredRepresentation||'auto');$('#languageDirection').value=d.languageDirection||'';if($('#culturalContext'))$('#culturalContext').value=d.culturalContext||'';setSelectValue('#continuityStrength',d.continuityStrength||'strict');state.controlMode=d.controlMode||'Guided';$$('#controlTabs .seg').forEach(x=>x.classList.toggle('active',x.dataset.control===state.controlMode));setView('create');toast('Story loaded. You can edit it before creating a production.')}
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
  queueMicrotask(()=>save());
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
function projectGenerationInput(p,idea,storySource='full-story'){return {idea:String(idea||'').trim(),storySource,inputMethod:'text',format:p.format||'Story',genre:p.genre||'Open',audience:p.audience||'General',duration:p.duration||formatConfig(p.format).defaultDuration,castSize:p.castSize||'auto',style:p.style||stylePromptFromPreset(p.visualStylePreset||'cinematic-realistic',p.customVisualStyle||''),visualStylePreset:p.visualStylePreset||'cinematic-realistic',customVisualStyle:p.customVisualStyle||'',language:p.language||'English',languageScope:p.languageScope||'entire-story',culturalTreatment:p.culturalTreatment||'auto',sacredRepresentation:p.sacredRepresentation||'auto',languageDirection:p.languageDirection||'',culturalContext:p.culturalContext||'',continuityStrength:p.continuityStrength||'strict',controlMode:p.controlMode||'Guided'}}
function renderStoryReview(p,ep){const panel=$('#storyReviewPanel');if(!panel)return;const text=storyTextOf(p,ep),hasReview=hasStoryReview(p,ep),approved=storyIsApproved(p,ep),cfg=formatConfig(p?.format||'Episode'),continuityWarnings=Array.isArray(ep?.continuityWarnings)?ep.continuityWarnings:[],continuityBlocked=continuityWarnings.length&&!ep?.continuityAcknowledged;const status=$('#storyReviewStatus'),legacy=$('#storyReviewLegacy'),edit=$('#editFullStory'),rebuild=$('#rebuildFullStory'),approve=$('#approveFullStory'),body=$('#storyReviewText'),meta=$('#storyReviewMeta');$('#storyReviewTitle').textContent=`Review the complete ${cfg.title.toLowerCase()}`;$('#storyReviewCopy').textContent=hasReview?'Read and approve the complete narrative before generating portraits, storyboards, audio or video.':'This older project does not yet contain a full narrative review. Existing production remains available, or you can rebuild a complete story review.';status.textContent=hasReview?(approved?'Approved':'Needs review'):'Legacy project';status.classList.toggle('approved',approved&&hasReview);legacy.classList.toggle('hidden',hasReview);edit.classList.toggle('hidden',!hasReview);rebuild.classList.toggle('hidden',hasReview);approve.classList.toggle('hidden',!hasReview||approved);body.classList.toggle('empty',!hasReview);body.innerHTML=hasReview?storyParagraphHtml(text):`<p>${esc(ep?.synopsis||p?.logline||'No full narrative is stored in this older project.')}</p>`;const words=storyWordCount(text),targetSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration),estimateSec=narrativeEstimateSeconds(ep),runtimeFit=targetSec&&estimateSec?estimateSec/targetSec:1,runtimeNote=targetSec&&estimateSec?`<span class="${runtimeFit<.75||runtimeFit>1.35?'runtime-mismatch':''}">≈${formatTime(estimateSec)} narrative · ${formatTime(targetSec)} target</span>`:'';meta.innerHTML=hasReview?`<span>${words.toLocaleString()} words</span><span>${esc(p.language||'Language open')}</span><span>${esc(p.audience||'Audience open')}</span><span>${esc(p.duration||'Runtime open')}</span>${runtimeNote}`:`<span>${esc(cfg.title)}</span><span>Created before Story Review</span>`;let guard=panel.querySelector('.continuity-guard');if(guard)guard.remove();if(continuityWarnings.length){guard=document.createElement('div');guard.className=`continuity-guard ${continuityBlocked?'blocking':'acknowledged'}`;guard.innerHTML=`<div><b>${continuityBlocked?'Continuity conflict needs review':'Continuity change acknowledged'}</b><span>${continuityWarnings.map(w=>esc(w.message||'A recurring series detail may have changed.')).join(' · ')}</span></div>${continuityBlocked?'<button type="button" class="ghost" id="ackContinuityChanges">Accept intentional changes</button>':''}`;body.parentElement?.insertBefore(guard,body);if(continuityBlocked){approve.disabled=true;approve.title='Review the continuity conflict first.';setTimeout(()=>{const b=$('#ackContinuityChanges');if(b)b.onclick=()=>{updateProject(x=>{const e=episodeOf(x);if(e)e.continuityAcknowledged=true});toast('Continuity change acknowledged. Review the story once more before approval.')}},0)}}else{approve.disabled=false;approve.title=''}}
function approveCurrentStory(){const p=current(),ep=episodeOf(p);if(!p||!ep||!hasStoryReview(p,ep))return;updateProject(x=>{const e=episodeOf(x);e.storyApproved=true;e.storyApprovedAt=new Date().toISOString()});toast('Story approved. Production tools are ready.')}
async function rebuildStoryReviewFromText(text,button){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const source=String(text||'').trim();if(source.length<80){toast('Add more of the story before rebuilding the production plan.');return}const hasAssets=assetStats(p).total>0||Boolean(p.finalAssembly)||Boolean(p.finalVideoMeta);if(hasAssets&&!confirm('Rebuilding from this story will replace the current cast and scene plan and clear generated production assets for this project. Continue?'))return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Rebuilding story…'}try{const d=await apiPost('/api/generate-plan',projectGenerationInput(p,source,'full-story'));const next=d.plan;next.format=normalizedFormat(p.requestedFormat||p.format,'Story');next.requestedFormat=next.format;next.duration=p.duration||next.duration||formatConfig(next.format).defaultDuration;next.targetRuntimeSec=durationTargetSeconds(next.duration)||Number(next.targetRuntimeSec)||0;next.id=p.id;next.createdAt=p.createdAt;next.updatedAt=new Date().toISOString();next.archived=p.archived;ensureEpisodeIds(next);next.activeEpisode=1;next.activeEpisodeId=next.episodes[0]?.id||null;if(next.episodes[0])next.episodes[0].storyApproved=false;const idx=state.projects.findIndex(x=>x.id===p.id);state.projects[idx]=next;state.currentId=next.id;save();renderAll();setView('studio');toast('Story rebuilt. Review the complete narrative before production.')}catch(e){toast(e.message||'Could not rebuild the story.')}finally{if(button){button.disabled=false;button.textContent=old||'Save & rebuild'}}}
function openFullStoryEditor(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const text=storyTextOf(p,ep)||legacyStorySeed(p,ep);$('#modalBody').innerHTML=`<form class="modal-form" id="fullStoryEditorForm"><span class="kicker">STORY REVIEW</span><h2>Edit the complete story</h2><p>Changes are rebuilt into the cast and scene plan so production stays aligned with the story. Nothing is generated until you confirm below.</p><label class="field"><span>Complete story</span><textarea class="story-edit-area" id="fullStoryEditorText" required>${esc(text)}</textarea><small>Keep character names, relationships, cultural context and the ending exactly as you want them.</small></label><div class="modal-actions"><button type="button" class="ghost" id="fullStoryEditorCancel">Cancel</button><button type="submit" class="primary">Save & rebuild plan</button></div></form>`;$('#modal').classList.remove('hidden');$('#fullStoryEditorCancel').onclick=closeModal;$('#fullStoryEditorForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter,txt=$('#fullStoryEditorText').value;closeModal();await rebuildStoryReviewFromText(txt,b)}}
function rebuildLegacyStoryReview(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;rebuildStoryReviewFromText(legacyStorySeed(p,ep),$('#rebuildFullStory'))}
function requireApprovedStory(action='continue'){const p=current(),ep=episodeOf(p);if(storyIsApproved(p,ep))return true;toast(`Review and approve the complete story before you ${action}.`);$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return false}
function renderWorkflow(p){const cfg=formatConfig(p?.format||'Episode'),a=assetStats(p),ep=episodeOf(p),approved=storyIsApproved(p,ep),steps=$$('#workflow .workflow-step');steps.forEach(x=>x.classList.remove('done','active'));cfg.journey.forEach((label,i)=>{const t=$(`#wf${i+1}Title`),sub=$(`#wf${i+1}Sub`);if(t)t.textContent=label;if(sub)sub.textContent=cfg.journeySubs[i]||''});let next;if($('#wf1Sub'))$('#wf1Sub').textContent=approved?'Approved':'Review';if(!approved){steps[0]?.classList.add('active');next={title:'Review the complete story',text:'Read, edit if needed, and approve the full narrative before production credits are used.',label:'Review story',action:'review-story'}}else{steps[0]?.classList.add('done');next={title:'Review your cast',text:'Generate or review the recurring characters needed for this production.',label:'Review cast',view:'characters'};if(a.charDone){steps[1]?.classList.add('done');next={title:cfg.title==='Movie'?'Build acts & scenes':'Build the storyboard',text:cfg.title==='Movie'?'Visualize the key scenes across the movie structure.':'Turn each scene into a visual frame while identity references are ready.',label:'Create storyboard',action:'storyboard'}}else steps[1]?.classList.add('active');if(a.sceneDone){steps[2]?.classList.add('done');next={title:'Preview audio',text:`Listen through the ${cfg.finalName} before spending on video generation.`,label:'Preview audio',action:'narrate'}}else if(a.charDone)steps[2]?.classList.add('active');if(p.narrationPlayed){steps[3]?.classList.add('done');next={title:'Generate video',text:'Your story, cast and audio preview are ready for scene rendering.',label:'Generate video',action:'video'}}else if(a.sceneDone)steps[3]?.classList.add('active');if(a.videoDone||p.videoStatus==='ready'){steps[4]?.classList.add('done');next={title:`Prepare final ${cfg.finalName}`,text:`All scene clips are ready. Preview the sequence and lock the final scene order.`,label:'Prepare final',action:'assemble'}}else if(p.narrationPlayed)steps[4]?.classList.add('active');if(p.renderStatus==='ready'||p.renderStatus==='final-video-ready'||p.finalVideoMeta){steps[5]?.classList.add('done');next=p.finalVideoMeta?{title:`Final ${cfg.finalName} ready`,text:'Your single-file final video is ready to download or share.',label:'View final',action:'preview-final'}:{title:`${cfg.title} assembly ready`,text:'The scene order is locked. Render one final video file from the verified synchronized scene media.',label:'Render full video',action:'render-final'}}}const card=$('#nextStepCard');if(card){$('#nextStepTitle').textContent=next.title;$('#nextStepText').textContent=next.text;const b=$('#nextStepAction');b.textContent=next.label;b.dataset.nextView=next.view||'';b.dataset.nextAction=next.action||''}}
function normalizedTier(value){const t=String(value||'standard').toLowerCase();if(t==='fast'||t==='draft'||t==='preview')return 'draft';if(t==='premium'||t==='cinematic'||t==='high')return 'premium';return 'standard'}
function tierLabel(value){return {draft:'Draft preview',standard:'Standard',premium:'Premium / Cinematic'}[normalizedTier(value)]}
function tierHint(value){return {draft:'Faster/cheaper when a draft route is configured.',standard:'Balanced default production quality.',premium:'Highest-fidelity route when a premium model is configured.'}[normalizedTier(value)]}
function setSceneTier(index,value){const p=current(),ep=episodeOf(p);if(!ep?.scenes?.[index])return;updateProject(x=>{const e=episodeOf(x);if(e?.scenes?.[index])e.scenes[index].tier=normalizedTier(value)});toast(`Scene quality set to ${tierLabel(value)}.`)}
function normalizedFraming(value){const v=String(value||'safe').toLowerCase();return ['auto','safe','medium','close','wide'].includes(v)?v:'safe'}
function framingLabel(value){return {auto:'Auto',safe:'Safe framing',medium:'Medium shot',close:'Close-up',wide:'Wide shot'}[normalizedFraming(value)]}
function setSceneFraming(index,value){const p=current(),ep=episodeOf(p);if(!ep?.scenes?.[index])return;updateProject(x=>{const e=episodeOf(x);if(e?.scenes?.[index])e.scenes[index].framing=normalizedFraming(value)});toast(`Scene framing set to ${framingLabel(value)}.`)}

function sceneCoveragePlan(scene,mode='balanced'){return ensureSceneCoverage(scene,mode)}
function coverageClips(scene={}){return Array.isArray(scene.coverageClips)?scene.coverageClips:[]}
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
function normalizedMediaUrl(value=''){try{return new URL(String(value||''),location.origin).href}catch{return String(value||'')}}
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
function sceneLipSyncAudioProvenanceValid(project={},scene={}){
  const current=sceneLipSyncSignature(project,scene);
  if(scene.lipSyncAudioSignature)return scene.lipSyncAudioSignature===current&&Boolean(scene.lipSyncAudioDigest);
  // Direct pre-v1.9.77 renders can remain usable when their semantic signature is still exact.
  // A recovered legacy render is trusted only when the recovery explicitly proved compatibility.
  if(scene.lipSyncRecoveredAt)return ['exact','legacy-compatible'].includes(String(scene.lipSyncRecoveryCompatibility||''));
  return String(scene.lipSyncSignature||'')===current;
}
async function recoverSavedLipSyncAsset(project,scene,index){
  const compatibility=sceneLipSyncRecoveryCompatibility(project,scene);if(!compatibility)return '';
  const projectId=project.id,episodeId=episodeOf(project)?.id||episodeOf(project)?.number,sceneId=scene.id||'',url=scene.lipSyncVideoUrl,signature=sceneLipSyncSignature(project,scene),savedSignature=String(scene.lipSyncSignature||'');
  try{
    await waitForVideoAsset(url);
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||sceneLipSyncRecoveryCompatibility(x,t)!==compatibility||normalizedMediaUrl(t.lipSyncVideoUrl||'')!==normalizedMediaUrl(url))return;t.lipSyncRecoveredFromSignature=savedSignature;t.lipSyncRecoveryCompatibility=compatibility;t.lipSyncSignature=sceneLipSyncSignature(x,t);t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncPlaybackFailedAt=null;t.lipSyncSubmissionFailedAt=null;t.lipSyncError=null;t.lipSyncErrorCode='';t.lipSyncProviderStatus='COMPLETED';t.lipSyncRecoveredAt=new Date().toISOString()},{render:false});
    const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
    return live&&liveScene&&sceneHasValidatedLipSync(live,liveScene)?liveScene.lipSyncVideoUrl:'';
  }catch(e){console.warn('[CineTale lipsync] Saved synchronized asset could not be recovered',e);return ''}
}
function sceneHasCurrentLipSync(project={},scene={}){return Boolean(['sync-labs','fal-sync'].includes(scene.lipSyncProvider)&&scene.lipSyncStatus!=='error'&&!scene.lipSyncPlaybackFailedAt&&sceneLipSyncResultLooksDistinct(scene)&&scene.lipSyncSignature===sceneLipSyncSignature(project,scene)&&sceneLipSyncAudioProvenanceValid(project,scene))}
function sceneHasValidatedLipSync(project={},scene={}){return Boolean(sceneHasCurrentLipSync(project,scene)&&scene.lipSyncValidated===true)}
function sceneProductionReady(project={},scene={}){return Boolean(scene?.videoUrl&&(!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene)))}
function resetSceneLipSyncForNewSource(scene={},videoUrl=''){
  scene.lipSyncVideoUrl='';scene.lipSyncRemoteVideoUrl='';scene.lipSyncProvider='';scene.lipSyncGenerationId='';scene.lipSyncSourceVideoUrl=videoUrl||scene.videoUrl||'';scene.lipSyncGeneratedAt=null;scene.lipSyncSignature='';scene.lipSyncAudioSignature='';scene.lipSyncAudioDigest='';scene.lipSyncRequestDigest='';scene.lipSyncRecoveredFromSignature='';scene.lipSyncRecoveryCompatibility='';scene.lipSyncRecoveredAt=null;scene.lipSyncOperation=null;scene.lipSyncStatusUrl='';scene.lipSyncResponseUrl='';scene.lipSyncModel='';scene.lipSyncStatus='idle';scene.lipSyncValidated=false;scene.lipSyncRetryCount=0;scene.lipSyncError=null;scene.lipSyncErrorCode='';scene.lipSyncProviderStatus='';scene.lipSyncPlaybackFailedAt=null;scene.lipSyncSubmissionFailedAt=null;scene.lipSyncStartedAt=null;
}
function scenePrimaryVideoUrl(scene={},project=null){const p=project||current()||{};return sceneHasValidatedLipSync(p,scene)?scene.lipSyncVideoUrl:(scene.videoUrl||'')}
function sceneStudioVideoUrl(scene={},project=null){const p=project||current()||{},ep=episodeOf(p),key=`${p.id||''}:${ep?.id||ep?.number||''}:${scene.id||scene.number||''}`,signature=sceneLipSyncSignature(p,scene),source=scene.videoUrl||'',synced=sceneHasValidatedLipSync(p,scene)?scene.lipSyncVideoUrl:'',desired=synced||source;const pin=studioVideoSourcePins.get(key);if(pin&&pin.signature===signature&&pin.source===source&&normalizedMediaUrl(pin.url)===normalizedMediaUrl(desired))return pin.url;if(desired)studioVideoSourcePins.set(key,{signature,source,url:desired});return desired}
function sceneVideoSources(scene={},project=null){const urls=[];const primary=scenePrimaryVideoUrl(scene,project);if(primary)urls.push(primary);for(const c of coverageClips(scene)){if(c?.videoUrl&&!urls.includes(c.videoUrl))urls.push(c.videoUrl)}return urls}
function coverageUi(scene={}){const summary=coverageSummary(scene,'balanced'),ready=Math.max(0,sceneVideoSources(scene).length);return `<div class="scene-coverage-note"><b>Cinematic coverage</b><span>${summary.planned} shots planned · ${summary.speaking} speaking shot${summary.speaking===1?'':'s'} · ${ready} video shot${ready===1?'':'s'} ready</span></div>`}
function sceneFinalToggleUi(scene={},index=-1){return `<label class="scene-final-toggle"><input type="checkbox" data-scene-final-include="${index}" ${scene.finalIncluded===false?'':'checked'}><span><b>Include in final</b><small>${scene.finalIncluded===false?'Skipped — no video generation required':'Selected for final production'}</small></span></label>`}
function mediaAspectClass(project={}){return String(project.format||'Episode')==='Short'?'media-portrait':'media-landscape'}

function primaryCoverageShot(scene={},mode='balanced'){
  const plan=ensureSceneCoverage(scene,mode);
  const hasDialogue=dialogueList(scene.dialogue).length>0;
  return (hasDialogue?plan.find(x=>x?.speaking):null)||plan[0]||null;
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
    videoPrimarySpokenLine:shot.spokenLine||''
  }:{videoPrimaryShotId:null,videoPrimarySpeaking:false,videoPrimarySpeaker:'',videoPrimarySpokenLine:''};
}

const confirmedVideoOperations=new Set();
const recoveringVideoOperations=new Set();
const VIDEO_RECOVERY_MAX_AGE_MS=20*60*1000;
function videoOperationConfirmed(scene={}){return Boolean(scene.videoOperation&&confirmedVideoOperations.has(scene.videoOperation))}
function videoOperationRecovering(scene={}){return Boolean(scene.videoOperation&&!videoOperationConfirmed(scene))}
function videoCooldownSeconds(scene={}){return Math.max(0,Math.ceil((Number(scene.videoRetryAt||0)-Date.now())/1000))}
function videoButtonLabel(scene={}){return videoCooldownSeconds(scene)>0?'Video temporarily limited':videoOperationConfirmed(scene)?'Rendering…':videoOperationRecovering(scene)?'Checking saved render…':scene.videoUrl?'Regenerate clip':'Generate video clip'}
function videoButtonDisabled(scene={},productionLocked=false){return productionLocked||videoCooldownSeconds(scene)>0||Boolean(scene.videoOperation)}
function sceneVideoMarkup(scene,art,title='Scene video',index=-1,project=null){
  const src=sceneStudioVideoUrl(scene,project);if(!src)return '';
  const poster=art?` poster="${esc(art)}"`:'';
  const sync=index>=0?` data-scene-video-preview="${index}"`:'';
  const isMountedSynced=project&&sceneHasValidatedLipSync(project,scene)&&normalizedMediaUrl(src)===normalizedMediaUrl(scene.lipSyncVideoUrl||'');
  const speaking=sceneHasSpokenContent(scene);
  const exact=isMountedSynced?' data-lipsync-ready="1"':'';
  // Speaking source clips are visual previews only until the rendered lip-synced asset is validated.
  // Do not let users play the raw provider clip with a second browser-timed voice track: that creates
  // the exact mouth/audio mismatch seen in production. Once synchronized, normal native controls return.
  if(speaking&&!isMountedSynced){
    return `<video playsinline muted preload="auto"${poster}${sync} data-scene-media-loading="1" data-sync-gated="1" aria-label="${esc(title)} preview" src="${esc(src)}"></video>`;
  }
  return `<video controls playsinline preload="auto"${poster}${sync}${exact} data-scene-media-loading="1" aria-label="${esc(title)}" src="${esc(src)}"></video>`;
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
  if(!scene?.videoUrl)return 'Not generated';
  // Never place synchronization/debug wording over the picture. Unsynchronized speaking clips
  // are visually gated and their state is shown below the media instead.
  if(sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project||{},scene))return '';
  return 'Video ready';
}
function sceneSyncStateUi(project={},scene={}){
  if(!scene?.videoUrl||!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene))return '';
  const signature=sceneLipSyncSignature(project,scene);
  const unsafeRecovered=Boolean(scene.lipSyncRecoveredAt&&!scene.lipSyncRecoveryCompatibility);
  const active=scene.lipSyncStatus==='processing'&&Boolean(scene.lipSyncOperation)&&scene.lipSyncSignature===signature;
  const waiting=scene.lipSyncProviderStatus==='WAITING_FOR_SLOT'&&scene.lipSyncAutoPending===true;
  const failed=scene.lipSyncStatus==='error'&&scene.lipSyncSignature===signature;
  if(!active&&!waiting&&!failed&&!unsafeRecovered)return '';
  const text=unsafeRecovered?'Dialogue sync must be rebuilt':failed?'Dialogue sync needs attention':waiting?'Dialogue sync queued':'Dialogue sync in progress';
  return `<div class="scene-sync-state" role="status"><span class="scene-sync-dot"></span><span>${text}</span></div>`;
}
function updateSceneMediaStatuses(project=null,episode=null){
  const p=project||current(),ep=episode||episodeOf(p),list=$('#sceneList');if(!p||!ep||!list)return;
  (ep.scenes||[]).forEach((scene,index)=>{const tag=list.querySelector(`[data-scene-media-status="${index}"]`),video=list.querySelector(`video[data-scene-video-preview="${index}"]`);if(tag){const text=sceneMediaStatusText(p,scene,video);tag.textContent=text;tag.classList.toggle('hidden',!text)}});
}

function renderStudio(){const p=current();
  // Do not remount every scene/video element while a final file is being captured.
  // Firefox visibly blanks/reloads media elements when Studio is rebuilt mid-render.
  if(p&&state.finalRenderRunning&&state.finalRenderProjectId===p.id&&$('#sceneList')?.childElementCount){
    const ep=episodeOf(p);renderFinalAssembly(p,ep);renderWorkflow(p);return;
  }
  if(!p){$('#studioEmpty').classList.remove('hidden');$('#studioContent').classList.add('hidden');return}$('#studioEmpty').classList.add('hidden');$('#studioContent').classList.remove('hidden');p.format=normalizedFormat(p.requestedFormat||p.format,'Episode');const ep=episodeOf(p),scenes=ep?.scenes||[],stats=assetStats(p),cfg=formatConfig(p.format),episodic=p.format==='Episode',productionLocked=!storyIsApproved(p,ep),targetSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration),narrativeSec=narrativeEstimateSeconds(ep);$('#studioTitle').textContent=p.title||'Untitled';$('#studioCrumbTitle').textContent=p.title||'Current project';$('#studioLogline').textContent=p.logline||'';if($('#studioFormatChip'))$('#studioFormatChip').textContent=cfg.title;if($('#studioAudienceChip'))$('#studioAudienceChip').textContent=p.audience||'Audience open';if($('#studioStyleChip'))$('#studioStyleChip').textContent=styleLabel(p.visualStylePreset||'cinematic-realistic');if($('#studioLanguageChip'))$('#studioLanguageChip').textContent=p.language||'Language open';$('#unitLabel').textContent=cfg.unitLabel;$('#episodeNumber').textContent=episodic?String(ep?.number||1).padStart(2,'0'):'';$('#episodeNumber').classList.toggle('hidden',!episodic);$('#episodeTitle').textContent=ep?.title||cfg.title;$('#episodeSynopsis').textContent=ep?.synopsis||'';$('#episodeRuntime').textContent=targetSec?`~${formatTime(targetSec)}`:(narrativeSec?`~${formatTime(narrativeSec)}`:'~00:00');$('#episodeRuntime').title=targetSec?`Creator-selected target: ${p.duration||formatTime(targetSec)}. Current narrative estimate: ${formatTime(narrativeSec)} at a natural reading pace.`:'Estimated from the complete story text at a natural reading pace.';$('#runtimeLabel').textContent=targetSec?`target ${cfg.finalName} runtime`:`estimated ${cfg.finalName} runtime`;$('#assetCount').textContent=`${stats.total} asset${stats.total===1?'':'s'}`;const episodesBtn=$('#studioEpisodesBtn'),nextBtn=$('#continueEpisode'),unitsBlock=$('#studioUnitsBlock');if(episodesBtn)episodesBtn.classList.toggle('hidden',!episodic);if(nextBtn)nextBtn.classList.toggle('hidden',!episodic);if(unitsBlock)unitsBlock.classList.toggle('hidden',!episodic);if($('#studioMemoryTitle'))$('#studioMemoryTitle').textContent=cfg.memoryTitle;if($('#sceneProductionTitle'))$('#sceneProductionTitle').textContent=cfg.sceneTitle;
  ensureEpisodeIds(p);$('#studioEpisodes').innerHTML=episodic?(p.episodes||[]).map(e=>`<div class="studio-episode-row"><button class="episode-chip ${e.id===ep?.id?'active':''}" data-studio-episode-id="${esc(e.id)}">${String(e.number).padStart(2,'0')} · ${esc(e.title)}</button>${(p.episodes||[]).length>1?`<button class="episode-mini-delete" data-studio-delete-id="${esc(e.id)}" aria-label="Delete ${esc(e.title)}">×</button>`:''}</div>`).join(''):'';$$('[data-studio-episode-id]').forEach(b=>b.onclick=()=>updateProject(x=>{ensureEpisodeIds(x);x.activeEpisodeId=b.dataset.studioEpisodeId;const e=x.episodes.find(v=>v.id===x.activeEpisodeId);x.activeEpisode=e?.number||x.activeEpisode}));$$('[data-studio-delete-id]').forEach(b=>b.onclick=()=>deleteEpisode(b.dataset.studioDeleteId));
  $('#canonList').innerHTML=(p.worldBible?.canon||[]).map(x=>`<div class="canon-chip">${esc(x)}</div>`).join('')||`<div class="canon-chip">${episodic?'Canon will build as the series grows.':'Project continuity notes will appear here.'}</div>`;
  renderStoryReview(p,ep);
  const sceneList=$('#sceneList');
  const sceneMarkup=scenes.map((s,i)=>{const art=visualSrc(s);return `<article class="scene-card surface"><div class="scene-media-column"><div class="scene-visual ${mediaAspectClass(p)}">${videoOperationConfirmed(s)?(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder scene-video-rendering"><b>Rendering…</b><span>CineTale is creating the replacement clip.</span></div>`):videoOperationRecovering(s)?(s.videoUrl?sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p):(art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder scene-video-rendering"><b>Checking saved render…</b><span>CineTale is verifying whether the previous video job is still active.</span></div>`)):s.videoUrl?sceneVideoMarkup(s,art,s.title||`Scene ${i+1}`,i,p):art?`<img src="${art}" alt="${esc(s.title)}">`:`<div class="scene-placeholder"><b>${String(s.number||i+1).padStart(2,'0')}</b><span>Storyboard pending</span></div>`}<div class="asset-tag" data-scene-media-status="${i}">${videoOperationConfirmed(s)?(s.videoUrl?'Rendering replacement':'Rendering video'):videoOperationRecovering(s)?'Checking saved render':s.videoUrl?(sceneHasSpokenContent(s)&&!sceneHasValidatedLipSync(p,s)?'':'Video ready'):art?(s._visualPersisting?'Saving safely…':(s.imageMode==='ai'?'Generated art':'Preview art')):'Not generated'}</div></div><div class="scene-media-support">${sceneSyncStateUi(p,s)}${coverageUi(s)}${sceneFinalToggleUi(s,i)}</div></div><div class="scene-copy"><div class="scene-kicker">${p.format==='Movie'&&s.act?`${esc(s.act)} · `:''}SCENE ${String(s.number||i+1).padStart(2,'0')} · ${Number(s.durationSec)||0}s story beat</div><h3>${esc(s.title)}</h3><p>${esc(s.visual||s.purpose||'')}</p><div class="dialogue scene-dialogue-box"><span>${esc(dialogueList(s.dialogue)[0]||dialogueText(s.narration)||'')}</span><button class="dialogue-edit-btn" data-scene-edit="${i}" type="button">Edit performance</button></div><button class="scene-voice-chip" data-scene-voice="${i}" type="button"><span class="scene-voice-icon">🎙</span><span class="scene-voice-copy"><small>Character voice</small><b>${esc(sceneVoiceSummary(p,s))}</b></span><span class="scene-voice-edit">Edit</span></button><div class="scene-meta"><span>🎵 ${esc(s.music||'Open music direction')}</span><span>🔊 ${esc(s.sfx||'Open SFX direction')}</span><span>🎥 ${esc(s.camera||'Open camera direction')}</span></div></div><div class="scene-actions"><div class="scene-action-buttons"><button class="primary small" data-scene-art="${i}" ${(productionLocked||visualGenerationBlocked())?`disabled title="${productionLocked?'Approve the story first':esc(visualBlockedMessage())}"`:''}>${visualGenerationBlocked()?'Visuals paused':hasVisual(s)?'Regenerate art':'Generate art'}</button><button class="ghost" data-scene-listen="${i}" ${productionLocked?'disabled title="Approve the story first"':''}>▶ Listen</button><button class="ghost" data-scene-video="${i}" ${videoButtonDisabled(s,productionLocked)?`disabled title="${productionLocked?'Approve the story first':'Google video generation is temporarily limited. Try again shortly.'}"`:''}>${videoButtonLabel(s)}</button></div><div class="scene-production-controls"><label class="scene-quality-control" title="${esc(tierHint(s.tier))}"><span>Video quality</span><select data-scene-tier="${i}"><option value="draft" ${normalizedTier(s.tier)==='draft'?'selected':''}>Draft preview</option><option value="standard" ${normalizedTier(s.tier)==='standard'?'selected':''}>Standard</option><option value="premium" ${normalizedTier(s.tier)==='premium'?'selected':''}>Premium / Cinematic</option></select></label><label class="scene-quality-control" title="Controls camera composition for video generation. Safe framing is recommended for normal scenes."><span>Framing</span><select data-scene-framing="${i}"><option value="safe" ${normalizedFraming(s.framing)==='safe'?'selected':''}>Safe framing</option><option value="auto" ${normalizedFraming(s.framing)==='auto'?'selected':''}>Auto</option><option value="medium" ${normalizedFraming(s.framing)==='medium'?'selected':''}>Medium shot</option><option value="close" ${normalizedFraming(s.framing)==='close'?'selected':''}>Close-up</option><option value="wide" ${normalizedFraming(s.framing)==='wide'?'selected':''}>Wide shot</option></select></label></div></div></article>`}).join('');
  const sceneContextKey=`${p.id}|${ep?.id||ep?.number||''}`;
  const sceneDomUnchanged=sceneList&&sceneList.__cinetaleContextKey===sceneContextKey&&sceneList.__cinetaleMarkup===sceneMarkup;
  if(sceneList&&!sceneDomUnchanged){
    // Never replace the scene-card DOM during an active player session. Firefox will visibly
    // drop/recreate the media pipeline even when the URL is unchanged. Defer the structural
    // refresh until playback has ended; transient lip-sync state is patched in place instead.
    if(sceneListPlaybackLocked(sceneList)){sceneList.__cinetaleDeferredRender=true;sceneList.__cinetaleDeferredMarkup=sceneMarkup;sceneList.__cinetaleDeferredContextKey=sceneContextKey}
    else{
      const playback=new Map([...sceneList.querySelectorAll('video[src]')].map(v=>[v.getAttribute('src'),{time:Number(v.currentTime)||0,paused:v.paused,muted:v.muted,volume:v.volume,rate:v.playbackRate}]));
      sceneList.innerHTML=sceneMarkup;sceneList.__cinetaleContextKey=sceneContextKey;sceneList.__cinetaleMarkup=sceneMarkup;sceneList.__cinetaleDeferredRender=false;
      sceneList.querySelectorAll('video[src]').forEach(v=>{const prior=playback.get(v.getAttribute('src'));if(!prior)return;v.muted=prior.muted;v.volume=prior.volume;v.playbackRate=prior.rate||1;const restore=()=>{try{if(prior.time>0&&Number.isFinite(v.duration))v.currentTime=Math.min(prior.time,Math.max(0,v.duration-.05));if(!prior.paused)v.play().catch(()=>{})}catch{}};if(v.readyState>=1)restore();else v.addEventListener('loadedmetadata',restore,{once:true})});
    }
  }
  $$('[data-scene-art]').forEach(b=>b.onclick=()=>generateScene(Number(b.dataset.sceneArt),b));$$('[data-scene-listen]').forEach(b=>b.onclick=()=>listenScene(Number(b.dataset.sceneListen),b));$$('[data-scene-edit]').forEach(b=>b.onclick=()=>openSceneAudioEditor(Number(b.dataset.sceneEdit)));$$('[data-scene-voice]').forEach(b=>b.onclick=()=>{const p=current(),s=episodeOf(p)?.scenes?.[Number(b.dataset.sceneVoice)],idx=sceneVoiceCharacterIndex(p,s);if(idx>=0)openVoicePicker(idx);else openNarratorVoicePicker()});$$('[data-scene-tier]').forEach(sel=>sel.onchange=()=>setSceneTier(Number(sel.dataset.sceneTier),sel.value));$$('[data-scene-framing]').forEach(sel=>sel.onchange=()=>setSceneFraming(Number(sel.dataset.sceneFraming),sel.value));$$('[data-scene-final-include]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.sceneFinalInclude),cb.checked));bindSceneVideoVoicePlayback(p,ep);authorizeUnsyncedSpeakingScenesOnStudioOpen(p,ep);updateSceneMediaStatuses(p,ep);renderFinalAssembly(p,ep);renderWorkflow(p);resumePendingVideoPolls();maybeResumeAutoFinal(p);scheduleStudioSceneAudioWarmup(p,ep);scheduleStudioLipSyncWarmup(p,ep)
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
function scenePrompt(p,ep,s,refs=[]){const cast=(p.characters||[]).map(c=>`${c.name}: ${c.appearance||''}; wardrobe: ${c.wardrobe||'continuity wardrobe'}; identity context: ${sacredFigureGuidance(p,c)}${c.visualStyleOverride&&c.visualStyleOverride!=='project'?`; style override ${characterStyle(p,c)}`:''}`).join(' | ');const refManifest=refs.length?` Reference portraits are supplied in this exact order: ${refs.map((r,i)=>`${i+1}) ${r.name}`).join('; ')}. Each reference image belongs to that named character only; never swap identities between characters.`:'';return `Original storyboard frame. Project: ${p.title}. Format: ${p.format||'Episode'}. Production unit: ${ep.title}. Scene: ${s.title}. Visual action: ${s.visual}. Story purpose: ${s.purpose}. Generation quality: ${tierLabel(s.tier)}. ${tierHint(s.tier)} Cast continuity: ${cast}. Project visual style: ${projectStyle(p)}. Cultural treatment: ${culturalPrompt(p)}. Sacred representation: ${sacredRepresentationPrompt(p)}. ${continuityPrompt(p)}${refManifest} Preserve cultural and geographic details requested by the creator without stereotyping. SAFE STORYBOARD FRAMING: compose in 16:9 with all principal faces fully inside frame, comfortable headroom and side margins, and important hands/props visible when story-relevant. Do not crop a principal character at the face/head edge or create an unintended extreme close-up. If two or more principal characters are present, keep each readable in frame unless the scene explicitly requests an intentional close-up. No captions, no written labels, no callout arrows, no infographic annotations, no logos.`}
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
const scenePreparedAudioTracks=new Map();
const sceneAudioWarmups=new Set();
let sceneVideoAudioContext=null;
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
async function sceneLipSyncAudioDataUrl(p,s){const assets=await sceneVoiceAssets(p,s);if(!assets.length)return '';const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return assets.length===1?blobToDataUrl(assets[0].blob):'';const ctx=new Ctx();try{const decoded=[];let duration=sceneVoiceLeadInSec(s);for(const a of assets){const ab=await a.blob.arrayBuffer(),b=await ctx.decodeAudioData(ab.slice(0)),trim=audioLeadingSilenceSec(b),playDuration=Math.max(.02,b.duration-trim);decoded.push({buffer:b,trim,playDuration});duration+=playDuration}const rate=44100,Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)return assets.length===1?blobToDataUrl(assets[0].blob):'';const offline=new Offline(1,Math.max(1,Math.ceil((duration+.05)*rate)),rate);let cursor=sceneVoiceLeadInSec(s);for(const item of decoded){const src=offline.createBufferSource();src.buffer=item.buffer;src.connect(offline.destination);src.start(cursor,item.trim,item.playDuration);cursor+=item.playDuration}const rendered=await offline.startRendering();return await blobToDataUrl(wavFromAudioBuffer(rendered))}finally{try{await ctx.close()}catch{}}}
const lipSyncJobsInFlight=new Map();
const validatedLipSyncUrls=new Set();
const studioVideoSourcePins=new Map();
function sceneLipSyncJobKey(p,s){return `${p.id||''}:${s.id||s.number||''}:${sceneLipSyncSignature(p,s)}`}
const LIP_SYNC_JOB_STALE_MS=15*60*1000;
function sceneLipSyncJobAgeMs(scene={}){const t=Date.parse(scene.lipSyncStartedAt||'');return Number.isFinite(t)?Math.max(0,Date.now()-t):Infinity}
function resumableSceneLipSyncJob(scene={},signature=''){
  if(scene.lipSyncStatus!=='processing'||scene.lipSyncSignature!==signature||!scene.lipSyncOperation)return null;
  if(sceneLipSyncJobAgeMs(scene)>LIP_SYNC_JOB_STALE_MS)return null;
  return {requestId:String(scene.lipSyncOperation),provider:String(scene.lipSyncProvider||''),model:String(scene.lipSyncModel||''),statusUrl:String(scene.lipSyncStatusUrl||''),responseUrl:String(scene.lipSyncResponseUrl||'')};
}
async function submitSceneLipSyncRequest(videoUrl,audioDataUrl,signature,requestDigest=''){
  const submissionKey=String(requestDigest||'').replace(/[^a-f0-9]/gi,'').slice(0,64)||`${hashString(signature).toString(36)}_${stableAudioHash(audioDataUrl).split('-')[0]}`;
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    const d=await apiPost('/api/lipsync-job',{videoUrl,audioDataUrl,submissionKey});
    if(d.status==='queued'||d.requestId||d.status==='not_configured')return d;
    if(!['retryable','submission_unknown'].includes(d.status||''))return d;
    last=d;
    if(attempt<2){const wait=Math.max(750,Math.min(10000,Number(d.retryAfterMs)||1500*Math.pow(2,attempt)));await sleep(wait)}
  }
  const err=new Error(last?.error||'Lip-sync provider could not accept the scene after safe retries.');err.code=last?.errorCode||'sync_submit_retry_exhausted';err.details=last||null;throw err;
}
async function pollSceneLipSync(projectId,episodeId,index,job,signature,sceneId=''){
  for(let attempt=0;attempt<180;attempt++){
    await sleep(attempt<6?2500:5000);
    const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
    const d=await apiPost('/api/lipsync-status',{requestId:job.requestId,provider:job.provider||'',model:job.model||'',statusUrl:job.statusUrl||'',responseUrl:job.responseUrl||'',sourceVideoUrl:liveScene?.videoUrl||''});
    if(d.status==='ready'){
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||sceneLipSyncSignature(x,t)!==signature)return;t.lipSyncVideoUrl=d.videoUrl;t.lipSyncRemoteVideoUrl=d.remoteVideoUrl||'';t.lipSyncProvider=d.provider||job.provider||'sync-labs';t.lipSyncGenerationId=d.generationId||job.requestId||'';t.lipSyncSourceVideoUrl=t.videoUrl||'';t.lipSyncGeneratedAt=new Date().toISOString();t.lipSyncSignature=signature;t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncModel=d.model||t.lipSyncModel||job.model||'';t.lipSyncStatus='ready';t.lipSyncValidated=false;t.lipSyncRetryCount=0;t.lipSyncError=null;t.lipSyncProviderStatus='COMPLETED';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
      return d.videoUrl;
    }
    if(d.queueStatus){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=e?.scenes?.[index];if(t&&t.lipSyncSignature===signature)t.lipSyncProviderStatus=d.queueStatus},{render:false})}
    if(d.status==='error')throw new Error(d.error||'Lip synchronization failed.');
  }
  // Do not poison a paid long-running job just because this browser polling window ended.
  // The saved request ID is resumed the next time the scene is opened or played.
  return '';
}
async function ensureSceneLipSync(p,s,index,{quiet=false,allowSubmit=true}={}){
  if(!p||!s?.videoUrl||!sceneHasSpokenContent(s))return '';
  const signature=sceneLipSyncSignature(p,s),sceneId=s.id||'';
  if(sceneHasValidatedLipSync(p,s))return s.lipSyncVideoUrl;
  // Recover an already-paid synchronized render even when an older build left its
  // validation flag/signature stale. This performs a read-only asset check and never submits a job.
  if(sceneHasRecoverableLipSyncAsset(p,s)&&s.lipSyncVideoUrl){
    const recovered=await recoverSavedLipSyncAsset(p,s,index);
    if(recovered){const live=state.projects.find(x=>x.id===p.id),liveScene=sceneAtIdentity(findEpisodeById(live,episodeOf(p)?.id||episodeOf(p)?.number),index,s.id||'');if(live&&liveScene){updateSceneMediaStatuses(live,episodeOf(live));return recovered}}
  }
  if(sceneHasCurrentLipSync(p,s)&&s.lipSyncVideoUrl){
    try{
      await waitForVideoAsset(s.lipSyncVideoUrl);
      const projectId=p.id,episodeId=episodeOf(p)?.id||episodeOf(p)?.number;
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t&&t.lipSyncSignature===signature&&sceneLipSyncResultLooksDistinct(t)){t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null}},{render:false});
      const live=state.projects.find(x=>x.id===projectId),liveScene=sceneAtIdentity(findEpisodeById(live,episodeId),index,sceneId);
      if(live&&liveScene&&sceneHasValidatedLipSync(live,liveScene)){updateSceneMediaStatuses(live,findEpisodeById(live,episodeId));return liveScene.lipSyncVideoUrl}
    }catch(e){console.warn('[CineTale lipsync] Saved synchronized asset failed validation; preserving the source scene.',e);markSceneLipSyncPlaybackError(p.id,index,e?.message||String(e))}
  }
  if(s.lipSyncStatus==='error'&&s.lipSyncSignature===signature&&(s.lipSyncPlaybackFailedAt||s.lipSyncSubmissionFailedAt))return '';
  const key=sceneLipSyncJobKey(p,s);if(lipSyncJobsInFlight.has(key))return lipSyncJobsInFlight.get(key);
  const task=(async()=>{
    const projectId=p.id,episodeId=episodeOf(p)?.id||episodeOf(p)?.number;
    try{
      // Resume a saved synchronization request before considering a new billable submission.
      let liveProject=state.projects.find(x=>x.id===projectId)||p,liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||s;
      let job=resumableSceneLipSyncJob(liveScene,signature);
      if(!job&&liveScene?.lipSyncStatus==='processing'&&liveScene?.lipSyncSignature===signature&&liveScene?.lipSyncOperation&&sceneLipSyncJobAgeMs(liveScene)>LIP_SYNC_JOB_STALE_MS){
        const retryCount=Math.max(0,Number(liveScene.lipSyncRetryCount)||0);
        if(retryCount>=1)throw new Error('Lip-sync provider did not finish the saved request. Change the scene voice or regenerate the source clip before retrying again.');
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t)return;t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncStatus='idle';t.lipSyncRetryCount=retryCount+1;t.lipSyncError='Previous lip-sync request expired before producing a usable result; retrying once.'},{render:false});
        liveProject=state.projects.find(x=>x.id===projectId)||p;liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId)||s;
      }
      if(!job){
        // Studio background warmup may resume/poll an existing paid job, but must never
        // start a new billable lip-sync generation without an explicit playback/final-render need.
        if(!allowSubmit)return '';
        const activeScene=(findEpisodeById(liveProject,episodeId)?.scenes||[]).find((candidate,candidateIndex)=>candidateIndex!==index&&candidate?.lipSyncStatus==='processing'&&candidate?.lipSyncOperation&&candidate?.lipSyncSignature===sceneLipSyncSignature(liveProject,candidate));
        if(activeScene){
          updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncProviderStatus='WAITING_FOR_SLOT';t.lipSyncError=null}},{render:false});
          if(!quiet)toast('Another scene is finishing dialogue synchronization. This scene will stay on its safe source clip for now.');
          return '';
        }
        const audioDataUrl=await sceneLipSyncAudioDataUrl(liveProject,liveScene);if(!audioDataUrl)return '';
        const audioDigest=await strongStringDigest(audioDataUrl),audioSignature=sceneLipSyncSignature(liveProject,liveScene);
        if(audioSignature!==signature)throw new Error('Scene dialogue changed while synchronization audio was being prepared. CineTale stopped the stale sync request.');
        const requestDigest=await strongStringDigest(`${signature}\n${audioDataUrl}`);
        const videoUrl=new URL(liveScene.videoUrl,location.origin).href;
        const d=await submitSceneLipSyncRequest(videoUrl,audioDataUrl,signature,requestDigest);
        if(d.status==='not_configured'){if(!quiet)console.info('[CineTale lipsync] Dedicated lip-sync is not configured.');return ''}
        if(d.status==='busy'){
          updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(t){t.lipSyncStatus='idle';t.lipSyncProviderStatus='WAITING_FOR_SLOT';t.lipSyncError=null;t.lipSyncErrorCode=''}},{render:false});
          if(!quiet)toast('Dialogue synchronization is busy with another scene. CineTale will not submit a duplicate job.');
          return '';
        }
        if(!d.requestId)throw new Error('Lip-sync provider did not return a queue request ID.');
        job={requestId:d.requestId,provider:d.provider||'',model:d.model||'',statusUrl:d.statusUrl||'',responseUrl:d.responseUrl||''};
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t)return;t.lipSyncOperation=d.requestId;t.lipSyncGenerationId=d.provider==='sync-labs'?d.requestId:(t.lipSyncGenerationId||'');t.lipSyncStatusUrl=d.statusUrl||'';t.lipSyncResponseUrl=d.responseUrl||'';t.lipSyncModel=d.model||'';t.lipSyncStartedAt=new Date().toISOString();t.lipSyncStatus='processing';t.lipSyncProviderStatus='PENDING';t.lipSyncSignature=signature;t.lipSyncAudioSignature=audioSignature;t.lipSyncAudioDigest=audioDigest;t.lipSyncRequestDigest=requestDigest;t.lipSyncRecoveryCompatibility='';t.lipSyncRecoveredAt=null;t.lipSyncProvider=d.provider||'sync-labs';t.lipSyncSourceVideoUrl=t.videoUrl||'';t.lipSyncValidated=false;t.lipSyncPlaybackFailedAt=null;t.lipSyncSubmissionFailedAt=null;t.lipSyncErrorCode='';t.lipSyncError=null;t.lipSyncAutoPending=false},{render:false});
      }
      const url=await pollSceneLipSync(projectId,episodeId,index,job,signature,sceneId);
      if(!url)return '';
      await waitForVideoAsset(url);
      updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),t=sceneAtIdentity(e,index,sceneId);if(!t||t.lipSyncSignature!==signature||!sceneLipSyncResultLooksDistinct(t))return;t.lipSyncValidated=true;t.lipSyncStatus='ready';t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null},{render:false});
      liveProject=state.projects.find(x=>x.id===projectId);liveScene=sceneAtIdentity(findEpisodeById(liveProject,episodeId),index,sceneId);
      if(!liveProject||!liveScene||!sceneHasValidatedLipSync(liveProject,liveScene))throw new Error('Lip-sync result could not be validated as a distinct playable synchronized asset.');
      // The render lock prevents active playback from being destroyed. Once safe, the next
      // render/player mount must prefer this validated synchronized asset over the old source pin.
      updateSceneMediaStatuses(liveProject,findEpisodeById(liveProject,episodeId));
      if(!quiet)toast('Dialogue synchronization is ready.');
      return url;
    }catch(e){
      console.warn('[CineTale lipsync]',e);
      updateProjectById(projectId,x=>{const ep=findEpisodeById(x,episodeId),t=sceneAtIdentity(ep,index,sceneId);if(t){const hadJob=Boolean(t.lipSyncOperation);t.lipSyncOperation=null;t.lipSyncStatusUrl='';t.lipSyncResponseUrl='';t.lipSyncStatus='error';t.lipSyncError=e?.message||String(e);t.lipSyncErrorCode=e?.code||e?.details?.errorCode||'';if(!hadJob)t.lipSyncSubmissionFailedAt=new Date().toISOString()}},{render:false});
      if(!quiet)toast('Dialogue synchronization could not be completed.');
      return '';
    }finally{lipSyncJobsInFlight.delete(key)}
  })();
  lipSyncJobsInFlight.set(key,task);return task;
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
        if(current()?.id===projectId){updateSceneMediaStatuses(live,liveEpisode);renderFinalAssembly(live,liveEpisode);toast(`Scene ${liveScene.number||index+1} dialogue synchronization is ready.`)}
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
  if(currentSrc===desiredSrc){validatedLipSyncUrls.add(desiredSrc);for(const src of ctl.sources||[]){try{src.stop()}catch{}}ctl.sources=[];ctl.track=null;restoreProviderGuideAudio(video,ctl);video.muted=false;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';return true}
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
    video.muted=false;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';delete video.dataset.lipSyncSwitching;delete video.dataset.lipSyncPendingAdoption;
    updateProjectById(project.id,x=>{const e=episodeOf(x),t=e?.scenes?.[index];if(t){t.lipSyncStatus='ready';t.lipSyncValidated=true;t.lipSyncPlaybackFailedAt=null;t.lipSyncError=null}},{render:false});
    if(wasPlaying){try{await video.play()}catch{}}
    return true;
  }catch(e){
    console.warn('[CineTale lipsync] Verified handoff failed; keeping/restoring the original scene video.',e);
    delete video.dataset.lipSyncSwitching;markSceneLipSyncPlaybackError(project.id,index,e?.message||String(e));
    const nowSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'');
    if(oldRawSrc&&nowSrc===desiredSrc){try{video.src=oldRawSrc;video.load();await new Promise(resolve=>{if(video.readyState>=1)return resolve();const done=()=>{video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',done);resolve()};video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',done,{once:true});setTimeout(done,3000)});if(oldTime>0&&Number.isFinite(video.duration))video.currentTime=Math.min(oldTime,Math.max(0,video.duration-.08));if(wasPlaying)await video.play().catch(()=>{})}catch{}}
    // Approved voice overlay remains the safe fallback; the user never loses the working source clip.
    return false;
  }finally{ctl.adopting=false}
}
function scenePreparedAudioKey(project={},scene={}){return `${project.id||''}:${scene.id||scene.number||''}:${sceneLipSyncSignature(project,scene)}`}
async function prepareSceneApprovedAudio(project,scene){
  if(!project||!scene||!sceneHasSpokenContent(scene))return null;
  const key=scenePreparedAudioKey(project,scene);
  if(scenePreparedAudioTracks.has(key))return scenePreparedAudioTracks.get(key);
  const task=(async()=>{
    const ctx=await ensureSceneVideoAudioContext();if(!ctx)throw new Error('Browser audio engine is unavailable.');
    const assets=await sceneVoiceAssets(project,scene);if(!assets.length)return null;
    return await decodeSceneAudioTrack(ctx,assets,{leadInSec:sceneVoiceLeadInSec(scene)});
  })().catch(e=>{scenePreparedAudioTracks.delete(key);throw e});
  scenePreparedAudioTracks.set(key,task);return task;
}
async function startSceneVideoVoicePlayback(video,p,s,index,{resumeVideo=false}={}){
  if(activeAudio){try{activeAudio.pause()}catch{}activeAudio=null}try{speechSynthesis?.cancel?.()}catch{}
  let ctl=sceneVideoAudioControllers.get(video);if(!ctl){ctl={sources:[],token:0,requestedPlay:false,preparing:false,track:null,providerMuteApplied:false,previousMuted:false,adopting:false,gating:false};sceneVideoAudioControllers.set(video,ctl)}
  ctl.requestedPlay=true;if(ctl.preparing)return;const token=++ctl.token;ctl.preparing=true;
  try{
    const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||s;
    const mountedSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'');
    const syncedSrc=sceneHasCurrentLipSync(liveProject,liveScene)&&liveScene.lipSyncValidated===true?normalizedMediaUrl(liveScene.lipSyncVideoUrl||''):'';
    if(syncedSrc&&mountedSrc===syncedSrc){restoreProviderGuideAudio(video,ctl);video.muted=false;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';return}
    video.dataset.voiceSync='preparing';
    const ctx=await ensureSceneVideoAudioContext();
    if(!ctx){restoreProviderGuideAudio(video,ctl);video.muted=false;video.dataset.voiceSync='source-fallback';return}
    try{if(ctx.state==='suspended')await ctx.resume()}catch{}
    ctl.track=await prepareSceneApprovedAudio(liveProject,liveScene);if(token!==ctl.token)return;
    if(!ctl.track?.tracks?.length){video.dataset.voiceSync='none';restoreProviderGuideAudio(video,ctl);video.muted=false;return}
    if(token!==ctl.token||!ctl.requestedPlay)return;
    muteProviderGuideAudio(video,ctl);
    for(const src of ctl.sources||[]){try{src.stop()}catch{}}ctl.sources=[];
    let offset=Math.max(0,Number(video.currentTime)||0);
    // Never cancel the user's native play gesture. If approved audio took long enough that
    // the first words would be skipped, rewind the already-playing element once instead.
    // Rewinding an element that is already playing is Firefox-safe and avoids autoplay blocks.
    if(offset>.35&&!video.paused&&video.dataset.voiceSyncRewound!=='1'){try{video.currentTime=0;offset=0;video.dataset.voiceSyncRewound='1'}catch{}}
    const now=ctx.currentTime+.05;
    for(const t of ctl.track.tracks){if(t.end<=offset)continue;const src=ctx.createBufferSource(),gain=ctx.createGain(),compressor=ctx.createDynamicsCompressor();src.buffer=t.buffer;compressor.threshold.value=-24;compressor.knee.value=18;compressor.ratio.value=3;gain.gain.value=1.24;src.connect(compressor);compressor.connect(gain);gain.connect(ctx.destination);const within=Math.max(0,offset-t.start),when=now+Math.max(0,t.start-offset);try{src.start(when,(t.trim||0)+within)}catch{}ctl.sources.push(src)}
    video.dataset.voiceSync='approved';
    // Prioritize immediate playback. Lip-sync generation/resume runs only after the approved
    // voice track is scheduled, so provider polling cannot delay the user's audio.
    if(sceneHasSpokenContent(liveScene)&&liveScene.videoUrl){
      ensureSceneLipSync(liveProject,liveScene,index,{quiet:true}).then(async url=>{if(!url||token!==ctl.token)return;const desiredSrc=normalizedMediaUrl(url);validatedLipSyncUrls.add(desiredSrc);const liveNow=liveSceneAt(index);if(liveNow.project&&liveNow.scene&&sceneHasValidatedLipSync(liveNow.project,liveNow.scene)){video.dataset.lipSyncReadyNextLoad='1';updateSceneMediaStatuses(liveNow.project,episodeOf(liveNow.project));if(video.ended){await adoptSceneLipSyncVideo(video,index,{resumeVideo:false,preserveTime:false});try{video.currentTime=0}catch{}updateSceneMediaStatuses(liveNow.project,episodeOf(liveNow.project))}}}).catch(e=>console.warn('[CineTale lipsync] Background synchronization failed',e));
    }
  }catch(e){restoreProviderGuideAudio(video,ctl);video.muted=false;console.warn('[CineTale scene audio] Approved-voice playback unavailable; source audio restored',e);video.dataset.voiceSync='source-fallback'}finally{ctl.preparing=false}
}

function scheduleStudioSceneAudioWarmup(project,episode){
  if(!project?.id||!episode||state.finalRenderRunning)return;
  const episodeId=episode.id||episode.number,key=`${project.id}:${episodeId}`;
  if(sceneAudioWarmups.has(key))return;
  const next=(episode.scenes||[]).find(scene=>scene?.videoUrl&&scene.finalIncluded!==false&&sceneHasSpokenContent(scene));
  if(!next)return;
  sceneAudioWarmups.add(key);
  setTimeout(async()=>{
    try{
      const liveProject=state.projects.find(x=>x.id===project.id),liveEpisode=findEpisodeById(liveProject,episodeId),liveScene=(liveEpisode?.scenes||[]).find(scene=>scene?.videoUrl&&scene.finalIncluded!==false&&sceneHasSpokenContent(scene));
      if(liveProject&&liveScene)await prepareSceneApprovedAudio(liveProject,liveScene);
    }catch(e){console.warn('[CineTale scene audio] Background approved-voice warmup unavailable',e)}
    finally{sceneAudioWarmups.delete(key)}
  },250);
}

const studioLipSyncWarmups=new Set();
const STUDIO_LIPSYNC_MIGRATION_REV='v1.9.62';
function authorizeUnsyncedSpeakingScenesOnStudioOpen(project,episode){
  if(!project?.id||!episode)return false;
  let changed=false;
  for(const scene of episode.scenes||[]){
    if(!scene?.videoUrl||scene.finalIncluded===false||!sceneHasSpokenContent(scene)||sceneHasValidatedLipSync(project,scene))continue;
    const signature=sceneLipSyncSignature(project,scene);
    const active=scene.lipSyncStatus==='processing'&&scene.lipSyncOperation&&scene.lipSyncSignature===signature;
    if(active)continue;
    if(scene.lipSyncStudioMigrationRev===STUDIO_LIPSYNC_MIGRATION_REV)continue;
    // v1.9.60 only auto-authorized clips created after that build was deployed. Existing
    // source clips (like a scene generated immediately before upgrade) could therefore sit
    // forever as "Video ready" without ever entering Sync Labs. Authorize each eligible
    // current-episode speaking source exactly once for this migration revision.
    scene.lipSyncStudioMigrationRev=STUDIO_LIPSYNC_MIGRATION_REV;
    scene.lipSyncAutoPending=true;
    if(scene.lipSyncStatus==='error'&&scene.lipSyncSignature===signature){
      scene.lipSyncStatus='pending';
      scene.lipSyncError=null;
      scene.lipSyncErrorCode='';
      scene.lipSyncSubmissionFailedAt=null;
      scene.lipSyncProviderStatus='';
      scene.lipSyncOperation=null;
      scene.lipSyncStatusUrl='';
      scene.lipSyncResponseUrl='';
    }
    changed=true;
  }
  if(changed){project.updatedAt=new Date().toISOString();save()}
  return changed;
}

function scheduleStudioLipSyncWarmup(project,episode){
  if(!project?.id||!episode||state.finalRenderRunning)return;
  if(previewSequenceLocks.has(previewSequenceKey(project,episode)))return;
  const episodeId=episode.id||episode.number,key=`${project.id}:${episodeId}`;
  if(studioLipSyncWarmups.has(key))return;
  const next=(episode.scenes||[]).map((scene,index)=>({scene,index})).find(({scene})=>scene?.videoUrl&&scene.finalIncluded!==false&&sceneHasSpokenContent(scene)&&!sceneHasValidatedLipSync(project,scene)&&!(scene.lipSyncStatus==='error'&&scene.lipSyncSignature===sceneLipSyncSignature(project,scene)));
  if(!next)return;
  studioLipSyncWarmups.add(key);
  setTimeout(async()=>{
    try{
      const liveProject=state.projects.find(x=>x.id===project.id),liveEpisode=findEpisodeById(liveProject,episodeId),liveScene=liveEpisode?.scenes?.[next.index];
      if(!liveProject||!liveScene?.videoUrl||!sceneHasSpokenContent(liveScene)||sceneHasValidatedLipSync(liveProject,liveScene))return;
      await ensureSceneLipSync(liveProject,liveScene,next.index,{quiet:true,allowSubmit:liveScene.lipSyncAutoPending===true});
    }catch(e){console.warn('[CineTale lipsync] Background dialogue finalization paused',e)}
    finally{
      studioLipSyncWarmups.delete(key);
      const liveProject=state.projects.find(x=>x.id===project.id),liveEpisode=findEpisodeById(liveProject,episodeId),list=$('#sceneList');
      if(current()?.id===project.id&&liveProject&&liveEpisode&&!sceneListPlaybackLocked(list))renderStudio();
      else if(liveProject&&liveEpisode)setTimeout(()=>scheduleStudioLipSyncWarmup(liveProject,liveEpisode),800);
    }
  },350);
}
function bindSceneVideoVoicePlayback(p,ep){
  const list=$('#sceneList');if(!list)return;
  list.querySelectorAll('video[data-scene-video-preview]').forEach(video=>{
    fitSceneVideoToSurface(video);
    const markSceneMediaLoaded=()=>{
      fitSceneVideoToSurface(video);
      video.dataset.sceneMediaLoading='0';
      video.closest?.('.scene-visual')?.classList.add('media-loaded');
      // A paused <video> without poster often stays black in Firefox even when it is valid.
      // Nudge to the first decodable frame so ready clips are visibly recognizable.
      if(video.paused&&video.readyState>=2&&Number.isFinite(video.duration)&&video.duration>.12&&Number(video.currentTime||0)===0){
        try{video.currentTime=Math.min(.08,video.duration/20)}catch{}
      }
    };
    video.addEventListener('loadedmetadata',markSceneMediaLoaded);
    video.addEventListener('loadeddata',markSceneMediaLoaded);
    video.addEventListener('canplay',markSceneMediaLoaded);
    if(video.readyState>=2)markSceneMediaLoaded();
    if(video.dataset.voiceBound==='1')return;video.dataset.voiceBound='1';const index=Number(video.dataset.sceneVideoPreview);const scene=ep?.scenes?.[index];if(!scene)return;
    if(video.dataset.syncGated==='1'){
      video.muted=true;
      video.removeAttribute('controls');
      video.dataset.voiceSync='waiting-for-render';
      return;
    }
    video.addEventListener('play',()=>{
      video.dataset.playerSession='1';
      let ctl=sceneVideoAudioControllers.get(video);if(!ctl){ctl={sources:[],token:0,requestedPlay:true,preparing:false,track:null,providerMuteApplied:false,previousMuted:Boolean(video.muted),adopting:false,gating:false};sceneVideoAudioControllers.set(video,ctl)}else ctl.requestedPlay=true;
      const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;
      const currentSrc=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||''),desired=sceneHasValidatedLipSync(liveProject,liveScene)?normalizedMediaUrl(liveScene.lipSyncVideoUrl||''):'';
      if(desired&&currentSrc===desired){restoreProviderGuideAudio(video,ctl);video.muted=false;video.dataset.voiceSync='provider';video.dataset.lipSyncReady='1';return}
      if(sceneHasSpokenContent(liveScene)){
        // Never pause a native user-initiated play event to wait for async TTS. Firefox can
        // reject a later programmatic resume after transient user activation has expired.
        // Keep picture playback alive, prepare approved audio, and align it to currentTime.
        muteProviderGuideAudio(video,ctl);
        if(!ctl.preparing)startSceneVideoVoicePlayback(video,liveProject,liveScene,index,{resumeVideo:false}).catch(()=>{});
      }
    });
    video.addEventListener('pause',()=>{const ctl=sceneVideoAudioControllers.get(video);if(ctl?.adopting)return;stopSceneVideoVoicePlayback(video,{keepIntent:false,restoreProviderAudio:true})});
    video.addEventListener('seeking',()=>{const ctl=sceneVideoAudioControllers.get(video);if(!ctl||ctl.adopting)return;const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;const desired=sceneHasValidatedLipSync(liveProject,liveScene)?normalizedMediaUrl(liveScene.lipSyncVideoUrl||''):'';if(desired&&normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||'')===desired)return;const shouldResume=!video.paused||ctl.requestedPlay;stopSceneVideoVoicePlayback(video,{keepIntent:shouldResume,restoreProviderAudio:!shouldResume});if(shouldResume){muteProviderGuideAudio(video,ctl);startSceneVideoVoicePlayback(video,liveProject,liveScene,index,{resumeVideo:true}).catch(()=>{})}});
    video.addEventListener('error',()=>{
      const live=liveSceneAt(index),liveProject=live.project||p,liveScene=live.scene||scene;if(!liveProject||!liveScene?.videoUrl)return;
      const failed=normalizedMediaUrl(video.currentSrc||video.getAttribute('src')||''),sync=normalizedMediaUrl(liveScene.lipSyncVideoUrl||''),source=normalizedMediaUrl(liveScene.videoUrl||'');
      if(sync&&failed===sync&&source&&source!==sync){markSceneLipSyncPlaybackError(liveProject.id,index,'Synchronized video failed to load; original scene restored.');video.src=liveScene.videoUrl;video.load();toast('Synchronized version could not load. The original scene was restored.')}
    });
    video.addEventListener('ended',async()=>{
      stopSceneVideoVoicePlayback(video,{restoreProviderAudio:true});
      const live=liveSceneAt(index);
      if(live.project&&live.scene&&sceneHasValidatedLipSync(live.project,live.scene)){await adoptSceneLipSyncVideo(video,index,{resumeVideo:false,preserveTime:false}).catch(()=>false);try{video.currentTime=0}catch{}}
      delete video.dataset.playerSession;updateSceneMediaStatuses(live.project||p,episodeOf(live.project||p));
      const list=$('#sceneList');if(list?.__cinetaleDeferredRender){list.__cinetaleDeferredRender=false;queueMicrotask(()=>renderStudio())}
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
function characterIndexForSpeaker(p,speaker=''){
  ensureCharacterIdentityIds(p);const key=normalizeSpeakerAlias(speaker);if(!key)return -1;
  let i=(p.characters||[]).findIndex(c=>normalizeSpeakerAlias(c.name)===key);if(i>=0)return i;
  const candidates=(p.characters||[]).map((c,index)=>({c,index,name:normalizeSpeakerAlias(c.name),role:normalizeSpeakerAlias(c.role)})).filter(x=>x.name.includes(key)||key.includes(x.name)||x.role===key);
  if(candidates.length===1)return candidates[0].index;
  const tokenMatches=(p.characters||[]).map((c,index)=>({index,tokens:normalizeSpeakerAlias(c.name).split(/\s+/).filter(Boolean)})).filter(x=>x.tokens.includes(key));
  return tokenMatches.length===1?tokenMatches[0].index:-1;
}
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
async function playSceneAudio(p,s){
  const items=await scenePlaybackItems(p,s);if(!items.length)return false;
  const narration=items.filter(x=>x.kind==='narration'),dialogue=items.filter(x=>x.kind==='dialogue');
  for(const item of narration)await speakText(item.text,item.voiceId,{...item,language:p.language});
  if(dialogue.length>=2&&dialogue.every(x=>x.voiceId&&!String(x.voiceId).startsWith('browser-'))){
    try{const payload={language:p.language,turns:dialogue.map(x=>({text:x.text,voiceId:x.voiceId,direction:x.direction}))};const d=await cachedAudioRequest('/api/dialogue',payload,'dialogue');if(d.mode==='ai'&&d.audio){if(!d.__cached)bumpUsage('audio');await playAudioUrl(d.audio);return true}}catch(e){console.warn('[CineTale audio] Natural dialogue endpoint unavailable; falling back to expressive per-line TTS',{message:e?.message||String(e)})}
  }
  for(const item of dialogue)await speakText(item.text,item.voiceId,{...item,language:p.language});
  return true;
}
async function listenScene(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s)return;$('#sceneList')?.querySelectorAll('video[data-scene-video-preview]').forEach(v=>{if(!v.paused)try{v.pause()}catch{}stopSceneVideoVoicePlayback(v)});const old=button?.textContent;if(button){button.disabled=true;button.classList.add('audio-loading');button.textContent='Preparing audio…'}
  const slowHint=setTimeout(()=>{if(button?.disabled)button.textContent='Generating natural voice…'},850);
  try{if(!await playSceneAudio(p,s)){toast('This scene has no spoken audio yet.');return}updateProject(x=>x.narrationPlayed=true)}catch{}finally{clearTimeout(slowHint);if(button){button.disabled=false;button.classList.remove('audio-loading');button.textContent=old||'▶ Listen'}}
}
async function narrateEpisode(){
  const p=current(),ep=episodeOf(p);if(!ep)return;
  try{for(const s of (ep.scenes||[]))await playSceneAudio(p,s);updateProject(x=>x.narrationPlayed=true);toast(`${formatConfig(p.format||'Episode').title} audio preview complete.`)}catch{}
}
function openSceneAudioEditor(index){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[index];if(!s)return;
  const lines=dialogueList(s.dialogue).join('\n');
  const sourceEntries=dialogueEntries(s.dialogue);
  const speakerIndexes=[...new Set(sourceEntries.map((line,lineIndex)=>resolveDialogueCharacterIndex(p,s,line,lineIndex)).filter(idx=>idx>=0))];
  const speakerButtons=speakerIndexes.map(idx=>`<button type="button" class="scene-speaker-voice" data-edit-scene-speaker="${idx}">Voice · ${esc(p.characters[idx].name)}</button>`).join('');
  const audioVoiceButtons=`<div class="scene-speaker-voices"><button type="button" class="scene-speaker-voice narrator" id="sceneNarratorVoice">Narrator voice</button>${speakerButtons}</div>`;
  $('#modalBody').innerHTML=`<form class="modal-form" id="sceneAudioForm"><h2>Edit performance</h2><p>Adjust the words, who speaks them, and how the moment should feel. Voice identity stays consistent unless you deliberately change it in Voice Studio.</p>${audioVoiceButtons}<label class="field"><span>Narration</span><textarea id="sceneNarration" placeholder="Optional narration">${esc(dialogueText(s.narration)||'')}</textarea></label><label class="field"><span>Dialogue · one speaker line per row</span><textarea id="sceneDialogue" rows="6" placeholder="Zoya: What is this?">${esc(lines)}</textarea></label><label class="field"><span>Scene performance direction</span><input id="sceneAudioDirection" value="${esc(s.audioDirection||sceneAudioDirection(s))}" placeholder="Quiet, uneasy curiosity; intimate, conversational"></label><label class="field"><span>Narrator style</span><input id="sceneNarrationStyle" value="${esc(s.narrationStyle||'warm, restrained storyteller; natural pacing')}" placeholder="Warm, restrained storyteller"></label><div class="modal-actions"><button type="button" class="ghost" id="sceneAudioCancel">Cancel</button><button type="button" class="ghost" id="sceneAudioPreview">Preview</button><button class="primary" type="submit">Save performance</button></div></form>`;
  $('#modal').classList.remove('hidden');$('#sceneAudioCancel').onclick=closeModal;$('#sceneNarratorVoice').onclick=()=>openNarratorVoicePicker();$$('[data-edit-scene-speaker]').forEach(b=>b.onclick=()=>openVoicePicker(Number(b.dataset.editSceneSpeaker)));
  $('#sceneAudioForm').onsubmit=e=>{e.preventDefault();const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);updateProject(x=>{const target=episodeOf(x)?.scenes?.[index];if(!target)return;target.narration=$('#sceneNarration').value.trim();target.dialogue=dialogue;target.audioDirection=$('#sceneAudioDirection').value.trim();target.narrationStyle=$('#sceneNarrationStyle').value.trim();bindSceneDialogueCharacters(x,target,{preserveExisting:true})});closeModal();toast('Scene dialogue and delivery saved. Character voice identity remains linked across scenes.')};
  $('#sceneAudioPreview').onclick=async()=>{const dialogue=$('#sceneDialogue').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const temp={...s,narration:$('#sceneNarration').value.trim(),dialogue,audioDirection:$('#sceneAudioDirection').value.trim(),narrationStyle:$('#sceneNarrationStyle').value.trim(),dialogueBindings:structuredClone(s.dialogueBindings||[])};bindSceneDialogueCharacters(p,temp,{preserveExisting:true});try{for(const item of await scenePlaybackItems(p,temp))await speakText(item.text,item.voiceId,{...item,language:p.language})}catch{}};
}
function selectedFinalScenes(ep){return (ep?.scenes||[]).map((s,i)=>({scene:s,index:i})).filter(x=>x.scene.finalIncluded!==false)}
function assemblySceneData(p,ep){return selectedFinalScenes(ep).map(({scene:s,index:i})=>{const sources=sceneVideoSources(s,p);return {index:i,number:s.number||i+1,title:s.title||`Scene ${i+1}`,durationSec:Number(s.durationSec)||0,narrativeBeatSec:Number(s.durationSec)||0,videoDurationSec:Number(s.videoDurationSec)||0,videoUrl:scenePrimaryVideoUrl(s,p)||null,coverageShotCount:sources.length,coveragePlanCount:sceneCoveragePlan(s,'balanced').length,videoUrls:sources,voiceSummary:sceneVoiceSummary(p,s),music:s.music||'',sfx:s.sfx||''}})}
function finalAssemblyManifest(p,ep){
  const scenes=assemblySceneData(p,ep),canon=Array.isArray(p?.worldBible?.canon)?p.worldBible.canon.filter(Boolean):[];
  return {
    version:2,
    preparedAt:new Date().toISOString(),
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
async function fetchVideoStatus(operation,{retries=4}={}){let last;for(let attempt=0;attempt<=retries;attempt++){try{const r=await fetch(`/api/video-status?operation=${encodeURIComponent(operation)}`);const d=await r.json().catch(()=>({}));if(r.ok)return d;last=new Error(d.error||`Video status failed (${r.status})`);if(!isTransientStatus(r.status)||attempt===retries)throw last}catch(e){last=e;if(attempt===retries)throw e}await sleep(Math.min(10000,1200*Math.pow(2,attempt)))}throw last||new Error('Video status failed')}
async function runPool(items,limit,worker){const queue=[...items],results=[],errors=[];const runners=Array.from({length:Math.max(1,Math.min(limit,queue.length||1))},async()=>{while(queue.length){const item=queue.shift();try{results.push(await worker(item))}catch(error){errors.push({item,error})}}});await Promise.all(runners);return {results,errors}}
function updateAutoFinalProgressUi(projectId,episodeId,message=''){if(current()?.id!==projectId)return;const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),selected=selectedFinalScenes(ep),ready=selected.filter(x=>sceneProductionReady(p,x.scene)).length,total=selected.length;if($('#finalReadiness'))$('#finalReadiness').textContent=`${ready} / ${total} selected clips ready`;if($('#finalAssemblyStatus'))$('#finalAssemblyStatus').textContent=`Automatic production · ${ready}/${total} clips ready${message?` · ${message}`:''}`;if(total)setFinalRenderProgress(Math.max(3,Math.min(88,8+Math.round((ready/total)*78))),message||`Generating selected clips · ${ready}/${total} ready`)}
function applyFinalVideoUi(p,ep,asset){
  const preview=$('#finalRenderPreview'),download=$('#downloadFinalVideo'),share=$('#shareFinalVideo'),placeholder=$('#finalVideoPlaceholder'),actions=$('#finalOutputActions'),hint=$('#finalOutputHint');
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
  const panel=$('#finalAssemblyPanel');if(!panel)return;const selected=selectedFinalScenes(ep),all=ep?.scenes||[],ready=selected.filter(x=>sceneProductionReady(p,x.scene)).length,total=selected.length,skipped=Math.max(0,all.length-total),cfg=formatConfig(p.format||'Episode'),job=p.autoFinalJob||null,approved=storyIsApproved(p,ep);
  $('#finalAssemblyTitle').textContent=`Final ${cfg.finalName}`;$('#finalReadiness').textContent=`${ready} / ${total} selected clips ready`;
  $('#finalAssemblyCopy').textContent=!total?`No scenes are selected. Include at least one scene.`:ready===total?`All selected scenes are ready. Click Create final video — CineTale will prepare, assemble, verify, and show the finished file below.`:`${Math.max(0,total-ready)} selected scene${total-ready===1?'':'s'} still need production finishing. ${skipped?`${skipped} scene${skipped===1?' is':'s are'} intentionally skipped. `:''}Click Create final video and CineTale will complete only the missing work.`;
  $('#finalAssemblyScenes').innerHTML=(all||[]).map((scene,i)=>{const included=scene.finalIncluded!==false,failed=job?.errors?.[String(i)];const productionReady=sceneProductionReady(p,scene),syncing=scene.videoUrl&&sceneHasSpokenContent(scene)&&!productionReady;const stateLabel=!included?'— SKIPPED':productionReady?'✓ READY':syncing?'◌ SYNCING':failed?'! RETRY':scene.videoOperation?'◌ RENDERING':'○ PENDING';const cls=!included?'skipped':productionReady?'ready':failed?'failed':'pending';return `<label class="final-scene-item ${cls}"><input type="checkbox" data-final-scene-toggle="${i}" ${included?'checked':''}><span>${stateLabel}</span><b>${String(scene.number||i+1).padStart(2,'0')} · ${esc(scene.title||`Scene ${i+1}`)}</b><small>${Number(scene.durationSec)||0}s narrative beat${scene.videoDurationSec?` · ${Number(scene.videoDurationSec)}s generated clip`:''}${scene.videoRoute==='efficient-fallback'?' · Efficient fallback used':''}${failed?` · ${esc(failed)}`:''}</small></label>`}).join('')||'<div class="final-scene-item pending"><b>No scenes yet</b></div>';
  $$('[data-final-scene-toggle]').forEach(cb=>cb.onchange=()=>setSceneFinalIncluded(Number(cb.dataset.finalSceneToggle),cb.checked));
  const prep=$('#prepareFinalAssembly'),preview=$('#previewFinalSequence'),download=$('#downloadAssemblyManifest'),render=$('#renderFinalVideo'),auto=$('#autoFinalVideo'),cancel=$('#cancelAutoFinalVideo');
  if(prep)prep.disabled=!approved||!(total&&ready===total);
  if(preview)preview.disabled=!ready;
  if(download)download.classList.add('hidden');
  if(render)render.disabled=!approved||!(total&&ready===total);
  if(auto){
    const key=finalVideoAssetKey(p,ep),hasPlayable=finalVideoAssets.has(key),restoreFailed=finalVideoRestoreFailures.has(key);
    auto.disabled=!approved||!total||state.autoFinalRunning||state.finalRenderRunning;
    auto.textContent=state.autoFinalRunning?'Creating scene assets…':state.finalRenderRunning?'Creating final video…':job&&['partial','paused','needs-attention'].includes(job.status)?'Resume final video':hasPlayable?'Recreate final video':restoreFailed?'Rebuild final video':'Create final video';
  }
  if(cancel)cancel.classList.toggle('hidden',!state.autoFinalRunning);
  const status=$('#finalAssemblyStatus');status.classList.toggle('ready',ready===total&&total>0);let statusText='';
  const finalKey=finalVideoAssetKey(p,ep),hasPlayableFinal=finalVideoAssets.has(finalKey),restoreFailed=finalVideoRestoreFailures.has(finalKey);
  if(state.finalRenderRunning)statusText='Creating the final video now. This local render runs in real time and can take about as long as the target episode. Keep this tab open; the finished video will appear in the Final Video box below.';
  else if(hasPlayableFinal)statusText='Final video verified and ready. Play it below, then Download or Share.';
  else if(restoreFailed)statusText='The previous final file is not available in this browser. The ready scene clips are preserved. Click Rebuild final video to assemble only the final file again.';
  else if(p.finalVideoMeta?.createdAt)statusText='Restoring the previously rendered final video from this browser…';
  else if(state.autoFinalRunning){const done=job?.completedCount??ready;statusText=`Creating final video · ${done}/${total} selected clips ready${job?.stage?` · ${job.stage}`:''}. Completed scene work is saved.`}
  else if(job&&['partial','paused','needs-attention'].includes(job.status)){const failedCount=Object.keys(job.errors||{}).length;statusText=`Production paused with ${ready}/${total} clips ready${failedCount?` and ${failedCount} item${failedCount===1?'':'s'} needing attention`:''}. Click Resume final video to continue only missing work.`}
  else if(!approved)statusText='Review and approve the complete story before starting production.';
  else statusText=total&&ready===total?'Ready. Click Create final video. The finished verified file will appear directly below.':'Manual scene generation is optional — Create final video can complete only the missing work.';
  status.textContent=statusText;
  if(!state.finalRenderRunning){
    if(job&&state.autoFinalRunning&&total){const pct=Math.max(2,Math.min(88,Math.round((ready/total)*78)+8));setFinalRenderProgress(pct,job.stage||`Creating scene assets · ${ready}/${total} ready`)}
    else if(!state.autoFinalRunning)setFinalRenderProgress(null,'');
    if(p.finalVideoMeta&&!finalVideoAssets.has(finalVideoAssetKey(p,ep))&&!finalVideoRestoreFailures.has(finalVideoAssetKey(p,ep)))restoreFinalVideoAsset(p,ep).catch(()=>{});
    else if(!p.finalVideoMeta)applyFinalVideoUi(p,ep,null);
  }
}

function prepareFinalAssembly({silent=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('prepare the final production'))return false;const scenes=selectedFinalScenes(ep);if(!scenes.length||scenes.some(x=>!sceneProductionReady(p,x.scene))){if(!silent)toast('Finish every selected scene, including dialogue synchronization for speaking scenes, or use Create final video.');return false}const manifest=finalAssemblyManifest(p,ep);updateProjectById(p.id,x=>{x.finalAssembly=manifest;x.renderStatus='ready';x.videoStatus='ready';x.finalVideoMeta=null},{render:false});if(!silent)toast('Final scene order prepared.');return true}
function playVideoElement(video){return new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=()=>reject(new Error('A scene clip could not be played.'));video.play().catch(reject)})}
const previewSequenceLocks=new Set();
function previewSequenceKey(project,episode){return `${project?.id||''}:${episode?.id||episode?.number||''}`}
async function previewFinalSequence(){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
  const previewKey=previewSequenceKey(p,ep);previewSequenceLocks.add(previewKey);
  const selected=selectedFinalScenes(ep);
  const playable=selected.filter(({scene})=>sceneHasSpokenContent(scene)?sceneHasValidatedLipSync(p,scene):Boolean(scenePrimaryVideoUrl(scene,p)||scene.videoUrl));
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
      const previewUrl=sceneHasSpokenContent(scene)?(sceneHasValidatedLipSync(liveProject,scene)?scene.lipSyncVideoUrl:''):(scenePrimaryVideoUrl(scene,liveProject)||scene.videoUrl);
      if(!previewUrl){console.warn('[CineTale preview] Finished asset is no longer available; skipping scene',{scene:index+1,title:scene?.title||''});continue}
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
  const sceneName=scene.title||`Scene ${index+1}`;
  setFinalRenderProgress(3+Math.round((index/Math.max(1,total))*12),`Checking scene ${index+1} of ${total} · ${sceneName}`);
  const ep=episodeOf(project),sceneIndex=Math.max(0,ep?.scenes?.indexOf(scene)??index);
  if(sceneHasSpokenContent(scene)&&scene.videoUrl&&!sceneHasValidatedLipSync(project,scene)){
    setFinalRenderProgress(3+Math.round((index/Math.max(1,total))*12),`Finishing dialogue sync for scene ${index+1} of ${total}`);
    await ensureSceneLipSync(project,scene,sceneIndex,{quiet:true});
  }
  const synced=sceneHasValidatedLipSync(project,scene),spoken=sceneHasSpokenContent(scene),sources=sceneVideoSources(scene,project),videos=[],failedSources=[];
  for(let sourceIndex=0;sourceIndex<sources.length;sourceIndex++){
    const url=sources[sourceIndex],v=document.createElement('video');v.preload='auto';v.playsInline=true;v.crossOrigin='anonymous';v.muted=true;
    try{await loadMediaWithRetry(v,url,{attempts:3,timeout:22000,label:`${sceneName} video`});videos.push(v)}
    catch(e){failedSources.push({url,error:e});console.warn('[CineTale final render] Skipping unavailable coverage source',{scene:sceneName,sourceIndex,error:e?.message||String(e)})}
  }
  if(!videos.length)throw new Error(`${sceneName} is marked ready, but its saved video file cannot be opened. The scene was not regenerated. Reload once; if it remains unavailable, regenerate only this scene.`);
  // Speaking scenes are production-ready only when their synchronized primary exists. The
  // synchronized file already contains the approved CineTale voice used to create lip sync.
  // Replaying cached TTS on top of that file can drift by hundreds of milliseconds, so the
  // synchronized file is the single source of truth for BOTH picture and speech in the final.
  if(spoken&&synced&&sources[0]&&failedSources.some(x=>normalizedMediaUrl(x.url)===normalizedMediaUrl(sources[0]))){
    throw new Error(`${sceneName}'s synchronized speaking clip is unavailable. CineTale stopped before creating an incorrect final video.`);
  }
  if(spoken&&!synced)throw new Error(`${sceneName} contains speech but does not have a validated synchronized clip. CineTale stopped before creating an out-of-sync final video.`);
  const primaryDuration=Math.max(.25,Number(videos[0]?.duration)||0),visualDuration=videos.reduce((sum,v)=>sum+Math.max(.25,Number(v.duration)||0),0),targetDuration=finalSceneTargetDuration(project,scene);
  // Never loop a generated clip merely to hit a requested runtime. A repeated 6–10 second
  // source was the cause of the visibly duplicated final video. Render each saved source at
  // most once. If there is less real coverage than the requested beat, the final runs shorter
  // rather than fabricating repeated footage. Never truncate the synchronized speaking primary.
  const requested=targetDuration>0?targetDuration:visualDuration;
  // A synchronized speaking clip is an atomic audio+picture unit. Do not continue into silent
  // coverage after its approved dialogue ends merely to pad the requested runtime. This was
  // the direct cause of 18–28 second silent holes in uploaded v1.9.75 final files.
  const sceneDuration=spoken&&synced?primaryDuration:Math.max(primaryDuration,Math.min(Math.max(primaryDuration,requested),visualDuration));
  return {scene,videos,visualDuration,targetDuration,sceneDuration,syncedAudio:spoken&&synced,useEmbeddedSyncedAudio:spoken&&synced};
}
function clearSceneLipSyncForIntegrityRepair(scene={},reason=''){
  const source=scene.videoUrl||'';
  resetSceneLipSyncForNewSource(scene,source);
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
  for(const item of selected){const s=item.scene,sourceFp=await fingerprint(s.videoUrl);if(sourceFp){const prev=sourceSeen.get(sourceFp);if(prev&&normalizedMediaUrl(prev.scene.videoUrl)!==normalizedMediaUrl(s.videoUrl))push('source-content',sourceFp,item,prev);else if(!prev)sourceSeen.set(sourceFp,item)}if(sceneHasValidatedLipSync(project,s)){const syncFp=await fingerprint(s.lipSyncVideoUrl);if(syncFp){const prev=syncSeen.get(syncFp);if(prev&&normalizedMediaUrl(prev.scene.lipSyncVideoUrl)!==normalizedMediaUrl(s.lipSyncVideoUrl))push('sync-content',syncFp,item,prev);else if(!prev)syncSeen.set(syncFp,item)}}}
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
  const {scene,videos,sceneDuration,useEmbeddedSyncedAudio}=asset;
  const videoGains=[];
  for(let i=0;i<videos.length;i++){
    try{
      const src=audioContext.createMediaElementSource(videos[i]),gain=audioContext.createGain();
      // Only the validated synchronized primary may contribute source audio. Coverage/raw
      // provider clips are always silent in the final. Do not leave the synchronized element
      // HTML-muted: some browsers apply that mute before MediaElementAudioSourceNode capture.
      videos[i].muted=!(useEmbeddedSyncedAudio&&i===0);
      gain.gain.value=0;
      src.connect(gain);gain.connect(audioDestination);videoGains.push(gain);
    }catch(e){console.warn('[CineTale final render] Video audio routing could not be connected',e);videoGains.push(null)}
  }
  const started=performance.now();let raf=0,activeVideo=videos[0];
  const paint=()=>{try{drawVideoFrame(ctx,activeVideo,canvas.width,canvas.height)}catch{}const elapsed=(performance.now()-started)/1000,remaining=sceneDuration-elapsed;if(remaining<.28){ctx.fillStyle=`rgba(8,6,20,${Math.max(0,Math.min(1,(.28-remaining)/.28))})`;ctx.fillRect(0,0,canvas.width,canvas.height)}raf=requestAnimationFrame(paint)};paint();
  let elapsed=0;
  for(let clipIndex=0;clipIndex<videos.length&&elapsed<sceneDuration-.02;clipIndex++){
    const remaining=Math.max(0,sceneDuration-elapsed),active=videos[clipIndex];activeVideo=active;
    for(let i=0;i<videoGains.length;i++)if(videoGains[i])videoGains[i].gain.value=useEmbeddedSyncedAudio&&i===0&&clipIndex===0?1:0;
    try{
      active.currentTime=0;
      await active.play();
      const playFor=Math.min(remaining,Math.max(.25,Number(active.duration)||0));
      await Promise.race([
        new Promise(resolve=>{const done=()=>{active.removeEventListener('ended',done);resolve()};active.addEventListener('ended',done,{once:true})}),
        sleep(playFor*1000)
      ]);
      active.pause();
      elapsed=(performance.now()-started)/1000;
    }catch(e){console.warn('[CineTale final render] Coverage clip playback skipped',e);await sleep(Math.min(remaining,1)*1000);elapsed=(performance.now()-started)/1000}
    setFinalRenderProgress(16+Math.round(((index+Math.min(1,elapsed/Math.max(.01,sceneDuration)))/total)*82),`Rendering scene ${index+1} of ${total} · ${scene.title||'Untitled'}`)
  }
  // If browser scheduling leaves a tiny tail, hold the LAST frame instead of replaying a clip.
  const tail=Math.max(0,sceneDuration-(performance.now()-started)/1000);if(tail>0)await sleep(tail*1000);
  cancelAnimationFrame(raf);videos.forEach(v=>v.pause());videoGains.forEach(g=>{try{if(g)g.gain.value=0}catch{}});ctx.fillStyle='#080614';ctx.fillRect(0,0,canvas.width,canvas.height);await sleep(80)
}

async function createFinalVideo(){
  const p=current(),ep=episodeOf(p);if(!p||!ep||state.finalRenderRunning||state.autoFinalRunning)return;
  if(!requireApprovedStory('create the final video'))return;
  const selected=selectedFinalScenes(ep);
  if(!selected.length){toast('Select at least one scene for the final video.');return}
  const allReady=selected.every(({scene})=>sceneProductionReady(p,scene));
  if(!allReady){return createFinalVideoAutomatically()}
  const conflicts=await duplicateFinalMediaConflicts(p,ep,{content:true});
  if(conflicts.length){toast('CineTale found duplicated scene media and will repair only the affected scene before final rendering.');return createFinalVideoAutomatically()}
  if(!p.finalAssembly?.preparedAt&&!prepareFinalAssembly({silent:true}))return;
  const key=finalVideoAssetKey(p,ep);
  finalVideoRestoreFailures.delete(key);
  return renderFinalVideoFile({autoPrepared:true});
}
async function renderFinalVideoFile({autoPrepared=false}={}){const p=current(),ep=episodeOf(p);if(!p||!ep||!requireApprovedStory('render the final video'))return;const selected=selectedFinalScenes(ep).map(x=>x.scene),scenes=selected.filter(s=>s.videoUrl);if(!p.finalAssembly?.preparedAt){if(!prepareFinalAssembly({silent:true})){toast('The final scene order could not be prepared.');return}}if(!scenes.length||scenes.length!==selected.length){toast('Every selected scene needs a generated video clip before final rendering.');return}const notReady=selected.filter(scene=>!sceneProductionReady(p,scene));if(notReady.length){toast('Final rendering is waiting for dialogue synchronization to finish on every selected speaking scene.');return}const duplicateConflicts=await duplicateFinalMediaConflicts(p,ep,{content:true});if(duplicateConflicts.length){const c=duplicateConflicts[0];toast(`Final render stopped: scenes ${c.otherIndex+1} and ${c.index+1} share the same media. Use Create final video so CineTale can repair only the duplicate scene.`);return}if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('This browser cannot create a local final video. Use current Chrome, Edge or another MediaRecorder-capable browser.');return}const button=$('#renderFinalVideo'),mainButton=$('#autoFinalVideo'),priorStoragePath=p.finalVideoMeta?.storagePath||'';state.finalRenderRunning=true;state.finalRenderProjectId=p.id;if(button){button.disabled=true;button.textContent='Rendering…'}if(mainButton){mainButton.disabled=true;mainButton.textContent='Creating final video…'}setFinalRenderProgress(2,'Preparing final video · keep this tab open.',{force:true});let recorder,audioContext,stream,url;try{const prepared=[];for(let i=0;i<scenes.length;i++)prepared.push(await prepareFinalSceneAsset(p,scenes[i],i,scenes.length));const isShort=(p.format||'')==='Short',width=isShort?720:1280,height=isShort?1280:720,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#080614';ctx.fillRect(0,0,width,height);audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();const audioDestination=audioContext.createMediaStreamDestination(),ambientGain=audioContext.createGain();ambientGain.gain.value=.24;ambientGain.connect(audioDestination);stream=canvas.captureStream(30);for(const t of audioDestination.stream.getAudioTracks())stream.addTrack(t);const mime=chooseFinalRecordingMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:isShort?5500000:6500000}:undefined);const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Final recording failed.'))});recorder.start(1000);await sleep(220);for(let i=0;i<prepared.length;i++)await playPreparedFinalScene({asset:prepared[i],index:i,total:prepared.length,canvas,ctx,audioContext,audioDestination,ambientGain});recorder.stop();await stopped;const actualMime=recorder.mimeType||mime||'video/webm',blob=new Blob(chunks,{type:actualMime});const verifiedDuration=await verifyFinalVideoBlob(blob);const key=finalVideoAssetKey(p,ep),filename=finalVideoFilename(p,actualMime),createdAt=new Date().toISOString();url=URL.createObjectURL(blob);const old=finalVideoAssets.get(key);if(old?.url)URL.revokeObjectURL(old.url);const meta={createdAt,mime:actualMime,size:blob.size,filename,sceneCount:scenes.length,durationSec:verifiedDuration,durationMode:'atomic-synced-scenes-no-silent-padding',pipelineVersion:10,storagePath:null,storageStatus:finalVideoStorageReady()?'saving':'browser-only'};await saveFinalVideoBlob(key,blob,meta).catch(e=>console.warn('[CineTale final render] Browser persistence unavailable',e));let persistence='browser';if(finalVideoStorageReady()){setFinalRenderProgress(98,'Saving final video to your CineTale account…',{force:true});try{meta.storagePath=await uploadFinalVideoCloud(p,ep,blob,filename,createdAt);meta.storageStatus='saved';persistence='cloud';if(priorStoragePath&&priorStoragePath!==meta.storagePath)deleteFinalVideoCloudPaths([priorStoragePath]).catch(e=>console.warn('[CineTale final render] Previous cloud final could not be removed',e))}catch(e){meta.storageStatus='browser-only';meta.storageError=String(e?.message||e).slice(0,220);console.warn('[CineTale final render] Cloud persistence unavailable; browser copy retained',e)}}await saveFinalVideoBlob(key,blob,meta).catch(()=>{});const asset={blob,url,mime:actualMime,filename,duration:verifiedDuration,persistence};finalVideoAssets.set(key,asset);finalVideoRestoreFailures.delete(key);updateProjectById(p.id,x=>{x.finalVideoMeta=meta;x.renderStatus='final-video-ready';x.autoFinalJob=null},{render:false});setFinalRenderProgress(100,persistence==='cloud'?'Final video saved — play it below.':'Final video ready in this browser — play it below.',{force:true});if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderWorkflow(liveProject);renderFinalAssembly(liveProject,liveEpisode);applyFinalVideoUi(liveProject,liveEpisode,asset)}toast(persistence==='cloud'?'Final video created and saved to your CineTale account.':'Final video created. It is saved in this browser; sign in to keep future final videos with your account.');setTimeout(()=>setFinalRenderProgress(null,''),1200)}catch(e){console.error('[CineTale final render]',e);setFinalRenderProgress(null,'');autoFinalJobPatch(p.id,{status:'needs-attention',stage:'Final render needs attention',lastError:e.message||String(e)});toast(e.message||'Final video rendering failed.')}finally{try{stream?.getTracks().forEach(t=>t.stop())}catch{}try{await audioContext?.close()}catch{}state.finalRenderRunning=false;state.finalRenderProjectId=null;if(button){button.disabled=false;button.textContent='Render full video'}if(mainButton){mainButton.disabled=false;mainButton.textContent='Create final video'}if(current()?.id===p.id){const liveProject=state.projects.find(x=>x.id===p.id)||p,liveEpisode=findEpisodeById(liveProject,ep.id||ep.number)||episodeOf(liveProject);renderFinalAssembly(liveProject,liveEpisode)}}}
function currentFinalVideoAsset(){const p=current(),ep=episodeOf(p);return p&&ep?finalVideoAssets.get(finalVideoAssetKey(p,ep)):null}
function downloadFinalVideoFile(){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const a=document.createElement('a');a.href=asset.url;a.download=asset.filename||finalVideoFilename(p,asset.mime);document.body.appendChild(a);a.click();a.remove()}
async function shareFinalVideoFile(){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const file=new File([asset.blob],asset.filename||finalVideoFilename(p,asset.mime),{type:asset.mime||asset.blob.type});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({title:p.title||'CineTale',text:`${p.title||'CineTale'} — created in CineTale`,files:[file]});return}catch(e){if(e?.name==='AbortError')return}}downloadFinalVideoFile();toast('Your browser cannot share video files directly, so CineTale downloaded the final video instead.')}
function publishFinalVideo(platform){const p=current(),asset=currentFinalVideoAsset();if(!p||!asset?.blob){toast('Render the final video first.');return}const destinations={youtube:'https://www.youtube.com/upload',instagram:'https://www.instagram.com/',tiktok:'https://www.tiktok.com/upload',facebook:'https://www.facebook.com/'};const url=destinations[platform];if(!url)return;downloadFinalVideoFile();window.open(url,'_blank','noopener,noreferrer');toast(`Final video downloaded. ${platform==='youtube'?'YouTube':platform==='instagram'?'Instagram':platform==='tiktok'?'TikTok':'Facebook'} opened so you can review and publish it.`)}
function downloadFinalAssemblyManifest(){const p=current(),ep=episodeOf(p);if(!p)return;const manifest=p.finalAssembly||finalAssemblyManifest(p,ep);const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(p.title||'cinetale').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-final-assembly.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const videoPollers=new Map();
function videoPollKey(projectId,episodeId,sceneIndex){return `${projectId}:${episodeId||'active'}:${sceneIndex}`}
function videoElapsedLabel(startedAt){const sec=Math.max(0,Math.floor((Date.now()-Number(startedAt||Date.now()))/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`}
async function pollVideo(i,operation,button,{background=false}={}){
  const initial=current(),initialEp=episodeOf(initial);if(!initial||!initialEp)return;
  const projectId=initial.id,episodeId=initialEp.id||initialEp.number,key=videoPollKey(projectId,episodeId,i);
  if(videoPollers.has(key))return videoPollers.get(key);
  const job=(async()=>{
    for(let attempt=0;attempt<72;attempt++){
      const live=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(live,episodeId),scene=liveEp?.scenes?.[i];
      if(!scene||scene.videoOperation!==operation)return;
      const started=scene.videoQueuedAt||Date.now();
      if(button&&!background){button.textContent=`Rendering… ${videoElapsedLabel(started)}`}
      const waitMs=attempt<4?6500:Math.min(15000,9000+attempt*250);
      await new Promise(r=>setTimeout(r,waitMs));
      const r=await fetch(`/api/video-status?operation=${encodeURIComponent(operation)}`),d=await r.json();
      if(!r.ok)throw new Error(d.error||'Video status failed');
      if(d.status==='ready'){
        confirmedVideoOperations.delete(operation);
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId);if(!e?.scenes?.[i])return;const target=e.scenes[i];if(target.videoOperation!==operation)return;target.videoUrl=d.videoUrl;target.videoOperation=null;target.videoQueuedAt=null;target.videoError=null;target.videoPlaybackError=null;resetSceneLipSyncForNewSource(target,d.videoUrl);x.videoStatus='ready';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});
        if(current()?.id===projectId)renderStudio();toast('Scene video clip is ready.');scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,i);return;
      }
      if(d.status==='error'){
        confirmedVideoOperations.delete(operation);
        updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=d.error||'Video generation failed'}},{render:false});
        if(current()?.id===projectId)renderStudio();throw new Error(d.error||'Video generation failed');
      }
    }
    confirmedVideoOperations.delete(operation);
    updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[i];if(target&&target.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError='Video rendering timed out. Your previous clip was preserved; try Regenerate clip again.'}},{render:false});
    if(current()?.id===projectId)renderStudio();throw new Error('Video rendering timed out. Your previous clip was preserved; try Regenerate clip again.');
  })().finally(()=>videoPollers.delete(key));
  videoPollers.set(key,job);return job;
}
async function reconcileSavedVideoOperation(i,scene){
  const p=current(),ep=episodeOf(p);if(!p||!ep||!scene?.videoOperation)return;
  const operation=scene.videoOperation;
  if(confirmedVideoOperations.has(operation)||recoveringVideoOperations.has(operation))return;
  recoveringVideoOperations.add(operation);
  try{
    const age=Date.now()-Number(scene.videoQueuedAt||0);
    if(scene.videoQueuedAt&&age>VIDEO_RECOVERY_MAX_AGE_MS){
      updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError='A saved video render expired before it could be confirmed. Your previous clip was preserved.'}});
      return;
    }
    const d=await fetchVideoStatus(operation,{retries:1});
    if(d.status==='ready'){
      updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(!target||target.videoOperation!==operation)return;target.videoUrl=d.videoUrl;target.videoOperation=null;target.videoQueuedAt=null;target.videoError=null;target.videoPlaybackError=null;resetSceneLipSyncForNewSource(target,d.videoUrl);x.videoStatus='ready';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null});
      toast('Saved video render recovered.');scheduleSceneLipSyncAfterSourceReady(p.id,ep.id||ep.number,i);
      return;
    }
    if(d.status==='error'||d.status==='failed'||d.status==='not_found'){
      updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=d.error||'The saved video render is no longer active. Your previous clip was preserved.'}});
      return;
    }
    if(d.status==='processing'||d.status==='pending'||d.status==='running'||d.done===false){
      confirmedVideoOperations.add(operation);
      renderStudio();
      pollVideo(i,operation,null,{background:true}).catch(e=>toast(e.message||'Video generation failed'));
      return;
    }
    updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError='CineTale could not confirm that the saved video render is still active. Your previous clip was preserved.'}});
  }catch(e){
    updateProject(x=>{const target=episodeOf(x)?.scenes?.[i];if(target?.videoOperation===operation){target.videoOperation=null;target.videoQueuedAt=null;target.videoError='CineTale could not verify the saved video render. Your previous clip was preserved.'}});
  }finally{
    recoveringVideoOperations.delete(operation);
  }
}
function resumePendingVideoPolls(){
  const p=current(),ep=episodeOf(p);if(!p||!ep)return;
  (ep.scenes||[]).forEach((s,i)=>{if(s.videoOperation)reconcileSavedVideoOperation(i,s)});
}
async function requestVideo(i,button){
  const p=current(),ep=episodeOf(p),s=ep?.scenes?.[i];if(!s||!requireApprovedStory('generate video'))return;
  const old=button.textContent;button.disabled=true;
  try{
    if(s.videoOperation){toast('CineTale is checking the saved video render before starting another one.');reconcileSavedVideoOperation(i,s);return}
    button.textContent='Submitting…';
    const primaryShot=primaryCoverageShot(s,'balanced');
    const videoScene=sceneForVideoShot(s,primaryShot);
    const primaryMeta=speakingVideoMeta(primaryShot);
    const d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:normalizedTier(s.tier)!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,characters:p.characters,worldBible:p.worldBible},scene:videoScene});
    if(d.status==='not_configured'){toast('Live video is off. In Vercel set ENABLE_LIVE_VIDEO=true; CineTale will use your existing GEMINI_API_KEY for Veo.');return}
    if(d.operation){
      confirmedVideoOperations.add(d.operation);
      bumpUsage('video');
      updateProject(x=>{const e=episodeOf(x);if(!e?.scenes?.[i])return;Object.assign(e.scenes[i],primaryMeta);e.scenes[i].videoOperation=d.operation;e.scenes[i].videoQueuedAt=Date.now();e.scenes[i].videoError=null;e.scenes[i].videoPlaybackError=null;e.scenes[i].videoModel=d.model||null;e.scenes[i].videoDurationSec=Number(d.durationSeconds)||e.scenes[i].videoDurationSec||0;e.scenes[i].videoRoute=d.fallbackFrom?'efficient-fallback':'requested-quality';e.scenes[i].videoFallbackFrom=d.fallbackFrom||null;e.scenes[i].videoSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);});
      toast('Video rendering started. You can keep working while CineTale finishes it.');
      // Do not lock the interface while Veo renders. Poll in the background.
      pollVideo(i,d.operation,null,{background:true}).catch(e=>toast(e.message||'Video generation failed'));
      return;
    }
    if(d.videoUrl){bumpUsage('video');updateProject(x=>{const e=episodeOf(x),target=e.scenes[i];Object.assign(target,primaryMeta);target.videoUrl=d.videoUrl;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);resetSceneLipSyncForNewSource(target,d.videoUrl);x.videoStatus='ready';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null});toast(primaryMeta.videoPrimarySpeaking?'Speaking shot is ready.':'Scene video is ready.');scheduleSceneLipSyncAfterSourceReady(p.id,ep.id||ep.number,i);return}
    toast('Video job submitted.');
  }catch(e){
    if(Number(e?.status)===429||e?.code==='VIDEO_QUOTA'){
      const retry=Math.max(20,Math.min(300,Number(e?.details?.retryAfterSeconds)||60));
      updateProjectById(p.id,x=>{const epx=findEpisodeById(x,ep.id||ep.number),target=epx?.scenes?.[i];if(target){target.videoRetryAt=Date.now()+retry*1000;target.videoError=videoQuotaMessage(e)}},{render:false});
      toast(`Google video generation is temporarily limited. CineTale retried safely${normalizedTier(s.tier)!=='premium'?' and tried the efficient Veo route':''}. Your scene is safe; try again in about ${retry} seconds.`);
      setTimeout(()=>{const live=state.projects.find(x=>x.id===p.id),liveEp=findEpisodeById(live,ep.id||ep.number),target=liveEp?.scenes?.[i];if(target&&Number(target.videoRetryAt||0)<=Date.now()){target.videoRetryAt=null;save();if(current()?.id===p.id)renderStudio()}},retry*1000+250);
    }else toast(e.message||'Video generation failed')
  }finally{button.disabled=false;button.textContent=old;renderStudio()}
}

function autoFinalTier(mode){return mode==='fast'?'draft':mode==='cinematic'?'premium':'standard'}
function videoQuotaMessage(error){const raw=String(error?.message||error||'').trim();if(Number(error?.status)===429||/quota|rate limit|too many requests|resource exhausted/i.test(raw)){if(/per day|daily|rpd|current quota/i.test(raw))return 'Video quota is currently exhausted. Completed clips are safe. Resume later, skip the remaining scene, or use an efficient fallback when available.';return 'Video generation is temporarily rate-limited. CineTale will protect completed work and retry at a safer pace.'}return raw||'Video generation failed.'}
async function waitForAutoVideoSubmissionSlot(onProgress){const windowMs=60000,maxPerWindow=2;while(true){const now=Date.now();state.autoVideoSubmissionTimes=state.autoVideoSubmissionTimes.filter(ts=>now-ts<windowMs);if(state.autoVideoSubmissionTimes.length<maxPerWindow){state.autoVideoSubmissionTimes.push(now);return}const wait=Math.max(900,windowMs-(now-state.autoVideoSubmissionTimes[0])+800);onProgress?.(`Preparing next scene · starts in ${Math.ceil(wait/1000)}s`);await sleep(Math.min(wait,5000));if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.')}}
function findEpisodeById(p,id){return (p?.episodes||[]).find(e=>String(e.id||e.number)===String(id))||episodeOf(p)}
async function waitForAutoVideo(projectId,episodeId,index,operation,onProgress){let consecutiveErrors=0;for(let attempt=0;attempt<96;attempt++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');const p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(scene?.videoUrl)return scene.videoUrl;if(!scene)throw new Error('A selected scene is no longer available.');onProgress?.(`Rendering scene ${scene.number||index+1} · ${videoElapsedLabel(scene.videoQueuedAt||Date.now())}`);await sleep(attempt<6?4500:Math.min(10000,6500+attempt*120));let d;try{d=await fetchVideoStatus(operation,{retries:3});consecutiveErrors=0}catch(e){consecutiveErrors++;if(consecutiveErrors<4){onProgress?.(`Temporary provider delay on scene ${scene.number||index+1}; retrying…`);continue}throw e}if(d.status==='ready'){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(!target)return;target.videoUrl=d.videoUrl;target.videoOperation=null;target.videoQueuedAt=null;target.videoError=null;resetSceneLipSyncForNewSource(target,d.videoUrl);x.videoStatus='ready';x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,index);return d.videoUrl}if(d.status==='error'){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target){target.videoOperation=null;target.videoQueuedAt=null;target.videoError=d.error||'Video generation failed'}},{render:false});throw new Error(d.error||'Video generation failed')}}throw new Error('Video is still rendering. CineTale saved the pending render so you can resume later.')}
async function submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene could not be found.');if(scene.videoUrl||scene.videoOperation)return scene.videoUrl||scene.videoOperation;updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target){target.tier=tier;target.videoError=null}},{render:false});p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];const primaryShot=primaryCoverageShot(scene,coverageModeFromAuto('balanced')),videoScene=sceneForVideoShot(scene,primaryShot),primaryMeta=speakingVideoMeta(primaryShot);onProgress?.(`Submitting scene ${scene.number||index+1}${primaryMeta.videoPrimarySpeaking?' · speaking shot':''}…`);await waitForAutoVideoSubmissionSlot(onProgress);let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:tier!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,characters:p.characters,worldBible:p.worldBible},scene:videoScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');if(d.videoUrl){bumpUsage('video');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(target){Object.assign(target,primaryMeta);target.videoUrl=d.videoUrl;target.videoOperation=null;target.videoQueuedAt=null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);resetSceneLipSyncForNewSource(target,d.videoUrl)}x.videoStatus='ready'},{render:false});scheduleSceneLipSyncAfterSourceReady(projectId,episodeId,index);return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a render job.');bumpUsage('video');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[index];if(!target)return;Object.assign(target,primaryMeta);target.videoOperation=d.operation;target.videoQueuedAt=Date.now();target.videoModel=d.model||null;target.videoDurationSec=Number(d.durationSeconds)||target.videoDurationSec||0;target.videoRoute=d.fallbackFrom?'efficient-fallback':'requested-quality';target.videoFallbackFrom=d.fallbackFrom||null;target.videoSpeechGuide=Boolean(d.speaking||primaryMeta.videoPrimarySpeaking);target.videoError=null},{render:false});return d.operation}
async function ensureAutoSceneVideo(projectId,episodeId,index,tier,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[index];if(!scene)throw new Error('A selected scene could not be found.');if(scene.videoUrl)return scene.videoUrl;if(!scene.videoOperation)await submitAutoSceneVideo(projectId,episodeId,index,tier,onProgress);p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[index];if(scene.videoUrl)return scene.videoUrl;if(!scene.videoOperation)throw new Error('The scene video job could not be started.');return waitForAutoVideo(projectId,episodeId,index,scene.videoOperation,onProgress)}

function coverageModeFromAuto(mode){return mode==='cinematic'?'cinematic':mode==='fast'?'fast':'balanced'}
function coverageEntry(scene,shotId){return coverageClips(scene).find(x=>x?.shotId===shotId)||null}
async function waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,operation,onProgress){for(let attempt=0;attempt<96;attempt++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex],entry=coverageEntry(scene,shot.id);if(entry?.videoUrl)return entry.videoUrl;if(!scene)throw new Error('A scene disappeared while cinematic coverage was rendering.');onProgress?.(`Rendering coverage shot ${shot.order} for scene ${scene.number||sceneIndex+1} · ${videoElapsedLabel(entry?.queuedAt||Date.now())}`);await sleep(attempt<6?4500:Math.min(10000,6500+attempt*120));const d=await fetchVideoStatus(operation,{retries:3});if(d.status==='ready'){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;target.coverageClips=Array.isArray(target.coverageClips)?target.coverageClips:[];const item=target.coverageClips.find(c=>c.shotId===shot.id);if(item){item.videoUrl=d.videoUrl;item.operation=null;item.queuedAt=null;item.error=null}else target.coverageClips.push({shotId:shot.id,order:shot.order,videoUrl:d.videoUrl,durationSec:Number(shot.targetClipSec)||0});x.finalAssembly=null;x.renderStatus=null;x.finalVideoMeta=null},{render:false});return d.videoUrl}if(d.status==='error')throw new Error(d.error||'Coverage video generation failed')}throw new Error('A cinematic coverage shot is still rendering. Completed work was saved so you can resume later.')}
async function ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene)throw new Error('A selected scene could not be found.');const plan=ensureSceneCoverage(scene,coverageModeFromAuto(mode)),shot=plan[shotIndex];if(!shot)return null;const primary=primaryCoverageShot(scene,coverageModeFromAuto(mode)),primaryId=scene.videoPrimaryShotId||primary?.id||plan[0]?.id;if(shot.id===primaryId)return ensureAutoSceneVideo(projectId,episodeId,sceneIndex,tier,onProgress);let entry=coverageEntry(scene,shot.id);if(entry?.videoUrl)return entry.videoUrl;if(!entry?.operation){onProgress?.(`Planning shot ${shot.order}/${plan.length} for scene ${scene.number||sceneIndex+1}…`);await waitForAutoVideoSubmissionSlot(onProgress);const shotScene={...scene,coverageShot:shot,visual:shot.visual||scene.visual,camera:shot.camera||scene.camera,dialogue:shot.speaking&&shot.spokenLine?[`${shot.speaker||''}: ${shot.spokenLine}`]:[],narration:''};let d;try{d=await apiPost('/api/video-job',{projectId:p.id,episode:ep.number,allowQualityFallback:tier!=='premium',project:{title:p.title,format:p.format,style:projectStyle(p),culturalTreatment:p.culturalTreatment,characters:p.characters,worldBible:p.worldBible},scene:shotScene})}catch(e){throw new Error(videoQuotaMessage(e))}if(d.status==='not_configured')throw new Error('Live video is not enabled. Set ENABLE_LIVE_VIDEO=true in Vercel and redeploy.');bumpUsage('video');if(d.videoUrl){updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;target.coverageClips=Array.isArray(target.coverageClips)?target.coverageClips:[];target.coverageClips.push({shotId:shot.id,order:shot.order,videoUrl:d.videoUrl,durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});return d.videoUrl}if(!d.operation)throw new Error('The video provider did not return a coverage render job.');updateProjectById(projectId,x=>{const e=findEpisodeById(x,episodeId),target=e?.scenes?.[sceneIndex];if(!target)return;target.coverageClips=Array.isArray(target.coverageClips)?target.coverageClips:[];target.coverageClips.push({shotId:shot.id,order:shot.order,operation:d.operation,queuedAt:Date.now(),durationSec:Number(d.durationSeconds)||Number(shot.targetClipSec)||0,model:d.model||null,speaking:Boolean(shot.speaking),speaker:shot.speaker||'',spokenLine:shot.spokenLine||'',speechGuide:Boolean(d.speaking||shot.speaking)})},{render:false});entry={operation:d.operation}}
  p=state.projects.find(x=>x.id===projectId);ep=findEpisodeById(p,episodeId);scene=ep?.scenes?.[sceneIndex];entry=coverageEntry(scene,shot.id);if(entry?.videoUrl)return entry.videoUrl;if(!entry?.operation)throw new Error('The cinematic coverage job could not be started.');return waitForCoverageVideo(projectId,episodeId,sceneIndex,shot,entry.operation,onProgress)}
async function ensureCinematicCoverage(projectId,episodeId,indices,tier,mode,onProgress){const coverageMode=coverageModeFromAuto(mode);if(coverageMode==='fast')return;for(const sceneIndex of indices){let p=state.projects.find(x=>x.id===projectId),ep=findEpisodeById(p,episodeId),scene=ep?.scenes?.[sceneIndex];if(!scene||scene.finalIncluded===false)continue;const target=coverageTargetCount(scene,coverageMode);for(let shotIndex=0;shotIndex<target;shotIndex++){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');await ensureAutoCoverageShot(projectId,episodeId,sceneIndex,shotIndex,tier,mode,onProgress)}}}
function autoFinalLockKey(projectId){return `cinetale.final.lock.${projectId}`}
function acquireAutoFinalLock(projectId){const key=autoFinalLockKey(projectId),now=Date.now();try{const old=safeParse(localStorage.getItem(key),null);if(old&&now-Number(old.ts||0)<90000)return null;const token=uid('final');localStorage.setItem(key,JSON.stringify({token,ts:now}));return token}catch{return uid('final')}}
function releaseAutoFinalLock(projectId,token){try{const key=autoFinalLockKey(projectId),old=safeParse(localStorage.getItem(key),null);if(!old||old.token===token)localStorage.removeItem(key)}catch{}}
function cancelAutoFinalProduction(){if(!state.autoFinalRunning)return;state.autoFinalCancelRequested=true;const p=current();if(p)autoFinalJobPatch(p.id,{status:'paused',stage:'Pausing after the current provider check…'});toast('Pausing automatic production. Completed clips will be kept.')}
async function createFinalVideoAutomatically({resume=false}={}){const p=current(),ep=episodeOf(p),button=$('#autoFinalVideo'),mode=resume?(p?.autoFinalJob?.mode||$('#autoFinalMode')?.value||'balanced'):($('#autoFinalMode')?.value||'balanced');if(!p||!ep||state.autoFinalRunning)return;if(!requireApprovedStory('create the final video'))return;const lock=acquireAutoFinalLock(p.id);if(!lock){toast('Automatic final production is already running for this project in this browser.');return}const selected=selectedFinalScenes(ep);if(!selected.length){releaseAutoFinalLock(p.id,lock);toast('Select at least one scene for the final video.');return}const missing=selected.filter(x=>!x.scene.videoUrl);const label=mode==='fast'?'Fast / efficient':mode==='cinematic'?'Cinematic':'Balanced',coverageMode=coverageModeFromAuto(mode),extraCoverage=selected.reduce((sum,x)=>sum+Math.max(0,coverageTargetCount(x.scene,coverageMode)-sceneVideoSources(x.scene).length),0);if(!resume&&!confirm(`Create the final video automatically?\n\n${selected.length} scene${selected.length===1?'':'s'} selected · ${missing.length} primary clip${missing.length===1?'':'s'} need generation · ${extraCoverage} additional cinematic coverage shot${extraCoverage===1?'':'s'} planned · ${label} quality.\n\nCineTale will generate only missing work, add varied coverage so long dialogue/narration does not sit on one frozen clip, use approved voices, assemble the shots in order, and render one final video. Speaking shots use natural visible mouth performance while the approved voice remains the audio source. Generation credits may be used.`)){releaseAutoFinalLock(p.id,lock);return}state.autoFinalRunning=true;state.autoFinalCancelRequested=false;if(button){button.disabled=true;button.textContent='Creating final video…'}const projectId=p.id,episodeId=ep.id||ep.number,tier=autoFinalTier(mode),indices=selected.map(x=>x.index);autoFinalJobPatch(projectId,{status:'running',mode,startedAt:p.autoFinalJob?.startedAt||new Date().toISOString(),stage:'Submitting missing scene videos…',sceneIndexes:indices,errors:{},completedCount:selected.length-missing.length});try{renderFinalAssembly(p,ep);for(const {index} of missing){if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');try{await submitAutoSceneVideo(projectId,episodeId,index,tier,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)})}catch(e){updateProjectById(projectId,x=>{const job=x.autoFinalJob||{};job.errors={...(job.errors||{}),[String(index)]:videoQuotaMessage(e)};x.autoFinalJob=job},{render:false})}await sleep(180)}const liveAfterSubmit=state.projects.find(x=>x.id===projectId),liveEpAfter=findEpisodeById(liveAfterSubmit,episodeId),pollIndices=indices.filter(i=>{const s=liveEpAfter?.scenes?.[i];return s&&s.finalIncluded!==false&&!s.videoUrl});const {errors}=await runPool(pollIndices,2,async index=>{const live=state.projects.find(x=>x.id===projectId),e=findEpisodeById(live,episodeId),s=e?.scenes?.[index];if(!s)return;return ensureAutoSceneVideo(projectId,episodeId,index,tier,msg=>{const now=state.projects.find(x=>x.id===projectId),ne=findEpisodeById(now,episodeId),r=selectedFinalScenes(ne).filter(x=>x.scene.videoUrl).length;autoFinalJobPatch(projectId,{stage:msg,completedCount:r});updateAutoFinalProgressUi(projectId,episodeId,msg)})});if(errors.length){updateProjectById(projectId,x=>{const job=x.autoFinalJob||{};const map={...(job.errors||{})};for(const item of errors)map[String(item.item)]=videoQuotaMessage(item.error);x.autoFinalJob={...job,status:'needs-attention',errors:map,stage:'Some clips need attention'}},{render:false})}const live=state.projects.find(x=>x.id===projectId),liveEp=findEpisodeById(live,episodeId),selectedNow=selectedFinalScenes(liveEp),remaining=selectedNow.filter(x=>!x.scene.videoUrl);if(state.autoFinalCancelRequested){autoFinalJobPatch(projectId,{status:'paused',stage:'Paused — completed clips were saved',completedCount:selectedNow.length-remaining.length});toast('Automatic production paused. Completed clips were saved.');return}if(remaining.length){autoFinalJobPatch(projectId,{status:'needs-attention',stage:`${remaining.length} selected clip${remaining.length===1?'':'s'} still need attention`,completedCount:selectedNow.length-remaining.length});throw new Error(`${remaining.length} selected clip${remaining.length===1?'':'s'} could not finish. Completed work was saved. Resume later to retry only the missing work, or uncheck a scene to render without it.`)}
// Integrity gate: two different scenes must never silently share the same source or synchronized file.
// Repair only the later duplicate scene, preserving all unique READY work.
await repairDuplicateFinalMedia(projectId,episodeId,tier,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)});
const integrityProject=state.projects.find(x=>x.id===projectId),integrityEpisode=findEpisodeById(integrityProject,episodeId);
// A generated source video is not production-ready when the scene contains speech.
// Final assembly must wait for the canonical synchronized asset before any final render starts.
const syncTargets=selectedFinalScenes(integrityEpisode).filter(x=>x.scene?.videoUrl&&sceneHasSpokenContent(x.scene)&&!sceneHasValidatedLipSync(integrityProject,x.scene));
for(const {index} of syncTargets){
  if(state.autoFinalCancelRequested)throw new Error('Automatic production was paused by the creator.');
  const lp=state.projects.find(x=>x.id===projectId),le=findEpisodeById(lp,episodeId),ls=le?.scenes?.[index];
  if(!lp||!ls||sceneHasValidatedLipSync(lp,ls))continue;
  const label=`Synchronizing dialogue for scene ${ls.number||index+1}…`;
  autoFinalJobPatch(projectId,{stage:label});updateAutoFinalProgressUi(projectId,episodeId,label);
  const syncedUrl=await ensureSceneLipSync(lp,ls,index,{quiet:true,allowSubmit:true});
  const after=state.projects.find(x=>x.id===projectId),afterEp=findEpisodeById(after,episodeId),afterScene=afterEp?.scenes?.[index];
  if(!syncedUrl||!after||!afterScene||!sceneHasValidatedLipSync(after,afterScene))throw new Error(`Scene ${afterScene?.number||index+1} dialogue synchronization did not finish. Completed work was saved; resume final production after synchronization is available.`);
}
const productionProject=state.projects.find(x=>x.id===projectId),productionEpisode=findEpisodeById(productionProject,episodeId),notProductionReady=selectedFinalScenes(productionEpisode).filter(x=>!sceneProductionReady(productionProject,x.scene));
if(notProductionReady.length){autoFinalJobPatch(projectId,{status:'needs-attention',stage:`${notProductionReady.length} selected scene${notProductionReady.length===1?'':'s'} still need production finishing`});throw new Error('Final rendering is waiting for every selected speaking scene to have a validated synchronized video. No finished synchronized scene will be regenerated.');}
if(coverageMode!=='fast'){autoFinalJobPatch(projectId,{stage:'Planning cinematic shot coverage…'});await ensureCinematicCoverage(projectId,episodeId,indices,tier,mode,msg=>{autoFinalJobPatch(projectId,{stage:msg});updateAutoFinalProgressUi(projectId,episodeId,msg)})}const refreshed=state.projects.find(x=>x.id===projectId),refreshedEp=findEpisodeById(refreshed,episodeId);const manifest=finalAssemblyManifest(refreshed,refreshedEp);updateProjectById(projectId,x=>{x.finalAssembly=manifest;x.renderStatus='ready';x.videoStatus='ready';x.finalVideoMeta=null;x.autoFinalJob={...(x.autoFinalJob||{}),status:'rendering-final',stage:'All clips ready · preparing final file',completedCount:selectedNow.length,errors:{}}},{render:false});if(current()?.id!==projectId){autoFinalJobPatch(projectId,{status:'paused',stage:'All clips are ready. Open the project to render the final file.'});toast('All selected clips are ready. Return to the project and resume to render the final video.');return}renderStudio();await renderFinalVideoFile()}catch(e){console.error('[CineTale auto final]',e);const cur=state.projects.find(x=>x.id===projectId);if(cur?.autoFinalJob?.status==='running')autoFinalJobPatch(projectId,{status:'needs-attention',stage:'Automatic production needs attention',lastError:e.message||String(e)});toast(e.message||'Automatic final video could not be completed.')}finally{state.autoFinalRunning=false;state.autoFinalCancelRequested=false;releaseAutoFinalLock(projectId,lock);if(button){button.disabled=false;button.textContent='Create final video automatically'}if(current()?.id===projectId){const live=state.projects.find(x=>x.id===projectId);if(live?.finalVideoMeta){const liveEp=findEpisodeById(live,episodeId)||episodeOf(live);renderWorkflow(live);renderFinalAssembly(live,liveEp);const asset=finalVideoAssets.get(finalVideoAssetKey(live,liveEp));if(asset)applyFinalVideoUi(live,liveEp,asset)}else renderStudio()}}}
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
async function generateNextMissingVideo(){const p=current(),ep=episodeOf(p);if(!p||!ep)return;const i=(ep.scenes||[]).findIndex(s=>s.finalIncluded!==false&&!s.videoUrl);if(i<0){toast(`All selected scene videos in this ${formatConfig(p.format||'Episode').finalName} are ready.`);return}const sceneButton=document.querySelector(`[data-scene-video="${i}"]`);if(sceneButton)await requestVideo(i,sceneButton);else toast('Open the scene and generate its video.')}
$('#nextStepAction').onclick=e=>{const b=e.currentTarget;if(b.dataset.nextView){setView(b.dataset.nextView);return}if(b.dataset.nextAction==='review-story'){$('#storyReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(b.dataset.nextAction==='storyboard'){generateAllScenes(b);return}if(b.dataset.nextAction==='narrate'){narrateEpisode();return}if(b.dataset.nextAction==='video'){generateNextMissingVideo();return}if(b.dataset.nextAction==='assemble'){prepareFinalAssembly();return}if(b.dataset.nextAction==='render-final'){createFinalVideo();return}if(b.dataset.nextAction==='preview-final'){const a=currentFinalVideoAsset(),v=$('#finalRenderPreview');if(a?.url&&v){v.scrollIntoView({behavior:'smooth',block:'center'});v.play().catch(()=>{})}else previewFinalSequence();return}};
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
    $('#voiceSaveSettings').onclick=()=>{const list=$('#voiceVoiceList'),selectedId=list?.dataset.selectedVoiceId||'',selectedName=list?.dataset.selectedVoiceName||'';updateProject(x=>{const t=x.characters[index];if(selectedId)applyCharacterVoiceSelection(x,index,{voiceId:selectedId,voiceName:selectedName||t.voiceName||'Selected voice',mode:'custom',locked:true});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});clearAudioPreviewCache();void pushCloudWorkspace();const live=current()?.characters?.[index];closeModal();toast(live?.voiceId===selectedId&&selectedId?`${live.voiceName||selectedName} saved and locked to ${live.name}.`:'Voice performance settings saved. Choose “Use & lock” on a voice to replace the current voice.')};
    $('#voiceAuto').onclick=()=>{updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:'',voiceName:'',mode:'auto',locked:false});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});clearAudioPreviewCache();void pushCloudWorkspace();closeModal();toast(`${c.name} reset to Auto voice. CineTale will choose again on the next listen.`)};
    $$('[data-preview-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.previewVoice;setVoicePreviewState('voice',id,true);$$('[data-preview-voice]').forEach(x=>x.disabled=x!==b);try{await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,id,previewOptions())}catch{}finally{setVoicePreviewState('voice',id,false);$$('[data-preview-voice]').forEach(x=>x.disabled=false)}});
    $$('[data-use-voice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.useVoice,name=b.dataset.voiceName;updateProject(x=>{const t=x.characters[index];applyCharacterVoiceSelection(x,index,{voiceId:id,voiceName:name,mode:'custom',locked:true});t.voicePerformance=$('#voicePerformance').value;t.voicePace=$('#voicePace').value;t.voiceAccentDirection=$('#voiceAccentDirection').value.trim();t.voiceCustomDirection=$('#voiceCustomDirection').value.trim();t.voicePreviewLine=$('#voicePreviewLine').value.trim()});clearAudioPreviewCache();setVoiceSelectedState('voice',id,name);void pushCloudWorkspace();const live=current()?.characters?.[index];if(live?.voiceId!==id||!live?.voiceLocked){toast('Voice selection could not be persisted. Please try again.');return}toast(`${name} saved and locked to ${live.name}. It will remain after closing or refreshing.`);try{setVoicePreviewState('voice',id,true);await speakText($('#voicePreviewLine').value.trim()||`Hi... I'm ${c.name}.`,id,previewOptions())}catch{}finally{setVoicePreviewState('voice',id,false)}});
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
function closeModal(){$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

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
  const base=Object.entries(d.services||{}).map(([k,v])=>`${v?'●':'○'} ${labels[k]}: <b>${v?'configured':'demo / not configured'}</b>`).join('<br>');
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
  const cloud=cloudHealthSummary();
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
$('#ownerCheckBtn').onclick=async()=>{try{const r=await fetch('/api/owner',{headers:{'x-owner-code':$('#ownerCode').value}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unauthorized');$('#ownerResult').textContent=JSON.stringify(d,null,2);$('#ownerResult').classList.remove('hidden')}catch(e){toast(e.message)}};

for(const p of state.projects){p.format=normalizedFormat(p.requestedFormat||p.format,'Episode');p.requestedFormat=p.requestedFormat||p.format;p.targetRuntimeSec=Number(p.targetRuntimeSec)||durationTargetSeconds(p.duration);ensureEpisodeIds(p);ensureCharacterIdentityIds(p);p.languageScope=p.languageScope||'entire-story';p.culturalTreatment=p.culturalTreatment||'auto';p.sacredRepresentation=p.sacredRepresentation||'auto';p.culturalContext=p.culturalContext||'';p.narratorPerformance=p.narratorPerformance||'Warm';p.narratorPace=p.narratorPace||'Natural';if(p.narratorVoiceLocked==null)p.narratorVoiceLocked=false;for(const c of p.characters||[]){c.voicePerformance=c.voicePerformance||'Natural';c.voicePace=c.voicePace||'Natural';c.voiceMode=c.voiceMode||(c.voiceId?'auto':'auto');if(c.voiceLocked==null)c.voiceLocked=false;c.entityType=c.entityType||'fictional-person';c.representationMode=c.representationMode||'project';c.canonicalVisualCues=Array.isArray(c.canonicalVisualCues)?c.canonicalVisualCues:[]}normalizeProjectIdentityBindings(p);migrateValidatedLipSyncSignatures(p)}save();

$('#accountButton')?.addEventListener('click',()=>openAccountModal('signin'));$('#settingsAccountBtn')?.addEventListener('click',()=>openAccountModal('signin'));$('#settingsSignOutBtn')?.addEventListener('click',signOutAccount);
$('#deleteProfileWorkspaceBtn')?.addEventListener('click',deleteProfileWorkspace);
$('#exportWorkspaceBtn')?.addEventListener('click',exportWorkspace);$('#importWorkspaceBtn')?.addEventListener('click',()=>$('#importWorkspaceFile').click());$('#importWorkspaceFile')?.addEventListener('change',e=>{importWorkspaceFile(e.target.files?.[0]);e.target.value=''});
$('#clearLocalDataBtn')?.addEventListener('click',()=>{if(!confirm('Clear CineTale projects and saved stories from this browser only? Your signed-in cloud profile will not be deleted. Export a backup first if you might need this local copy.'))return;if(!confirm('Remove the browser-local copy now?'))return;state.cloudSync.applying=true;state.projects=[];state.savedStories=[];state.currentId=null;localStorage.removeItem(storageKey);localStorage.removeItem(savedStoriesKey);localStorage.removeItem(currentKey);state.cloudSync.applying=false;renderAll();toast(authUser()&&state.cloudSync.status==='synced'?'Local copy cleared. Reload or sign in on another device to restore from your profile.':'Local CineTale workspace cleared.')});
const sceneListEl=$('#sceneList');
if(sceneListEl){
  const activateSceneVideo=e=>{
    const b=e.target.closest?.('[data-scene-video]');
    if(!b||!sceneListEl.contains(b)||b.disabled)return false;
    const i=Number(b.dataset.sceneVideo);
    if(!Number.isInteger(i))return false;
    requestVideo(i,b);
    return true;
  };
  sceneListEl.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    if(activateSceneVideo(e)){e.preventDefault();e.stopPropagation();}
  },true);
  sceneListEl.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-scene-video]');
    if(!b||!sceneListEl.contains(b))return;
    if(e.detail!==0)return;
    if(activateSceneVideo(e)){e.preventDefault();e.stopPropagation();}
  });
}
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
