import {openAIImageRequest} from '../lib/ai.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const key=String(process.env.OPENAI_API_KEY||'').trim();
  if(!key)return res.status(503).json({ok:false,error:'OpenAI visual provider is not configured.',code:'BACKUP_NOT_CONFIGURED'});
  const attempts=[];
  try{
    const result=await openAIImageRequest({
      key,
      prompt:'A simple neutral CineTale system verification frame: soft studio gradient, no people, no text, no logos.',
      aspect:'1:1',
      referenceImages:[],
      quality:'draft',
      attempts
    });
    return res.status(200).json({ok:true,provider:'openai',model:result.model,quality:result.quality||'low',verifiedAt:new Date().toISOString(),mode:'live-image-generation',attempts});
  }catch(e){
    const status=Number(e?.status||0);
    return res.status(status===429?429:502).json({ok:false,error:e?.message||'OpenAI visual verification failed.',provider:'openai',attempts});
  }
}
