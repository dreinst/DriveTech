-- =============================================================================
-- Drive Tech — Zona Booth Leasing & Brand Otomotif + zona motor (2026-08-29)
-- =============================================================================
-- Keputusan pemilik:
-- 1. Zona 14 slot (svg zone-mobil-motor) fokus MOTOR saja -> nama tampilan
--    "Area Pameran Motor" (zone_type tetap mobil_motor_bekas; katalognya kini
--    otomatis tercatat jenis motor lewat aplikasi).
-- 2. UMKM slot 11-20 (booth 2 sisi: 5 bank leasing + 5 brand otomotif,
--    Rp500.000/tanggal) dipisah jadi zona sendiri 'booth_khusus' agar punya
--    card sendiri di beranda dan statistik terpisah. svg_element_id slot
--    TIDAK berubah (tetap slot-umkm-11..20); harga pindah dari override
--    per-slot ke zones.admin_fee.
--
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- 1. Nama zona motor
update public.zones
   set name = 'Area Pameran Motor'
 where svg_group_id = 'zone-mobil-motor'
   and name is distinct from 'Area Pameran Motor';

-- 2. Zona booth_khusus (sekali buat) + geser display_order zona setelah UMKM
do $do$
declare
  umkm_zone public.zones%rowtype;
  booth_id uuid;
begin
  select * into umkm_zone from public.zones where svg_group_id = 'zone-umkm' limit 1;
  if umkm_zone.id is null then
    raise exception 'Zona zone-umkm tidak ditemukan';
  end if;

  if not exists (select 1 from public.zones where svg_group_id = 'zone-booth-khusus') then
    update public.zones
       set display_order = display_order + 1
     where display_order > umkm_zone.display_order;

    insert into public.zones (event_id, name, zone_type, svg_group_id, admin_fee, description, display_order)
    values (
      umkm_zone.event_id,
      'Booth Leasing & Brand Otomotif',
      'booth_khusus',
      'zone-booth-khusus',
      500000,
      'Booth premium 2 sisi di tengah Area UMKM: 5 booth bank/leasing (slot 11-15) dan 5 booth brand otomotif (slot 16-20).',
      umkm_zone.display_order + 1
    );
  end if;

  select id into booth_id from public.zones where svg_group_id = 'zone-booth-khusus';

  -- 3. Pindahkan slot 11-20 dari zona UMKM ke zona booth; harga ikut zona
  --    (override per-slot dihapus), peruntukan per slot dipertahankan.
  update public.slots s
     set zone_id = booth_id,
         admin_fee_override = null
   where s.zone_id = umkm_zone.id
     and s.slot_number between 11 and 20;

  -- Pastikan peruntukan terisi benar (idempotent, juga untuk data lama).
  update public.slots
     set peruntukan = 'Booth Leasing'
   where zone_id = booth_id and slot_number between 11 and 15
     and peruntukan is distinct from 'Booth Leasing';
  update public.slots
     set peruntukan = 'Booth Otomotif'
   where zone_id = booth_id and slot_number between 16 and 20
     and peruntukan is distinct from 'Booth Otomotif';
end $do$;
