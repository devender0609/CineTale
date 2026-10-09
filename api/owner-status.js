function ownerEmails(){
  return String(process.env.OWNER_EMAILS||process.env.OWNER_EMAIL||'')
    .split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const allowed=ownerEmails();
  if(!allowed.length) return res.status(200).json({configured:false,isOwner:false});
  const auth=String(req.headers.authorization||'');
  const token=auth.match(/^Bearer\s+(.+)$/i)?.[1];
  const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
  const anonKey=String(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
  if(!token||!url||!anonKey) return res.status(200).json({configured:true,isOwner:false});
  try{
    const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:`Bearer ${token}`}});
    if(!r.ok) return res.status(200).json({configured:true,isOwner:false});
    const user=await r.json();
    const email=String(user?.email||'').trim().toLowerCase();
    return res.status(200).json({configured:true,isOwner:Boolean(email&&allowed.includes(email))});
  }catch{
    return res.status(200).json({configured:true,isOwner:false});
  }
}
