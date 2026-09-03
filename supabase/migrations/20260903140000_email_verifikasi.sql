-- =============================================================================
-- Drive Tech — Verifikasi email (OTP) sebelum booking dikunci — 2026-09-03
-- =============================================================================
-- Keputusan pemilik: kode booking & notifikasi dikirim lewat EMAIL, dan untuk
-- menahan penimbunan slot lewat data karangan, penyewa harus membuktikan
-- kepemilikan email dengan kode 6 digit (berlaku 10 menit, maks 5 percobaan).
-- Kode TIDAK disimpan mentah: hanya hash sha256(email:kode:pepper). Tabel ini
-- hanya disentuh service_role (RLS aktif tanpa policy). Baris lama dibersihkan
-- pg_cron tiap jam. Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.email_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int  not null default 0,
  verified_at timestamptz,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists email_verifications_email_time_idx
  on public.email_verifications (email, created_at desc);

alter table public.email_verifications enable row level security;
revoke all on public.email_verifications from anon, authenticated;

comment on table public.email_verifications is
  'Kode verifikasi email (hash) untuk mengunci booking; hanya service_role.';

-- Bersihkan kode lebih tua dari 1 hari, tiap jam (pg_cron bila tersedia).
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'email-otp-cleanup') then
      perform cron.unschedule('email-otp-cleanup');
    end if;
    perform cron.schedule('email-otp-cleanup', '23 * * * *',
      $q$delete from public.email_verifications where created_at < now() - interval '1 day'$q$);
  end if;
end $do$;
