-- =============================================================================
-- Drive Tech — Antrean notifikasi WhatsApp (outbox) — 2026-09-03
-- =============================================================================
-- Keputusan pemilik: pesan ke penyewa (kode booking, tenggat, verifikasi,
-- penolakan, pembatalan) dikirim DARI nomor WhatsApp kantor 6282232999900 yang
-- dipegang bot Hermes di VPS. Aplikasi (Vercel) tidak bisa memanggil bot itu
-- langsung, jadi aplikasi menulis baris ke tabel ini (service_role) dan worker
-- di VPS (tools/vps/drivetech-wa-outbox.py, timer tiap menit) mengirimnya lewat
-- `hermes send`, lalu menandai sent/failed. RLS aktif TANPA policy = deny-all
-- untuk anon/authenticated; hanya service_role yang menyentuhnya.
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null default 'whatsapp' check (channel in ('whatsapp')),
  recipient    text not null,                          -- nomor internasional tanpa +, mis. 6281234567890
  body         text not null,
  kind         text not null default 'other',           -- created | verified | rejected | cancelled | other
  booking_code text,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where status = 'pending';

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;

comment on table public.notification_outbox is
  'Antrean pesan WhatsApp ke penyewa; dikirim worker VPS lewat bot Hermes (nomor kantor).';
