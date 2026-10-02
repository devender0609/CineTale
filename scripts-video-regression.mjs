import assert from 'node:assert/strict';
import handler from './api/video-file.js';

function makeRes(){
  return {headers:{},statusCode:200,body:null,setHeader(k,v){this.headers[k.toLowerCase()]=String(v)},status(n){this.statusCode=n;return this},send(v){this.body=v;return this},end(v=''){this.body=v;return this}};
}
const webmHeader=Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0,1,2,3,4]);
const rangeBody=Buffer.alloc(100,7);
let calls=[];
global.fetch=async (url,opts={})=>{
  calls.push({url,opts});
  const range=opts.headers?.Range||opts.headers?.range||'';
  if(opts.method==='HEAD') return new Response(null,{status:200,headers:{'content-type':'video/mp4','content-length':'1000'}});
  if(range==='bytes=0-63') return new Response(webmHeader,{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-15/1000','content-length':String(webmHeader.length)}});
  if(range==='bytes=100-199') return new Response(rangeBody,{status:206,headers:{'content-type':'application/octet-stream','content-range':'bytes 100-199/1000','content-length':'100'}});
  return new Response(Buffer.concat([webmHeader,Buffer.alloc(984)]),{status:200,headers:{'content-type':'application/octet-stream','content-length':'1000'}});
};
process.env.GEMINI_API_KEY='test';
const uri='https://generativelanguage.googleapis.com/test/video';
let res=makeRes();
await handler({method:'HEAD',query:{uri},headers:{}},res);
assert.equal(res.statusCode,200);assert.equal(res.headers['content-type'],'video/webm');assert.match(res.headers['content-disposition'],/\.webm/);
res=makeRes();
await handler({method:'GET',query:{uri},headers:{range:'bytes=100-199'}},res);
assert.equal(res.statusCode,206);assert.equal(res.headers['content-type'],'video/webm');assert.equal(res.headers['content-range'],'bytes 100-199/1000');assert.equal(res.headers['content-length'],'100');
console.log('video MIME/range regression PASS');
