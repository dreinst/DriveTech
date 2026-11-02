-- =============================================================================
-- Label "Nego" di samping harga katalog: vehicle_listings.harga_nego.
-- Honda C70 dan Honda Astrea C100 ditandai nego, harga C100 disamakan dengan C70 (keputusan pemilik 2 Nov 2026).
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261102-harga-nego.sql
-- =============================================================================
begin;

alter table public.vehicle_listings add column if not exists harga_nego boolean not null default false;

update public.vehicle_listings set harga_nego = true,
  description = 'Honda C70 70 cc tahun 1978 warna merah. Kilometer menyusul.'
 where id = '5a471f94-cc8a-4105-9d0b-34ee1ef2d863';

update public.vehicle_listings set harga_nego = true, price = 10000000,
  description = 'Honda Astrea C100 100 cc tahun 1994 warna hitam, STNK berlaku sampai 2022. Unit yang tampil di foto adalah motor di bagian belakang. Kilometer menyusul.'
 where vehicle_name = 'Honda Astrea C100';

commit;
