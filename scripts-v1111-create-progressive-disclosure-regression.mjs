import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const checks=[
  [pkg.version==='1.12.4','package version'],
  [app.includes("const APP_VERSION = '1.12.4'"),'app version'],
  [html.includes('/app.js?v=1.12.4')&&html.includes('/styles.css?v=1.12.4'),'cache bust'],
  [html.includes('id="worldAutoSummary"')&&html.includes('CineTale will understand culture, belief, tradition, place and language from your story.'),'world-aware summary'],
  [html.includes('<details class="world-details advanced-details" id="worldDetails">'),'advanced world details collapsed by default'],
  [html.includes('id="culturalContext"')&&html.match(/id="culturalContext"/g)?.length===1,'single world context input'],
  [html.includes('id="culturalTreatment"')&&html.includes('id="sacredRepresentation"'),'sacred controls preserved'],
  [html.includes('id="regionCommunity"')&&html.includes('id="beliefContext"')&&html.includes('id="traditionContext"'),'global context controls preserved'],
  [html.includes('data-production-profile="economy"')&&html.includes('data-production-profile="balanced"')&&html.includes('data-production-profile="cinematic"'),'production profiles preserved'],
  [css.includes('.production-profile.active:before')&&css.includes('.world-auto-summary'),'clear selection and world summary styling'],
  [app.includes("createLabel:'Build episode plan'")&&app.includes("createLabel:'Build story plan'"),'non-paid planning CTA'],
  [!html.includes('GLOBAL STORY INTELLIGENCE</span><b>Culture, belief, tradition & language memory'),'duplicate dense intelligence panel removed']
];
for(const [ok,label] of checks) assert.ok(ok,label);
console.log(`v1.12.4 Create progressive-disclosure regression PASS · ${checks.length}/${checks.length}`);
