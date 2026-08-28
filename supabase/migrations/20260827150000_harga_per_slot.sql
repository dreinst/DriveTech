-- =============================================================================
-- Migrasi: HARGA PER SLOT + LOKASI SINGOSARI (keputusan pemilik, 2026-08-27)
-- =============================================================================
-- 1. Kolom baru slots.admin_fee_override (numeric) dan slots.peruntukan (text):
--    harga efektif slot = coalesce(admin_fee_override, zone.admin_fee).
--    Resolusi di aplikasi: src/lib/domain/harga.ts (slotAdminFee).
-- 2. Harga baru admin fee PER TANGGAL per zona:
--      mobil_baru        1.000.000
--      mobil_bekas          50.000
--      mobil_motor_bekas    25.000
--      umkm                250.000
--      warung              500.000 (tetap)
--      facility                  0
-- 3. Override khusus zona UMKM:
--      slot 11-15 -> 500.000, peruntukan 'Booth Leasing'
--      slot 16-20 -> 500.000, peruntukan 'Booth Otomotif'
--      slot 1-10 & 21-30 tanpa override (ikut harga zona 250.000).
--      ASUMSI: pemilik tidak menyebut slot 21 secara eksplisit — kami anggap
--      slot 21 UMKM biasa (250.000, tanpa peruntukan). Kalau keputusan
--      berubah, cukup update admin_fee_override/peruntukan slot tersebut.
-- 4. Lokasi event -> 'Kampung Tentara, Singosari, Malang' (nama event tetap).
--
-- Seluruh pernyataan idempotent: aman dijalankan berulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Kolom baru pada slots
-- -----------------------------------------------------------------------------
alter table public.slots add column if not exists admin_fee_override numeric;
alter table public.slots add column if not exists peruntukan text;

comment on column public.slots.admin_fee_override is
  'Harga admin fee per tanggal KHUSUS slot ini; null = ikut zones.admin_fee.';
comment on column public.slots.peruntukan is
  'Peruntukan khusus slot (mis. "Booth Leasing", "Booth Otomotif"); null = umum.';

-- -----------------------------------------------------------------------------
-- 2. Harga baru admin fee per zona (via zone_type)
-- -----------------------------------------------------------------------------
update public.zones set admin_fee = 1000000 where zone_type = 'mobil_baru'        and admin_fee is distinct from 1000000;
update public.zones set admin_fee =   50000 where zone_type = 'mobil_bekas'       and admin_fee is distinct from 50000;
update public.zones set admin_fee =   25000 where zone_type = 'mobil_motor_bekas' and admin_fee is distinct from 25000;
update public.zones set admin_fee =  250000 where zone_type = 'umkm'              and admin_fee is distinct from 250000;
update public.zones set admin_fee =  500000 where zone_type = 'warung'            and admin_fee is distinct from 500000;
update public.zones set admin_fee =       0 where zone_type = 'facility'          and admin_fee is distinct from 0;

-- -----------------------------------------------------------------------------
-- 3. Override per-slot zona UMKM (join zona lewat zone_type + rentang nomor)
-- -----------------------------------------------------------------------------
update public.slots s
set admin_fee_override = 500000,
    peruntukan         = 'Booth Leasing'
from public.zones z
where z.id = s.zone_id
  and z.zone_type = 'umkm'
  and s.slot_number between 11 and 15
  and (s.admin_fee_override is distinct from 500000
       or s.peruntukan is distinct from 'Booth Leasing');

update public.slots s
set admin_fee_override = 500000,
    peruntukan         = 'Booth Otomotif'
from public.zones z
where z.id = s.zone_id
  and z.zone_type = 'umkm'
  and s.slot_number between 16 and 20
  and (s.admin_fee_override is distinct from 500000
       or s.peruntukan is distinct from 'Booth Otomotif');

-- Slot UMKM 1-10 dan 21-30: pastikan TANPA override (ikut harga zona).
-- ASUMSI slot 21 = UMKM biasa 250.000 — pemilik tidak menyebutnya eksplisit.
update public.slots s
set admin_fee_override = null,
    peruntukan         = null
from public.zones z
where z.id = s.zone_id
  and z.zone_type = 'umkm'
  and (s.slot_number between 1 and 10 or s.slot_number between 21 and 30)
  and (s.admin_fee_override is not null or s.peruntukan is not null);

-- -----------------------------------------------------------------------------
-- 4. Lokasi event (nama event dibiarkan apa adanya)
-- -----------------------------------------------------------------------------
update public.events
set location = 'Kampung Tentara, Singosari, Malang'
where location is distinct from 'Kampung Tentara, Singosari, Malang';
