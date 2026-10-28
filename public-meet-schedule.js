(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 root.renderPublicMeetEvents=function(meet,swimmer){
  const schedule=root.MeetSchedules?.forMeet(meet);
  if(!schedule)return '';
  const entries=Array.isArray(meet.events)?meet.events:[];
  if(!entries.length)return '<p class="small muted">本人の出場種目はまだ登録されていません。</p>';
  const rows=entries.map(entry=>({entry,race:root.MeetSchedules.findRace(schedule,entry,swimmer)}));
  const eventHtml=({entry:e,race:r})=>'<div class="row"><div><b>'+(r?'No.'+r.number+'｜':'')+esc(e.distance)+'m '+esc(e.stroke)+'</b><br><span class="small muted">'+(r?esc(r.round)+' ／ ':'')+esc(e.course)+'</span></div></div>';
  const unknown=rows.filter(r=>!r.race);
  return '<div class="public-meet-events"><p class="small muted">あなたの出場予定</p>'+schedule.days.map(day=>{
   const items=rows.filter(r=>r.race?.day===day.day).sort((a,b)=>a.race.number-b.race.number);
   if(!items.length)return '';
   return '<section aria-label="第'+day.day+'日の出場種目"><h4>第'+day.day+'日｜'+esc(day.date.slice(5).replace('-','/'))+'</h4>'+items.map(eventHtml).join('')+'</section>';
  }).join('')+(unknown.length?'<section><h4>日程未照合</h4>'+unknown.map(eventHtml).join('')+'</section>':'')+'<p class="small muted">競技番号は予選・タイム決勝の番号です。区分決勝・決勝は進出時のみ出場します。</p></div>';
 };
})(typeof window==='undefined'?globalThis:window);
