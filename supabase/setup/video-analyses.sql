-- Video analyses are intentionally independent of competition results and public QR data.
create table public.swim_video_analyses (
  id uuid primary key default gen_random_uuid(),
  swimmer_id uuid not null references public.swimmers(id),
  source_id text not null unique check (length(source_id) between 1 and 200),
  record_date date not null,
  stroke text not null,
  distance numeric not null check (distance > 0),
  time_seconds double precision not null check (time_seconds > 0 and time_seconds < 'Infinity'::double precision),
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index swim_video_analyses_swimmer_date_idx on public.swim_video_analyses(swimmer_id,record_date desc);
create index swim_video_analyses_created_by_idx on public.swim_video_analyses(created_by);
alter table public.swim_video_analyses enable row level security;
revoke all on public.swim_video_analyses from anon, authenticated;
grant select,insert,delete on public.swim_video_analyses to authenticated;
-- The existing app is a single shared coach workspace; all signed-in coaches
-- can read swimmers. Limit new analysis writes to the existing admin allowlist.
create policy video_analyses_read on public.swim_video_analyses for select to authenticated
  using (exists (select 1 from public.swimmers s where s.id=swimmer_id));
create policy video_analyses_insert on public.swim_video_analyses for insert to authenticated
  with check ((select public.is_swim_share_admin()) and created_by=(select auth.uid())
    and exists (select 1 from public.swimmers s where s.id=swimmer_id));
create policy video_analyses_delete on public.swim_video_analyses for delete to authenticated
  using ((select public.is_swim_share_admin()));
