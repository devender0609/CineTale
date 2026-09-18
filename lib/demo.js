const pick = (arr, seed = 0) => arr[Math.abs(seed) % arr.length];
const hash = (s='') => [...String(s)].reduce((a,c)=>((a<<5)-a)+c.charCodeAt(0),0);

export function demoProject(input={}){
  const idea = (input.idea || 'A mysterious signal changes everything.').trim();
  const h = hash(idea);
  const genre = input.genre || 'Mystery';
  const titleSeeds = ['The Hidden Frequency','After the Last Bell','The Glass Horizon','Signal Below','The Door Between','Echoes of Tomorrow'];
  const names = ['Maya Vale','Nico Reyes','Ari Bennett','Leena Rao','Jules Carter','Samira Wells'];
  const title = pick(titleSeeds,h);
  const characters = [
    {
      id:'c1', name: pick(names,h), role:'Lead', age:'17',
      appearance: input.characterDirection || 'Inventive teen with expressive eyes, practical layered clothing, recognizable silhouette',
      background:'Open-ended; creator can specify culture, nationality, ethnicity, identity, species, or fictional origin.',
      personality:'Curious, observant, brave when it matters',
      voice:'Warm, natural, youthful; creator can describe any language, accent, tone, pacing, or vocal texture.',
      languages: input.language || 'English', wardrobe:'Contemporary practical layers', locked:true
    },
    {
      id:'c2', name: pick(names,h+7), role:'Closest ally', age:'18',
      appearance:'Distinctive curly hair, expressive face, casual jacket, grounded contemporary styling',
      background:'Creator-defined', personality:'Dry humor, loyal, cautious under pressure',
      voice:'Quick conversational delivery, understated humor', languages: input.language || 'English', wardrobe:'Casual streetwear', locked:true
    },
    {
      id:'c3', name:'The Signal', role:'Unknown presence', age:'Unknown',
      appearance:'Mostly implied through light, reflections, silhouettes, and interface artifacts',
      background:'Unknown', personality:'Precise, unsettling, strangely protective',
      voice:'Calm, low, intimate, slightly synthetic', languages: input.language || 'English', wardrobe:'N/A', locked:true
    }
  ];
  const scenes = [
    {id:'s1',number:1,title:'Cold open',durationSec:18,purpose:'Hook the audience immediately',visual:'Late afternoon. A locked workshop hums after everyone has left. A small device lights up by itself.',narration:'The first signal arrived after the building was supposed to be empty.',dialogue:[`${characters[0].name.split(' ')[0]}: That is not connected to anything.`],music:'Minimal pulse; curious, restrained',sfx:'Fluorescent hum, relay click, distant hallway',camera:'Slow push-in; macro inserts',tier:'fast'},
    {id:'s2',number:2,title:'The impossible message',durationSec:26,purpose:'Introduce the central mystery',visual:'A hand-drawn waveform resolves into coordinates beneath the school.',narration:'The message was not asking to be decoded. It was asking to be found.',dialogue:[`${characters[1].name.split(' ')[0]}: We could absolutely pretend we never saw this.`],music:'Add soft analog synth',sfx:'Device chirp, chair scrape',camera:'Over-shoulder to close-up',tier:'standard'},
    {id:'s3',number:3,title:'Below the school',durationSec:34,purpose:'Move into discovery',visual:'They descend a forgotten maintenance stairwell into a sealed robotics lab.',narration:'The oldest part of the building had been removed from every current floor plan.',dialogue:[`${characters[0].name.split(' ')[0]}: Someone wanted this room forgotten.`],music:'Wider low drones',sfx:'Metal steps, latch, air pressure release',camera:'Handheld follow then wide reveal',tier:'standard'},
    {id:'s4',number:4,title:'First contact',durationSec:38,purpose:'Deliver the first major reveal',visual:'A dormant humanoid robot opens its eyes as old monitors wake around it.',narration:'It recognized her before she spoke.',dialogue:[`The Signal: You are three years late.`],music:'Emotional rise with restrained strings',sfx:'Servo movement, CRT crackle, low sub hit',camera:'Wide reveal, reaction close-ups',tier:'premium'},
    {id:'s5',number:5,title:'Cliffhanger',durationSec:24,purpose:'Create next-episode demand',visual:'A security feed shows the same two teenagers entering the room years earlier—unchanged.',narration:'Then the archive showed them something that could not have happened.',dialogue:[`${characters[1].name.split(' ')[0]}: That is us.`],music:'Hard stop into single unresolved note',sfx:'Tape stop, monitor buzz',camera:'Insert to slow push on faces',tier:'premium'}
  ];
  const format=input.format||'Episode';
  const formatScenes=format==='Short'?scenes.slice(0,3):format==='Movie'?[...scenes,...[
    {id:'s6',number:6,title:'Midpoint reversal',durationSec:55,purpose:'Force a new strategy',visual:'The discovery changes what the characters think the goal actually is.',narration:'Halfway through, the mystery changed shape.',dialogue:[`${characters[0].name.split(' ')[0]}: We have been solving the wrong problem.`],music:'Broader thematic variation',sfx:'Low impact, room tone',camera:'Wide to close reaction',tier:'standard',act:'Act II'},
    {id:'s7',number:7,title:'Final choice',durationSec:65,purpose:'Resolve the central conflict',visual:'The lead makes a costly choice that resolves the central conflict.',narration:'The answer required a choice, not another clue.',dialogue:[`${characters[0].name.split(' ')[0]}: Then we finish this now.`],music:'Full emotional theme',sfx:'Environment builds then clears',camera:'Dynamic coverage into still close-up',tier:'premium',act:'Act III'},
    {id:'s8',number:8,title:'Aftermath',durationSec:40,purpose:'Land the ending',visual:'The world settles into a changed but complete new normal.',narration:'What remained was different, but finally honest.',dialogue:[`${characters[1].name.split(' ')[0]}: So what happens tomorrow?`],music:'Resolved reprise',sfx:'Natural ambience',camera:'Quiet wide ending frame',tier:'premium',act:'Act III'}
  ]].flat():scenes;
  if(format==='Movie') formatScenes.forEach((s,i)=>{if(!s.act)s.act=i<2?'Act I':i<6?'Act II':'Act III'});
  const unitTitle=format==='Short'?'The Signal':format==='Story'?'The Hidden Signal':format==='Movie'?'Signal Below': 'The First Signal';
  const unitSynopsis=format==='Short'?'A compact discovery forces the lead to make one decisive choice before the signal disappears.':format==='Story'?'A strange transmission leads two friends into a forgotten lab and through a complete mystery with a resolved ending.':format==='Movie'?'A strange transmission opens a larger mystery that unfolds across three acts and reaches a complete ending.':'A strange transmission leads two friends into a forgotten lab where something has been waiting for them.';
  const lead=characters[0].name.split(' ')[0], ally=characters[1].name.split(' ')[0];
  const storyText=format==='Episode'
    ? `After everyone leaves the building, ${lead} notices a forgotten device glowing inside a locked workshop even though it is not connected to power. ${ally} wants to walk away, but the screen produces coordinates that point beneath the school. Together they follow a maintenance stairwell into a sealed robotics lab missing from every current floor plan. There, an old humanoid robot wakes and addresses ${lead} as if it has been waiting for years. The machine says they are three years late. Before they can understand what that means, an archive terminal begins playing security footage dated years earlier. On the screen, ${lead} and ${ally} enter the same room looking exactly as they do now. They leave shaken, carrying one impossible question into the next chapter: if the footage is real, who were the people in it—and why did the signal know they would come?`
    : format==='Short'
      ? `${lead} finds an unplugged device glowing in an empty workshop after hours. When ${ally} arrives, the screen reveals coordinates beneath the building. They descend into a forgotten lab where a dormant machine wakes and recognizes ${lead}. A final archive image shows the two friends standing in the same room years earlier. Instead of chasing another clue, ${lead} shuts the machine down, takes the archive drive, and leaves with ${ally} to decide what the impossible evidence means. The signal goes dark, but the mystery has changed them.`
      : format==='Movie'
        ? `${lead} and ${ally} discover an impossible signal in an abandoned workshop and trace it to a sealed robotics laboratory beneath their school. A dormant machine recognizes ${lead}, while archived footage suggests the two friends entered the room years before they were supposed to have been there. Their search expands across the city, where old records and reluctant witnesses reveal that the laboratory belonged to a long-running experiment in predictive memory. Midway through the investigation, ${lead} learns that the system was not recording the future at all; it was manipulating the choices of people who believed its predictions. The apparent images of the friends were planted to lure them into repeating an earlier failure. In the final act, ${lead} refuses the machine's last prediction, destroys the control archive, and saves ${ally} from a trap designed around their expected behavior. The system loses its power because the friends stop treating prediction as destiny. In the aftermath, the school reopens the buried lab as evidence of what happened, and ${lead} and ${ally} leave knowing the future is uncertain again—and that uncertainty is finally theirs.`
        : `${lead} notices an unplugged device glowing in an empty workshop after everyone has gone home. When ${ally} joins the investigation, the device displays coordinates beneath the school. They follow the clue into a sealed robotics lab that has disappeared from every current floor plan. Inside, a dormant humanoid machine wakes and speaks to ${lead} as if they have met before. An archive terminal then reveals footage of ${lead} and ${ally} entering the same room years earlier, unchanged. Rather than accept the image as proof of fate, they search the lab and discover that the system was built to manufacture convincing predictions in order to steer human choices. The final recording was bait. ${lead} disconnects the archive while ${ally} opens the sealed room to daylight. The machine powers down, and the impossible footage dissolves into corrupted frames. They leave with the evidence, no longer certain what had been staged and what had been real, but certain of one thing: the next choice belongs to them. The mystery ends not with a prophecy fulfilled, but with the two friends walking out together into a future the machine can no longer script.`;
  return {
    id:`ct_${Date.now()}`,
    title,
    logline:`${idea} What begins as a discovery becomes a recurring story about trust, consequence, and a secret that keeps changing what the characters think they know.`,
    format, genre, audience:input.audience||'Teen (13–17)', duration:input.duration||'2–3 minutes',
    controlMode:input.controlMode||'Guided', language:input.language||'English', style:input.style||'Cinematic contemporary',
    worldBible:{
      premise:idea,
      visualLanguage:input.style||'Cinematic contemporary with expressive lighting, clean composition, and consistent character identity',
      rules:['Character identity remains consistent unless explicitly changed by the creator.','Important story facts become canon and carry into later episodes.','Every episode earns its cliffhanger rather than ending arbitrarily.'],
      canon:['The signal knows the lead character.','A sealed robotics lab exists beneath the school.','Archived footage contradicts the characters’ timeline.']
    },
    characters,
    episodes:[{number:1,title:unitTitle,synopsis:unitSynopsis,storyText,storyApproved:false,scenes:formatScenes}],
    activeEpisode:1, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), generationMode:'demo'
  };
}

export function demoNextEpisode(project){
  const n=(project.episodes?.length||1)+1;
  const lead=project.characters?.[0]?.name?.split(' ')[0]||'The lead';
  return {number:n,title:n===2?'The Archive Room':`Episode ${n}`,synopsis:`${lead} follows the contradiction left by the previous episode and discovers that the mystery is connected to an older version of the same story.`,storyText:`${lead} studies the impossible archive frame and notices a symbol hidden at its edge. The same mark appears on an old map across town. Following it leads to a shopkeeper who recognizes the symbol immediately and warns them to stop searching. When ${lead} refuses, the shopkeeper reveals an old photograph showing ${lead}'s family standing beside the same machine decades earlier. The new discovery deepens the mystery but also gives the episode a clear answer: the signal is connected to the family's past, not a random accident. ${lead} leaves with the photograph and a new direction for the investigation.`,storyApproved:false,scenes:[
    {id:`e${n}s1`,number:1,title:'Previously unseen',durationSec:20,purpose:'Reconnect to canon',visual:'Morning light. The old footage is paused on a frame nobody noticed before.',narration:'The answer was hiding at the edge of the frame.',dialogue:[`${lead}: Zoom in.`],music:'Soft pulse',sfx:'Keyboard taps, monitor hum',camera:'Monitor insert to reaction',tier:'fast'},
    {id:`e${n}s2`,number:2,title:'A second map',durationSec:32,purpose:'Expand the world',visual:'The frame reveals a symbol matching a location across town.',narration:'The signal had never been confined to the school.',dialogue:['Ally: So this is bigger than the lab.'],music:'Light momentum',sfx:'City ambience',camera:'Map montage',tier:'standard'},
    {id:`e${n}s3`,number:3,title:'Someone remembers',durationSec:42,purpose:'Introduce a new relationship',visual:'An older shopkeeper recognizes the symbol and goes silent.',narration:'For the first time, an adult looked afraid of the same thing they were chasing.',dialogue:['Shopkeeper: Put that away.'],music:'Warm tension',sfx:'Bell, distant traffic',camera:'Dialogue coverage',tier:'standard'},
    {id:`e${n}s4`,number:4,title:'The old photograph',durationSec:32,purpose:'Deliver reveal',visual:'A photograph shows the lead’s family standing beside the robot decades earlier.',narration:'The mystery had a family history.',dialogue:[`${lead}: That is my grandmother.`],music:'Emotional lift',sfx:'Paper handling',camera:'Photo insert to close-up',tier:'premium'}
  ]};
}

export function demoArtDataUri(label='CineTale', aspect='16:9'){
  const [w,h]=aspect==='1:1'?[900,900]:[1280,720];
  const safe=String(label).replace(/[<>&"']/g,'');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6F55E8"/><stop offset=".5" stop-color="#C665D6"/><stop offset="1" stop-color="#7ADDF2"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="55"/></filter></defs><rect width="100%" height="100%" fill="#171228"/><circle cx="${w*.2}" cy="${h*.2}" r="${h*.3}" fill="#6f55e8" opacity=".55" filter="url(#b)"/><circle cx="${w*.8}" cy="${h*.65}" r="${h*.32}" fill="#dd6fc5" opacity=".45" filter="url(#b)"/><rect x="${w*.07}" y="${h*.08}" width="${w*.86}" height="${h*.84}" rx="${h*.05}" fill="url(#g)" opacity=".18" stroke="#fff" stroke-opacity=".25"/><text x="50%" y="47%" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="${Math.max(28,w/24)}" font-weight="700">${safe}</text><text x="50%" y="56%" text-anchor="middle" fill="#eee7ff" opacity=".8" font-family="Arial, sans-serif" font-size="${Math.max(16,w/48)}">CineTale preview artwork</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
