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
    const err=new Error(message);err.status=r.status;err.model=model;err.minimal=minimal;throw err;
  }
  const d=await r.json();
  const image=geminiInlineImage(d);
  if(image?.data) return `data:${image.mime};base64,${image.data}`;
  throw new Error(`${model}: Gemini image response completed without inline image data.`);
}

export async function createImage(prompt, aspect='16:9', referenceImages=[], quality='standard'){
  const geminiKey=process.env.GEMINI_API_KEY;
  if(geminiKey){
    const q=['draft','standard','premium'].includes(String(quality).toLowerCase())?String(quality).toLowerCase():'standard';
    const tierModel=String(process.env[`GEMINI_IMAGE_MODEL_${q.toUpperCase()}`]||'').trim();
    const envModel=String(process.env.GEMINI_IMAGE_MODEL||'').trim();
    const defaults=q==='premium'
      ? ['gemini-3-pro-image','gemini-3.1-flash-image','gemini-3.1-flash-lite-image']
      : ['gemini-3.1-flash-image','gemini-3.1-flash-lite-image'];
    const models=[tierModel,envModel,...defaults].filter(Boolean).filter((m,i,a)=>a.indexOf(m)===i);
    const requestedAspect = aspect==='1:1' ? '1:1' : '16:9';
    const aspectHint = requestedAspect==='1:1'
      ? 'Create one polished square character reference portrait.'
      : 'Create one polished cinematic widescreen storyboard frame in a 16:9 composition.';
    const qualityHint={draft:'Prioritize a clean, fast composition preview and clear blocking.',standard:'Prioritize balanced production quality, coherent details and polished lighting.',premium:'Prioritize maximum visual fidelity, nuanced materials, refined lighting, composition and character consistency.'}[q];
    const fullPrompt = `${prompt}\n\n${qualityHint} ${aspectHint} No captions, no logos, no UI. Return a clean image; do not render prompt text inside the image.`;
    const inputParts=[{text:fullPrompt}];
    for(const ref of (Array.isArray(referenceImages)?referenceImages:[]).slice(0,4)){
      const parsed=dataImagePart(ref);
      if(parsed?.data) inputParts.push({inlineData:{mimeType:parsed.mime_type,data:parsed.data}});
    }

    let lastError=null;
    for(const model of models){
      try{
        return await geminiImageRequest({key:geminiKey,model,parts:inputParts,aspectRatio:requestedAspect,imageSize:'1K',minimal:false});
      }catch(e){
        lastError=e;
        const message=String(e?.message||'');
        const compatibility=/delivery mode|response.?format|image.?size|aspect.?ratio|unsupported|invalid argument|bad request/i.test(message) || e?.status===400;
        const unavailable=e?.status===404 || /not found|does not exist|no longer available|model.*available/i.test(message);
        if(compatibility){
          // Some Gemini projects/revisions reject optional image-format fields even
          // when the image model itself is available. Retry the same model with the
          // minimal documented image request before trying another model.
          try{
            console.warn('[CineTale image] Retrying Gemini image model with minimal generateContent config',{model});
            return await geminiImageRequest({key:geminiKey,model,parts:inputParts,aspectRatio:requestedAspect,imageSize:'1K',minimal:true});
          }catch(minimalError){lastError=minimalError;}
        }
        const retryable=compatibility || unavailable || e?.status===429 || e?.status>=500;
        if(!retryable) throw e;
        console.warn('[CineTale image] Gemini image model failed; trying fallback',{model,status:e?.status,message});
      }
    }
    throw lastError || new Error('No supported Gemini image model returned an image.');
  }

  const openAIKey=process.env.OPENAI_API_KEY; if(!openAIKey) return null;
  const size=aspect==='1:1'?'1024x1024':'1536x1024';
  const r=await fetch('https://api.openai.com/v1/images/generations',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${openAIKey}`},
    body:JSON.stringify({model:'gpt-image-1',prompt,size})
  });
  if(!r.ok) throw new Error(await parseError(r, `Image service error (${r.status})`));
  const d=await r.json();
  const item=d.data?.[0]; if(!item) return null;
  if(item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return item.url||null;
}
