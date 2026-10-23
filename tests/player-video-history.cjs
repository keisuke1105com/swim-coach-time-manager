const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('video-analysis.js','utf8');
const record={id:'saved',swimmer_id:'a',record_date:'2026-10-22',stroke:'平泳ぎ',distance:25,time_seconds:17,analysis:{id:'source',athlete:'テスト',stroke:'平泳ぎ',distance:25,practiceDate:'2026-10-22',marks:{0:3,25:20}}};
let nodes={},pending,clicked='',payload;
const node=(extra={})=>({textContent:'',innerHTML:'',style:{},dataset:{},appendChild(x){(this.children||=[]).push(x)},...extra});
const context={PLAYERS:[{id:'a',name:'テスト'}],session:{user:{id:'coach'}},shareAdmin:true,
  document:{getElementById:id=>nodes[id],createElement:()=>node()},
  fetchAllRows:async(table,build)=>{const query={eq(col,value){assert.equal(col,'swimmer_id');assert.equal(value,'a');return this},order(){return this}};if(build)build(query);if(pending)return pending;return [record]},
  sb:{from:()=>({upsert:(p)=>{payload=p;return {select:async()=>({data:[{id:'saved'}]})}}})},
  playerById:()=>({name:'テスト'}),go:()=>{},showPlayerDetail:id=>clicked=id,alert:()=>{throw Error('unexpected alert')}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
  nodes.playerVideoAnalyses=node({dataset:{playerId:'a'}});
  await context.renderPlayerVideoAnalyses('a');
  assert.ok(nodes.playerVideoAnalyses.innerHTML.includes('最新'));
  assert.ok(nodes.playerVideoAnalyses.innerHTML.includes('17.000秒'));
  assert.ok(!nodes.playerVideoAnalyses.innerHTML.includes('details open'));
  let resolve;pending=new Promise(r=>resolve=r);const old=nodes.playerVideoAnalyses;
  const slow=context.renderPlayerVideoAnalyses('a');nodes.playerVideoAnalyses=node({dataset:{playerId:'b'},textContent:'別の選手'});resolve([record]);await slow;
  assert.equal(nodes.playerVideoAnalyses.textContent,'別の選手');assert.equal(old.innerHTML.includes('最新'),true);pending=null;
  delete nodes.playerVideoAnalyses;
  for(const id of ['videoImportSave','videoBackupFile','videoImportStatus','videoSavedList'])nodes[id]=node();
  nodes.videoPlayerFilter={value:''};
  vm.runInContext(`videoImportRows=parseVideoBackup(${JSON.stringify({format:'swim-split-backup',version:1,records:[record.analysis]})})`,context);
  await context.saveVideoAnalyses();assert.equal(payload[0].swimmer_id,'a');
  assert.ok(nodes.videoImportStatus.textContent.includes('1件を保存'));
  nodes.videoImportStatus.children[0].onclick();assert.equal(clicked,'a');
  const page=fs.readFileSync('index.html','utf8');assert.ok(page.includes('growthHistory.slice(0,5)'));assert.ok(page.includes('growthHistory.slice(5)'));assert.ok(page.includes('max-height:420px'));assert.ok(page.includes('renderPlayerVideoAnalyses(id)'));
  console.log('PASS: swimmer analysis display, stale-response protection, save-to-player link and compact history');
})().catch(e=>{console.error(e);process.exitCode=1});
