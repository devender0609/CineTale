import {demoArtDataUri} from '../lib/demo.js';
import {createImage} from '../lib/ai.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {prompt,label='CineTale',aspect='16:9',quality='standard',referenceImages=[]}=req.body||{};
  if(!prompt) return res.status(400).json({error:'Prompt required'});

  const hasLiveProvider=Boolean(process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY);
  try{
    const img=await createImage(prompt,aspect,referenceImages,quality);
    if(img) return res.status(200).json({image:img,mode:'ai'});
    if(!hasLiveProvider) return res.status(200).json({image:demoArtDataUri(label,aspect),mode:'demo',warning:'Live visual generation is not configured, so CineTale showed preview art.'});
    throw new Error('Configured visual provider returned no image.');
  }catch(e){
    const message=e?.message||String(e);
    const quota=/quota|rate limit|resource exhausted|too many requests|resource_exhausted|\b429\b/i.test(message);
    const requestConfig=/delivery mode|unsupported|invalid argument|bad request|response.?format|\b400\b/i.test(message);
    console.error('[CineTale generate-image] Live image generation failed',{
      message,
      model:process.env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-image',
      hasGeminiKey:Boolean(process.env.GEMINI_API_KEY),
      aspect,
      quality,
      referenceCount:Array.isArray(referenceImages)?referenceImages.length:0
    });
    const errorCode=quota?'VISUAL_QUOTA':requestConfig?'VISUAL_REQUEST':'VISUAL_UNAVAILABLE';
    const error=quota
      ? 'Visual generation limit reached for now. Your project is safe; try again later.'
      : requestConfig
        ? 'The image service rejected this generation request. CineTale did not substitute preview artwork. Please retry; if it repeats, check the latest /api/generate-image log.'
        : 'Live visual generation failed. CineTale did not substitute preview artwork. Please retry or check the latest /api/generate-image log.';
    // A configured provider failure is a real failure. Do not silently present demo
    // artwork as though generation succeeded.
    return res.status(quota?429:502).json({error,errorCode,providerMessage:message});
  }
}
