-- Program assignments are separate from entry times and measured swim records.
create table if not exists public.swim_meet_programs (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.swim_meet_entries(id) on delete cascade,
 race_date date not null,
 round text not null check (round in ('予選','準決勝','決勝','タイム決勝')),
 program_number integer not null check (program_number between 1 and 9999),
 heat integer not null check (heat between 1 and 999),
 lane integer not null check (lane between 0 and 10),
 source text not null check (length(source) between 1 and 240),
 updated_at timestamptz not null default now(),
 unique(entry_id,race_date,round)
);
alter table public.swim_meet_programs enable row level security;
revoke all on public.swim_meet_programs from anon;
grant select,insert,update,delete on public.swim_meet_programs to authenticated;
-- Use the same coach access model as entries; require a current participant.
create policy coaches_manage_programs on public.swim_meet_programs
 for all to authenticated
 using (auth.uid() is not null and exists (
  select 1 from public.swim_meet_entries e
  join public.swim_meet_swimmers s on s.meet_id=e.meet_id and s.swimmer_id=e.swimmer_id
  where e.id=entry_id
 ))
 with check (auth.uid() is not null and exists (
  select 1 from public.swim_meet_entries e
  join public.swim_meet_swimmers s on s.meet_id=e.meet_id and s.swimmer_id=e.swimmer_id
  where e.id=entry_id
 ));

create or replace function public.import_swim_meet_program(
 p_meet_id uuid,p_race_date date,p_rows jsonb,p_source text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; old jsonb; n integer:=0; meet_day date;
begin
 if auth.uid() is null then raise exception 'コーチとしてログインしてください。' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception '出走情報の形式が不正です。'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception '1～1000件を選択してください。'; end if;
 if p_source is null or length(p_source) not between 1 and 240 then raise exception 'PDF名を確認してください。'; end if;
 select meet_date into meet_day from public.swim_meets where id=p_meet_id for update;
 if not found then raise exception '大会が見つかりません。'; end if;
 if p_race_date is null or p_race_date<meet_day or p_race_date>meet_day+14 then raise exception '競技日を確認してください（大会開始日から14日以内）。'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as x(entry_id uuid,round text) group by entry_id,round having count(*)>1) then raise exception '同じ種目・ラウンドが重複しています。'; end if;
 for r in select * from jsonb_to_recordset(p_rows) as x(entry_id uuid,round text,program_number integer,heat integer,lane integer,expected jsonb) order by entry_id,round loop
  if r.entry_id is null or r.round is null or r.round not in ('予選','準決勝','決勝','タイム決勝') or r.program_number is null or r.program_number not between 1 and 9999 or r.heat is null or r.heat not between 1 and 999 or r.lane is null or r.lane not between 0 and 10 then raise exception '競技番号・組・レーンを確認してください。'; end if;
  perform 1 from public.swim_meet_entries e join public.swim_meet_swimmers s on s.meet_id=e.meet_id and s.swimmer_id=e.swimmer_id where e.id=r.entry_id and e.meet_id=p_meet_id for update of e;
  if not found then raise exception '大会・出場種目が変更されました。読み直してください。'; end if;
  select jsonb_build_object('program_number',program_number,'heat',heat,'lane',lane,'updated_at',updated_at) into old from public.swim_meet_programs where entry_id=r.entry_id and race_date=p_race_date and round=r.round for update;
  if old is distinct from nullif(r.expected,'null'::jsonb) then raise exception '出走情報が別の端末で変更されました。読み直してください。'; end if;
  insert into public.swim_meet_programs(entry_id,race_date,round,program_number,heat,lane,source)
  values(r.entry_id,p_race_date,r.round,r.program_number,r.heat,r.lane,p_source)
  on conflict(entry_id,race_date,round) do update set program_number=excluded.program_number,heat=excluded.heat,lane=excluded.lane,source=excluded.source,updated_at=now();
  n:=n+1;
 end loop;
 return jsonb_build_object('saved',n);
end $$;
revoke all on function public.import_swim_meet_program(uuid,date,jsonb,text) from public,anon;
grant execute on function public.import_swim_meet_program(uuid,date,jsonb,text) to authenticated;
