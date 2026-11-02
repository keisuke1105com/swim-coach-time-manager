const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../scripts/weekly-rankings.cjs'),'utf8');
(async()=>{
 const published=[],moduleStub={exports:{}},processStub={env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'},exitCode:0};
 const req=name=>require(name);req.main=moduleStub;
 let clock=0,calls=0,finish;const done=new Promise(resolve=>finish=resolve);
 class TestDate extends Date{static now(){return clock;}}
 const player={id:'p',name:'テスト',birth_date:'2012-10-10',gender:'女子',athlete_ids:['58640127']};
 const records=[50,100,200].map(distance=>({swimmer_id:'p',stroke:'自由形',distance,course:'長水路',time_seconds:60}));
 vm.runInNewContext(source,{require:req,module:moduleStub,__dirname:path.join(__dirname,'../scripts'),process:processStub,Date:TestDate,URLSearchParams,AbortSignal,setTimeout:fn=>{fn();return 0;},clearTimeout,console:{log:text=>finish(JSON.parse(text)),error:()=>finish(null)},fetch:async(url,options)=>{
  if(url.includes('/functions/')){calls++;clock=151*60000;return new Response(JSON.stringify({success:true,data:[{ranking:3,swimmers:{swimmer_code:'9546708',swimmer_name:'テスト',school_class:{code:2},school_grade:2}}]}));}
  if(options.method==='POST'){published.push(JSON.parse(options.body));return new Response('{}');}
  if(url.includes('/swimmers?'))return new Response(JSON.stringify([player]));
  if(url.includes('/swim_records?'))return new Response(JSON.stringify(records));
  return new Response(JSON.stringify([{progress:{}}]));
 }});
 const summary=await done,report=published.at(-1).p_progress.weeklyRanking;
 assert.ok(summary);assert.equal(calls,1);assert.equal(processStub.exitCode,1);
 assert.equal(report.stopReason,'time_budget');assert.equal(report.attempted,1);
 assert.equal(report.pendingReasons.unprocessed,2);assert.equal(report.pendingReasons.pref_unknown,1);
 assert.equal(Object.keys(report.outcomes).length,1);
 const {retryTasks}=require('../scripts/weekly-rankings.cjs');
 assert.deepEqual(retryTasks(report.pending,report).map(t=>t.distance),[100,200,50]);
 console.log('PASS: time budget preserves unprocessed tasks, records per-event cause, resumes untouched events first');
})().catch(e=>{console.error(e);process.exitCode=1});
