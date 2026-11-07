(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 root.renderPublicMeetEvents=function(meet,swimmer){
  const schedule=root.MeetSchedules?.forMeet(meet);
  const entries=Array.isArray(meet.events)?meet.events:[];
  if(!entries.length)return '<p class="small muted">本人の出場種目はまだ登録されていません。</p>';
  if(entries.some(e=>e.programs?.length||e.timetable?.length)){
   const rows=[];
   for(const entry of entries){
    const programs=entry.programs||[],times=entry.timetable||[];
    for(const race of programs)rows.push({entry,race});
    for(const race of times)if(!programs.some(p=>p.race_date===race.race_date&&p.round===race.round))rows.push({entry,race});
    if(!programs.length&&!times.length)rows.push({entry,race:null});
   }
   const number=r=>Number(r?.program_number)>0?Number(r.program_number):Infinity;
   rows.sort((a,b)=>String(a.race?.race_date||'9999').localeCompare(String(b.race?.race_date||'9999'))||
    (number(a.race)===number(b.race)?0:number(a.race)-number(b.race))||String(a.race?.scheduled_time||'99:99').localeCompare(String(b.race?.scheduled_time||'99:99'))||Number(a.race?.heat||0)-Number(b.race?.heat||0));
   return '<div class="public-meet-events"><p class="small muted">あなたの出場予定</p>'+rows.map(({entry:e,race:r})=>
    '<div class="row"><div><b>'+(number(r)<Infinity?'No.'+esc(r.program_number)+'｜':'')+esc(e.distance)+'m '+esc(e.stroke)+'</b><br><span class="small muted">'+
    (r?esc(r.race_date)+' ／ '+esc(r.round)+' ／ ':'')+(r?.heat!=null?esc(r.heat)+'組 ／ ':'')+(r?.lane!=null?esc(r.lane)+'レーン ／ ':'')+esc(e.course)+'</span>'+
    (r?.scheduled_time?'<div><b>🕒 '+esc(r.scheduled_time)+' '+(r.time_estimated?'競技開始の目安（女子＋2分）':'競技開始予定')+'</b></div>':'')+'</div></div>').join('')+
    '<p class="small muted">時刻は競技全体の開始予定・目安で、各組の発走時刻ではありません。競技進行により前後します。</p></div>';
  }
  if(!schedule)return '<div class="public-meet-events"><p class="small muted">あなたの出場予定</p>'+entries.map(e=>'<div class="row"><div><b>'+esc(e.distance)+'m '+esc(e.stroke)+'</b><br><span class="small muted">'+esc(e.course)+'</span></div></div>').join('')+'</div>';
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
