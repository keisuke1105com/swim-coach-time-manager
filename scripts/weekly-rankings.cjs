// Scheduled server-side runner. Never print player data, upstream URLs or credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
function appRankingContext(fetchPage){
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const block=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);if(a<0||b<0)throw Error('App ranking source changed');return html.slice(a,b)};
 const c=vm.createContext({setTimeout,clearTimeout,console:{warn(){}}});
 vm.runInContext(block('const JASF_ATHLETE_IDS=','function jasfAthleteId(player)')+block('const JASF_EVENTS=','async function fetchJasfRecord(')+block('function ageOnDate(','function joMeetInfo(')+block('function jasfEventCodes(','function escapeRankingError('),c);
 c.safeFetchJasfRankingPage=fetchPage;return c;
}
function tasksFor(players,records,context){
 const active=new Map(players.map(p=>[String(p.id),p])),tasks=new Map();
 for(const r of records){const p=active.get(String(r.swimmer_id));if(!p||!context.jasfAthleteIds(p).length||!context.jasfEventCodes(r.stroke,r.distance)||!['短水路','長水路'].includes(r.course)||!(Number(r.time_seconds)>0))continue;
 const key=`nationalRank|2026|${p.id}|${r.stroke}|${Number(r.distance)}|${r.course}`;tasks.set(key,{key,playerId:String(p.id),stroke:r.stroke,distance:Number(r.distance),course:r.course});}
 return [...tasks.values()];
}
function cacheResult(q,now){const x=q.gradeMatched?.[0];if(!x)return null;return {found:true,rank:q.gradeRank||x.ranking||x.ranking_in_overall,gradeRank:q.gradeRank||x.ranking||x.ranking_in_overall,prefRank:q.prefRank??null,prefName:q.prefName||'',prefStatus:q.prefStatus||'pending',officialTime:x.record?.record||x.record||'-',swimmerCode:x.swimmers?.swimmer_code||x.swimmer_code||'-',updatedAt:now};}
// Unattempted events go first so expensive/unmatched events cannot starve the tail.
function retryTasks(allTasks,previous){
 const pending=new Set((previous?.pending||[]).map(t=>t.key));
 const outcomes=previous?.outcomes||{};
 return allTasks.filter(t=>pending.has(t.key)).sort((a,b)=>{
  const stamp=t=>outcomes[t.key]?.checkedAt||'';
  return stamp(a).localeCompare(stamp(b));
 });
}
function lookupOutcome(q){
 if(!q.gradeMatched?.length)return q.status==='grade_unavailable'?'grade_unavailable':'not_listed';
 return ({found:'confirmed',too_deep:'pref_search_limit',pref_unknown:'pref_unknown',not_found:'pref_not_found',error:'pref_request_failed'})[q.prefStatus]||'pref_pending';
}
function outcomeCounts(pending,outcomes){
 const counts={};for(const t of pending){const reason=outcomes[t.key]?.reason||'unprocessed';counts[reason]=(counts[reason]||0)+1;}return counts;
}
async function run(){
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!key)throw Error('Required repository secrets are missing');
 const retry=process.env.RETRY_ONLY==='true',started=Date.now(),now=()=>new Date().toISOString();
 if(now().slice(0,10)>'2027-03-31')throw Error('Ranking year configuration requires review');
 const api=async(route,body)=>{const r=await fetch(url+'/rest/v1/'+route,{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Database request failed: '+r.status);return r.json();};
 const all=async(table,query)=>{const result=[];for(let offset=0;;offset+=1000){const page=await api(`${table}?${query}&limit=1000&offset=${offset}`);result.push(...page);if(page.length<1000)return result;}};
 const players=await all('swimmers','select=id,name,birth_date,gender,athlete_id,athlete_ids&active=eq.true&order=id');
 const records=await all('swim_records','select=swimmer_id,stroke,distance,course,time_seconds&order=id');
 const saved=(await api('swimmer_ranking_share_cache?select=progress&job_key=eq.same_grade_2026'))[0]?.progress||{};
 let requests=0,lastRequest=0,halt=false,lastError=null,stopReason=null;
 const fetchPage=async(p,stroke,distance,course,year,schoolClass,grade,name,page)=>{
  if(halt||requests>=2500||Date.now()-started>150*60000){halt=true;stopReason=stopReason||(requests>=2500?'request_budget':Date.now()-started>150*60000?'time_budget':'access_restricted');throw Object.assign(Error('Run stopped'),{halt:true});}
  await new Promise(r=>setTimeout(r,Math.max(0,1500-(Date.now()-lastRequest))));lastRequest=Date.now();requests++;
  const codes=context.jasfEventCodes(stroke,distance);
  const query=new URLSearchParams({year:String(year),waterway_code:course==='短水路'?'2':'1',gender_code:String(context.jasfGenderCode(p)),distance_code:String(codes.distanceCode),swimming_style_code:String(codes.styleCode),school_class_code:String(schoolClass),school_grade:String(grade),swimmer_name:name,page:String(page)});
  const r=await fetch(url+'/functions/v1/jasf-ranking',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify(Object.fromEntries(query)),signal:AbortSignal.timeout(25000)});
  const json=await r.json();
  if([401,403,429].includes(r.status)||/^JASF HTTP (401|403|429)$/.test(json.error||'')){halt=true;stopReason='access_restricted';lastError=/^JASF HTTP (401|403|429)$/.test(json.error||'')?'upstream_access_restricted':'ranking_server_auth_or_limit';throw Object.assign(Error(lastError),{halt:true});}
  if(!r.ok||!json.success){lastError='ranking_server_request_failed';throw Error(lastError);}
  const rows=json.data;if(!Array.isArray(rows))throw Error('Unexpected official source response');return rows;
 };
 const context=appRankingContext(fetchPage),allTasks=tasksFor(players,records,context),byId=new Map(players.map(p=>[String(p.id),p]));
 const previous=saved.weeklyRanking;
 if(retry&&(!previous?.pending?.length)){console.log('No pending weekly events');return;}
 let tasks=retry?retryTasks(allTasks,previous):allTasks;
 const stamp=now(),report={...(retry?previous:{}),status:'running',startedAt:retry?previous.startedAt:stamp,checkedAt:stamp,completedAt:null,totalPlayers:players.length,totalEvents:retry?previous.totalEvents:tasks.length,confirmed:retry?previous.confirmed||0:0,attempted:retry?previous.attempted||0:0,failed:0,pending:tasks,requests:0,lastError:null,stopReason:null,outcomes:retry?{...(previous.outcomes||{})}:{},successfulPlayerIds:retry?previous.successfulPlayerIds||[]:[]};
 const publish=async(cache={})=>{report.checkedAt=now();report.requests=requests;report.stopReason=stopReason;report.pendingReasons=outcomeCounts(report.pending,report.outcomes);report.failed=report.pending.length;await api('rpc/merge_swimmer_ranking_cache',{p_job_key:'same_grade_2026',p_ranking_cache:cache,p_progress:{weeklyRanking:report}});};
 const pending=[];await publish();
 for(let i=0;i<tasks.length;i++){
  if(halt||requests>=2500||Date.now()-started>150*60000){stopReason=stopReason||(requests>=2500?'request_budget':'time_budget');break;}
  const t=tasks[i],cache={};lastError=null;let success=false,reason='lookup_failed';
  try{const q=await context.fetchJasfRankingForPlayer(byId.get(t.playerId),t.stroke,t.distance,t.course,2026);reason=lookupOutcome(q);const result=cacheResult(q,now());if(result){success=!['error','pending','not_found','too_deep','pref_unknown'].includes(result.prefStatus);if(success||!saved.rankingCache?.[t.key]?.found)cache[t.key]=result;if(success){report.confirmed++;report.successfulPlayerIds=[...new Set([...report.successfulPlayerIds,t.playerId])];}}}
  catch(e){lastError=lastError||'ranking_lookup_failed';reason=stopReason||lastError;if(e.halt)halt=true;}
  if(stopReason)reason=stopReason;
  report.outcomes[t.key]={reason,checkedAt:now()};
  report.lastError=lastError;
  report.attempted++;if(!success)pending.push(t);report.pending=[...pending,...tasks.slice(i+1)];await publish(cache);if(halt)break;
 }
 report.status=report.pending.length?'partial':'complete';report.completedAt=now();await publish();
 console.log(JSON.stringify({status:report.status,totalPlayers:report.totalPlayers,confirmed:report.confirmed,pending:report.pending.length,requests,stopReason:report.stopReason,pendingReasons:report.pendingReasons,lastError:report.lastError}));
 if(report.pending.length)process.exitCode=1;
}
module.exports={appRankingContext,tasksFor,cacheResult,retryTasks,lookupOutcome,outcomeCounts};
if(require.main===module)run().catch(()=>{console.error('Weekly ranking run failed; existing rankings retained. See app status.');process.exitCode=1});

