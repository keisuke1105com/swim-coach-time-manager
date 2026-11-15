-- Business-row policies and protected columns. No swimmer/record data is changed.
BEGIN;
CREATE FUNCTION swim_authz_private.guard_columns() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[];
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 IF public.is_swim_share_admin() THEN RETURN NEW; END IF;
 IF NOT public.is_swim_coach_approved() THEN RAISE EXCEPTION 'コーチ承認が必要です' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='swimmers' THEN
  allowed=ARRAY['name','age_group','gender','birth_date','team','sort_order','athlete_id','athlete_ids','jasf_athlete_id','updated_at'];
  IF TG_OP='INSERT' AND NOT NEW.active THEN RAISE EXCEPTION '非表示化は管理者専用です' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='swim_records' THEN
  allowed=ARRAY['stroke','distance','course','time_seconds','meet_name','record_date','memo','is_personal_best','is_jo_qualified','updated_at'];
  IF TG_OP='INSERT' AND (coalesce(NEW.source,'manual')<>'manual' OR NEW.jasf_athlete_id IS NOT NULL OR NEW.jasf_synced_at IS NOT NULL) THEN RAISE EXCEPTION '公式属性は管理者専用です' USING ERRCODE='42501'; END IF;
  IF (TG_OP='INSERT' OR coalesce(OLD.source,'manual')='manual') THEN allowed=array_append(allowed,'laps'); END IF;
  IF NEW.laps IS NOT NULL AND jsonb_typeof(NEW.laps) NOT IN ('array','string') THEN RAISE EXCEPTION 'ラップ形式を確認してください' USING ERRCODE='22023'; END IF;
 ELSIF TG_TABLE_NAME='swim_manual_laps' THEN allowed=ARRAY['cumulative_seconds','updated_at'];
 ELSIF TG_TABLE_NAME='swimmer_goals' THEN allowed=ARRAY['target_seconds','updated_by','updated_at'];
 ELSE RAISE EXCEPTION 'Unsupported authorization guard'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN RAISE EXCEPTION '管理者専用項目または関連IDは変更できません' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION swim_authz_private.guard_columns() FROM PUBLIC,anon,authenticated;
DROP POLICY "manual_laps_delete" ON public.swim_manual_laps;
DROP POLICY "manual_laps_insert" ON public.swim_manual_laps;
DROP POLICY "manual_laps_select" ON public.swim_manual_laps;
DROP POLICY "manual_laps_update" ON public.swim_manual_laps;
DROP POLICY "coaches_create_entries" ON public.swim_meet_entries;
DROP POLICY "coaches_delete_entries" ON public.swim_meet_entries;
DROP POLICY "coaches_edit_entries" ON public.swim_meet_entries;
DROP POLICY "coaches_read_entries" ON public.swim_meet_entries;
DROP POLICY "coaches_manage_programs" ON public.swim_meet_programs;
DROP POLICY "coaches_add_meet_swimmers" ON public.swim_meet_swimmers;
DROP POLICY "coaches_read_meet_swimmers" ON public.swim_meet_swimmers;
DROP POLICY "coaches_remove_meet_swimmers" ON public.swim_meet_swimmers;
DROP POLICY "coaches_manage_timetable" ON public.swim_meet_timetable;
DROP POLICY "coaches_create_meets" ON public.swim_meets;
DROP POLICY "coaches_delete_meets" ON public.swim_meets;
DROP POLICY "coaches_edit_meets" ON public.swim_meets;
DROP POLICY "coaches_read_meets" ON public.swim_meets;
DROP POLICY "authenticated_swim_records_all" ON public.swim_records;
DROP POLICY "video_analyses_delete" ON public.swim_video_analyses;
DROP POLICY "video_analyses_insert" ON public.swim_video_analyses;
DROP POLICY "video_analyses_read" ON public.swim_video_analyses;
DROP POLICY "authenticated_coaches_delete_goals" ON public.swimmer_goals;
DROP POLICY "authenticated_coaches_insert_goals" ON public.swimmer_goals;
DROP POLICY "authenticated_coaches_read_goals" ON public.swimmer_goals;
DROP POLICY "authenticated_coaches_update_goals" ON public.swimmer_goals;
DROP POLICY "share_admin_delete" ON public.swimmer_public_shares;
DROP POLICY "share_admin_insert" ON public.swimmer_public_shares;
DROP POLICY "share_admin_select" ON public.swimmer_public_shares;
DROP POLICY "share_admin_update" ON public.swimmer_public_shares;
DROP POLICY "ranking_share_admin_insert" ON public.swimmer_ranking_share_cache;
DROP POLICY "ranking_share_admin_select" ON public.swimmer_ranking_share_cache;
DROP POLICY "ranking_share_admin_update" ON public.swimmer_ranking_share_cache;
DROP POLICY "authenticated_swimmers_all" ON public.swimmers;
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swimmers FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swimmers TO authenticated;
CREATE POLICY authz_read ON public.swimmers FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swimmers FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_update ON public.swimmers FOR UPDATE TO authenticated USING ((SELECT public.is_swim_coach_approved())) WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_delete ON public.swimmers FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE TRIGGER swim_authz_guard BEFORE INSERT OR UPDATE ON public.swimmers FOR EACH ROW EXECUTE FUNCTION swim_authz_private.guard_columns();
ALTER TABLE public.swim_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_records FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_records TO authenticated;
CREATE POLICY authz_read ON public.swim_records FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_records FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_update ON public.swim_records FOR UPDATE TO authenticated USING ((SELECT public.is_swim_coach_approved())) WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_delete ON public.swim_records FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE TRIGGER swim_authz_guard BEFORE INSERT OR UPDATE ON public.swim_records FOR EACH ROW EXECUTE FUNCTION swim_authz_private.guard_columns();
ALTER TABLE public.swim_manual_laps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_manual_laps FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_manual_laps TO authenticated;
CREATE POLICY authz_read ON public.swim_manual_laps FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_manual_laps FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_update ON public.swim_manual_laps FOR UPDATE TO authenticated USING ((SELECT public.is_swim_coach_approved())) WITH CHECK ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_delete ON public.swim_manual_laps FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE TRIGGER swim_authz_guard BEFORE INSERT OR UPDATE ON public.swim_manual_laps FOR EACH ROW EXECUTE FUNCTION swim_authz_private.guard_columns();
ALTER TABLE public.swimmer_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swimmer_goals FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swimmer_goals TO authenticated;
CREATE POLICY authz_read ON public.swimmer_goals FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swimmer_goals FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_coach_approved()) AND updated_by=(SELECT auth.uid()));
CREATE POLICY authz_update ON public.swimmer_goals FOR UPDATE TO authenticated USING ((SELECT public.is_swim_coach_approved())) WITH CHECK ((SELECT public.is_swim_coach_approved()) AND updated_by=(SELECT auth.uid()));
CREATE POLICY authz_delete ON public.swimmer_goals FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE TRIGGER swim_authz_guard BEFORE INSERT OR UPDATE ON public.swimmer_goals FOR EACH ROW EXECUTE FUNCTION swim_authz_private.guard_columns();
ALTER TABLE public.swim_meets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_meets FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_meets TO authenticated;
CREATE POLICY authz_read ON public.swim_meets FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_meets FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()) AND created_by=(SELECT auth.uid()));
CREATE POLICY authz_update ON public.swim_meets FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_delete ON public.swim_meets FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swim_meet_swimmers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_meet_swimmers FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_meet_swimmers TO authenticated;
CREATE POLICY authz_read ON public.swim_meet_swimmers FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_meet_swimmers FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_update ON public.swim_meet_swimmers FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_delete ON public.swim_meet_swimmers FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swim_meet_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_meet_entries FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_meet_entries TO authenticated;
CREATE POLICY authz_read ON public.swim_meet_entries FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_meet_entries FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_update ON public.swim_meet_entries FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_delete ON public.swim_meet_entries FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swim_meet_programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_meet_programs FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_meet_programs TO authenticated;
CREATE POLICY authz_read ON public.swim_meet_programs FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_meet_programs FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()) AND EXISTS(SELECT 1 FROM public.swim_meet_entries e JOIN public.swim_meet_swimmers s ON s.meet_id=e.meet_id AND s.swimmer_id=e.swimmer_id WHERE e.id=entry_id));
CREATE POLICY authz_update ON public.swim_meet_programs FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()) AND EXISTS(SELECT 1 FROM public.swim_meet_entries e JOIN public.swim_meet_swimmers s ON s.meet_id=e.meet_id AND s.swimmer_id=e.swimmer_id WHERE e.id=entry_id));
CREATE POLICY authz_delete ON public.swim_meet_programs FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swim_meet_timetable ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_meet_timetable FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swim_meet_timetable TO authenticated;
CREATE POLICY authz_read ON public.swim_meet_timetable FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_meet_timetable FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_update ON public.swim_meet_timetable FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_delete ON public.swim_meet_timetable FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swim_video_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swim_video_analyses FROM anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.swim_video_analyses TO authenticated;
CREATE POLICY authz_read ON public.swim_video_analyses FOR SELECT TO authenticated USING ((SELECT public.is_swim_coach_approved()));
CREATE POLICY authz_insert ON public.swim_video_analyses FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()) AND created_by=(SELECT auth.uid()));
CREATE POLICY authz_delete ON public.swim_video_analyses FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swimmer_public_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swimmer_public_shares FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.swimmer_public_shares TO authenticated;
CREATE POLICY authz_read ON public.swimmer_public_shares FOR SELECT TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_insert ON public.swimmer_public_shares FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_update ON public.swimmer_public_shares FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_delete ON public.swimmer_public_shares FOR DELETE TO authenticated USING ((SELECT public.is_swim_share_admin()));
ALTER TABLE public.swimmer_ranking_share_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.swimmer_ranking_share_cache FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.swimmer_ranking_share_cache TO authenticated;
CREATE POLICY authz_read ON public.swimmer_ranking_share_cache FOR SELECT TO authenticated USING ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_insert ON public.swimmer_ranking_share_cache FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE POLICY authz_update ON public.swimmer_ranking_share_cache FOR UPDATE TO authenticated USING ((SELECT public.is_swim_share_admin())) WITH CHECK ((SELECT public.is_swim_share_admin()));
CREATE OR REPLACE FUNCTION public.import_swim_meet_entries(p_meet_id uuid, p_course text, p_entries jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_total integer;
  v_inserted integer;
begin
 IF NOT public.is_swim_share_admin() THEN RAISE EXCEPTION '大会取込は管理者専用です' USING ERRCODE='42501'; END IF;
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
      or r.entry_class is null
      or length(btrim(r.entry_class)) not between 1 and 60
      or r.entry_class ~ '[[:cntrl:]]'
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
$function$
;
CREATE OR REPLACE FUNCTION public.import_swim_meet_program(p_meet_id uuid, p_race_date date, p_rows jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; old jsonb; n integer:=0; meet_day date;
begin
 IF NOT public.is_swim_share_admin() THEN RAISE EXCEPTION '大会取込は管理者専用です' USING ERRCODE='42501'; END IF;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.import_swim_meet_timetable(p_meet_id uuid, p_race_date date, p_course text, p_rows jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; meet_day date; n integer:=0;
begin
 IF NOT public.is_swim_share_admin() THEN RAISE EXCEPTION '大会取込は管理者専用です' USING ERRCODE='42501'; END IF;
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
end $function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
