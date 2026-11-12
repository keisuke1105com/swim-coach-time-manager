const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fetchSource=html.slice(html.indexOf('function jasfRecordRequestError('),html.indexOf('function jasfResultIdFromMemo('));
const syncSource=html.slice(html.indexOf('let jasfRecordSyncBusy='),html.indexOf('async function updateAllPlayersJasfLaps('));
function fixture(reply){
 let calls=0,writes=0,active=0,maxActive=0;const box={innerHTML:''},records=[{swimmer_id:'p',id:'existing',time_seconds:60}];
 const c=vm.createContext({window:{SUPABASE_URL:'https://example.test'},AbortSignal,setTimeout:fn=>{fn();return 0;},Response,
  $:()=>box,playerById:()=>({id:'p'}),jasfAthleteIds:()=>['test-id'],
  JASF_EVENTS:[{stroke:'自由形',styleCode:1,distances:[{m:50,code:2},{m:100,code:3}]}],
  records,loadCloud:async()=>{},renderHome(){},renderRecords(){},renderAnalysis(){},sec:Number,jasfRecordDate:()=> '2026-11-12',isJasfOfficialRecord:()=>false,
  cleanupExactDuplicatesForPlayerSilent:async()=>0,
  escapeRankingError:v=>String(v).replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  sb:{from(){writes++;throw Error('unexpected write');}},console,
  fetch:async()=>{calls++;active++;maxActive=Math.max(active,maxActive);try{await Promise.resolve();return await reply(calls);}finally{active--;}}
 });
 vm.runInContext(fetchSource+syncSource,c);
 return {c,box,records,get calls(){return calls},get writes(){return writes},get maxActive(){return maxActive}};
}
(async()=>{
 for(const status of [401,403,429]){
  const f=fixture(()=>new Response(JSON.stringify({success:false,status,data:{raw:''}})));
  const result=await f.c.fetchJasfLatest('p');
  assert.equal(f.calls,1);assert.equal(f.writes,0);assert.equal(result.success,false);assert.equal(result.stopped,true);
  assert.ok(f.box.innerHTML.includes('HTTP '+status));assert.ok(!f.box.innerHTML.includes('取得できる公式記録がありません'));assert.equal(f.records[0].id,'existing');
 }
 for(const reply of [()=>new Response('not JSON'),()=>new Response(JSON.stringify({success:true,data:{unexpected:[]}})),()=>{throw Error('offline')}]){
  const f=fixture(reply);const result=await f.c.fetchJasfLatest('p');assert.equal(f.calls,1);assert.equal(result.stopped,true);assert.equal(f.writes,0);
 }
 const empty=fixture(()=>new Response(JSON.stringify({success:true,data:{result:[]}})));
 const result=await empty.c.fetchJasfLatest('p');assert.equal(result.success,true);assert.equal(result.empty,true);assert.equal(empty.calls,4);assert.equal(empty.maxActive,1);assert.equal(empty.writes,0);assert.ok(!empty.box.innerHTML.includes('同期に失敗'));
 // Busy guard prevents a second set of requests while the first run is unresolved.
 let release;const gate=new Promise(resolve=>release=resolve),busy=fixture(async()=>{await gate;return new Response(JSON.stringify({success:false,status:403}));});
 const first=busy.c.fetchJasfLatest('p');const second=await busy.c.fetchJasfLatest('p');assert.equal(second.success,false);release();await first;assert.equal(busy.calls,1);
 // A partial result followed by a restriction must not report a complete sync or request laps.
 const partial=fixture(n=>new Response(JSON.stringify(n===1?{success:true,data:{result:[{year:2026,data:[{result_time:'-',result_date:'11/12'}]}]}}:{success:false,status:403})));
 const incomplete=await partial.c.fetchJasfLatest('p');assert.equal(incomplete.partial,true);assert.equal(incomplete.stopped,true);assert.equal(partial.calls,2);assert.equal(partial.writes,0);assert.ok(partial.box.innerHTML.includes('取得できた公式記録だけ'));assert.ok(!partial.box.innerHTML.includes('同期が完了しました'));
 const bulk=fixture(()=>new Response(JSON.stringify({success:false,status:403})));
 bulk.c.PLAYERS=[{id:'p',name:'試験A'},{id:'q',name:'試験B'}];vm.runInContext(html.slice(html.indexOf('async function updateAllPlayersJasfLaps('),html.indexOf('async function importTestJasfLaps(')),bulk.c);
 await bulk.c.updateAllPlayersJasfLaps();assert.equal(bulk.calls,1);assert.ok(bulk.box.innerHTML.includes('未処理：1名'));assert.ok(!bulk.box.innerHTML.includes('更新が完了しました'));
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 console.log('PASS: upstream 403/429/401 preserved, serial requests, stop on restriction/network/bad schema, true empty results, busy guard, partial/bulk reporting, no record writes on failed sync');
})().catch(e=>{console.error(e);process.exitCode=1});
