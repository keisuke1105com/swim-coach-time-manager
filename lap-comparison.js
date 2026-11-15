/* Read-only lap projection. Never mutate official records or manual checkpoints. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const seconds=v=>{
  if(v==null||String(v).trim()==='')return NaN;
  const parts=String(v).trim().split(':');
  if(parts.length>3||parts.some(p=>!/^\d+(?:\.\d+)?$/.test(p)))return NaN;
  return parts.reduce((a,p)=>a*60+Number(p),0);
 };
 const fmt=v=>{if(!Number.isFinite(v))return '—';const cents=Math.round(v*100);return `${Math.floor(cents/6000)}:${(cents%6000/100).toFixed(2).padStart(5,'0')}`;};
 function checkpoints(record,manual){
  if(!record)return new Map();
  const finish=Number(record.distance),total=Number(record.time_seconds),points=new Map([[0,{time:0,source:'スタート'}]]);
  const valid=(d,t)=>Number.isInteger(d)&&d>0&&d<=finish&&Number.isFinite(t)&&t>0&&(!Number.isFinite(total)||t<=total);
  for(const m of manual||[]){
   if(String(m.record_id)!==String(record.id))continue;
   const d=Number(m.distance),t=seconds(m.cumulative_seconds);
   if(valid(d,t))points.set(d,{time:t,source:'手入力'});
  }
  let official=record.laps;
  if(typeof official==='string'){try{official=JSON.parse(official)}catch{official=[]}}
  let previousDistance=0,previousTime=0;
  for(const l of (Array.isArray(official)?[...official]:[]).sort((a,b)=>Number(a.distance)-Number(b.distance))){
   const d=Number(l.distance);let t=seconds(l.cumulative_time),calculated=false;
   // Only derive a missing cumulative value from a known adjacent official 50m interval.
   if(!Number.isFinite(t)&&d-previousDistance===50&&Number.isFinite(previousTime)){
    const split=seconds(l.split_time);if(split>0){t=previousTime+split;calculated=true}
   }
   if(valid(d,t)&&t>previousTime){points.set(d,{time:t,source:calculated?'公式（累積を区間から計算）':'公式'});previousDistance=d;previousTime=t;}
  }
  if(valid(finish,total)&&!points.has(finish))points.set(finish,{time:total,source:'記録のゴールタイム'});
  // Hide inconsistent manual values, retaining their stored originals.
  const anchors=[...points].filter(([,p])=>p.source!=='手入力').sort((a,b)=>a[0]-b[0]);
  for(const [d,p] of points){if(p.source!=='手入力')continue;const before=anchors.filter(([x])=>x<d).at(-1),after=anchors.find(([x])=>x>d);if((before&&p.time<=before[1].time)||(after&&p.time>=after[1].time))points.delete(d);}
  let previous=0;
  for(const [d,p] of [...points].sort((a,b)=>a[0]-b[0])){if(d&&p.time<=previous)points.delete(d);else previous=p.time;}
  return points;
 }
 function values(record,manual,mode){
  if(!record)return [];
  const points=checkpoints(record,manual),step=mode==='25'?25:50,out=[];
  // Cumulative view includes actual 25m checkpoints as well as official 50m points.
  for(let end=mode==='cumulative'?25:step;end<=Number(record.distance);end+=mode==='cumulative'?25:step){
   const start=mode==='cumulative'?0:end-step,a=points.get(start),b=points.get(end);
   const ok=a&&b&&b.time>a.time;
   out.push({start,end,time:ok?b.time-a.time:null,source:ok?(mode==='cumulative'?b.source:`${a.source} → ${b.source}（差分計算）`):'データなし'});
  }
  return out;
 }
 function selectRecords(records,swimmerId,event){
  const rows=(records||[]).filter(r=>String(r.swimmer_id)===String(swimmerId)&&r.stroke===event.stroke&&Number(r.distance)===Number(event.distance)&&r.course===event.course&&Number(r.time_seconds)>0&&Number.isFinite(Number(r.time_seconds)));
  const dated=[...rows].filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.record_date||'')).sort((a,b)=>b.record_date.localeCompare(a.record_date)||Number(a.time_seconds)-Number(b.time_seconds)||String(a.id).localeCompare(String(b.id)));
  return {best:[...rows].sort((a,b)=>Number(a.time_seconds)-Number(b.time_seconds)||String(b.record_date||'').localeCompare(String(a.record_date||'')))[0]||null,latest:dated[0]||null};
 }
 function chart(best,latest){
  const width=Math.max(480,best.length*58+100),height=320,left=78,right=22,top=40,bottom=58;
  const times=[...best,...latest].map(p=>p.time).filter(Number.isFinite);
  if(!times.length)return '<p>この表示で比較できるラップはありません。</p>';
  const min=Math.min(...times),max=Math.max(...times),pad=Math.max(.5,(max-min)*.12),low=Math.max(0,min-pad),high=max+pad;
  const x=i=>left+(best.length===1?(width-left-right)/2:i*(width-left-right)/Math.max(1,best.length-1));
  const y=t=>top+(t-low)/(high-low)*(height-top-bottom); // smaller time is higher
  let grid='';for(let i=0;i<=4;i++){const t=low+(high-low)*i/4,cy=y(t);grid+=`<line x1="${left}" x2="${width-right}" y1="${cy}" y2="${cy}" stroke="#dce5ed"/><text x="${left-10}" y="${cy+5}" text-anchor="end" font-size="14">${fmt(t)}</text>`;}
  const series=[{rows:best,label:'PB',color:'#1264b5'},{rows:latest,label:'直近',color:'#b64c00'}];
  const plots=series.map((s,seriesIndex)=>{
   let path='',connected=false;
   const dots=s.rows.map((p,i)=>{
    if(p.time==null){connected=false;return ''}
    const cx=x(i),cy=y(p.time);path+=`${connected?'L':'M'}${cx},${cy} `;connected=true;
    const label=`${s.label} ${p.start?`${p.start}–${p.end}m`:`0–${p.end}m`} ${fmt(p.time)} ${p.source}`;
    return `<g role="button" tabindex="0" data-series="${seriesIndex}" data-point="${i}" aria-label="${esc(label)}"><circle cx="${cx}" cy="${cy}" r="22" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${seriesIndex?5:8}" fill="${seriesIndex?'white':s.color}" stroke="${s.color}" stroke-width="3" pointer-events="none"/></g>`;
   }).join('');
   return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="3" ${seriesIndex?'stroke-dasharray="8 5"':''}/>${dots}`;
  }).join('');
  return `<div class="vm-chart-scroll"><svg viewBox="0 0 ${width} ${height}" style="width:100%;min-width:${width}px" role="group" aria-label="ラップ比較。速いタイムほど上。点をタップすると詳細を表示">${grid}<text x="${left}" y="23" font-size="14">↑ 速い ／ 秒</text>${plots}${best.map((p,i)=>`<text x="${x(i)}" y="${height-24}" text-anchor="middle" font-size="14">${p.end}m</text>`).join('')}</svg></div>`;
 }
 function mount(target,{best,latest,manual=[]}){
  let mode='50';
  function render(){
   const a=values(best,manual,mode),b=values(latest,manual,mode),length=Math.max(a.length,b.length);
   // Keep equal axes even when one selected race is absent.
   const empty=Array.from({length},(_,i)=>({start:(mode==='cumulative'?0:i*(mode==='25'?25:50)),end:(i+1)*(mode==='50'?50:25),time:null,source:'データなし'}));
   const bestPoints=a.length?a:empty,latestPoints=b.length?b:empty;
   target.innerHTML=`<h3>ラップ比較</h3><div class="vm-switch" role="group" aria-label="ラップの表示方法">${[['25','25m区間'],['50','50m区間'],['cumulative','累積タイム']].map(([v,label])=>`<button type="button" data-mode="${v}" aria-pressed="${mode===v}">${label}</button>`).join('')}</div><p class="vm-legend"><span>● PB・青実線</span><span>○ 直近・オレンジ破線</span></p>${best&&latest&&String(best.id)===String(latest.id)?'<p>直近の記録がPBです。</p>':''}${chart(bestPoints,latestPoints)}<p class="vm-point-detail" aria-live="polite">グラフの点をタップすると区間・タイム・出典を表示します。</p><p class="vm-note">欠損は「—」表示。推測・補間は行いません。区間タイムは両端の累積値から計算します。</p><div class="vm-table-scroll"><table><caption>${mode==='cumulative'?'累積タイム':'区間タイム'}比較</caption><thead><tr><th>${mode==='cumulative'?'地点':'区間'}</th><th>PB</th><th>直近</th><th>直近−PB</th></tr></thead><tbody>${bestPoints.map((p,i)=>{const q=latestPoints[i],diff=p.time!=null&&q.time!=null?q.time-p.time:null;return `<tr><th>${mode==='cumulative'?`${p.end}m`:`${p.start}–${p.end}m`}</th><td>${fmt(p.time)}<small>${esc(p.source)}</small></td><td>${fmt(q.time)}<small>${esc(q.source)}</small></td><td>${diff==null?'—':`${diff>0?'+':''}${diff.toFixed(2)}秒`}</td></tr>`}).join('')}</tbody></table></div>`;
   target.onclick=e=>{
    const toggle=e.target.closest('[data-mode]');if(toggle){mode=toggle.dataset.mode;render();target.querySelector(`[data-mode="${mode}"]`).focus();return}
    const point=e.target.closest('[data-point]');if(!point)return;
    const p=(point.dataset.series==='0'?bestPoints:latestPoints)[Number(point.dataset.point)];
    target.querySelector('.vm-point-detail').textContent=`${point.dataset.series==='0'?'PB':'直近'} ／ ${mode==='cumulative'?`${p.end}m累積`:`${p.start}–${p.end}m区間`} ／ ${fmt(p.time)} ／ ${p.source}`;
   };
   target.onkeydown=e=>{const point=e.target.closest('[data-point]');if(point&&(e.key==='Enter'||e.key===' ')){e.preventDefault();point.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};
  }
  render();
 }
 const api={checkpoints,values,selectRecords,chart,mount,fmt,esc};root.LapComparison=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
