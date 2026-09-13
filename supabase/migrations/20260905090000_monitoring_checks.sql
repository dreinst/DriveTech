-- =============================================================================
-- Drive Tech — Tabel sampel monitoring (health/availability/performance) — 2026-09-05
-- =============================================================================
-- Dipakai fitur dashboard /admin/monitoring (branch feature/monitoring, tidak
-- menyentuh alur produksi apa pun). Endpoint cron /api/cron/monitoring-check
-- menulis satu baris tiap kali dijalankan (rencana: tiap 5 menit via Vercel
-- Cron); dashboard admin membaca & meringkas baris-baris ini.
-- RLS aktif TANPA policy = deny-all untuk anon/authenticated; hanya
-- service_role (dipakai server) yang menyentuhnya — pola sama seperti
-- rate_limit_events & notification_outbox.
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.monitoring_checks (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  -- 'db' | 'site' | 'cron' — komponen yang diperiksa.
  check_type   text not null check (check_type in ('db', 'site', 'cron')),
  target       text not null,                    -- mis. 'supabase', 'https://.../denah', 'sync-cancelled'
  status       text not null check (status in ('ok', 'degraded', 'down')),
  latency_ms   integer,                           -- null kalau tidak relevan / gagal sebelum sempat diukur
  detail       text,                              -- pesan error singkat, kalau ada
  meta         jsonb not null default '{}'::jsonb
);

create index if not exists monitoring_checks_type_time_idx
  on public.monitoring_checks (check_type, created_at desc);

alter table public.monitoring_checks enable row level security;
revoke all on public.monitoring_checks from anon, authenticated;

comment on table public.monitoring_checks is
  'Sampel health/availability/performance untuk dashboard /admin/monitoring. Ditulis oleh /api/cron/monitoring-check, dibaca lapisan admin lewat service_role.';

-- Retensi: buang sampel lebih tua dari 14 hari supaya tabel tetap kecil.
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'monitoring-checks-cleanup') then
      perform cron.unschedule('monitoring-checks-cleanup');
    end if;
    perform cron.schedule('monitoring-checks-cleanup', '23 3 * * *',
      $q$delete from public.monitoring_checks where created_at < now() - interval '14 days'$q$);
  end if;
end $do$;
