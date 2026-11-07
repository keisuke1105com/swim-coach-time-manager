/* Read-only view of the same standards used by achievement calculations. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={source:'jo',gender:'all',course:'all',division:'all',stroke:'all',open:false};
 const strokeOrder=['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー','フリーリレー','メドレーリレー'];
 function format(seconds,precision=2){
  if(seconds==null||!Number.isFinite(Number(seconds))||Number(seconds)<=0)return '—';
  const scale=10**precision,ticks=Math.round(Number(seconds)*scale),minutes=Math.floor(ticks/(60*scale));
  const rest=((ticks%(60*scale))/scale).toFixed(precision);
  return minutes?minutes+':'+rest.padStart(3+precision,'0'):rest;
 }
 function sources(data){
  const jo=[];
  for(const r of data.jo||[])for(const [gender,prefix] of [['男子','male'],['女子','female']])for(const [course,suffix] of [['短水路','SC'],['長水路','LC']])jo.push({stroke:r.event,distance:r.distance,division:r.division,gender,course,seconds:r[prefix+suffix]??null,precision:2});
  const yume=[];
  const divisions={A:'A：小学3年以下',B:'B：小学4～5年',C:'C：小学6年～中学1年',D:'D：中学2～3年',E:'E：高校生',F:'F：大学生以上'};
  for(const [division,events] of Object.entries(data.yume||{}))for(const [stroke,distances] of Object.entries(events))for(const [distance,values] of Object.entries(distances))for(const [gender,index] of [['男子',0],['女子',1]])yume.push({stroke,distance:distance+'m',division:divisions[division]||division,gender,course:'長短共通',seconds:values[index]??null,precision:2});
  return [
   {id:'jo',name:'JO（登録基準）',year:'対象年度・原資料の情報は未登録',source:'アプリに登録済みのJO標準記録',note:'達成率の判定と同じ登録値です。年齢は大会基準日で判定します。13歳以上の50m背泳ぎ・平泳ぎ・バタフライはCS標準を使用します。リレーの登録基準も掲載しています。',rows:jo},
   {id:'yamanashi',name:'山梨県強化標準 2026',year:'2026年度／学年基準日：2026年4月1日',source:'提供された山梨県強化指定選手の標準記録表',note:'中学1年～高校3年が登録されています。標準・記録ともに10分の1秒単位に切り捨てて突破判定します（標準1:06.0は記録1:06.09まで突破）。',rows:(data.yamanashi||[]).map(r=>({stroke:r.stroke,distance:r.distance+'m',division:r.grade,gender:r.gender,course:r.course,seconds:r.seconds,precision:1}))},
   {id:'yume',name:'ゆめカップ2027（予定）',year:'2027年度予定／学年基準日：2027年4月1日',source:'アプリ登録済みの2026年度基準を継続使用（原資料URL未登録）',note:'2027年度の正式要項公開前の予定基準です。2026年度と同じ標準を使用し、短水路・長水路は同一基準です。A区分には小学生未満も含みます。',rows:yume},
   {id:'tokyo',name:'東京SC招待（2026基準）',year:'2026年大会／年齢基準日：2026年10月30日',source:'提供資料「別表2 標準記録」（原資料URL未登録）',note:'水路別の登録がないため、アプリで使用している共通値を表示します。2027年の予定分析でもこの2026年基準を暫定使用しています。',rows:(data.tokyo||[]).map(r=>({stroke:r.event,distance:r.distance+'m',division:r.age,gender:r.gender,course:'水路区分なし',seconds:r.standard,precision:2}))}
  ];
 }
 const unique=(rows,key)=>[...new Set(rows.map(r=>r[key]))];
 function normalize(all,s=state){
  const source=all.find(x=>x.id===s.source)||all[0];s.source=source.id;
  for(const key of ['gender','course','division','stroke'])if(s[key]!=='all'&&!source.rows.some(r=>r[key]===s[key]))s[key]='all';
  return source;
 }
 function filtered(source,s=state){return source.rows.filter(r=>['gender','course','division','stroke'].every(key=>s[key]==='all'||r[key]===s[key]));}
 function bodyHtml(all,s=state){
  const source=normalize(all,s);
  const select=(key,label,values)=>'<label>'+esc(label)+'<select aria-label="'+esc(label)+'" data-standard-filter="'+key+'"><option value="all"'+(s[key]==='all'?' selected':'')+'>すべて</option>'+values.map(v=>'<option value="'+esc(v)+'"'+(s[key]===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
  const divisions=unique(source.rows,'division');
  if(source.id==='yamanashi')divisions.sort((a,b)=>['中1','中2','中3','高1','高2','高3'].indexOf(a)-['中1','中2','中3','高1','高2','高3'].indexOf(b));
  const selected=filtered(source,s),columns=divisions.filter(d=>s.division==='all'||s.division===d);
  let tables='';
  for(const gender of ['男子','女子'])for(const course of unique(source.rows,'course')){
   const rows=selected.filter(r=>r.gender===gender&&r.course===course);if(!rows.length)continue;
   const events=[...new Map(rows.map(r=>[[r.stroke,r.distance].join('|'),r])).values()].sort((a,b)=>strokeOrder.indexOf(a.stroke)-strokeOrder.indexOf(b.stroke)||parseInt(a.distance)-parseInt(b.distance));
   const cells=new Map(rows.map(r=>[[r.stroke,r.distance,r.division].join('|'),r]));
   tables+='<h4 class="standard-table-title">'+esc(gender+' ／ '+course)+'</h4><div class="standard-table-scroll" tabindex="0" role="region" aria-label="'+esc(gender+' '+course)+'標準記録表"><table class="standard-table"><caption>'+esc(gender+' ／ '+course)+'</caption><thead><tr><th scope="col">種目</th>'+columns.map(d=>'<th scope="col">'+esc(d)+'</th>').join('')+'</tr></thead><tbody>'+events.map(e=>'<tr><th scope="row">'+esc(e.stroke)+'<br>'+esc(e.distance)+'</th>'+columns.map(d=>{const r=cells.get([e.stroke,e.distance,d].join('|'));return '<td>'+format(r?.seconds,r?.precision??2)+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  return '<div class="standard-filters"><label>大会・基準<select aria-label="大会・基準" data-standard-filter="source">'+all.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===s.source?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'+select('gender','男女',unique(source.rows,'gender'))+select('course','水路',unique(source.rows,'course'))+select('division','年齢・学年区分',divisions)+select('stroke','泳法',unique(source.rows,'stroke'))+'</div><div class="standard-meta"><b>'+esc(source.year)+'</b><p>'+esc(source.note)+'</p><small>出典：'+esc(source.source)+'</small></div><p class="muted small">横にスクロールして全区分を確認できます。— はアプリに基準値の登録がない項目です。</p>'+ (tables||'<p class="muted" role="status">この条件に該当する登録基準はありません。</p>');
 }
 function cardHtml(data){return '<details class="card standard-catalog" id="analysis-standards"'+(state.open?' open':'')+'><summary>📋 標準記録一覧</summary><p class="muted">選手を選ばずに、アプリの達成率判定で使っている標準記録を確認できます。</p><div data-standard-body>'+bodyHtml(sources(data))+'</div></details>';}
 function mount(element,data){
  if(!element||element.dataset.standardMounted)return;element.dataset.standardMounted='true';
  const all=sources(data);element.addEventListener('toggle',()=>{state.open=element.open;});
  element.addEventListener('change',event=>{
   const key=event.target?.dataset?.standardFilter;if(!['source','gender','course','division','stroke'].includes(key))return;
   state[key]=event.target.value;if(key==='source'){state.division='all';state.stroke='all';}
   element.querySelector('[data-standard-body]').innerHTML=bodyHtml(all);
   element.querySelector('[data-standard-filter="'+key+'"]').focus();
  });
 }
 root.StandardCatalog={state,sources,format,normalize,filtered,bodyHtml,cardHtml,mount};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.StandardCatalog;
})(typeof window!=='undefined'?window:globalThis);
