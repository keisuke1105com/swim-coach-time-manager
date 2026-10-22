const assert=require('node:assert/strict');const {appRankingContext,tasksFor,cacheResult}=require('../scripts/weekly-rankings.cjs');
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
const player={id:'p',name:'テスト',birth_date:'2012-10-10',gender:'女子',athlete_ids:['58640127']};
let calls=0;const context=appRankingContext(async()=>{calls++;return [{ranking:3,swimmers:{swimmer_code:'9546708',swimmer_name:'テスト',school_class:{code:2},school_grade:2},record:{record:'1:02.20'}}]});
const record={swimmer_id:'p',stroke:'自由形',distance:100,course:'長水路',time_seconds:62.2};
const tasks=tasksFor([player],[record,{...record,time_seconds:65},{...record,course:'短水路'},{...record,swimmer_id:'inactive'},{...record,time_seconds:0}],context);
assert.equal(tasks.length,2);assert.ok(tasks[0].key.endsWith('|長水路'));assert.ok(tasks[1].key.endsWith('|短水路'));
const q=await context.fetchJasfRankingForPlayer(player,'自由形',100,'長水路',2026);assert.equal(q.gradeRank,3);assert.equal(calls,1);
assert.equal(cacheResult({gradeMatched:[]},'now'),null,'unconfirmed never erases success');
const cache=cacheResult(q,'2026-10-22T12:17:00Z');assert.equal(cache.found,true);assert.equal(cache.swimmerCode,'9546708');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const source=html.slice(html.indexOf('function weeklyRankingStatusHtml('),html.indexOf('function sameGradeRankingSummaryHtml('));
let report;const ui=vm.createContext({loadRankingBulkProgress:()=>({weeklyRanking:report})});vm.runInContext(source,ui);assert.ok(ui.weeklyRankingStatusHtml().includes('初回'));
report={status:'partial',checkedAt:'2026-10-22T12:17:00Z',confirmed:3,totalEvents:5,totalPlayers:45,pending:[{},{}],successfulPlayerIds:['p','p']};assert.ok(ui.weeklyRankingStatusHtml().includes('一部未確認'));assert.ok(ui.weeklyRankingStatusHtml().includes('1 / 45名'));assert.ok(ui.weeklyRankingStatusHtml().includes('2種目'));
console.log('PASS: shared swimmer identity, event deduplication, active targets, failure preservation, weekly status, JS syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
