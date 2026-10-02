import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const owner=fs.readFileSync('api/owner.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(pkg.version==='1.12.4','package version must be 1.12.4');
ok(html.includes('id="ownerAccessCard"'),'owner access card missing');
ok(!/id="ownerAccessCard"[^>]*owner-only/.test(html),'owner access card must not be owner-only (would create circular lockout)');
ok(html.includes('id="refreshSyncDiagnosticBtn"')&&html.includes('id="copySyncDiagnosticBtn"'),'diagnostic controls missing');
ok(/Speaking clip diagnostics/.test(html)&&/owner-only/.test(html.match(/<div class="surface setting-card owner-card owner-only"[^>]*><h3>Speaking clip diagnostics[\s\S]*?<\/div>/)?.[0]||''),'diagnostic panel must stay owner-only');
ok(app.includes("state.ownerAccess={resolved:true,isOwner:true,configured:true,source:'code'}"),'successful owner unlock must enable owner mode');
ok(app.includes('applyOwnerMode();renderSyncDiagnostics();'),'owner unlock must reveal and render diagnostics');
ok(owner.includes("if(!configuredCode)return res.status(503)"),'owner endpoint must fail closed when OWNER_CODE is unset');
ok(owner.includes("if(code!==configuredCode)return res.status(401)"),'owner endpoint must reject wrong owner code');
console.log('v1.10.20 owner diagnostics access regression: PASS');
