-- =============================================================================
-- Drive Tech — Jenis kendaraan (mobil/motor) di katalog
-- =============================================================================
-- Navbar punya tautan "Katalog Mobil" dan "Katalog Motor"; zona
-- mobil_motor_bekas mencampur keduanya, jadi listing butuh penanda jenis.
-- Diisi penyewa di form booking (hanya bisa dipilih di zona campuran;
-- zona mobil_baru/mobil_bekas selalu 'mobil').
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

alter table public.vehicle_listings
  add column if not exists vehicle_kind text not null default 'mobil'
    check (vehicle_kind in ('mobil', 'motor'));

comment on column public.vehicle_listings.vehicle_kind is
  'Jenis kendaraan untuk filter katalog: mobil | motor.';
