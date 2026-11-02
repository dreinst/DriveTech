-- =============================================================================
-- Label "Sold Out" terjadwal di katalog: vehicle_listings.terjual_mulai.
--
-- Begitu waktu sekarang melewati terjual_mulai, kartu dan halaman detail unit menampilkan "Sold Out"
-- (lihat src/lib/domain/terjual.ts). Kosong = belum terjual.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261102-katalog-terjual.sql
-- =============================================================================
begin;

alter table public.vehicle_listings add column if not exists terjual_mulai timestamptz;

commit;
