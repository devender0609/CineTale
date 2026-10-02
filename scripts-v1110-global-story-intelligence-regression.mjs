import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizePlan } from './api/generate-plan.js';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const planApi=fs.readFileSync(new URL('./api/generate-plan.js',import.meta.url),'utf8');
const videoApi=fs.readFileSync(new URL('./api/video-job.js',import.meta.url),'utf8');

const checks=[]; const check=(name,fn)=>{fn();checks.push(name)};
check('build is v1.11.0',()=>assert.match(app,/APP_VERSION = '1\.12\.4'/));
check('global culture inputs exist',()=>{for(const id of ['regionCommunity','beliefContext','traditionContext','eraPlace','culturalGrounding','languageBehavior'])assert.ok(html.includes(`id="${id}"`),id)});
check('production profiles exist',()=>{for(const p of ['economy','balanced','cinematic'])assert.ok(html.includes(`data-production-profile="${p}"`),p)});
check('world memory schema is requested',()=>assert.match(planApi,/worldBible\.globalContext/));
check('uncertainty is explicit instead of guessed',()=>assert.match(planApi,/uncertaintyNotes/));
check('culture is forwarded into video prompt',()=>assert.match(videoApi,/World context memory:/));
check('story setup preserves production profile',()=>assert.match(app,/productionProfile,/));

const input={idea:'A family in Kochi prepares for Onam while three generations disagree about an old tradition.',format:'Episode',duration:'2–3 minutes',genre:'Family',audience:'Family / All ages',language:'Malayalam + English',languageScope:'custom-multilingual',culturalTreatment:'culturally-faithful',regionCommunity:'Kerala',beliefContext:'Family context; do not infer religion',traditionContext:'Onam',eraPlace:'present-day Kochi',culturalGrounding:'research-careful',languageBehavior:'code-switching',productionProfile:'economy'};
const candidate={title:'Test',logline:'Test',worldBible:{premise:'Test',globalContext:{familySocialContext:['three generations'],customsPractices:['shared meal'],uncertaintyNotes:['Do not invent a ritual not supplied by the creator.']}},characters:[],episodes:[{number:1,title:'Test',storyText:'A '.repeat(320),scenes:[{id:'s1',number:1,title:'Home',dialogue:[],visual:'Family prepares together.',durationSec:30,coveragePlan:[]}]}]};
const normalized=normalizePlan(candidate,input,'test');
check('global context survives normalization',()=>{assert.equal(normalized.worldBible.globalContext.regionCommunity,'Kerala');assert.equal(normalized.worldBible.globalContext.traditionContext,'Onam');assert.equal(normalized.worldBible.globalContext.grounding,'research-careful');assert.equal(normalized.worldBible.globalContext.languageBehavior,'code-switching')});
check('economy routes scene to draft tier',()=>assert.equal(normalized.episodes[0].scenes[0].tier,'draft'));
check('routing contract requires explicit paid generation',()=>assert.equal(normalized.episodes[0].scenes[0].productionRouting.paidGenerationExplicitOnly,true));

console.log(`CineTale v1.11.0 global-story-intelligence regression passed: ${checks.length}/${checks.length}`);
