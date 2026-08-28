-- =============================================================================
-- Drive Tech — Katalog Kendaraan (fitur baru, keputusan pemilik 2026-08-28)
-- =============================================================================
-- Etalase publik "mobil/motor apa yang dijual hari itu" untuk pengunjung umum:
--   * 1 booking slot zona kendaraan = 1 kendaraan (vehicle_listings 1:1 bookings).
--   * Data diisi penyewa slot lewat form booking (nama, plat, harga, 1 foto,
--     tahun, km, transmisi, warna, deskripsi).
--   * Tampil di /katalog HANYA saat booking sudah confirmed (pembayaran
--     terverifikasi) dan is_visible (admin bisa menyembunyikan).
--   * Halaman katalog dirender server memakai service role — tabel SENGAJA
--     tanpa policy publik, konsisten dengan bookings/tenants.
--   * Foto disimpan di bucket storage publik "foto-kendaraan".
--
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Tabel vehicle_listings
-- -----------------------------------------------------------------------------
create table if not exists public.vehicle_listings (
  id            uuid primary key default gen_random_uuid(),
  -- UNIQUE + cascade => 1:1 dengan booking; batal/hapus booking = listing ikut hilang
  booking_id    uuid not null unique references public.bookings(id) on delete cascade,
  slot_id       uuid not null references public.slots(id),
  vehicle_name  text not null,
  plate_number  text not null,
  price         numeric not null check (price > 0),
  year          int check (year between 1950 and 2100),
  mileage_km    int check (mileage_km >= 0),
  transmission  text,
  color         text,
  description   text,
  photo_url     text not null,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.vehicle_listings is
  'Katalog kendaraan per booking slot zona kendaraan; tampil publik saat booking confirmed & is_visible.';

create index if not exists vehicle_listings_slot_id_idx
  on public.vehicle_listings (slot_id);

drop trigger if exists vehicle_listings_set_updated_at on public.vehicle_listings;
create trigger vehicle_listings_set_updated_at
  before update on public.vehicle_listings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. RLS & grant — service-role only (tanpa policy publik)
-- -----------------------------------------------------------------------------
alter table public.vehicle_listings enable row level security;

do $do$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.vehicle_listings to service_role;
  end if;
end $do$;

-- -----------------------------------------------------------------------------
-- 3. Storage — bucket publik "foto-kendaraan"
-- -----------------------------------------------------------------------------
do $do$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('foto-kendaraan', 'foto-kendaraan', true)
    on conflict (id) do nothing;
  end if;
end $do$;

do $do$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "foto_kendaraan_public_read" on storage.objects;
    create policy "foto_kendaraan_public_read"
      on storage.objects for select
      using (bucket_id = 'foto-kendaraan');
  end if;
end $do$;
