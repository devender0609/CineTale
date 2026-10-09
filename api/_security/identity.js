// Shared verification only. Never treat editable workspace JSON as an approval for paid work.
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const jsonError = (code, status) => Object.assign(new Error(code), {code, status});
export async function authenticatedWorkspaceProject(req, projectId, opts={}) {
  if (!safeId(projectId)) throw jsonError('INVALID_PROJECT_ID', 400);
  const token = String(req?.headers?.authorization || '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) throw jsonError('SIGN_IN_REQUIRED', 401);
  const env = opts.env || process.env;
  const endpoint = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '');
  if (!/^https:\/\/[^/]+/.test(endpoint) || !key) throw jsonError('AUTH_NOT_CONFIGURED', 503);
  const request = opts.fetch || fetch;
  let userResponse;
  try {
    userResponse = await request(`${endpoint}/auth/v1/user`, {
      headers: {apikey:key, authorization:`Bearer ${token}`},
      signal: AbortSignal.timeout(8000)
    });
  } catch { throw jsonError('AUTH_UNAVAILABLE', 503); }
  if (!userResponse.ok) throw jsonError(userResponse.status === 401 || userResponse.status === 403 ? 'SIGN_IN_REQUIRED':'AUTH_UNAVAILABLE', userResponse.status === 401 || userResponse.status === 403 ? 401:503);
  let user;
  try { user = await userResponse.json(); } catch { throw jsonError('AUTH_UNAVAILABLE', 503); }
  if (!safeId(user?.id)) throw jsonError('SIGN_IN_REQUIRED', 401);
  // RLS restricts this read to the authenticated user's workspace. Explicitly
  // scope the row as defense-in-depth; don't accept any project object in req.body.
  let workspaceResponse;
  try {
    workspaceResponse = await request(`${endpoint}/rest/v1/cinetale_workspaces?user_id=eq.${encodeURIComponent(user.id)}&select=payload&limit=1`, {
      headers: {apikey:key, authorization:`Bearer ${token}`},
      signal: AbortSignal.timeout(8000)
    });
  } catch { throw jsonError('WORKSPACE_UNAVAILABLE', 503); }
  if (!workspaceResponse.ok) throw jsonError('WORKSPACE_UNAVAILABLE', 503);
  let rows;
  try { rows = await workspaceResponse.json(); } catch { throw jsonError('WORKSPACE_UNAVAILABLE', 503); }
  if (!Array.isArray(rows) || !Array.isArray(rows[0]?.payload?.projects) || !rows[0].payload.projects.some(p=>p?.id===projectId)) {
    throw jsonError('PROJECT_NOT_FOUND', 404);
  }
  return {userId:user.id, projectId};
}
