const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const helpers=html.slice(html.indexOf('async function preserveManualLaps('),html.indexOf('async function cleanupAllExactDuplicates('));
const lap=(record_id,distance,cumulative_seconds)=>({record_id,distance,cumulative_seconds});
function setup(initial,{failInsert=false,hideSaved=false,failDelete=false}={}){
  let manual=structuredClone(initial),raceRows=[{id:'old'},{id:'new'}],events=[];
  const c={records:raceRows,loadCloud:async()=>{},recalcPersonalBests:async()=>{},recordExactKey:()=> 'same',chooseDuplicateKeeper:()=>({id:'new'}),
    fetchAllRows:async(table,build)=>{
      const q={eq(k,v){this.value=v;return this},order(){return this}};build(q);
      return structuredClone(manual.filter(m=>m.record_id===q.value&&!(hideSaved&&q.value==='new')));
    },sb:{from(table){return {insert:async rows=>{
      events.push('copy');if(failInsert)return {error:{message:'offline'}};
      manual.push(...structuredClone(rows));return {error:null};
    },delete(){return {in:async(k,ids)=>{
      events.push('delete');if(failDelete)return {error:{message:'delete failed'}};
      manual=manual.filter(m=>!ids.includes(m.record_id));raceRows=raceRows.filter(r=>!ids.includes(r.id));return {error:null};
    }}}}}}};
  vm.createContext(c);vm.runInContext(helpers,c);
  return {c,get manual(){return manual},get records(){return raceRows},events};
}
(async()=>{
  const checkpoints=[25,75,125,175].map((d,i)=>lap('old',d,[12,46,82,116][i]));
  let x=setup(checkpoints);
  await x.c.removeReplacedRecords({id:'new'},[{id:'old'}]);
  assert.deepEqual(x.manual,checkpoints.map(m=>({...m,record_id:'new'})),'25m checkpoints survive cascading deletion');
  assert.deepEqual(x.events,['copy','delete']);
  await x.c.preserveManualLaps('new',['old']);assert.equal(x.manual.length,4,'retry does not duplicate laps');
  x=setup([lap('old',25,12),lap('new',25,13)]);
  await x.c.removeReplacedRecords({id:'new'},[{id:'old'}]);
  assert.deepEqual(x.manual,[lap('new',25,13)],'manual conflict keeps destination and does not stop sync');
  x=setup([lap('old',25,12),lap('old',50,29),lap('old',75,46),lap('new',50,28.2)]);
  await x.c.removeReplacedRecords({id:'new'},[{id:'old'}]);
  assert.deepEqual(x.manual.map(m=>[m.distance,m.cumulative_seconds]).sort((a,b)=>a[0]-b[0]),[[25,12],[50,28.2],[75,46]],'overlapping checkpoint cannot discard manual-only 25m/75m');
  x=setup([lap('old',25,12),lap('new',25,12)]);
  await x.c.removeReplacedRecords({id:'new'},[{id:'old'}]);assert.equal(x.manual.length,1,'identical checkpoint remains');
  for(const options of [{failInsert:true},{hideSaved:true},{failDelete:true}]){
    x=setup(checkpoints,options);
    await assert.rejects(()=>x.c.removeReplacedRecords({id:'new'},[{id:'old'}]));
    assert.equal(x.manual.filter(m=>m.record_id==='old').length,4,'failed operation keeps source laps');
    assert.ok(x.records.some(r=>r.id==='old'));
  }
  x=setup(checkpoints);
  assert.equal(await x.c.cleanupExactDuplicatesForPlayerSilent(undefined),1);
  assert.equal(x.manual.length,4);assert.ok(x.manual.every(m=>m.record_id==='new'),'automatic duplicate cleanup preserves manual laps');
  // Exercise the actual official-import block, including existing-official and failed-insert paths.
  const syncStart=html.indexOf('      const incomingResultId=');
  const syncEnd=html.indexOf('    // ========================================',syncStart);
  const sync=html.slice(syncStart,syncEnd).replace(/    }\s*$/,'');
  for(const mode of ['new','existing','insert-failure']){
    x=setup(checkpoints);
    const old={id:'old',swimmer_id:'p',record_date:'2026-10-31',stroke:'個人メドレー',distance:200,course:'長水路',time_seconds:134.59,memo:'スクリーンショット解析から登録'};
    const official={...old,id:'new',time_seconds:134.60,memo:'日本水泳連盟 ID:1 / result_id:123'};
    const originalFrom=x.c.sb.from;
    x.c.sb.from=table=>{
      if(table==='swim_manual_laps')return originalFrom(table);
      return {delete:originalFrom(table).delete,insert:payload=>({select:()=>({single:async()=>mode==='insert-failure'?{error:Error('official insert failed')}:{data:{...payload,id:'new'}}})})};
    };
    Object.assign(x.c,{records:mode==='existing'?[old,official]:[old],playerId:'p',stroke:'個人メドレー',distance:200,
      item:{course:'長水路',athleteId:'1',year:2026},x:{result_id:'123'},timeSeconds:134.60,recordDate:'2026-10-31',meetName:'東京SC',
      existingOfficialResultIds:new Set(mode==='existing'?['123']:[]),existingOfficialFallbackKeys:new Set(),
      best:()=>null,joMeetInfo:()=>null,standard:()=>null,isJasfOfficialRecord:r=>r.memo.startsWith('日本水泳連盟'),
      jasfResultIdFromMemo:r=>r.includes('result_id:123')?'123':''});
    const code='(async()=>{let saved=0,unchanged=0;const savedRows=[];for(const once of [1]){'+sync+'}})()';
    if(mode==='insert-failure'){
      await assert.rejects(()=>vm.runInContext(code,x.c),/official insert failed/);
      assert.equal(x.manual.filter(m=>m.record_id==='old').length,4);
      assert.ok(!x.events.includes('delete'));
    }else{
      await vm.runInContext(code,x.c);
      assert.equal(x.manual.length,4);
      assert.ok(x.manual.every(m=>m.record_id==='new'),mode+' official import keeps 25m laps even with corrected finish time');
    }
  }
  // Official points take precedence in display, without changing stored manual points.
  const start=html.indexOf('const officialLaps = laps.map');
  const end=html.indexOf('// 50m種目',start);
  const display=vm.runInNewContext(html.slice(start,end)+';combinedLaps',{
    laps:[{distance:50,cumulative_time:'0:28.10'}],manualLaps:[lap('new',25,12),lap('new',50,29),lap('new',75,46)],r:{id:'new'},fmt:String});
  assert.deepEqual(Array.from(display,l=>[l.distance,l.lap_source]),[[25,'manual'],[50,'official'],[75,'manual']]);
  const lapCode=html.slice(start,html.indexOf('          const lapHtml=',start));
  const timeHelpers=html.slice(html.indexOf('function sec('),html.indexOf('function formatTimeInput('))+html.match(/^function fmt\(.*$/m)[0];
  function calculate(r,manual=[],official=[]){
    const context=vm.createContext({r,laps:official,manualLaps:manual});vm.runInContext(timeHelpers,context);
    return vm.runInContext(lapCode+';({combinedLaps,fiftyMeterLaps})',context);
  }
  const race={id:'r',distance:100,time_seconds:59.87};
  let result=calculate(race,[lap('r',25,12.87),lap('r',50,28.47),lap('r',75,43.81)]);
  let final=result.combinedLaps.at(-1);assert.equal(final.distance,100);assert.equal(final.split_start,75);assert.equal(final.split_time,'16.06');assert.equal(final.lap_source,'finish');assert.equal(result.fiftyMeterLaps[1].time,'31.40');
  result=calculate(race,[lap('r',75,43.81)],[{distance:100,cumulative_time:'59.87'}]);assert.equal(result.combinedLaps.filter(l=>l.distance===100).length,1);assert.equal(result.combinedLaps.at(-1).lap_source,'official');
  assert.equal(calculate(race).combinedLaps.length,0,'no synthetic lap list without checkpoints');
  assert.equal(calculate(race,[lap('r',75,60)]).combinedLaps.some(l=>l.lap_source==='finish'),false,'invalid checkpoint cannot produce a negative final split');
  assert.equal(calculate({id:'r',distance:50,time_seconds:30},[lap('r',25,12.5)]).combinedLaps.at(-1).split_time,'17.50');
  assert.equal(calculate({id:'r',distance:200,time_seconds:127},[lap('r',175,110)]).combinedLaps.at(-1).split_time,'17.00');
  console.log('PASS: 100m final 75–100m split 16.06, 50m/200m finish splits, no duplicate finish, no negative split, existing 50m intervals unchanged');
  console.log('PASS: replacement/cascade, duplicate cleanup, retry, conflicts, insert/read/delete failures, official/manual display');
})().catch(e=>{console.error(e);process.exitCode=1});
