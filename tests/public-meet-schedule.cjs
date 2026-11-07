const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const base=path.join(__dirname,'..');
const tokyo='9cfab7f6-d11d-4688-a651-dfee38168f26';
const token='11111111-1111-4111-8111-111111111111';
const otherToken='22222222-2222-4222-8222-222222222222';
const rows={
 swimmer_public_shares:[{swimmer_id:'own',share_token:token,is_enabled:true,consent_confirmed_at:'2026-01-01'}],
 swimmers:[{id:'own',name:'本人',gender:'男子',active:true},{id:'other',name:'他の選手',gender:'女子',active:true}],
 swim_meet_swimmers:[{swimmer_id:'own',meet_id:tokyo},{swimmer_id:'other',meet_id:tokyo},{swimmer_id:'own',meet_id:'future'},{swimmer_id:'own',meet_id:'past'}],
 swim_meets:[{id:tokyo,name:'東京SC<招待>',meet_date:'2026-10-30',venue:'会場',notes:'private'},
  {id:'future',name:'別大会',meet_date:'2026-11-08',venue:'別会場'},
  {id:'past',name:'過去大会',meet_date:'2026-10-29'},
  {id:'unlinked',name:'未参加大会',meet_date:'2026-11-01'}],
 swim_meet_entries:[{swimmer_id:'own',meet_id:tokyo,stroke:'自由形',distance:50,course:'長水路',entry_seconds:25,entry_class:'14～15歳'},
  {swimmer_id:'own',meet_id:tokyo,stroke:'背泳ぎ',distance:200,course:'長水路',entry_seconds:130},
  {swimmer_id:'other',meet_id:tokyo,stroke:'バタフライ',distance:100,course:'長水路',entry_seconds:60},
  {swimmer_id:'own',meet_id:'future',stroke:'平泳ぎ',distance:100,course:'短水路',entry_seconds:70}]
};
function client(data,log=[]){return {from(table){
 let values=[...(data[table]||[])],fields=null,single=false;
 const call={table,filters:[]};log.push(call);
 const q={select(s){fields=s.split(',').map(x=>x.trim());call.fields=s;return q},eq(k,v){call.filters.push([k,v]);values=values.filter(x=>x[k]===v);return q},
  not(k,op,v){values=values.filter(x=>x[k]!==v);return q},in(k,ids){(call.inFilters??=[]).push([k,ids]);values=values.filter(x=>ids.includes(x[k]));return q},
  gte(k,v){values=values.filter(x=>x[k]>=v);return q},order(k){values.sort((a,b)=>String(a[k]).localeCompare(String(b[k])));return q},
  limit(n){values=values.slice(0,n);return q},range(a,b){values=values.slice(a,b+1);return q},maybeSingle(){single=true;return q},
  then(ok,bad){const projected=values.map(x=>Object.fromEntries(fields.map(k=>[k,x[k]])));return Promise.resolve({data:single?(projected[0]||null):projected,error:null}).then(ok,bad)}};return q;
 }};}
const meetsSource=fs.readFileSync(path.join(base,'supabase/functions/swimmer-public-profile/meets.ts'),'utf8');
const context={};vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(meetsSource.replace('export async function','async function')),context);
const ui={window:{}};vm.createContext(ui);
for(const file of ['meet-schedules.js','public-meet-schedule.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),ui);
const clean=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const log=[];const own=clean(await context.getPublicMeetSchedule(client(rows,log),'own','2026-11-01'));
 const meet=own.find(x=>x.id===tokyo);assert.equal(meet.events.length,2);assert.equal(meet.end_date,'2026-11-03');
 assert.deepEqual(own.map(m=>m.id),[tokyo,'future']);
 for(const e of meet.events)assert.deepEqual(Object.keys(e).sort(),['course','distance','stroke']);
 assert.ok(!JSON.stringify(own).includes('private'));assert.ok(!JSON.stringify(own).includes('他の選手'));
 const query=log.find(x=>x.table==='swim_meet_entries');assert.deepEqual(query.filters,[['swimmer_id','own']]);assert.deepEqual(query.inFilters,[['meet_id',[tokyo,'future']]]);
 const autumn=own.find(m=>m.id==='future');assert.equal(autumn.events.length,1);assert.equal(autumn.events[0].stroke,'平泳ぎ');
 const autumnHtml=ui.window.renderPublicMeetEvents(autumn,{gender:'男子'});assert.ok(autumnHtml.includes('100m 平泳ぎ'));assert.ok(!autumnHtml.includes('No.'));assert.ok(!autumnHtml.includes('背泳ぎ'));assert.ok(!autumnHtml.includes('70.00'));
 const other=clean(await context.getPublicMeetSchedule(client(rows),'other','2026-10-28'));
 assert.equal(other[0].events.length,1);assert.equal(other[0].events[0].stroke,'バタフライ');
 assert.equal((await context.getPublicMeetSchedule(client(rows),'missing','2026-10-28')).length,0);
 assert.ok((await context.getPublicMeetSchedule(client(rows),'own','2026-11-03')).some(m=>m.id===tokyo));
 assert.ok(!(await context.getPublicMeetSchedule(client(rows),'own','2026-11-04')).some(m=>m.id===tokyo));
 const removed={...rows,swim_meet_swimmers:rows.swim_meet_swimmers.filter(x=>x.swimmer_id!=='own'||x.meet_id!==tokyo)};
 assert.ok(!(await context.getPublicMeetSchedule(client(removed),'own','2026-10-28')).some(m=>m.id===tokyo));
 const html=ui.window.renderPublicMeetEvents(meet,{gender:'男子'});
 assert.ok(html.includes('第1日｜10/30'));assert.ok(html.includes('第3日｜11/01'));assert.ok(!html.includes('第2日'));
 assert.ok(html.indexOf('No.4｜200m 背泳ぎ')<html.indexOf('No.74｜50m 自由形'));
 assert.ok(!html.includes('バタフライ'));assert.ok(!html.includes('25.00'));
 assert.ok(html.includes('区分決勝・決勝は進出時のみ'));
 assert.ok(ui.window.renderPublicMeetEvents({...meet,events:[]},{gender:'男子'}).includes('まだ登録'));
 assert.ok(ui.window.renderPublicMeetEvents({id:'future'},{}).includes('まだ登録'));
 assert.ok(ui.window.renderPublicMeetEvents({...meet,events:[{stroke:'<script>',distance:25,course:'長水路'}]},{gender:'男子'}).includes('&lt;script&gt;'));

 const detailed=structuredClone(rows);
 detailed.swim_meet_entries=detailed.swim_meet_entries.map((r,i)=>({...r,id:'entry-'+i}));
 detailed.swim_meet_entries.push({id:'entry-4',swimmer_id:'own',meet_id:'future',stroke:'自由形',distance:200,course:'短水路'});
 detailed.swim_meet_programs=[
  {entry_id:'entry-3',race_date:'2026-11-08',round:'タイム決勝',program_number:4,heat:2,lane:0,source:'private.pdf'},
  {entry_id:'entry-4',race_date:'2026-11-08',round:'タイム決勝',program_number:32,heat:3,lane:5},
  {entry_id:'entry-2',race_date:'2026-11-08',round:'決勝',program_number:999,heat:9,lane:9,source:'other-private.pdf'}
 ];
 detailed.swim_meet_timetable=[
  {meet_id:'future',race_date:'2026-11-08',gender:'女子',course:'短水路',stroke:'平泳ぎ',distance:100,round:'タイム決勝',program_number:3,scheduled_time:'10:43:00',source:'private-times.pdf'},
  {meet_id:'future',race_date:'2026-11-08',gender:'女子',course:'短水路',stroke:'自由形',distance:200,round:'タイム決勝',program_number:31,scheduled_time:'15:01:00'},
 ];
 const detailsLog=[],details=clean(await context.getPublicMeetSchedule(client(detailed,detailsLog),'own','2026-11-07','男子'));
 const future=details[0],breast=future.events.find(e=>e.stroke==='平泳ぎ'),free=future.events.find(e=>e.stroke==='自由形');
 assert.equal(breast.programs[0].scheduled_time,'10:45');assert.equal(breast.programs[0].time_estimated,true);assert.equal(breast.programs[0].lane,0);
 assert.equal(free.programs[0].program_number,32);assert.equal(free.programs[0].scheduled_time,'15:03');
 for(const forbidden of ['entry_id','swimmer_id','source','private','999','entry_seconds','entry_class'])assert.ok(!JSON.stringify(details).includes(forbidden));
 assert.deepEqual(clean(detailsLog.find(c=>c.table==='swim_meet_programs').inFilters),[['entry_id',['entry-3','entry-4']]]);
 const detailHtml=ui.window.renderPublicMeetEvents({...future,events:[free,breast]},{gender:'男子'});
 assert.ok(detailHtml.indexOf('No.4｜')<detailHtml.indexOf('No.32｜'));assert.ok(detailHtml.includes('2組 ／ 0レーン'));assert.ok(detailHtml.includes('15:03 競技開始の目安（女子＋2分）'));
 detailed.swim_meet_timetable.push({...detailed.swim_meet_timetable[0],gender:'男子',program_number:4,scheduled_time:'10:50:00'});
 const explicit=clean(await context.getPublicMeetSchedule(client(detailed),'own','2026-11-07','男子'))[0].events.find(e=>e.stroke==='平泳ぎ').programs[0];
 assert.equal(explicit.scheduled_time,'10:50');assert.equal(explicit.time_estimated,false);
 const explicitHtml=ui.window.renderPublicMeetEvents({events:[{stroke:'平泳ぎ',distance:100,course:'短水路',programs:[explicit]}]},{gender:'男子'});assert.ok(explicitHtml.includes('10:50 競技開始予定'));
 const withoutPrograms={...detailed,swim_meet_programs:[]};
 const onlyTimes=clean(await context.getPublicMeetSchedule(client(withoutPrograms),'own','2026-11-07','男子'))[0];
 assert.ok(ui.window.renderPublicMeetEvents(onlyTimes,{gender:'男子'}).includes('10:50 競技開始予定'));
 const malicious=ui.window.renderPublicMeetEvents({events:[{stroke:'<script>',distance:50,course:'短水路',programs:[{race_date:'<img>',round:'<svg>',program_number:1,heat:1,lane:1,scheduled_time:'<iframe>'}]}]},{});
 assert.ok(!malicious.includes('<script>'));assert.ok(malicious.includes('&lt;svg&gt;'));

 // Exercise the actual handler: disabled/unconsented/inactive tokens never reach meet queries.
 const raw=fs.readFileSync(path.join(base,'supabase/functions/swimmer-public-profile/index.ts'),'utf8');
 let handler,db;const handlerContext={Response,URL,JO_STANDARDS:[],YAMANASHI_2026_STANDARDS:[],console,
  createClient:()=>db,mergePublicLaps:()=>[],getPublicMeetSchedule:(sb,id,today,gender)=>context.getPublicMeetSchedule(sb,id,'2026-10-28',gender),
  Deno:{env:{get:()=> 'test-config'},serve:fn=>handler=fn}};
 vm.runInNewContext(stripTypeScriptTypes(raw.replace(/^import .*;\n/gm,'')),handlerContext);
 const request=t=>new Request('https://example.test/profile?token='+t+'&swimmer_id=other');
 db=client(rows);let res=await handler(request(token));assert.equal(res.status,200);
 let body=await res.json();assert.equal(body.swimmer.name,'本人');assert.equal(body.meets.find(m=>m.id===tokyo).events.length,2);
 assert.ok(!JSON.stringify(body.meets).includes('swimmer_id'));
 db=client(detailed);res=await handler(request(token));body=await res.json();assert.equal(body.meets.find(m=>m.id==='future').events.find(e=>e.stroke==='平泳ぎ').programs[0].scheduled_time,'10:50');
 for(const change of [{is_enabled:false},{consent_confirmed_at:null}]){
  const calls=[];db=client({...rows,swimmer_public_shares:[{...rows.swimmer_public_shares[0],...change}]},calls);
  res=await handler(request(token));assert.equal(res.status,404);assert.ok(!calls.some(x=>x.table==='swim_meet_entries'));
 }
 db=client({...rows,swimmers:[{...rows.swimmers[0],active:false}]});assert.equal((await handler(request(token))).status,404);
 db=client(rows);assert.equal((await handler(request(otherToken))).status,404);assert.equal((await handler(request('bad'))).status,400);
 const index=fs.readFileSync(path.join(base,'index.html'),'utf8');
 assert.ok(index.includes('renderPublicMeetEvents(m,swimmer)'));assert.ok(index.includes('id="share-meets"'));
 assert.ok(index.includes('meDays(m.end_date)>=0'));assert.ok(index.includes('public-meet-schedule.js'));
 for(const m of index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 console.log('PASS: scoped program/lane/times, estimates vs official, sorted public UI, private-field removal, own events only, token/consent/active gates, no private fields/entry times, participant removal, five-day visibility, race order, empty/unknown events, escaped UI and profile syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
