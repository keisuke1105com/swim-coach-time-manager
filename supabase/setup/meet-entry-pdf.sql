-- 既存のコーチ用RLSをそのまま使用する。PDF原本・生年月日は取り込み保存しない。
alter table public.swim_meet_entries
  add column if not exists entry_mark text check (entry_mark is null or entry_mark in ('S','L','＊')),
  add column if not exists entry_class text,
  add column if not exists entry_source text;

create or replace function public.import_swim_meet_entries(
  p_meet_id uuid, p_course text, p_entries jsonb, p_source text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_total integer;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'コーチとしてログインしてください。' using errcode='42501';
  end if;
  if p_course is null or p_course not in ('長水路','短水路') then
    raise exception '大会の水路が不正です。';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '取り込む種目の形式が不正です。';
  end if;
  v_total := jsonb_array_length(p_entries);
  if v_total < 1 or v_total > 1000 then
    raise exception '1～1000種目を選択してください。';
  end if;
  if p_source is null or length(p_source) < 1 or length(p_source) > 240 then
    raise exception 'PDFファイル名を確認してください。';
  end if;
  perform 1 from public.swim_meets where id=p_meet_id for update;
  if not found then
    raise exception '登録先の大会が見つかりません。' using errcode='42501';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as r(
      swimmer_id uuid,stroke text,distance integer,entry_seconds numeric,entry_mark text,entry_class text
    ) left join public.swimmers s on s.id=r.swimmer_id
    where s.id is null
      or r.stroke is null or r.stroke not in ('自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー')
      or r.distance is null or r.distance not in (50,100,200,400,800,1500)
      or (r.stroke <> '自由形' and r.distance > 400)
      or (r.stroke='個人メドレー' and r.distance not in (200,400))
      or r.entry_seconds is null or not (r.entry_seconds > 0 and r.entry_seconds < 86400)
      or (r.entry_mark is not null and r.entry_mark not in ('S','L','＊'))
      or r.entry_class is null or r.entry_class not in ('9歳以下','10～11歳','12～13歳','14～15歳','16～17歳','18歳以上')
  ) then
    raise exception '選手・種目・タイム・クラスを確認してください。保存は行われませんでした。';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as r(swimmer_id uuid,stroke text,distance integer)
    group by swimmer_id,stroke,distance having count(*) > 1
  ) then
    raise exception '取込内容に同じ選手・種目の重複があります。';
  end if;

  insert into public.swim_meet_swimmers(meet_id,swimmer_id)
  select distinct p_meet_id,r.swimmer_id
  from jsonb_to_recordset(p_entries) as r(swimmer_id uuid)
  on conflict (meet_id,swimmer_id) do nothing;

  insert into public.swim_meet_entries(
    meet_id,swimmer_id,stroke,distance,course,entry_seconds,entry_mark,entry_class,entry_source
  ) select p_meet_id,r.swimmer_id,r.stroke,r.distance,p_course,r.entry_seconds,r.entry_mark,r.entry_class,p_source
    from jsonb_to_recordset(p_entries) as r(
      swimmer_id uuid,stroke text,distance integer,entry_seconds numeric,entry_mark text,entry_class text
    )
  on conflict (meet_id,swimmer_id,stroke,distance,course) do nothing;
  get diagnostics v_inserted = row_count;

  -- 既存の申込タイムは保持。同じ申込値に対してのみ未入力の原表情報を補完する。
  update public.swim_meet_entries e
  set entry_mark=coalesce(e.entry_mark,r.entry_mark),
      entry_class=coalesce(e.entry_class,r.entry_class),
      entry_source=coalesce(e.entry_source,p_source)
  from jsonb_to_recordset(p_entries) as r(
    swimmer_id uuid,stroke text,distance integer,entry_seconds numeric,entry_mark text,entry_class text
  ) where e.meet_id=p_meet_id and e.swimmer_id=r.swimmer_id
    and e.stroke=r.stroke and e.distance=r.distance and e.course=p_course
    and e.entry_seconds=r.entry_seconds
    and (e.entry_mark is null or e.entry_class is null or e.entry_source is null);

  return jsonb_build_object('inserted_entries',v_inserted,'existing_entries',v_total-v_inserted);
end;
$$;
revoke all on function public.import_swim_meet_entries(uuid,text,jsonb,text) from public,anon;
grant execute on function public.import_swim_meet_entries(uuid,text,jsonb,text) to authenticated;
