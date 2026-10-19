const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const joSource=html.slice(html.indexOf('let joRanking=Object.values('),html.indexOf('  let joRankingHtml='));
const joBestMap={};
for(let i=0;i<35;i++)joBestMap[i]={player:{id:i},standard:90,time:100};
joBestMap.below={player:{id:'below'},standard:89.99,time:100};
joBestMap.duplicate={player:{id:0},standard:101,time:100};
let result=vm.runInNewContext(joSource+';joRanking',{joBestMap});
assert.equal(result.length,20,'eligible swimmers are capped at 20');
assert.equal(result[0].player.id,0);
assert.equal(result[0].qualified,true);
assert.equal(result.some(x=>x.player.id==='below'),false);
assert.equal(vm.runInNewContext(joSource+';joRanking.length',{joBestMap:{boundary:{player:{id:'boundary'},standard:90,time:100}}}),1,'exactly 90% is included');
assert.equal(vm.runInNewContext(joSource+';joRanking.length',{joBestMap:{below:joBestMap.below}}),0,'below 90% is excluded before limiting');
assert.equal(vm.runInNewContext(joSource+';joRanking.length',{joBestMap:{}}),0);
const ageSource=html.slice(html.indexOf('function ageOnDate('),html.indexOf('function joMeetInfo('));
const gradeSource=html.slice(html.indexOf('  function schoolGrade2026('),html.indexOf('  const yamanashiBestMap='));
const prefSource=html.slice(html.indexOf('  const yamanashiBestMap='),html.indexOf('  const tokyoQual='));
const players=[{id:'a',name:'A<script>',birth_date:'2012-10-10',gender:'女子'},
  {id:'b',name:'B',birth_date:'2012-10-10',gender:'男子'},
  {id:'unknown',name:'不明',gender:'女子'}];
const record=(id,course,time,distance=100)=>({swimmer_id:id,stroke:'自由形',distance,course,time_seconds:time});
const records=[record('a','短水路',60),record('a','短水路',55),record('a','長水路',65),
  record('b','短水路',55),record('unknown','短水路',1),record('a','短水路',0),record('a','短水路',1,50)];
const standards=[{gender:'女子',grade:'中2',stroke:'自由形',distance:100,course:'短水路',seconds:55},
  {gender:'女子',grade:'中2',stroke:'自由形',distance:100,course:'長水路',seconds:60},
  {gender:'男子',grade:'中2',stroke:'自由形',distance:100,course:'短水路',seconds:50}];
function run(rs=records,ps=players){
  const context={records:rs,PLAYERS:ps,playerById:id=>ps.find(p=>p.id===id),window:{YAMANASHI_2026_STANDARDS:standards},fmt:n=>Number(n).toFixed(2)};
  return vm.runInNewContext(ageSource+gradeSource+prefSource+';({yamanashiRanking,yamanashiQual,yamanashiQualifiedPlayers,yamanashiRankingHtml,yamanashiQualifierHtml})',context);
}
result=run();
assert.equal(result.yamanashiRanking.length,2,'one event per eligible swimmer');
assert.equal(result.yamanashiRanking[0].time,55,'best historical time is used');
assert.equal(result.yamanashiRanking[0].standard,55,'gender, grade and course match');
assert.equal(result.yamanashiRanking[0].qualified,true,'equal standard qualifies');
assert.equal(result.yamanashiRanking[1].standard,50,'male standard stays separate');
assert.equal(result.yamanashiQualifiedPlayers,1,'existing qualifier count retained');
assert.equal(result.yamanashiQual.length,1,'existing event list retained');
assert.ok(result.yamanashiRankingHtml.includes('A&lt;script&gt;'));
assert.ok(result.yamanashiRankingHtml.includes('あと 5.00秒'));
assert.equal(run([],[]).yamanashiRanking.length,0);
const many=Array.from({length:25},(_,i)=>({...players[0],id:String(i),name:`選手${i}`}));
assert.equal(run(many.map(p=>record(p.id,'短水路',55)),many).yamanashiRanking.length,20);
console.log('PASS: JO 90% boundary/deduplication, prefectural standards/ranking/qualifier counts, empty states, top20, escaping, inline syntax');
