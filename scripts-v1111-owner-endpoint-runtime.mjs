import handler from './api/owner.js';
function run(headers={}){
  return new Promise((resolve,reject)=>{
    const req={headers,body:{}};
    const res={
      statusCode:200,
      status(n){this.statusCode=n;return this},
      json(body){resolve({status:this.statusCode,body});return this}
    };
    try{handler(req,res)}catch(e){reject(e)}
  });
}
const old=process.env.OWNER_CODE;
try{
  delete process.env.OWNER_CODE;
  let r=await run({'x-owner-code':'anything'});
  if(r.status!==503)throw new Error(`expected 503 when unconfigured, got ${r.status}`);
  process.env.OWNER_CODE='test-owner-secret';
  r=await run({'x-owner-code':'wrong'});
  if(r.status!==401)throw new Error(`expected 401 for wrong code, got ${r.status}`);
  r=await run({'x-owner-code':'test-owner-secret'});
  if(r.status!==200||!r.body?.configured)throw new Error(`expected configured owner response, got ${r.status}`);
  console.log('v1.10.20 owner endpoint runtime: PASS');
}finally{
  if(old===undefined)delete process.env.OWNER_CODE;else process.env.OWNER_CODE=old;
}
