(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=r=>'No.'+r.program_number+' ／ '+r.round+' ／ '+r.heat+'組 ／ '+r.lane+'レーン';
 root.meetProgramHtml=function(entry){
  const rows=(entry.programs||[]).slice().sort((a,b)=>String(a.race_date).localeCompare(String(b.race_date))||a.program_number-b.program_number);
  return rows.length?'<div class="me-program">'+rows.map(r=>'<div><b>'+esc(label(r))+'</b><br><small>'+esc(r.race_date)+'</small></div>').join('')+'</div>':'';
 };
 root.showMeetProgramImport=function({meet,players,entries,client,onSaved}){
  if(document.getElementById('meetProgramDialog'))return;
  const overlay=document.createElement('div');overlay.id='meetProgramDialog';overlay.className='me-pdf-overlay';
  overlay.innerHTML='<form class="me-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="programTitle"><h3 id="programTitle">プログラムPDFを取り込む</h3><p><b>'+esc(meet.name)+'</b></p><p class="small muted">山梨県秋季大会の2段組プログラムに対応。PDFは端末内で読み取ります。既存の出場種目に競技番号・組・レーンを追加します。</p><label>競技日<input id="programDate" type="date" value="'+esc(meet.meet_date)+'" required></label><label>大会の水路<select id="programCourse"><option>長水路</option><option>短水路</option></select></label><label>プログラムPDF（10MB・50ページ以下）<input id="programFile" type="file" accept="application/pdf,.pdf"></label><p id="programStatus" role="status" aria-live="polite"></p><p id="programError" class="shotBad" role="alert"></p><div id="programPreview"></div><div class="me-actions"><button type="button" id="programClose" class="secondary">閉じる</button><button type="submit" id="programSave" disabled>選択した出走情報を保存</button></div></form>';
  document.body.appendChild(overlay);const q=id=>overlay.querySelector('#'+id);
  let parsed=null,rows=[],busy=false,saved=false;
  const chosen=()=>[...overlay.querySelectorAll('[data-program-row]:checked')].map(el=>rows[Number(el.dataset.programRow)]);
  const update=()=>{q('programSave').disabled=busy||!chosen().length||!q('programConfirm')?.checked||!q('programDate').value;};
  const close=()=>{if(!busy)overlay.remove();};q('programClose').onclick=close;overlay.onkeydown=e=>{if(e.key==='Escape')close();};
  function draw(){
   if(!parsed)return;
   rows=parsed.rows.map(row=>({...row,match:root.MeetProgramPdf.matchEntry(row,players,entries,meet.id,q('programCourse').value)}));
   const matching=rows.map((r,i)=>({r,i})).filter(({r})=>r.match.player),count=rows.filter(r=>r.match.entry).length;
   q('programPreview').innerHTML='<div class="notice">'+parsed.pages+'ページ／'+parsed.eventCount+'競技／'+rows.length+'出走を読み取りました。照合できた出場種目：'+count+'件。<br>PDFに大会名・日付の記載がないため、登録先と競技日・水路を確認してください。所属の一致も確認して選択してください。<br>組番号が省略された種目は「1組（組表記なし）」と表示します。</div><button type="button" id="programSelect" class="secondary">照合済みをすべて選択</button><div class="me-scroll"><table class="me-table"><thead><tr><th>保存</th><th>選手・所属</th><th>種目／出走情報</th><th>現在の登録／確認</th></tr></thead><tbody>'+matching.map(({r,i})=>{
    const e=r.match.entry,old=e?.programs?.find(x=>x.race_date===q('programDate').value&&x.round===r.round);
    return '<tr><td><input type="checkbox" data-program-row="'+i+'" aria-label="'+esc(r.name+' '+r.distance+'m '+r.stroke)+'" '+(e?'':'disabled')+'></td><td>'+esc(r.name)+'<br>'+esc(r.team)+'</td><td>'+esc(r.gender+' '+r.distance+'m '+r.stroke)+'<br>'+esc(label(r))+(r.heat_inferred?'（組表記なし）':'')+'<br><small>PDF '+r.page+'ページ</small></td><td>'+esc(old?label(old)+' → '+label(r):e?'新規登録':r.match.reason)+'</td></tr>';
   }).join('')+'</tbody></table></div><p class="small muted">登録選手と照合できない '+(rows.length-matching.length)+'件は対象外です。種目が未登録の場合は申込一覧表を先に取り込んでください。訂正版は、同じ競技日・ラウンドの選択した情報を更新します。未選択の情報は保持します。</p><label class="me-pdf-confirm"><input type="checkbox" id="programConfirm">登録先の大会・競技日・水路、選手の所属と出走情報を確認しました</label>';
   q('programSelect').onclick=()=>{overlay.querySelectorAll('[data-program-row]:not(:disabled)').forEach(el=>el.checked=true);update();};
   update();
  }
  q('programPreview').onchange=update;q('programDate').onchange=draw;q('programCourse').onchange=draw;
  function lock(value){busy=value;for(const id of ['programFile','programDate','programCourse','programClose'])q(id).disabled=value;overlay.querySelectorAll('#programPreview input,#programPreview button').forEach(el=>{if(value)el.disabled=true;});update();}
  q('programFile').onchange=async()=>{
   saved=false;parsed=null;rows=[];q('programPreview').innerHTML='';q('programError').textContent='';if(!q('programFile').files[0]){update();return;}
   lock(true);q('programStatus').textContent='PDFを読み取っています…';
   try{parsed=await root.MeetProgramPdf.readPdf(q('programFile').files[0]);q('programStatus').textContent='読み取りが完了しました。';}
   catch(e){q('programError').textContent=String(e.message||e);q('programStatus').textContent='';}
   finally{lock(false);draw();}
  };
  q('programSave').closest('form').onsubmit=async ev=>{
   ev.preventDefault();if(q('programSave').disabled||busy)return;
   const selected=chosen(),date=q('programDate').value;
   const payload=selected.map(r=>{const old=r.match.entry.programs?.find(x=>x.race_date===date&&x.round===r.round);return {entry_id:r.match.entry.id,round:r.round,program_number:r.program_number,heat:r.heat,lane:r.lane,expected:old?{program_number:old.program_number,heat:old.heat,lane:old.lane,updated_at:old.updated_at}:null};});
   lock(true);q('programError').textContent='';q('programStatus').textContent='保存しています…';
   try{
    const result=await client.rpc('import_swim_meet_program',{p_meet_id:meet.id,p_race_date:date,p_rows:payload,p_source:q('programFile').files[0].name});
    if(result.error)throw result.error;saved=true;
    await onSaved();overlay.innerHTML='<div class="me-pdf-dialog" role="dialog" aria-modal="true" aria-label="保存完了"><h3>出走情報を保存しました</h3><p>'+Number(result.data?.saved||0)+'件を大会予定に反映しました。</p><button id="programDone">閉じる</button></div>';overlay.querySelector('#programDone').onclick=()=>overlay.remove();overlay.querySelector('#programDone').focus();
   }catch(e){lock(false);draw();q('programError').textContent=saved?'保存は完了しましたが、画面の更新に失敗しました。閉じて大会予定を再読み込みしてください。':'保存できませんでした：'+String(e.message||e)+'。閉じて大会予定を再読み込みし、最新情報で再度取り込んでください。';q('programStatus').textContent='';if(saved)q('programSave').disabled=true;}
  };
  const courses=[...new Set(entries.filter(e=>e.meet_id===meet.id).map(e=>e.course))];if(courses.length===1)q('programCourse').value=courses[0];
  q('programFile').focus();
 };
})(window);
