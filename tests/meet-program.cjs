const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
global.MeetEntryPdf=require('../meet-entry-pdf.js');const P=require('../meet-program-pdf.js');
const row=(name='試験 花',team='試験SC')=>`2. ${name} ( ${team} ) 小5 : .`;
const pages=[[
 ['No.1 全年齢女子 100m自由形タイム決勝',row(),'3. ( ) : .','No.2 全年齢男子 50m平泳ぎ予選','1組','1. 試験 太郎 ( 試験SC ) 中1 : .'],
 ['2組',row('試験 次郎'),'No.3 全年齢女子 50m自由形予選','1組',row()]
],[['2組',row('試験 夏')],['No.4 全年齢女子 50m自由形決勝',row()]]];
const parsed=P.parsePages(pages);
assert.equal(parsed.eventCount,4);assert.equal(parsed.rows.length,6);
assert.equal(parsed.rows[0].heat_inferred,true);assert.equal(parsed.rows[2].program_number,2);assert.equal(parsed.rows[2].heat,2);
assert.equal(parsed.rows[4].program_number,3);assert.equal(parsed.rows[4].heat,2);assert.equal(parsed.rows[4].page,2);
assert.equal(parsed.rows[5].round,'決勝');
assert.throws(()=>P.parsePages([[['No.1 全年齢女子 50m自由形予選',row(),row()],[]]]),/重複/);
assert.throws(()=>P.parsePages([[['No.1 全年齢女子 200mメドレーリレー予選'],[]]]),/対応していない/);
assert.throws(()=>P.parsePages([[[row()],[]]]),/見出し/);
assert.throws(()=>P.parsePages([[['No.1 全年齢女子 50m自由形予選','2. 名前 ( ) 小5 : .'],[]]]),/不完全/);
const players=[{id:'p',name:'試験　花',gender:'女子'}],entry={id:'e',swimmer_id:'p',meet_id:'m',stroke:'自由形',distance:100,course:'短水路'};
assert.equal(P.matchEntry(parsed.rows[0],players,[entry],'m','短水路').entry.id,'e');
assert.equal(P.matchEntry(parsed.rows[0],players,[entry],'other','短水路').entry,null);
assert.equal(P.matchEntry(parsed.rows[0],players,[entry],'m','長水路').entry,null);
assert.equal(P.matchEntry(parsed.rows[0],[...players,{...players[0],id:'p2'}],[entry],'m','短水路').entry,null);
const c={window:{MeetEntryPdf:global.MeetEntryPdf}};vm.createContext(c);
for(const file of ['meet-program-import-ui.js','meet-entry-import-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const assignment={program_number:1,round:'予選',heat:2,lane:0,race_date:'2026-11-08'};
assert.ok(c.window.meetProgramHtml({programs:[assignment]}).includes('0レーン'));
assert.ok(c.window.meetProgramHtml({programs:[{...assignment,round:'<x>'}]}).includes('&lt;x&gt;'));
assert.ok(c.window.renderMeetEventList({id:'m'},[{...entry,programs:[assignment]}],players).includes('No.1 ／ 予選 ／ 2組 ／ 0レーン'));
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
console.log('PASS: two columns, continuation across columns/pages, implicit single heat, empty lanes, rounds, duplicate slots, strict entry matching, escaped rendering, script syntax');
