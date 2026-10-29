-- =============================================================================
-- PDF formulir dealer dikirim bot WhatsApp kantor. Nomor kantor tidak pernah mengirim pesan pertama,
-- jadi dealer chat dulu lewat tombol di /dealer/<token> (pesan berisi kode DL-0001-XXXXXXXX), lalu bot
-- membalas dengan PDF dan menyimpan chat-nya di wa_chat.
-- kabar terisi saat PDF berubah dan perlu dikirim ulang ke wa_chat:
-- 'ditandatangani' (tanda tangan menyusul) atau 'diterima' (panitia menerima, tanda tangan panitia masuk).
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261029-dealer-wa.sql
-- =============================================================================
begin;

alter table public.dealer_pendaftaran
    add column if not exists wa_chat text,
    add column if not exists kabar text;

alter table public.dealer_pendaftaran drop constraint if exists dealer_pendaftaran_kabar_check;
alter table public.dealer_pendaftaran
    add constraint dealer_pendaftaran_kabar_check check (kabar in ('ditandatangani', 'diterima'));

commit;
