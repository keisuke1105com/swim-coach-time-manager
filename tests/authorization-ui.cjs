const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('async function routeAuth()'),html.indexOf('function renderAuth()'));
function fixture({approved=true,admin=false,requestError=false,readError=false,signedIn=true}={}){
 const nodes=new Map();let reads=0,restores=0,logins=0;
 const node=()=>({innerHTML:'',classList:{add(){},remove(){}}});
 const c={session:signedIn?{}:null,authorizationEpoch:0,coachApproved:false,shareAdmin:false,$:key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)},resetAuthorizationState:()=>{c.coachApproved=false;c.shareAdmin=false},renderAuth:()=>{logins++},loadCloud:async()=>{reads++;if(readError)throw Error('read failed')},restoreViewState:()=>{restores++},applyAuthorizationUi(){},sb:{rpc:async name=>name==='request_coach_access'?{error:requestError?Error('failed'):null}:{data:name==='is_swim_share_admin'?admin:approved}}};
 vm.createContext(c);vm.runInContext(source,c);return {c,get reads(){return reads},get restores(){return restores},get logins(){return logins},nodes};
}
(async()=>{
 for(const options of [{approved:false},{requestError:true},{signedIn:false}]){const f=fixture(options);await f.c.routeAuth();assert.equal(f.reads,0,'unapproved/failed/anonymous route must not load data');assert.equal(f.restores,0);}
 let f=fixture();await f.c.routeAuth();assert.equal(f.reads,1);assert.equal(f.c.shareAdmin,false);assert.equal(f.c.coachApproved,true);
 f=fixture({admin:true});await f.c.routeAuth();assert.equal(f.reads,1);assert.equal(f.c.shareAdmin,true);
 f=fixture({readError:true});await f.c.routeAuth();assert.equal(f.restores,0,'failed data load must not open workspace');
 f=fixture();let release;f.c.sb.rpc=()=>new Promise(resolve=>{release=resolve});const first=f.c.routeAuth();f.c.session=null;await f.c.routeAuth();release({error:null});await first;assert.equal(f.reads,0,'old authorization request must not open a signed-out workspace');
 console.log('PASS: approval before reads, fail-closed errors, admin/coach separation and stale authorization response');
})().catch(e=>{console.error(e);process.exitCode=1});
