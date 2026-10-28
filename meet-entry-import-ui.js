(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const time=v=>{if(v==null||!Number.isFinite(Number(v)))return '未登録';const n=Math.round(Number(v)*100),m=Math.floor(n/6000);return (m?m+':':'')+(m?String(Math.floor(n%6000/100)).padStart(2,'0'):String(Math.floor(n/100)))+'.'+String(n%100).padStart(2,'0')};
 root.renderMeetEventList=function(meet,entries,players){
  const list=entries.filter(e=>e.meet_id===meet.id);
  if(!list.length)return '<p class="small muted">出場種目は未登録です。「PDFから種目を追加」で申込一覧表を取り込めます。</p>';
  const grouped=new Map();for(const e of list){if(!grouped.has(e.swimmer_id))grouped.set(e.swimmer_id,[]);grouped.get(e.swimmer_id).push(e)}
  return '<details class="me-event-list" open><summary>出場種目（'+list.length+'件）</summary>'+[...grouped].map(([id,events])=>{
   const p=players.find(p=>p.id===id);
   return '<div class="me-entry-player"><b>'+esc(p?.name||'未登録の選手')+'</b><div class="me-scroll"><table class="me-table"><thead><tr><th>種目</th><th>申込タイム</th><th>大会水路</th><th>クラス</th></tr></thead><tbody>'+events.sort((a,b)=>a.stroke.localeCompare(b.stroke,'ja')||a.distance-b.distance).map(e=>'<tr><td>'+esc(e.distance)+'m '+esc(e.stroke)+'</td><td>'+esc(time(e.entry_seconds))+' '+esc(e.entry_mark||'')+'</td><td>'+esc(e.course)+'</td><td>'+esc(e.entry_class||'—')+'</td></tr>').join('')+'</tbody></table></div></div>';
  }).join('')+'<p class="small muted">S：短水路での申込、L：長水路での申込、＊：PDF原表の記号。大会水路とは別の情報です。</p></details>';
 };
 root.showMeetPdfImport=function({meet,players,entries,client,onSaved}){
  if(document.getElementById('meetPdfDialog'))return;
  const overlay=document.createElement('div');overlay.id='meetPdfDialog';overlay.className='me-pdf-overlay';
  overlay.innerHTML='<form class="me-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="meetPdfTitle"><h3 id="meetPdfTitle">PDFから出場種目を追加</h3><p><b>登録先：'+esc(meet.name)+'</b><br>'+esc(meet.meet_date)+'</p><p class="small muted">WebSWMSYSの「個人種目申込一覧表」に対応しています。文字を選択できるPDFを使用してください。PDFはこの端末内で読み取ります。</p><label for="meetPdfCourse">大会の水路</label><select id="meetPdfCourse"><option>長水路</option><option>短水路</option></select><label for="meetPdfFile">申込一覧表（PDF・10MB以下）</label><input id="meetPdfFile" type="file" accept="application/pdf,.pdf"><div id="meetPdfStatus" role="status" aria-live="polite"></div><div id="meetPdfPreview"></div><div id="meetPdfError" role="alert" class="shotBad"></div><div class="me-actions"><button type="button" class="secondary" id="meetPdfCancel">閉じる</button><button type="submit" id="meetPdfSave" disabled>内容を確認して登録</button></div></form>';
  document.body.appendChild(overlay);
  const q=s=>overlay.querySelector(s),file=q('#meetPdfFile'),save=q('#meetPdfSave'),cancel=q('#meetPdfCancel'),course=q('#meetPdfCourse'),preview=q('#meetPdfPreview'),status=q('#meetPdfStatus'),error=q('#meetPdfError');
  let parsed=null,rows=[],busy=false,reading=0;
  const selected=()=>[...preview.querySelectorAll('input[data-entry-index]:checked')].map(el=>rows[Number(el.dataset.entryIndex)]);
  function update(){
   const chosen=selected();save.disabled=busy||!parsed||!chosen.length||!q('#meetPdfConfirm')?.checked;
   save.textContent=chosen.length?'選択した'+chosen.length+'種目を登録':'内容を確認して登録';
  }
  cancel.onclick=()=>{if(!busy){reading++;overlay.remove()}};
  overlay.onkeydown=ev=>{if(ev.key==='Escape'&&!busy)cancel.click()};
  function draw(){
   const current=new Map(entries.filter(e=>e.meet_id===meet.id&&e.course===course.value).map(e=>[[e.swimmer_id,e.stroke,e.distance].join('|'),e]));
   const valid=rows.filter(r=>r.match.player),ids=new Set(valid.map(r=>r.match.player.id));
   preview.innerHTML='<div class="notice"><b>PDF：'+esc(parsed.title||file.files[0].name)+'</b>'+ (parsed.code?'<br>大会番号：'+esc(parsed.code):'')+'<br>読取：'+rows.length+'種目／照合できた選手：'+ids.size+'名<br>選手を照合できない行は登録しません。既存の種目・申込タイムは上書きしません。</div><div class="me-scroll"><table class="me-table"><thead><tr><th>登録</th><th>選手／種目</th><th>申込</th><th>クラス</th><th>照合</th></tr></thead><tbody>'+rows.map((r,i)=>{
    const player=r.match.player,existing=player&&current.get([player.id,r.stroke,r.distance].join('|'));
    let label=!player?r.match.reason:existing?'登録済み':r.match.reason||'追加できます';
    if(existing&&Number(existing.entry_seconds)!==r.entry_seconds)label+='（申込タイムに差あり。既存値を保持）';
    return '<tr><td><input aria-label="'+esc(r.name+' '+r.distance+'m'+r.stroke)+'を登録" type="checkbox" data-entry-index="'+i+'" '+(player?'checked':'disabled')+'></td><td>'+esc(r.name)+'<br>'+r.distance+'m '+esc(r.stroke)+'</td><td>'+esc(time(r.entry_seconds))+' '+esc(r.entry_mark||'')+'</td><td>'+esc(r.entry_class)+'</td><td>'+esc(label)+'</td></tr>';
   }).join('')+'</tbody></table></div><p class="small muted">PDFの申込タイムは自己ベスト記録には追加しません。S・L・＊は原表記を保存します。</p><label class="me-pdf-confirm"><input type="checkbox" id="meetPdfConfirm">登録先の大会・水路と、選択した選手・種目を確認しました</label>';
   update();
  }
  preview.onchange=update;course.onchange=()=>{if(parsed)draw()};
  file.onchange=async()=>{
   const token=++reading;parsed=null;rows=[];preview.innerHTML='';error.textContent='';save.disabled=true;
   if(!file.files[0])return;
   status.textContent='PDFを読み取っています…';busy=true;cancel.disabled=true;course.disabled=true;file.disabled=true;
   try{
    const result=await root.MeetEntryPdf.readPdf(file.files[0]);
    if(token!==reading||!overlay.isConnected)return;
    parsed=result;rows=result.rows.map(r=>({...r,match:root.MeetEntryPdf.matchPlayer(r,players)}));
    status.textContent=result.pages+'ページを読み取りました。';draw();
   }catch(e){error.textContent='読み取れませんでした：'+String(e?.message||e);status.textContent=''}
   finally{busy=false;cancel.disabled=false;course.disabled=false;file.disabled=false;update()}
  };
  q('form').onsubmit=async ev=>{
   ev.preventDefault();if(busy||save.disabled)return;
   const chosen=selected();if(!chosen.length||!q('#meetPdfConfirm')?.checked)return;
   busy=true;save.disabled=true;cancel.disabled=true;file.disabled=true;course.disabled=true;preview.querySelectorAll('input').forEach(el=>el.disabled=true);error.textContent='';status.textContent='出場種目を保存しています…';
   try{
    const payload=chosen.map(r=>({swimmer_id:r.match.player.id,stroke:r.stroke,distance:r.distance,entry_seconds:r.entry_seconds,entry_mark:r.entry_mark,entry_class:r.entry_class}));
    const result=await client.rpc('import_swim_meet_entries',{p_meet_id:meet.id,p_course:course.value,p_entries:payload,p_source:file.files[0].name});
    if(result.error)throw result.error;
    const added=Number(result.data?.inserted_entries||0),kept=Number(result.data?.existing_entries||0);
    await onSaved();
    overlay.innerHTML='<div class="me-pdf-dialog" role="dialog" aria-modal="true" aria-label="登録完了"><h3>登録が完了しました</h3><p>追加 '+added+'種目／登録済み '+kept+'種目</p><p>選択対象外 '+(rows.length-chosen.length)+'種目。大会欄に反映しました。</p><button type="button" id="meetPdfDone">閉じる</button></div>';
    overlay.querySelector('#meetPdfDone').onclick=()=>overlay.remove();
    overlay.querySelector('#meetPdfDone').focus();
   }catch(e){
    status.textContent='';error.textContent='保存できませんでした：'+String(e?.message||e)+'。再読込して登録状況を確認できます。同じPDFを取り込んでも重複しません。';
    busy=false;cancel.disabled=false;file.disabled=false;course.disabled=false;draw();
   }
  };
  file.focus();
 };
})(window);
