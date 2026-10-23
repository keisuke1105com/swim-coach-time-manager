/* Video analysis is stored separately from competition results. */
'use strict';
let videoImportRows=[], videoSavedRows=[], videoBusy=false;
const videoEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const videoName=v=>String(v||'').normalize('NFKC').replace(/\s/g,'');

function parseVideoBackup(data){
  if(data?.format!=='swim-split-backup'||data.version!==1||!Array.isArray(data.records)||data.records.length>2000)throw Error('対応する動画分析バックアップ（version 1）を選んでください。');
  return data.records.map((r,i)=>{
    try{
      if(!r||typeof r!=='object'||!r.id||!['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー'].includes(r.stroke))throw Error('ID・泳法を確認してください');
      if(typeof r.distance!=='number'||!Number.isFinite(r.distance)||r.distance<=0)throw Error('距離が不正です');
      const date=r.practiceDate||String(r.date||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('練習日が不正です');
      if(!r.marks||typeof r.marks!=='object'||Array.isArray(r.marks))throw Error('通過時刻がありません');
      const points=Object.entries(r.marks).map(([d,t])=>({distance:Number(d),time:t})).sort((a,b)=>a.distance-b.distance);
      if(points.length<2||points[0].distance!==0||points.at(-1).distance!==r.distance)throw Error('スタートとゴールの時刻が必要です');
      points.forEach((p,j)=>{if(!Number.isFinite(p.distance)||p.distance<0||typeof p.time!=='number'||!Number.isFinite(p.time)||p.time<0||(j&&(p.distance<=points[j-1].distance||p.time<=points[j-1].time)))throw Error('距離・通過時刻の順序が不正です');});
      const segments=points.slice(1).map((p,j)=>({from:points[j].distance,to:p.distance,seconds:p.time-points[j].time,speed:(p.distance-points[j].distance)/(p.time-points[j].time)}));
      const athlete=String(r.athlete||(data.athletes||[]).find(a=>a.id===r.athleteId)?.name||'選手名なし');
      const matches=PLAYERS.filter(p=>videoName(p.name)===videoName(athlete));
      return {raw:r,date,athlete,points,segments,total:points.at(-1).time-points[0].time,playerId:matches.length===1?matches[0].id:'',selected:true};
    }catch(e){return {raw:r,athlete:String(r?.athlete||''),error:`${i+1}件目：${e.message}`,selected:false};}
  });
}

function videoDetails(row){
  const r=row.raw, esc=videoEscape;
  const entries=Array.isArray(r.strokeAnalysis?.entries)?r.strokeAnalysis.entries:[];
  const tempo=Array.isArray(r.tempoAnalysis?.samples)?r.tempoAnalysis.samples:[];
  return `<p class="muted small">${esc(r.poolLength?`${r.poolLength}mプール`:'プール長未設定')} ／ ${esc(r.startBasis||'スタート基準未設定')}<br>${esc(r.filename||'')}<br>スタート区間には飛び込み・水中動作を含みます。</p>
    <div style="overflow-x:auto"><table style="width:100%;min-width:280px"><thead><tr><th>区間</th><th>タイム</th><th>平均泳速</th></tr></thead><tbody>${row.segments.map(s=>`<tr><td>${s.from}–${s.to}m</td><td>${s.seconds.toFixed(3)}秒</td><td>${s.speed.toFixed(2)}m/秒</td></tr>`).join('')}</tbody></table></div>
    ${entries.length?`<p><b>ストローク分析</b></p>${entries.map(e=>{const s=row.segments.find(s=>s.from===e.from&&s.to===e.to);const count=Number(e.count);return `<p class="small">${esc(e.from)}–${esc(e.to)}m：${esc(e.count)}${r.strokeAnalysis.mode==='cycle'?'サイクル':'ストローク'}${s&&count>0?` ／ ${((s.to-s.from)/count).toFixed(2)}m/${r.strokeAnalysis.mode==='cycle'?'サイクル':'ストローク'}`:''}</p>`;}).join('')}`:''}
    ${tempo.length?`<p><b>テンポ</b></p>${tempo.map(t=>{const duration=Number(t.end)-Number(t.start),cycles=Number(t.cycles);return duration>0&&cycles>0?`<p class="small">${esc(t.label||'テンポ')}：${(duration/cycles).toFixed(3)}秒/サイクル ／ ${(60*cycles/duration).toFixed(1)}サイクル/分</p>`:'';}).join('')}`:''}
    ${r.note?`<p style="white-space:pre-wrap">${esc(r.note)}</p>`:''}`;
}

async function openVideoAnalysis(playerId=''){
  go('home');
  const panel=document.getElementById('videoAnalysisPanel');
  panel.innerHTML=`<div class="card"><h3>🎥 動画分析</h3><p class="muted">区間泳速・ストローク・テンポを確認できます。大会記録・ベスト集計とは別に保存します。</p>${shareAdmin?'<label for="videoBackupFile">分析バックアップJSONを選ぶ</label><input id="videoBackupFile" type="file" accept=".json,application/json" onchange="readVideoBackup(this)"><div id="videoImportPreview" aria-live="polite"></div>':''}<h4>保存済みの分析</h4><label for="videoPlayerFilter">選手で絞り込む</label><select id="videoPlayerFilter" onchange="renderSavedVideoAnalyses()"><option value="">全選手</option>${PLAYERS.map(p=>`<option value="${videoEscape(p.id)}" ${p.id===playerId?'selected':''}>${videoEscape(p.name)}</option>`).join('')}</select><div id="videoSavedList" aria-live="polite">読み込み中…</div></div>`;
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{videoSavedRows=await fetchAllRows('swim_video_analyses',q=>q.order('record_date',{ascending:false}).order('id'));renderSavedVideoAnalyses();}
  catch(e){document.getElementById('videoSavedList').textContent='読み込めませんでした：'+e.message;}
}

async function readVideoBackup(input){
  if(videoBusy)return;
  const panel=document.getElementById('videoImportPreview');
  videoImportRows=[];panel.textContent='';
  try{
    const file=input.files?.[0];if(!file)return;
    if(file.size>10*1024*1024)throw Error('10MB以下のJSONを選んでください。');
    videoImportRows=parseVideoBackup(JSON.parse(await file.text()));
    panel.innerHTML=`<p>${videoImportRows.length}件。選手と内容を確認し、保存する記録にチェックしてください。同じ分析IDは重複保存しません。</p>${videoImportRows.map((row,i)=>row.error?`<p class="bad">${videoEscape(row.error)}</p>`:`<div class="result"><label><input type="checkbox" style="width:auto" checked onchange="videoImportRows[${i}].selected=this.checked"> ${videoEscape(row.athlete)}・${videoEscape(row.raw.stroke)} ${row.raw.distance}m ／ ${row.date} ／ <b>${row.total.toFixed(3)}秒</b></label><label for="videoMatch${i}" class="small">保存先の選手</label><select id="videoMatch${i}" onchange="videoImportRows[${i}].playerId=this.value"><option value="">選手を選択してください</option>${PLAYERS.map(p=>`<option value="${videoEscape(p.id)}" ${row.playerId===p.id?'selected':''}>${videoEscape(p.name)}</option>`).join('')}</select><details><summary>区間泳速・分析の詳細</summary>${videoDetails(row)}</details></div>`).join('')}<button id="videoImportSave" style="margin-top:12px" onclick="saveVideoAnalyses()">選択した分析をクラウドに保存</button><p id="videoImportStatus" role="status"></p>`;
  }catch(e){panel.textContent='読み込みエラー：'+e.message;}
}

async function saveVideoAnalyses(){
  if(videoBusy||!session||!shareAdmin)return;
  const rows=videoImportRows.filter(r=>r.selected&&!r.error);
  if(!rows.length){alert('保存する分析を選択してください。');return;}
  if(rows.some(r=>!PLAYERS.some(p=>p.id===r.playerId))){alert('選択したすべての分析で保存先の選手を選んでください。');return;}
  videoBusy=true;
  const btn=document.getElementById('videoImportSave'),file=document.getElementById('videoBackupFile'),status=document.getElementById('videoImportStatus');btn.disabled=true;file.disabled=true;
  try{
    // One transaction, with a database unique key protecting concurrent imports.
    const payload=rows.map(row=>({swimmer_id:row.playerId,source_id:String(row.raw.id),record_date:row.date,stroke:row.raw.stroke,distance:row.raw.distance,time_seconds:row.total,analysis:row.raw,created_by:session.user.id}));
    const {data,error}=await sb.from('swim_video_analyses').upsert(payload,{onConflict:'source_id',ignoreDuplicates:true}).select('id');
    if(error)throw error;
    videoSavedRows=await fetchAllRows('swim_video_analyses',q=>q.order('record_date',{ascending:false}).order('id'));
    renderSavedVideoAnalyses();
    status.textContent=`${data.length}件を保存しました。重複 ${rows.length-data.length}件は追加していません。`;
    const playerIds=[...new Set(rows.map(row=>row.playerId))];
    playerIds.forEach(id=>{
      const button=document.createElement('button');button.className='secondary';button.style.margin='8px 8px 0 0';
      button.textContent=(playerById(id)?.name||'選手')+'の欄を見る';
      button.onclick=()=>{go('players');showPlayerDetail(id);};status.appendChild(button);
    });
    const visiblePlayer=document.getElementById('playerVideoAnalyses')?.dataset.playerId;
    if(visiblePlayer)await renderPlayerVideoAnalyses(visiblePlayer);
  }catch(e){status.textContent='保存・確認エラー：'+e.message+'。再読み込みして保存状況を確認してください。同じファイルを再度取り込んでも重複しません。';}
  finally{videoBusy=false;btn.disabled=false;file.disabled=false;}
}

function renderSavedVideoAnalyses(){
  const panel=document.getElementById('videoSavedList');if(!panel)return;
  const playerId=document.getElementById('videoPlayerFilter').value;
  panel.innerHTML=videoSavedRows.filter(r=>!playerId||r.swimmer_id===playerId).map(r=>{
    const row=parseVideoBackup({format:'swim-split-backup',version:1,records:[r.analysis]})[0];
    if(row.error)return `<p>分析データを表示できません：${videoEscape(row.error)}</p>`;
    return `<details class="result"><summary><b>${videoEscape(playerById(r.swimmer_id)?.name||'非表示の選手')}</b> ／ ${videoEscape(r.record_date)}<br>${videoEscape(r.stroke)} ${r.distance}m ／ ${Number(r.time_seconds).toFixed(3)}秒</summary>${videoDetails(row)}${shareAdmin?`<button class="danger" onclick="deleteVideoAnalysis('${videoEscape(r.id)}')">この分析を削除</button>`:''}</details>`;
  }).join('')||'<p class="muted">保存済みの分析はありません。</p>';
}

async function deleteVideoAnalysis(id){
  if(!shareAdmin||videoBusy||!confirm('この動画分析を削除しますか？元の動画分析アプリの記録は残ります。'))return;
  const {data,error}=await sb.from('swim_video_analyses').delete().eq('id',id).select('id');
  if(error||!data?.length){alert('削除できませんでした：'+(error?.message||'権限または保存状況を確認してください'));return;}
  videoSavedRows=videoSavedRows.filter(r=>r.id!==id);renderSavedVideoAnalyses();
  const visiblePlayer=document.getElementById('playerVideoAnalyses')?.dataset.playerId;
  if(visiblePlayer)await renderPlayerVideoAnalyses(visiblePlayer);
}

function playerVideoCard(record,latest=false){
  const row=parseVideoBackup({format:'swim-split-backup',version:1,records:[record.analysis]})[0];
  if(row.error)return '<p class="muted">この分析を表示できません。</p>';
  return `<details class="result player-video-record"><summary><span>${latest?'<span class="badge">最新</span> ':''}${videoEscape(record.record_date)} ／ ${videoEscape(record.stroke)} ${Number(record.distance)}m</span><b>${Number(record.time_seconds).toFixed(3)}秒</b></summary>${videoDetails(row)}</details>`;
}

async function renderPlayerVideoAnalyses(playerId){
  const panel=document.getElementById('playerVideoAnalyses');
  if(!panel||panel.dataset.playerId!==String(playerId))return;
  panel.textContent='分析を読み込み中…';
  try{
    const rows=await fetchAllRows('swim_video_analyses',q=>q.eq('swimmer_id',playerId).order('record_date',{ascending:false}).order('created_at',{ascending:false}).order('id'));
    // A slow response must not replace a different swimmer's current view.
    if(document.getElementById('playerVideoAnalyses')!==panel)return;
    panel.innerHTML=rows.length?`<p class="muted small">保存済み ${rows.length}件 · 日付の新しい順。開くと区間泳速・ストローク・テンポを表示します。</p>${playerVideoCard(rows[0],true)}${rows.length>1?`<details class="player-video-history"><summary>過去の動画分析を見る（${rows.length-1}件）</summary><div class="compact-history-list">${rows.slice(1).map(r=>playerVideoCard(r)).join('')}</div></details>`:''}`:'<p class="muted">この選手の動画分析はまだありません。取り込み時にこの選手を選ぶと、ここに自動で反映されます。</p>';
  }catch(e){
    if(document.getElementById('playerVideoAnalyses')!==panel)return;
    panel.textContent='動画分析を読み込めませんでした。';
    const retry=document.createElement('button');retry.className='secondary';retry.textContent='再読み込み';retry.onclick=()=>renderPlayerVideoAnalyses(playerId);panel.appendChild(retry);
  }
}
