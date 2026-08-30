-- Foto katalog versi KECIL khusus kartu daftar (~640px). Kartu di HP hanya
-- selebar ~360px, tapi selama ini mengunduh foto 1600px — boros kuota penyewa.
-- Nullable: baris lama tetap valid dan otomatis jatuh ke photo_url.
alter table public.vehicle_listings add column if not exists photo_thumb_url text;

comment on column public.vehicle_listings.photo_thumb_url is
  'Foto versi kecil (~640px) untuk kartu katalog. NULL = pakai photo_url.';
