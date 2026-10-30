const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/jasf-ranking/index.ts'),'utf8').replace(/^import .*;\n/,''));
let handler,upstreamCalls=0,credentialChecks=0;
const c=vm.createContext({Response,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,Deno:{env:{get:k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'runtime-server-key'}[k])},serve:fn=>{handler=fn}},createClient:()=>({auth:{getUser:async token=>({data:{user:token==='coach'?{id:'coach'}:null},error:null})}}),fetch:async(url,options)=>{
 if(url.startsWith('https://test.supabase.co/rest/v1/')){
  credentialChecks++;assert.equal(options.headers.Authorization,'Bearer '+options.headers.apikey);
  const key=options.headers.apikey;
  if(key==='network-error')throw Error('offline');
  if(key==='alternate-server-key')return new Response(JSON.stringify([{job_key:'same_grade_2026'}]));
  if(key==='empty-access')return new Response('[]');
  if(key==='wrong-row')return new Response(JSON.stringify([{job_key:'other'}]));
  return new Response('{}',{status:401});
 }
 assert.ok(url.startsWith('https://result.swim.or.jp/api/v1/rankings/results?'));upstreamCalls++;
 return new Response(JSON.stringify({data:[]}));
}});
vm.runInContext(source,c);
const query={year:2026,waterway_code:1,gender_code:2,distance_code:3,swimming_style_code:1,school_class_code:2,school_grade:2,swimmer_name:'テスト',page:1};
const req=(token,body=query)=>({method:'POST',headers:new Headers(token?{authorization:'Bearer '+token}:{}),json:async()=>body});
(async()=>{
 assert.equal((await handler(req(''))).status,401);
 for(const key of ['fake-service-role-jwt','anon','empty-access','wrong-row'])assert.equal((await handler(req(key))).status,401);
 assert.equal((await handler(req('network-error'))).status,503);assert.equal(upstreamCalls,0);
 assert.equal((await handler(req('runtime-server-key'))).status,200);
 assert.equal((await handler(req('coach'))).status,200);assert.equal(credentialChecks,5);
 assert.equal((await handler(req('alternate-server-key'))).status,200);assert.equal(credentialChecks,6);
 assert.equal((await handler(req('runtime-server-key',{...query,page:501}))).status,400);
 assert.equal(upstreamCalls,3);
 console.log('PASS: alternate server credential, runtime credential, coach session, anon/invalid/empty/wrong-row rejection, fail-closed outage, query validation');
})().catch(e=>{console.error(e);process.exitCode=1});

