import fs from 'fs';
const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql','utf8');
const checks=[
 ['version advanced', /APP_VERSION = '1\.9\.80'/.test(app)&&/app\.js\?v=1\.9\.80/.test(index)],
 ['private final-video bucket configured', /cinetale-final-videos/.test(sql)&&/public, file_size_limit/.test(sql)],
 ['per-user RLS folder restriction present', /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(sql)],
 ['direct authenticated storage upload present', /uploadFinalVideoCloud/.test(app)&&/x-upsert/.test(app)&&/storage\/v1\/object/.test(app)],
 ['cloud download restoration present', /downloadFinalVideoCloud/.test(app)&&/p\.finalVideoMeta\?\.storagePath/.test(app)],
 ['browser copy remains fallback', /saveFinalVideoBlob\(key,blob,meta\)/.test(app)&&/browser-only/.test(app)],
 ['final meta records cloud path and pipeline 10', /pipelineVersion:10,storagePath:null/.test(app)],
 ['guest final persistence is truthfully labeled', /Saved in this browser/.test(app)],
 ['signed-in final persistence is truthfully labeled', /Saved to your CineTale account and this browser/.test(app)],
 ['library restoration uses shared restore path', /await restoreFinalVideoAsset\(p,ep\)/.test(app)],
];
let bad=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++}
if(bad)process.exit(1);console.log('v1.9.80 cloud final-video persistence regression PASS');
