const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const api=require('../screenshot-import.js');
const players=[{id:'sample',name:'サンプル 選手'}],meta={date:'2026-11-15',meet:'テスト大会'};
const draft={playerId:'sample',name:'サンプル 選手',ocrName:'サンプル 選手',stroke:'自由形',distance:100,course:'長水路',time:'1:02.34',lapText:'50m 30.12\n100m 1:02.34',save:true,verified:true};
assert.equal(api.seconds('19.90'),19.9,'no invented minute');
assert.ok(Number.isNaN(api.seconds('1:62.34')));
assert.throws(()=>api.validate([draft],{...meta,date:''},players));
assert.throws(()=>api.validate([draft],{...meta,date:'2026-02-30'},players));
for(const change of [{verified:false},{course:''},{playerId:'stranger'},{time:'[24.23]'},{lapText:'100m 1:02.34'},{lapText:'50m 30.12\n100m 1:03.34'}])assert.throws(()=>api.validate([{...draft,...change}],meta,players));
assert.throws(()=>api.validate([{...draft,ocrName:'別の 選手'}],meta,players),'another athlete is blocked');
assert.equal(api.validate([{...draft,ocrName:'誤読',imageName:'サンプル 選手'}],meta,players).length,1,'explicit OCR name correction is allowed');
assert.equal(api.validate([draft],meta,players)[0].laps[1].split_time,'32.22');
const parsed=api.parse('50m自由形 タイム決勝\nサンプル 選手\nクラブ（一般）\n24.57\n[24.23]\n● 50m 24.57 24.57 RT:0.57\n無関係 選手 25.18',players,{stroke:'自由形',distance:50});
assert.equal(parsed.length,2);assert.equal(parsed[0].time,'24.57');assert.equal(parsed[0].lapText,'50m 24.57');assert.equal(parsed[0].playerId,'sample');assert.equal(parsed[1].playerId,'');assert.ok(parsed.every(r=>!r.save&&!r.verified&&r.course===''));
const html=fs.readFileSync('index.html','utf8');
const eventContext={normalizeOcrText:t=>String(t).replace(/\s+/g,' ').trim()};
vm.createContext(eventContext);
vm.runInContext(html.slice(html.indexOf('function detectShotEvent('),html.indexOf('function parseShotRows(')),eventContext);
const syntheticOcr='100m 自 由 形 タイ ム 決 勝\nテス ト 選手 1:02.34\n[1:01.00]\n50m 30.12 30.12 RT:0.57\n100m 1:02.34 32.22';
const syntheticEvent=eventContext.detectShotEvent(syntheticOcr);
assert.equal(syntheticEvent.stroke,'自由形');assert.equal(syntheticEvent.distance,100);
const syntheticRows=api.parse(syntheticOcr,[{id:'ocr',name:'テスト 選手'}],syntheticEvent);
assert.equal(syntheticRows[0].playerId,'ocr');assert.equal(syntheticRows[0].time,'1:02.34');assert.equal(syntheticRows[0].lapText,'50m 30.12\n100m 1:02.34');
// Production loadCloud normally reports failures in the UI. Saving a screenshot
// must also receive that failure instead of treating it as an empty record set.
const cloudContext={PLAYERS:players,records:[{id:'keep'}],setStatus(){},fetchAllRows:async()=>{throw Error('read failed')}};
vm.createContext(cloudContext);
vm.runInContext(html.slice(html.indexOf('async function loadCloud('),html.indexOf('\nasync function ',html.indexOf('async function loadCloud(')+1)),cloudContext);
// All inline scripts must parse, including generated event-handler strings.
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
function fixture({fail=false,duplicate=false}={}){
 const nodes={},events=[],alerts=[];const element=()=>({innerHTML:'',textContent:'',disabled:false,setAttribute(){},remove(){delete nodes.shotFinalReview},querySelectorAll(){return []},appendChild(n){nodes[n.id]=n},scrollIntoView(){}});
 nodes.screenshotResults=element();nodes.screenshotStatus=element();nodes.screenshotFile=element();
 const key=r=>[r.swimmer_id,r.stroke,r.distance,r.course,r.time_seconds,r.record_date].join('|');
 const existing={id:'existing',swimmer_id:'sample',stroke:'自由形',distance:100,course:'長水路',time_seconds:62.34,record_date:meta.date,laps:[{distance:50,cumulative_time:'30.12'}]};
 const context={ScreenshotImport:api,PLAYERS:players,records:duplicate?[structuredClone(existing)]:[],screenshotRows:[structuredClone(draft)],$:s=>nodes[s.slice(1)],document:{createElement:element},alert:x=>alerts.push(x),playerById:id=>players.find(p=>p.id===id),recordExactKey:key,loadCloud:async()=>{events.push('read')},joMeetInfo:()=>null,standard:()=>null,recalcPersonalBests:async()=>{events.push('best')},renderHome(){},renderPlayers(){},renderAnalysis(){},sb:{from(table){assert.equal(table,'swim_records');return {insert(payload){events.push('insert');return {select(){return {single:async()=>fail?{error:Error('test failure')}:{data:{...payload,id:'new'}}}}}}}}}};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function shotEscape('),html.indexOf('const analysisUiState=')),context);
 vm.runInContext(`screenshotMeta=${JSON.stringify(meta)}`,context);
 return {context,nodes,events,alerts,existing};
}
(async()=>{
 await assert.rejects(cloudContext.loadCloud({throwOnError:true}),/read failed/);
 assert.equal(cloudContext.records[0].id,'keep','strict refresh failure preserves the local record list');
 let x=fixture();x.context.saveScreenshotRows();assert.deepEqual(x.events,[],'preview never writes or reads live data');assert.match(x.nodes.shotFinalReview.innerHTML,/確認して保存/);
 x.context.cancelScreenshotImport();await x.context.commitScreenshotReview();assert.deepEqual(x.events,[],'cancelled snapshot cannot save');
 x=fixture();x.context.saveScreenshotRows();x.context.updateShot(0,'time','1:03.00');await x.context.commitScreenshotReview();assert.deepEqual(x.events,[],'editing invalidates confirmation');
 x=fixture();x.context.saveScreenshotRows();await Promise.all([x.context.commitScreenshotReview(),x.context.commitScreenshotReview()]);assert.equal(x.events.filter(e=>e==='insert').length,1,'double click writes once');assert.ok(x.events.indexOf('insert')<x.events.indexOf('best'));
 x=fixture({duplicate:true});const before=JSON.stringify(x.context.records);x.context.saveScreenshotRows();await x.context.commitScreenshotReview();assert.ok(!x.events.includes('insert')&&!x.events.includes('best'));assert.equal(JSON.stringify(x.context.records),before,'duplicates preserve existing laps and record');
 x=fixture({fail:true});x.context.saveScreenshotRows();await x.context.commitScreenshotReview();assert.ok(!x.events.includes('best'),'failed insert never clears best flags');await x.context.commitScreenshotReview();assert.equal(x.events.filter(e=>e==='insert').length,1,'failure requires a new confirmation');
 console.log('PASS: screenshot parsing, bracket/RT exclusion, no inference, lap validation, preview/cancel/edit gates, duplicate preservation, double-save guard, failed-insert best preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
