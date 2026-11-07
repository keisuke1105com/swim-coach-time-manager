const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),context={window:{},console:{log(){}}};vm.createContext(context);
for(const file of ['data.js','yamanashi_2026.js','tokyo_sc.js','standard-catalog.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(html.slice(html.indexOf('const YUME_CUP_STANDARDS='),html.indexOf('function schoolGrade2027')),context);
const data=vm.runInContext('({jo:STANDARDS,yamanashi:window.YAMANASHI_2026_STANDARDS,tokyo:window.TOKYO_SC_STANDARDS,yume:YUME_CUP_STANDARDS})',context);
const C=context.window.StandardCatalog,all=C.sources(data);
assert.equal(all.length,4);
const jo=all.find(x=>x.id==='jo');assert.equal(jo.rows.length,data.jo.length*4);
for(const original of data.jo)for(const [gender,prefix] of [['男子','male'],['女子','female']])for(const [course,suffix] of [['短水路','SC'],['長水路','LC']]){
 const row=jo.rows.find(r=>r.gender===gender&&r.course===course&&r.division===original.division&&r.stroke===original.event&&r.distance===original.distance);
 assert.equal(row.seconds,original[prefix+suffix]??null);
}
assert.ok(jo.rows.some(r=>r.stroke==='フリーリレー'));assert.ok(jo.rows.some(r=>r.seconds===null));
for(const [id,rows,key] of [['yamanashi',data.yamanashi,'seconds'],['tokyo',data.tokyo,'standard']]){
 const normalized=all.find(x=>x.id===id).rows;assert.equal(normalized.length,rows.length);rows.forEach((r,i)=>assert.equal(normalized[i].seconds,r[key]));
}
const yume=all.find(x=>x.id==='yume');assert.ok(yume.year.includes('予定'));assert.ok(yume.rows.every(r=>r.course==='長短共通'));
assert.equal(yume.rows.find(r=>r.division.startsWith('C：')&&r.gender==='女子'&&r.stroke==='自由形'&&r.distance==='100m').seconds,data.yume.C['自由形'][100][1]);
assert.equal(C.format(null),'—');assert.equal(C.format(66,1),'1:06.0');assert.equal(C.format(62.19),'1:02.19');
const state={source:'jo',gender:'女子',course:'長水路',division:'11歳',stroke:'平泳ぎ'};
assert.equal(C.filtered(jo,state).length,2);
state.source='tokyo';state.division='does not exist';C.normalize(all,state);assert.equal(state.course,'all');assert.equal(state.division,'all');assert.equal(state.gender,'女子');
const table=C.bodyHtml(all,{source:'yamanashi',gender:'男子',course:'短水路',division:'中1',stroke:'自由形'});assert.ok(table.includes('中1'));assert.ok(table.includes('25.5'));assert.ok(!table.includes('<caption>女子'));
assert.ok(C.bodyHtml(all,{source:'jo',gender:'男子',course:'短水路',division:'9歳以下',stroke:'フリーリレー'}).includes('該当する登録基準はありません'));
const unsafe=[{id:'x',name:'<script>',year:'<img>',source:'<source>',note:'<note>',rows:[{stroke:'<stroke>',division:'<division>',distance:'50m',course:'短水路',gender:'男子',seconds:30}]}];
const escaped=C.bodyHtml(unsafe,{source:'x',gender:'all',course:'all',division:'all',stroke:'all'});assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('&lt;script&gt;'));assert.ok(escaped.includes('&lt;stroke&gt;'));
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
assert.ok(html.includes("StandardCatalog.mount(document.getElementById('analysis-standards')"));
console.log('PASS: exact shared values for JO/prefecture/Tokyo/Yume, relay and missing values, precision, filter normalization/empty states, escaping, integration and syntax');
