import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const markers = ['<<'+'<<<<<', '==='+'====', '>>'+'>>>>>'];
const textExt = new Set(['.html','.css','.js','.mjs','.json','.md','.svg','.txt','.example']);
let bad = false;
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    if(name === '.git' || name === 'node_modules') continue;
    const p = path.join(dir,name); const st = fs.statSync(p);
    if(st.isDirectory()) walk(p); else {
      const ext = path.extname(p);
      if(textExt.has(ext) || name === '.env.example'){
        const t = fs.readFileSync(p,'utf8');
        for(const m of markers) if(t.includes(m)){ console.error(`Merge marker ${m} found in ${p}`); bad = true; }
      }
      if(ext === '.json') { try{ JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ console.error(`Invalid JSON: ${p}: ${e.message}`); bad=true; } }
    }
  }
}
walk(root);
if(bad) process.exit(1);
console.log('CineTale checks passed: no merge markers; JSON valid.');
