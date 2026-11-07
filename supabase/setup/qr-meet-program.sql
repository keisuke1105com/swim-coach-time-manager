-- The existing token-gated public profile function uses the server service role.
-- No anon/authenticated grants or RLS policies change.
grant select on public.swim_meet_programs, public.swim_meet_timetable to service_role;
