create table if not exists public.swim_meet_timetable (
 id uuid primary key default gen_random_uuid(),
 meet_id uuid not null references public.swim_meets(id) on delete cascade,
 race_date date not null,
 course text not null check (course in ('長水路','短水路')),
 program_number integer not null check (program_number between 1 and 9999),
 gender text not null check (gender in ('女子','男子')),
 stroke text not null check (stroke in ('自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー')),
 distance integer not null check (distance in (50,100,200,400,800,1500)),
 round text not null check (round in ('予選','準決勝','決勝','タイム決勝')),
 scheduled_time time without time zone not null,
 source text not null check (length(source) between 1 and 240),
 updated_at timestamptz not null default now(),
 unique(meet_id,race_date,course,program_number)
);
alter table public.swim_meet_timetable enable row level security;
revoke all on public.swim_meet_timetable from anon;
grant select,insert,update,delete on public.swim_meet_timetable to authenticated;
create policy coaches_manage_timetable on public.swim_meet_timetable for all to authenticated
 using (auth.uid() is not null and exists(select 1 from public.swim_meets m where m.id=meet_id))
 with check (auth.uid() is not null and exists(select 1 from public.swim_meets m where m.id=meet_id));
create or replace function public.import_swim_meet_timetable(p_meet_id uuid,p_race_date date,p_course text,p_rows jsonb,p_source text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; meet_day date; n integer:=0;
begin
 if auth.uid() is null then raise exception 'コーチとしてログインしてください。' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception '予定時刻の形式が不正です。'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception '1～1000競技を指定してください。'; end if;
 if p_course is null or p_course not in ('長水路','短水路') or p_source is null or length(p_source) not between 1 and 240 then raise exception '水路・PDF名を確認してください。'; end if;
 select meet_date into meet_day from public.swim_meets where id=p_meet_id for update;
 if not found then raise exception '大会が見つかりません。'; end if;
 if p_race_date is null or p_race_date<meet_day or p_race_date>meet_day+14 then raise exception '競技日を確認してください。'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as x(program_number integer) group by program_number having count(*)>1) then raise exception '競技番号が重複しています。'; end if;
 for r in select * from jsonb_to_recordset(p_rows) as x(program_number integer,gender text,stroke text,distance integer,round text,scheduled_time text) loop
  if r.program_number is null or r.program_number not between 1 and 9999 or r.gender is null or r.gender not in ('女子','男子') or r.stroke is null or r.stroke not in ('自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー') or r.distance is null or r.distance not in (50,100,200,400,800,1500) or r.round is null or r.round not in ('予選','準決勝','決勝','タイム決勝') or r.scheduled_time is null or r.scheduled_time!~'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '競技・予定時刻を確認してください。'; end if;
  insert into public.swim_meet_timetable(meet_id,race_date,course,program_number,gender,stroke,distance,round,scheduled_time,source)
  values(p_meet_id,p_race_date,p_course,r.program_number,r.gender,r.stroke,r.distance,r.round,r.scheduled_time::time,p_source)
  on conflict(meet_id,race_date,course,program_number) do update set gender=excluded.gender,stroke=excluded.stroke,distance=excluded.distance,round=excluded.round,scheduled_time=excluded.scheduled_time,source=excluded.source,updated_at=now();
  n:=n+1;
 end loop;
 return jsonb_build_object('saved',n);
end $$;
revoke all on function public.import_swim_meet_timetable(uuid,date,text,jsonb,text) from public,anon;
grant execute on function public.import_swim_meet_timetable(uuid,date,text,jsonb,text) to authenticated;
