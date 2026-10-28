/* WebSWMSYS「個人種目申込一覧表」用。PDFの解析は端末内で行う。 */
(function(root){
 'use strict';
 const normalize=v=>String(v??'').normalize('NFKC').replace(/[\s\u200b]+/g,'');
 const clean=v=>String(v??'').normalize('NFKC').replace(/\u200b/g,'').replace(/([ァ-ヶ])\s*([\u3099\u309a])/g,'$1$2').normalize('NFC').trim();
 const strokes=['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー'];
 const strokePattern=strokes.map(v=>[...v].join('\\s*')).join('|');
 const eventPattern=new RegExp('(\\d+)\\s*m\\s*('+strokePattern+')\\s*([0-9]+(?:\\s*:\\s*[0-9]{1,2})?\\s*\\.\\s*[0-9]{2})\\s*([SL*＊]?)\\s*(.*?)\\s*$');
 function seconds(text){
  const t=clean(text).replace(/\s/g,'');
  if(!/^(?:\d+:\d{2}|\d{1,3})\.\d{2}$/.test(t))throw Error('申込タイムを読み取れません：'+t);
  const a=t.split(':').map(Number);
  if(a.length===2&&a[1]>=60)throw Error('秒の値が不正です：'+t);
  const n=a.length===2?a[0]*60+a[1]:a[0];
  if(!Number.isFinite(n)||n<=0||n>=86400)throw Error('申込タイムを確認してください。');
  return Math.round(n*100)/100;
 }
 function linesFromItems(items){
  const lines=[];
  for(const item of items.filter(x=>typeof x.str==='string'&&x.str.trim()).slice().sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
   const y=item.transform[5];let row=lines.find(r=>Math.abs(r.y-y)<2.5);
   if(!row){row={y,items:[]};lines.push(row)}row.items.push(item);
  }
  return lines.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' '));
 }
 function parseLines(pages){
  const all=pages.flat().map(clean),text=all.join('\n');
  if(!normalize(text).includes('個人種目申込一覧表'))throw Error('「個人種目申込一覧表」のPDFを選択してください。画像だけのPDFは読み取れません。');
  const code=text.match(/[(（]\s*(\d{7})\s*[)）]/)?.[1]||'';
  const title=all.find(l=>l.includes('大会')&&!l.includes('申込種目'))||'';
  const rows=[];let swimmer=null,expected=0;
  for(const line of all){
   const birth=line.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
   if(birth&&/^\d{6,10}\s/.test(line)){
    const prefix=line.slice(0,birth.index).trim();
    const person=prefix.match(/^(\d{6,10})\s+(.+?)\s+([ァ-ヶー・ヴ\s]+)$/u);
    if(!person)throw Error('選手名を読み取れません：'+prefix);
    const gender=normalize(line.match(/男\s*子|女\s*子/)?.[0]||'');
    if(!gender)throw Error('性別を読み取れません：'+person[2]);
    const date=[birth[1],birth[2].padStart(2,'0'),birth[3].padStart(2,'0')].join('-');
    const check=new Date(date+'T00:00:00Z');
    if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,10)!==date)throw Error('生年月日を確認してください：'+person[2]);
    swimmer={athlete_number:person[1],name:person[2].trim(),birth_date:date,gender};
   }
   if(new RegExp('\\d+\\s*m\\s*(?:'+strokePattern+')').test(line)){
    expected++;
    const event=line.match(eventPattern);
    if(!swimmer||!event)throw Error('種目の行を正しく読み取れません：'+line);
    const distance=Number(event[1]),stroke=normalize(event[2]);
    if(![50,100,200,400,800,1500].includes(distance)||(stroke!=='自由形'&&distance>400)||(stroke==='個人メドレー'&&![200,400].includes(distance)))throw Error('対応していない種目があります：'+line);
    // Class labels belong to the meet: single ages, middle-dot ranges,
    // school groups and open classes must not be converted to Tokyo SC ages.
    const rawClass=event[5],entryClass=normalize(rawClass).replace(/[~〜-]/g,'～');
    if(/[\u0000-\u001f\u007f]/.test(rawClass)||!entryClass||[...entryClass].length>60||/\d+\s*m\s*(?:自由形|背泳ぎ|平泳ぎ|バタフライ|個人メドレー)/.test(rawClass))throw Error('クラスを正しく読み取れません：'+line);
    rows.push({...swimmer,distance,stroke,entry_seconds:seconds(event[3]),entry_mark:event[4]==='*'?'＊':event[4]||null,entry_class:entryClass});
   }
  }
  if(!rows.length||rows.length!==expected)throw Error('出場種目を読み取れませんでした。PDFの形式を確認してください。');
  if(rows.length>1000)throw Error('一度に取り込める種目は1000件までです。');
  const keys=new Set();
  for(const r of rows){const key=[r.athlete_number,r.stroke,r.distance].join('|');if(keys.has(key))throw Error('PDF内に同じ選手・種目の重複があります。');keys.add(key)}
  return {title,code,rows,pages:pages.length};
 }
 function matchPlayer(row,players){
  const candidates=players.filter(p=>normalize(p.name)===normalize(row.name));
  if(candidates.length!==1)return {player:null,reason:candidates.length?'同姓同名の選手がいます':'アプリに同名の選手がいません'};
  const p=candidates[0];
  if(p.gender&&p.gender!==row.gender)return {player:null,reason:'性別が登録と一致しません'};
  if(p.birth_date&&p.birth_date!==row.birth_date)return {player:null,reason:'生年月日が登録と一致しません'};
  return {player:p,reason:!p.birth_date?'生年月日未登録。選手名を確認してください。':''};
 }
 let loading;
 async function readPdf(file){
  if(!file||!file.size||file.size>10*1024*1024)throw Error('10MB以下のPDFを選択してください。');
  if(!/\.pdf$/i.test(file.name))throw Error('PDFファイルを選択してください。');
  const data=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('PDFファイルではありません。');
  if(!loading)loading=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').catch(e=>{loading=null;throw e});
  let lib;try{lib=await loading}catch(e){throw Error('PDF読取機能を読み込めません。通信状態を確認して再度お試しください。')}
  lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const task=lib.getDocument({data,isEvalSupported:false});let pdf;
  try{
   pdf=await task.promise;
   if(pdf.numPages>50)throw Error('50ページ以下のPDFを選択してください。');
   const pages=[];
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent();
    pages.push(linesFromItems(content.items));page.cleanup();
   }
   return parseLines(pages);
  }finally{await task.destroy()}
 }
 const api={normalize,seconds,linesFromItems,parseLines,matchPlayer,readPdf};
 root.MeetEntryPdf=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
