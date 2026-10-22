-- Replace only the existing ranking merge RPC; no swim records/auth/QR policies change.
-- Existing authenticated users remain subject to the table's RLS (SECURITY INVOKER).
create or replace function public.merge_swimmer_ranking_cache(
 p_job_key text, p_ranking_cache jsonb, p_progress jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing jsonb; merged jsonb; result jsonb; item record; old jsonb; progress jsonb;
begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authentication required'; end if;
 if p_job_key <> 'same_grade_2026' then raise exception 'Unsupported ranking year'; end if;
 if jsonb_typeof(p_ranking_cache) <> 'object' or jsonb_typeof(p_progress) <> 'object' then raise exception 'Invalid ranking payload'; end if;
 insert into public.swimmer_ranking_share_cache(job_key,progress,updated_at)
 values(p_job_key,'{}'::jsonb,now()) on conflict(job_key) do nothing;
 select c.progress into existing from public.swimmer_ranking_share_cache c where c.job_key=p_job_key for update;
 merged=coalesce(existing->'rankingCache','{}'::jsonb);
 for item in select * from jsonb_each(p_ranking_cache) loop
  old=merged->item.key;
  -- Older devices must not replace a newer server result or erase confirmed ranks.
  if old is null or (
   coalesce(old->>'updatedAt','') <= coalesce(item.value->>'updatedAt','')
   and not (coalesce(old->>'found','false')='true' and coalesce(item.value->>'found','false')<>'true')
  ) then merged=jsonb_set(merged,array[item.key],item.value,true); end if;
 end loop;
 progress=case when auth.role()='service_role' then p_progress else p_progress-'weeklyRanking' end;
 result=coalesce(existing,'{}'::jsonb)||progress||jsonb_build_object('rankingCache',merged,'updatedAt',now());
 update public.swimmer_ranking_share_cache set progress=result,updated_at=now() where job_key=p_job_key;
 return result;
end $$;
revoke execute on function public.merge_swimmer_ranking_cache(text,jsonb,jsonb) from public, anon;
grant execute on function public.merge_swimmer_ranking_cache(text,jsonb,jsonb) to authenticated, service_role;

grant select, insert, update on table public.swimmer_ranking_share_cache to service_role;
