(function(root){
 'use strict';
 const clean=v=>String(v??'').normalize('NFKC').trim();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function parsePages(pages){
  const lines=pages.flat().map(clean),rows=[],numbers=new Map(),warnings=[];
  if(!lines.some(l=>l.includes('予定時刻')))throw Error('競技予定時刻の一覧表を選択してください。');
  for(const line of lines){
   if(!/^\d+\s+(?:女子|男子)/.test(line))continue;
   const m=line.match(/^(\d+)\s+(女子|男子)\s+(.+?)\s+(\d+)\s*m\s+(自由形|背泳ぎ|平泳ぎ|バタフライ|個人メドレー)\s+(タイム決勝|予選|準決勝|決勝)\s+(\d+)(?:\s+(\d{1,2}:\d{2}))?\s*$/);
   if(!m)throw Error('競技の行を読み取れません：'+line);
   const row={program_number:Number(m[1]),gender:m[2],distance:Number(m[4]),stroke:m[5],round:m[6],heats:Number(m[7]),scheduled_time:m[8]?m[8].padStart(5,'0'):null};
   if(row.program_number<1||row.program_number>9999||![50,100,200,400,800,1500].includes(row.distance)||row.heats>999||(row.scheduled_time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.scheduled_time)))throw Error('競技番号・距離・予定時刻を確認してください。');
   if(row.heats===0&&row.scheduled_time)throw Error('組数0の競技に予定時刻があります。');
   if(numbers.has(row.program_number))warnings.push('No.'+row.program_number+'が原表で重複しています。空欄の時刻は保存せず、競技番号・性別・種目が一致する情報だけ表示します。');
   numbers.set(row.program_number,true);rows.push(row);
  }
  if(!rows.length||rows.length>1000)throw Error('1～1000競技の予定時刻表を選択してください。');
  const timed=rows.filter(r=>r.scheduled_time);
  if(!timed.length)throw Error('予定時刻が記載された競技がありません。');
  const seen=new Set();for(const r of timed){if(seen.has(r.program_number))throw Error('予定時刻のある競技番号が重複しています。原表を確認してください。');seen.add(r.program_number);}
  return {rows,pages:pages.length,warnings:[...new Set(warnings)],title:lines.find(l=>l.includes('予定時刻')&&l.includes('大会'))||''};
 }
 function forEntry(entry,player,times){return times.filter(t=>t.meet_id===entry.meet_id&&t.course===entry.course&&t.gender===player?.gender&&t.stroke===entry.stroke&&Number(t.distance)===Number(entry.distance));}
 function html(entry){
  const times=entry.timetable||[],programs=entry.programs||[];
  if(programs.length)return '';
  return times.map(t=>'<div class="me-program-time"><b>🕒 '+esc(t.scheduled_time.slice(0,5))+' 競技開始予定</b><br><small>'+esc(t.race_date)+' ／ No.'+esc(t.program_number)+' '+esc(t.round)+'（各組の発走時刻ではありません）</small></div>').join('');
 }
 function timeForProgram(entry,program){return (entry.timetable||[]).find(t=>t.race_date===program.race_date&&t.round===program.round&&Number(t.program_number)===Number(program.program_number));}
 root.MeetTimetable={parsePages,forEntry,html,timeForProgram,readPdf:file=>root.MeetEntryPdf.readPdf(file,parsePages)};
 root.showMeetTimetableImport=function({meet,entries=[],client,onSaved}){
  if(document.getElementById('meetTimetableDialog'))return;
  const overlay=document.createElement('div');overlay.id='meetTimetableDialog';overlay.className='me-pdf-overlay';
  overlay.innerHTML='<form class="me-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="timetableTitle"><h3 id="timetableTitle">予定時刻PDFを取り込む</h3><p><b>'+esc(meet.name)+'</b></p><p>山梨県秋季大会の競技予定時刻表に対応。PDFは端末内で読み取ります。記載のある競技開始予定時刻だけを保存し、空欄は推測しません。</p><label>競技日<input id="timetableDate" type="date" value="'+esc(meet.meet_date)+'" required></label><label>大会の水路<select id="timetableCourse"><option>長水路</option><option>短水路</option></select></label><label>競技予定時刻PDF<input id="timetableFile" type="file" accept="application/pdf,.pdf"></label><p id="timetableStatus" role="status" aria-live="polite"></p><p id="timetableError" role="alert" class="shotBad"></p><div id="timetablePreview"></div><div class="me-actions"><button type="button" id="timetableClose" class="secondary">閉じる</button><button type="submit" id="timetableSave" disabled>予定時刻を保存</button></div></form>';
  document.body.appendChild(overlay);const q=id=>overlay.querySelector('#'+id);let parsed=null,busy=false;
  const update=()=>q('timetableSave').disabled=busy||!parsed||!q('timetableConfirm')?.checked||!q('timetableDate').value;
  const lock=value=>{busy=value;for(const id of ['timetableDate','timetableCourse','timetableFile','timetableClose'])q(id).disabled=value;if(q('timetableConfirm'))q('timetableConfirm').disabled=value;update();};
  q('timetableClose').onclick=()=>{if(!busy)overlay.remove();};overlay.onkeydown=e=>{if(e.key==='Escape'&&!busy)overlay.remove();};
  for(const id of ['timetableDate','timetableCourse'])q(id).onchange=()=>{if(q('timetableConfirm'))q('timetableConfirm').checked=false;update();};
  q('timetablePreview').onchange=update;
  q('timetableFile').onchange=async()=>{
   parsed=null;q('timetablePreview').innerHTML='';q('timetableError').textContent='';if(!q('timetableFile').files[0]){update();return;}lock(true);q('timetableStatus').textContent='読み取り中…';
   try{
    parsed=await root.MeetTimetable.readPdf(q('timetableFile').files[0]);const timed=parsed.rows.filter(r=>r.scheduled_time);
    q('timetablePreview').innerHTML='<div class="notice">PDF：'+esc(parsed.title)+'<br>'+parsed.rows.length+'競技／時刻記載 '+timed.length+'競技／空欄 '+(parsed.rows.length-timed.length)+'競技。大会名・競技日・水路を確認してください。空欄は保存しません。訂正版は同じ日・水路・競技番号の時刻を更新します。<br>'+parsed.warnings.map(esc).join('<br>')+'</div><div class="me-scroll"><table class="me-table"><thead><tr><th>競技</th><th>競技開始予定</th></tr></thead><tbody>'+parsed.rows.map(r=>'<tr><td>No.'+r.program_number+' '+esc(r.gender+' '+r.distance+'m '+r.stroke+' '+r.round)+'</td><td>'+esc(r.scheduled_time||'原表に記載なし')+'</td></tr>').join('')+'</tbody></table></div><p class="small muted">各組の発走時刻ではありません。当日の競技進行により前後する場合があります。PDFで空欄になった既存の時刻は自動削除しません。</p><label class="me-pdf-confirm"><input type="checkbox" id="timetableConfirm">登録先・競技日・水路と予定時刻を確認しました</label>';
    q('timetableStatus').textContent='読み取りが完了しました。';
   }catch(e){q('timetableError').textContent=String(e.message||e);q('timetableStatus').textContent='';}finally{lock(false);}
  };
  q('timetableSave').closest('form').onsubmit=async ev=>{
   ev.preventDefault();if(busy||q('timetableSave').disabled)return;lock(true);q('timetableError').textContent='';q('timetableStatus').textContent='保存中…';
   try{
    const result=await client.rpc('import_swim_meet_timetable',{p_meet_id:meet.id,p_race_date:q('timetableDate').value,p_course:q('timetableCourse').value,p_rows:parsed.rows.filter(r=>r.scheduled_time).map(({heats,...r})=>r),p_source:q('timetableFile').files[0].name});
    if(result.error)throw result.error;await onSaved();overlay.innerHTML='<div class="me-pdf-dialog" role="dialog" aria-modal="true" aria-label="保存完了"><h3>予定時刻を保存しました</h3><p>'+Number(result.data?.saved||0)+'競技を登録しました。男子など原表で時刻が空欄の種目は予定時刻を表示しません。</p><button id="timetableDone">閉じる</button></div>';overlay.querySelector('#timetableDone').onclick=()=>overlay.remove();overlay.querySelector('#timetableDone').focus();
   }catch(e){q('timetableError').textContent='保存できませんでした：'+String(e.message||e);q('timetableStatus').textContent='';lock(false);}
  };
  const courses=[...new Set(entries.filter(e=>e.meet_id===meet.id).map(e=>e.course))];if(courses.length===1)q('timetableCourse').value=courses[0];
  q('timetableFile').focus();
 };
})(typeof window!=='undefined'?window:globalThis);
