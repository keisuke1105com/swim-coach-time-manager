// REVIEW DRAFT ONLY. Not deployed. Uses current DB authorization, not user metadata.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
export async function requireAdmin(req: Request) {
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
 const reject=(status:number,message:string)=>new Response(JSON.stringify({success:false,error:message}),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
 if(!token)return reject(401,'Authentication required');
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key)return reject(500,'Auth configuration unavailable');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 const {data,error}=await client.auth.getUser(token);
 if(error||!data.user)return reject(401,'Invalid session');
 const admin=await client.rpc('is_swim_share_admin');
 if(admin.error||admin.data!==true)return reject(403,'Administrator required');
 return {client};
}
export async function matchesActiveAthlete(client:any,athleteId:string,swimmerId?:string){
 if(!/^\d{1,20}$/.test(athleteId))return false;
 let query=client.from('swimmers').select('id').eq('active',true)
  .or(`athlete_id.eq.${athleteId},jasf_athlete_id.eq.${athleteId},athlete_ids.cs.{${athleteId}}`);
 if(swimmerId)query=query.eq('id',swimmerId);
 const result=await query.limit(1);
 return !result.error&&result.data?.length===1;
}
