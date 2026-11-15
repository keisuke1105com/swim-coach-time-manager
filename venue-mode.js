/* iPad-only, read-only view of data already loaded by the coach application. */
(function(root){
 'use strict';
 const L=root.LapComparison,esc=L.esc;
 let activeClose=null;
 function dismiss(){activeClose?.(false)}
 function supported(nav=root.navigator,screen=root.screen){
  const ipad=/iPad/.test(nav?.userAgent||'')||(/Mac/.test(nav?.platform||'')&&nav?.maxTouchPoints>1);
  return ipad&&Math.min(screen.width,screen.height)>=740&&Math.max(screen.width,screen.height)<=1200;
 }
 function launchers(container,open){
  if(!supported())return;
  container.querySelectorAll('.me-card').forEach(card=>{
   const existing=card.querySelector('[data-meet-action="edit-meet"]');if(!existing)return;
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='大会会場モード（閲覧専用）';
   button.onclick=()=>open(existing.dataset.meetId);card.querySelector('.me-actions').appendChild(button);
  });
 }
 function eventKey(e){return JSON.stringify([e.stroke,Number(e.distance),e.course])}
 function rowsForMeet(data,meet){
  const entries=data.entries.filter(e=>String(e.meet_id)===String(meet.id));
  const ids=[...new Set([...data.participants.filter(p=>String(p.meet_id)===String(meet.id)).map(p=>String(p.swimmer_id)),...entries.map(e=>String(e.swimmer_id))])];
  const rows=[];
  for(const id of ids){
   const player=data.players.find(p=>String(p.id)===id);if(!player)continue;
   const events=entries.filter(e=>String(e.swimmer_id)===id);
   if(!events.length)rows.push({player,entry:null,program:null,date:meet.meet_date});
   for(const entry of events){
    if(entry.programs?.length){for(const program of entry.programs)rows.push({player,entry,program,date:program.race_date||meet.meet_date});}
    else if(entry.timetable?.length){
     for(const time of entry.timetable)rows.push({player,entry,program:time,date:time.race_date||meet.meet_date});
    }else{
     const schedule=root.MeetSchedules?.forMeet(meet),race=root.MeetSchedules?.findRace(schedule,entry,player);
     rows.push({player,entry,program:race?{program_number:race.number,round:race.round}:null,date:race?.date||meet.meet_date});
    }
   }
  }
  return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.program?.program_number??Infinity)-(b.program?.program_number??Infinity)||(a.program?.heat??Infinity)-(b.program?.heat??Infinity)||a.player.name.localeCompare(b.player.name,'ja'));
 }
 function programHtml(row){
  const p=row.program,e=row.entry;
  let text=p?`${p.program_number!=null?`No.${esc(p.program_number)} ／ `:""} ${esc(p.round||'')} ${p.heat!=null?`／ ${esc(p.heat)}組`:''} ${p.lane!=null?`／ ${esc(p.lane)}レーン`:''}`:'組・レーン未登録';
  const time=e&&(p?root.MeetTimetable?.timeForProgram(e,p):null);
  if(time)text+=`<br>${esc(time.scheduled_time?.slice(0,5))} ${esc(root.MeetTimetable.timeLabel(time))}（各組の発走時刻ではありません）`;
  return text;
 }
 function open(data,initialId){
  if(!supported()||document.getElementById('venueMode'))return;
  const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
  const overlay=document.createElement('div');overlay.id='venueMode';overlay.className='vm';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','大会会場モード');
  let meetId=initialId,selectedIndex=0;
  const siblings=[...document.body.children].map(node=>({node,inert:node.inert}));
  siblings.forEach(({node})=>node.inert=true);
  document.body.appendChild(overlay);document.body.style.overflow='hidden';
  function close(restoreFocus=true){if(!data)return;overlay.replaceChildren();overlay.remove();document.body.style.overflow=previousOverflow;siblings.forEach(({node,inert})=>node.inert=inert);data=null;activeClose=null;if(restoreFocus)previousFocus?.focus();}
  activeClose=close;
  function render(){
   const meet=data.meets.find(m=>String(m.id)===String(meetId))||data.meets[0];
   if(!meet){close();return}
   meetId=meet.id;
   const rows=rowsForMeet(data,meet);if(selectedIndex>=rows.length)selectedIndex=0;
   overlay.innerHTML=`<header class="vm-header"><div><h2>大会会場モード</h2><p>閲覧専用 ／ 登録済みの大会予定・記録を表示</p></div><button type="button" data-close>閉じる</button></header><label class="vm-meet-label">大会<select class="vm-meet">${data.meets.map(m=>`<option value="${esc(m.id)}" ${String(m.id)===String(meetId)?'selected':''}>${esc(m.meet_date)} ${esc(m.name)}</option>`).join('')}</select></label><p class="vm-note">${esc(meet.venue||'')} ／ 競技進行の自動追従・速報取得はありません。</p><div class="vm-columns"><aside class="vm-list" aria-label="大会の出場予定・選手一覧"><h3>出場予定・選手一覧</h3>${rows.length?rows.map((r,i)=>`<button class="vm-entry" type="button" data-row="${i}" aria-pressed="${selectedIndex===i}"><b>${esc(r.player.name)}</b><span>${esc(r.date)} ／ ${r.entry?esc(`${r.entry.stroke} ${r.entry.distance}m・${r.entry.course}`):'出場種目未登録'}</span><span>${programHtml(r)}</span></button>`).join(''):'<p>出場予定は未登録です。</p>'}</aside><div class="vm-detail" aria-label="選択選手の記録"></div></div>`;
   overlay.querySelector('[data-close]').onclick=close;
   overlay.querySelector('.vm-meet').onchange=e=>{meetId=e.target.value;selectedIndex=0;render();overlay.querySelector('.vm-meet').focus();};
   overlay.querySelectorAll('[data-row]').forEach(button=>button.onclick=()=>{
    selectedIndex=Number(button.dataset.row);overlay.querySelectorAll('[data-row]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));detail(rows[selectedIndex]);
   });
   detail(rows[selectedIndex]);
  }
  function detail(row){
   const target=overlay.querySelector('.vm-detail');
   if(!row){target.innerHTML='<p>選手の出場予定が登録されると表示できます。</p>';return}
   const events=[...new Map(data.entries.filter(e=>String(e.meet_id)===String(meetId)&&String(e.swimmer_id)===String(row.player.id)).map(e=>[eventKey(e),e])).values()];
   target.innerHTML=`<h2>${esc(row.player.name)}</h2><p>${esc(row.date)} ／ ${programHtml(row)}</p>${events.length?`<label>比較する種目<select class="vm-event">${events.map((e,i)=>`<option value="${i}" ${row.entry&&eventKey(e)===eventKey(row.entry)?'selected':''}>${esc(e.stroke)} ${esc(e.distance)}m・${esc(e.course)}</option>`).join('')}</select></label><div class="vm-results"></div><div class="vm-laps"></div>`:'<p>この大会の出場種目は未登録です。</p>'}`;
   if(!events.length)return;
   function comparison(){
    const event=events[Number(target.querySelector('.vm-event').value)],pair=L.selectRecords(data.records,row.player.id,event);
    const card=(r,label)=>`<article><h3>${label}</h3><strong>${r?L.fmt(Number(r.time_seconds)):'—'}</strong><p>${r?`${esc(r.record_date||'日付未登録')}<br>${esc(r.meet_name||'大会名未登録')}`:'記録なし'}</p></article>`;
    target.querySelector('.vm-results').innerHTML=card(pair.best,'PB')+card(pair.latest,'直近大会結果')+'<p class="vm-note">同一種目・距離・水路で比較。同日に複数の記録がある場合、直近はその日の最速を表示します。</p>';
    L.mount(target.querySelector('.vm-laps'),{...pair,manual:data.manual});
   }
   target.querySelector('.vm-event').onchange=comparison;comparison();
  }
  overlay.onkeydown=e=>{
   if(e.key==='Escape'){close();return}
   if(e.key==='Tab'){
    const nodes=[...overlay.querySelectorAll('button,select,[tabindex="0"]')],first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
   }
  };
  render();overlay.querySelector('[data-close]')?.focus();
 }
 root.VenueMode={supported,launchers,open,rowsForMeet,dismiss};
 if(typeof module!=='undefined')module.exports=root.VenueMode;
})(typeof window==='undefined'?globalThis:window);
