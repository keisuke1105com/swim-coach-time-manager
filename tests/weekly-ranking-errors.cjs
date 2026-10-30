const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../scripts/weekly-rankings.cjs'),'utf8');
async function scenario(httpStatus,error){
 const published=[],moduleStub={exports:{}},processStub={env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'},exitCode:0};
 const req=name=>require(name);req.main=moduleStub;
 let calls=0,finish;
 const done=new Promise(resolve=>finish=resolve);
 const player={id:'p',name:'テスト',birth_date:'2012-10-10',gender:'女子',athlete_ids:['58640127']};
 const record={swimmer_id:'p',stroke:'自由形',distance:100,course:'長水路',time_seconds:62.2};
 vm.runInNewContext(source,{require:req,module:moduleStub,__dirname:path.join(__dirname,'../scripts'),process:processStub,URLSearchParams,AbortSignal,setTimeout,clearTimeout,console:{log:text=>finish(JSON.parse(text)),error:()=>finish(null)},fetch:async(url,options)=>{
  if(url.includes('/functions/')){calls++;return new Response(JSON.stringify({success:false,error}),{status:httpStatus});}
  if(options.method==='POST'){published.push(JSON.parse(options.body));return new Response('{}');}
  if(url.includes('/swimmers?'))return new Response(JSON.stringify([player]));
  if(url.includes('/swim_records?'))return new Response(JSON.stringify([record]));
  return new Response(JSON.stringify([{progress:{}}]));
 }});
 const report=await done;
 assert.equal(calls,1);assert.equal(processStub.exitCode,1);
 assert.equal(report.confirmed,0);assert.equal(report.pending,1);
 assert.ok(published.length>=2);for(const p of published)assert.deepEqual(p.p_ranking_cache,{});
 assert.equal(published.at(-1).p_progress.weeklyRanking.lastError,report.lastError);
 return report.lastError;
}
(async()=>{
 assert.equal(await scenario(401,'Invalid session'),'ranking_server_auth_or_limit');
 assert.equal(await scenario(502,'JASF HTTP 403'),'upstream_access_restricted');
 console.log('PASS: worker stops after one auth/restriction failure, classifies errors, checkpoints pending task, never overwrites ranking');
})().catch(e=>{console.error(e);process.exitCode=1});
