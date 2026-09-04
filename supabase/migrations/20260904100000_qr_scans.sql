-- =============================================================================
-- Drive Tech — Pencatatan scan QR (halaman /go) — 2026-09-04
-- =============================================================================
-- QR cetak/digital mengarah ke /go?dari=<media>. Halaman itu mencatat satu
-- baris per kunjungan supaya panitia tahu media mana (spanduk, flyer, LED,
-- Instagram, ...) yang paling banyak di-scan. Tidak menyimpan IP / data
-- pribadi — hanya nama media, platform kasar (android/ios/lain), dan waktu.
-- Ditulis lewat service_role dari server; RLS aktif tanpa policy.
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.qr_scans (
  id         bigserial primary key,
  media      text not null,
  platform   text not null default 'lain',
  created_at timestamptz not null default now()
);

create index if not exists qr_scans_media_time_idx
  on public.qr_scans (media, created_at desc);

create index if not exists qr_scans_time_idx
  on public.qr_scans (created_at desc);

alter table public.qr_scans enable row level security;
revoke all on public.qr_scans from anon, authenticated;
