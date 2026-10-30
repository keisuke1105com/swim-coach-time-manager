// One request only; no database writes and no response/player/credential logging.
(async()=>{
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base||'')||!key)throw Error('Missing configuration');
 const r=await fetch(base+'/functions/v1/jasf-ranking-smoke',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(35000)});
 const d=await r.json();
 console.log(JSON.stringify({httpStatus:r.status,credentialValidated:d.credentialValidated===true,upstreamStatus:d.upstreamStatus??null,rowCount:d.rowCount??null,error:['auth_required','credential_rejected','probe_expired','probe_connection_error'].includes(d.error)?d.error:undefined}));
 if(!r.ok||!d.success||!(d.rowCount>0))process.exitCode=1;
})().catch(()=>{console.error('Probe failed; no data changed');process.exitCode=1});
