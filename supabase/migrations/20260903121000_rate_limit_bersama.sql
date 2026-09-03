-- =============================================================================
-- Drive Tech — Pembatas laju BERSAMA lintas instance Vercel — 2026-09-03
-- =============================================================================
-- Temuan audit: pembatas laju lama in-memory per instance serverless dan tidak
-- menyentuh server action. Tabel + fungsi ini dipakai semua jalur publik
-- (form web, API, pembatalan mandiri, login admin) lewat service_role.
--   select public.rate_limit_hit('booking:ip:1.2.3.4', 5, 60)  -> true = boleh
-- Baris lama dibersihkan pg_cron tiap jam. RLS aktif tanpa policy.
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.rate_limit_events (
  id         bigserial primary key,
  key        text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_key_time_idx
  on public.rate_limit_events (key, created_at desc);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  jumlah int;
begin
  select count(*) into jumlah
    from public.rate_limit_events
   where key = p_key
     and created_at > now() - make_interval(secs => p_window_seconds);
  if jumlah >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (key) values (p_key);
  return true;
end;
$fn$;

revoke execute on function public.rate_limit_hit(text, int, int) from public;
do $do$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.rate_limit_hit(text, int, int) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
  end if;
end $do$;

-- Bersihkan jejak lebih tua dari 1 hari, tiap jam (pg_cron bila tersedia).
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'rate-limit-cleanup') then
      perform cron.unschedule('rate-limit-cleanup');
    end if;
    perform cron.schedule('rate-limit-cleanup', '17 * * * *',
      $q$delete from public.rate_limit_events where created_at < now() - interval '1 day'$q$);
  end if;
end $do$;
