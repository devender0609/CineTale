export default function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const url=String(process.env.SUPABASE_URL||'').trim();
  const anonKey=String(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
  const oauthUrl=String(process.env.SUPABASE_OAUTH_URL||'').trim();
  res.status(200).json({configured:Boolean(url&&anonKey),url:url||null,oauthUrl:oauthUrl||null,anonKey:anonKey||null,requireAuth:String(process.env.REQUIRE_AUTH||'').toLowerCase()==='true'});
}
