function cleanJson(text=''){
  const t=String(text).replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
  const s=t.indexOf('{'), e=t.lastIndexOf('}');
  if(s>=0&&e>s) return JSON.parse(t.slice(s,e+1));
  throw new Error('AI response did not contain valid JSON');
}

async function parseError(response, fallback){
  try{
    const data = await response.json();
    return data?.error?.message || data?.message || data?.error || fallback;
  }catch{
    try{
      const text = await response.text();
      return text || fallback;
    }catch{
      return fallback;
    }
  }
}

export async function generateWithOpenAI(prompt){
  const key=process.env.OPENAI_API_KEY; if(!key) return null;
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${key}`},
    body:JSON.stringify({model:'gpt-5-mini',input:prompt})
  });
  if(!r.ok) throw new Error(await parseError(r, `Story service error (${r.status})`));
  const d=await r.json();
  const text=d.output_text || (d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
  return cleanJson(text);
}

export async function generateWithGemini(prompt){
  const key=process.env.GEMINI_API_KEY; if(!key) return null;
  // Prefer current stable models first. A stale GEMINI_TEXT_MODEL (for example an
  // older 2.5 model) must never prevent CineTale from reaching a supported model.
  const preferred=String(process.env.GEMINI_TEXT_MODEL||'').trim();
  const stable=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash'];
  const preferredIsLegacy=/^gemini-2\.|preview|experimental/i.test(preferred);
  const models=[...stable,...(!preferredIsLegacy&&preferred?[preferred]:[])].filter(Boolean).filter((m,i,a)=>a.indexOf(m)===i);
  let lastError=null;

  for(const model of models){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{responseMimeType:'application/json'}
      })
    });

    if(r.ok){
      const d=await r.json();
      const text=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
      const plan=cleanJson(text);
      Object.defineProperty(plan,'__cinetaleGeminiModel',{value:model,enumerable:false,configurable:true});
      return plan;
    }

    const message=await parseError(r, `Story service error (${r.status})`);
    lastError=new Error(`${model}: ${message}`);
    const unavailable=r.status===404 || /no longer available|not found|unsupported|does not exist|model.*available|not supported for this api/i.test(String(message));
    if(!unavailable) throw lastError;
    console.warn('[CineTale story] Gemini model unavailable; trying stable fallback', {model,status:r.status});
  }

  throw lastError || new Error('No supported Gemini text model was available.');
}

function findGeminiImage(payload){
  const seen=new Set();
  function walk(value){
    if(!value || typeof value!=='object') return null;
    if(seen.has(value)) return null;
    seen.add(value);
    if(value.type==='image'){
      if(typeof value.data==='string' && value.data) return {data:value.data,mime:value.mime_type||'image/jpeg'};
      if(typeof value.uri==='string' && value.uri) return {uri:value.uri,mime:value.mime_type||'image/jpeg'};
    }
    for(const child of Object.values(value)){
      if(child && typeof child==='object'){
        const found=walk(child);
        if(found) return found;
      }
    }
    return null;
  }
  return walk(payload);
}

function dataImagePart(value){
  const m=String(value||'').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!m) return null;
  return {type:'image',mime_type:m[1],data:m[2].replace(/\s+/g,'')};
}

function geminiInlineImage(payload){
  const parts=payload?.candidates?.[0]?.content?.parts||[];
  for(const part of parts){
    const inline=part?.inlineData || part?.inline_data;
    if(inline?.data){
      return {data:inline.data,mime:inline.mimeType||inline.mime_type||'image/png'};
    }
  }
  return null;
}

async function geminiImageRequest({key,model,parts,aspectRatio,imageSize='1K',minimal=false}){
  const generationConfig=minimal
    ? {responseModalities:['TEXT','IMAGE']}
    : {responseModalities:['TEXT','IMAGE'],responseFormat:{image:{aspectRatio,imageSize}}};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',
    headers:{'content-type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{parts}],generationConfig})
  });
  if(!r.ok){
    const message=await parseError(r, `Gemini image service error (${r.status})`);
    const err=new Error(message);err.status=r.status;err.model=model;err.minimal=minimal;err.retryAfterSec=Number(r.headers?.get?.('retry-after')||0)||0;throw err;
  }
  const d=await r.json();
  const image=geminiInlineImage(d);
  if(image?.data) return `data:${image.mime};base64,${image.data}`;
  throw new Error(`${model}: Gemini image response completed without inline image data.`);
}

function imageQuality(q='standard'){
  q=String(q||'standard').toLowerCase();
  return q==='draft'?'low':q==='premium'?'high':'medium';
}
function imageSize(aspect='16:9'){return aspect==='1:1'?'1024x1024':'1536x1024'}
function normalizeProviderError(error,provider){const e=error instanceof Error?error:new Error(String(error||'Image provider failed.'));e.provider=provider;return e}
function isQuotaImageError(e){const m=String(e?.message||'');return e?.status===429||/quota|rate limit|resource exhausted|too many requests|resource_exhausted|insufficient_quota|billing hard limit|usage limit|\b429\b/i.test(m)}
function isCompatibilityImageError(e){const m=String(e?.message||'');return e?.status===400||e?.status===404||(e?.status===403&&/model|access|verification|not permitted|not available/i.test(m))||/unsupported|invalid argument|bad request|not found|no longer available|unknown model|model.*available|response.?format|image.?size|aspect.?ratio/i.test(m)}
function isRetryableImageError(e){const m=String(e?.message||'');return isCompatibilityImageError(e)||e?.status===408||e?.status===425||isQuotaImageError(e)||e?.status>=500||/temporar(?:y|ily)|unavailable|timeout/i.test(m)}
function providerAttempt(provider,stage,e,extra={}){return {provider,stage,status:Number(e?.status||0)||null,message:String(e?.message||e||'Unknown provider error').slice(0,700),...extra}}
export async function openAIImageRequest({key,prompt,aspect='16:9',referenceImages=[],quality='standard',attempts=[]}){
  const configured=String(process.env.OPENAI_IMAGE_MODEL||'').trim();
  const models=[configured,'gpt-image-2','gpt-image-1.5','gpt-image-1'].filter(Boolean).filter((m,i,a)=>a.indexOf(m)===i);
  const size=imageSize(aspect),requestedQuality=imageQuality(quality),refs=(Array.isArray(referenceImages)?referenceImages:[]).map(dataImagePart).filter(Boolean).slice(0,4);
  // A live verification uses low quality. Real scene generation may request medium/high.
  // If the account/provider temporarily rejects the higher tier with a quota/rate-limit,
  // retry the SAME supported image route once at low quality before giving up. This keeps
  // a verified provider usable in production without silently changing the prompt/content.
  const qualities=[requestedQuality,...(requestedQuality!=='low'?['low']:[])].filter((v,i,a)=>a.indexOf(v)===i);
  let lastError=null;
  for(const model of models){
    for(const q of qualities){
      let r;
      try{
        if(refs.length){
          const form=new FormData();
          form.append('model',model);form.append('prompt',prompt);form.append('size',size);form.append('quality',q);
          if(model!=='gpt-image-2')form.append('input_fidelity','high');
          refs.forEach((ref,i)=>{const bytes=Buffer.from(ref.data,'base64');form.append(refs.length===1?'image':'image[]',new Blob([bytes],{type:ref.mime_type}),`reference-${i+1}.png`)});
          r=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${key}`},body:form});
        }else{
          r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model,prompt,size,quality:q})});
        }
        if(!r.ok){
          const message=await parseError(r,`OpenAI image service error (${r.status})`);
          const e=new Error(message);e.status=r.status;e.retryAfterSec=Number(r.headers?.get?.('retry-after')||0)||0;e.model=model;e.quality=q;
          attempts.push(providerAttempt('openai',refs.length?'edit':'generation',e,{model,quality:q}));lastError=e;
          if(isCompatibilityImageError(e)) break; // try next model, not another quality
          if(isQuotaImageError(e)&&q!=='low') continue; // retry same model at low quality
          throw e;
        }
        const d=await r.json();const item=d.data?.[0];
        if(!item){const e=new Error('OpenAI image service returned no image.');e.model=model;e.quality=q;attempts.push(providerAttempt('openai','empty-response',e,{model,quality:q}));lastError=e;continue}
        const image=item.b64_json?`data:image/png;base64,${item.b64_json}`:(item.url||null);
        if(image)return {image,model,quality:q};
        const e=new Error('OpenAI image result did not contain image bytes or a URL.');e.model=model;e.quality=q;attempts.push(providerAttempt('openai','empty-image',e,{model,quality:q}));lastError=e;
      }catch(e){
        if(!attempts.some(a=>a.provider==='openai'&&a.model===model&&a.quality===q&&a.message===String(e?.message||e).slice(0,700))) attempts.push(providerAttempt('openai',refs.length?'edit':'generation',e,{model,quality:q}));
        lastError=e;
        if(isCompatibilityImageError(e)) break;
        if(isQuotaImageError(e)&&q!=='low') continue;
        throw e;
      }
    }
  }
  throw lastError||new Error('No supported OpenAI image model returned an image.');
}

export async function createImageWithMeta(prompt, aspect='16:9', referenceImages=[], quality='standard', preferBackup=false){
  const q=['draft','standard','premium'].includes(String(quality).toLowerCase())?String(quality).toLowerCase():'standard';
  const providers=[];
  const requestedPrimary=String(process.env.VISUAL_PRIMARY_PROVIDER||'').trim().toLowerCase();
  // When both providers are configured, prefer OpenAI by default because it is the route
  // CineTale can live-verify end-to-end. Gemini remains a fallback. Set
  // VISUAL_PRIMARY_PROVIDER=gemini only when you intentionally want Gemini first.
  const openAIFirst=Boolean(process.env.OPENAI_API_KEY)&&(preferBackup||requestedPrimary!=='gemini'||!process.env.GEMINI_API_KEY);
  if(openAIFirst)providers.push('openai');
  if(process.env.GEMINI_API_KEY)providers.push('gemini');
  if(process.env.OPENAI_API_KEY&&!providers.includes('openai'))providers.push('openai');
  if(!providers.length)return null;
  const firstProvider=providers[0],attempts=[];let lastError=null;
  for(const provider of providers){
    try{
      if(provider==='gemini'){
        const key=process.env.GEMINI_API_KEY,tierModel=String(process.env[`GEMINI_IMAGE_MODEL_${q.toUpperCase()}`]||'').trim(),envModel=String(process.env.GEMINI_IMAGE_MODEL||'').trim();
        const defaults=q==='premium'?['gemini-3-pro-image','gemini-3.1-flash-image','gemini-3.1-flash-lite-image']:['gemini-3.1-flash-image','gemini-3.1-flash-lite-image'];
        const models=[tierModel,envModel,...defaults].filter(Boolean).filter((m,i,a)=>a.indexOf(m)===i),requestedAspect=aspect==='1:1'?'1:1':'16:9';
        const aspectHint=requestedAspect==='1:1'?'Create one polished square character reference portrait.':'Create one polished cinematic widescreen storyboard frame in a 16:9 composition.';
        const qualityHint={draft:'Prioritize a clean, fast composition preview and clear blocking.',standard:'Prioritize balanced production quality, coherent details and polished lighting.',premium:'Prioritize maximum visual fidelity, nuanced materials, refined lighting, composition and character consistency.'}[q];
        const fullPrompt=`${prompt}\n\n${qualityHint} ${aspectHint} No captions, no logos, no UI. Return a clean image; do not render prompt text inside the image.`;
        const parts=[{text:fullPrompt}];for(const ref of (Array.isArray(referenceImages)?referenceImages:[]).slice(0,4)){const parsed=dataImagePart(ref);if(parsed?.data)parts.push({inlineData:{mimeType:parsed.mime_type,data:parsed.data}})}
        let geminiError=null;
        for(const model of models){
          try{
            const image=await geminiImageRequest({key,model,parts,aspectRatio:requestedAspect,imageSize:'1K',minimal:false});return {image,provider:'gemini',model,providerRoute:provider===firstProvider?'primary':'backup',providerAttempts:attempts};
          }catch(e){
            geminiError=e;attempts.push(providerAttempt('gemini','generation',e,{model}));const message=String(e?.message||'');
            // Gemini image quotas are project-level. Trying more Gemini models after
            // a 429 only wastes time and additional requests. Jump directly to the
            // configured backup provider instead.
            if(isQuotaImageError(e)){console.warn('[CineTale image] Gemini quota reached; switching immediately to backup visual provider',{model,status:e?.status,message});break}
            const compatibility=isCompatibilityImageError(e);
            const unavailable=e?.status===404||/not found|does not exist|no longer available|model.*available/i.test(message);
            if(compatibility){
              try{const image=await geminiImageRequest({key,model,parts,aspectRatio:requestedAspect,imageSize:'1K',minimal:true});return {image,provider:'gemini',model,providerRoute:provider===firstProvider?'primary':'backup',providerAttempts:attempts}}catch(me){geminiError=me;attempts.push(providerAttempt('gemini','minimal-generation',me,{model}));if(isQuotaImageError(me))break}
            }
            if(!(compatibility||unavailable||e?.status>=500))throw normalizeProviderError(e,'gemini');
            console.warn('[CineTale image] Gemini route unavailable; trying next route',{model,status:e?.status,message});
          }
        }
        throw normalizeProviderError(geminiError||new Error('No supported Gemini image model returned an image.'),'gemini');
      }
      const result=await openAIImageRequest({key:process.env.OPENAI_API_KEY,prompt,aspect,referenceImages,quality:q,attempts});
      return {image:result.image,provider:'openai',model:result.model,quality:result.quality||imageQuality(q),providerRoute:provider===firstProvider?'primary':'backup',providerAttempts:attempts};
    }catch(e){
      lastError=normalizeProviderError(e,provider);lastError.providerAttempts=attempts;
      if(provider==='gemini'&&process.env.OPENAI_API_KEY){console.warn('[CineTale image] Primary visual route failed; invoking OpenAI backup',{status:lastError.status,message:lastError.message});continue}
      if(!isRetryableImageError(lastError))throw lastError;
      console.warn('[CineTale image] Visual provider unavailable; trying backup',{provider,status:lastError.status,message:lastError.message});
    }
  }
  if(lastError)lastError.providerAttempts=attempts;
  throw lastError||new Error('No configured image provider returned an image.');
}

export async function createImage(prompt, aspect='16:9', referenceImages=[], quality='standard', preferBackup=false){
  const result=await createImageWithMeta(prompt,aspect,referenceImages,quality,preferBackup);return result?.image||null;
}
