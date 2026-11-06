/* Two-column printed lane programs. Never interpret instructions in PDF text. */
(function(root){
 'use strict';
 const norm=v=>String(v??'').normalize('NFKC').replace(/[\s\u200b]+/g,'');
 const clean=v=>String(v??'').normalize('NFKC').trim();
 function columnsFromItems(items,width){
  const E=root.MeetEntryPdf;
  if(!E||!Number.isFinite(width)||width<=0)throw Error('PDFのページ幅を確認できません。');
  return [items.filter(x=>x.transform[4]<width/2),items.filter(x=>x.transform[4]>=width/2)].map(E.linesFromItems);
 }
 function parsePages(pages){
  const rows=[],events=new Map(),slots=new Set();let race=null,heat=null,implicit=false;
  for(let page=0;page<pages.length;page++)for(const column of pages[page])for(const raw of column){
   const line=clean(raw),compact=norm(line);
   if(/^No[.．]/i.test(compact)){
    const m=compact.match(/^No\.(\d+)(.*?)((?:女子|男子))(\d+)m(自由形|背泳ぎ|平泳ぎ|バタフライ|個人メドレー)(タイム決勝|予選|準決勝|決勝)$/i);
    if(!m)throw Error('対応していない競技見出しがあります（'+(page+1)+'ページ）。リレー・異なる様式は取り込めません。');
    race={program_number:Number(m[1]),gender:m[3],distance:Number(m[4]),stroke:m[5],round:m[6]};
    if(race.program_number<1||race.program_number>9999||![50,100,200,400,800,1500].includes(race.distance))throw Error('競技番号・距離を確認してください。');
    const prior=events.get(race.program_number);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(race))throw Error('同じ競技番号に異なる種目があります。');
    events.set(race.program_number,race);heat=null;implicit=false;continue;
   }
   const group=compact.match(/^(\d+)組(?:着順時間)?$/);
   if(group){if(!race)throw Error('種目のない組番号があります。');heat=Number(group[1]);implicit=false;if(heat<1||heat>999)throw Error('組番号を確認してください。');continue;}
   if(!/^\d+\./.test(compact))continue;
   const m=line.match(/^(\d+)\s*\.\s*(.*?)\s*\(\s*(.*?)\s*\)\s*(.*?)\s*[:：].*$/);
   if(!m)throw Error('レーンの行を読み取れません（'+(page+1)+'ページ）。');
   if(!race)throw Error('競技見出しのないレーンがあります。');
   if(heat===null){heat=1;implicit=true;}
   const lane=Number(m[1]),name=m[2].trim(),team=m[3].trim();
   if(lane<0||lane>10)throw Error('レーン番号を確認してください。');
   const slot=[race.program_number,heat,lane].join('|');
   if(slots.has(slot))throw Error('組・レーンが重複しています。段組または続きのページを確認してください。');
   slots.add(slot);
   if(!name&&!team)continue;
   if(!name||!team)throw Error('選手名・所属が不完全な行があります。');
   rows.push({...race,heat,lane,name,team,school:clean(m[4]),heat_inferred:implicit,page:page+1});
  }
  if(!rows.length)throw Error('出走情報を読み取れません。文字を選択できる2段組のプログラムPDFを選択してください。');
  if(rows.length>3000)throw Error('一度に読み取れる出走情報は3000件までです。');
  return {rows,pages:pages.length,eventCount:events.size};
 }
 function matchEntry(row,players,entries,meetId,course){
  const candidates=players.filter(p=>norm(p.name)===norm(row.name)&&(!p.gender||p.gender===row.gender));
  if(candidates.length!==1)return {entry:null,reason:candidates.length?'同姓同名のため要確認':'登録選手と照合できません'};
  const player=candidates[0];
  const found=entries.filter(e=>e.meet_id===meetId&&e.swimmer_id===player.id&&e.stroke===row.stroke&&Number(e.distance)===row.distance&&e.course===course);
  if(found.length!==1)return {entry:null,player,reason:found.length?'出場種目が重複しています':'この大会・水路の出場種目が未登録です'};
  return {entry:found[0],player,reason:'氏名・性別・出場種目が一致。所属も確認してください。'};
 }
 const api={normalize:norm,columnsFromItems,parsePages,matchEntry,readPdf:file=>root.MeetEntryPdf.readPdf(file,parsePages,columnsFromItems)};
 root.MeetProgramPdf=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
