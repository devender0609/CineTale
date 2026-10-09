export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const explicit=String(process.env.CINETALE_RUNTIME_MODE||'').trim().toLowerCase();
  const vercel=String(process.env.VERCEL_ENV||'').trim().toLowerCase();
  const mode=explicit||((vercel&&vercel!=='production')?'development':'production');
  const allowOverride=String(process.env.CINETALE_ALLOW_PAID_GENERATION||'').trim().toLowerCase();
  const paidGenerationAllowed=allowOverride?allowOverride==='true':mode==='production';
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({mode,paidGenerationAllowed,reason:paidGenerationAllowed?'':'Paid video generation is locked in this development deployment. Existing provider jobs can still be recovered without starting replacement work.'});
}
