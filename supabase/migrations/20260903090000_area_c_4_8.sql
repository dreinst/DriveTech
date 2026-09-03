-- =============================================================================
-- Drive Tech — Area C mengikuti GAMBAR Layout v2: 4 motor baru + 8 motor bekas
-- =============================================================================
-- Keputusan pemilik 2026-09-03 (menggantikan 3 + 14 dari teks Deck v4 yang
-- dipakai migrasi 20260902101000_layout_v2.sql):
--   * zone-motor-baru  : 3 -> 4 slot (tambah slot-motor-baru-04)
--   * zone-mobil-motor : 14 -> 8 slot (hapus slot-mobil-motor-09..14)
-- Penghapusan hanya menyentuh slot yang belum pernah dipakai booking; slot yang
-- masih dirujuk tabel lain akan ditolak FK (migrasi gagal, bukan data hilang).
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

update public.zones
   set description = 'Area C — tenda dealer motor baru, 4 slot.'
 where svg_group_id = 'zone-motor-baru';

update public.zones
   set description = 'Area C — area pameran motor bekas, 8 slot.'
 where svg_group_id = 'zone-mobil-motor';

insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, 4, null, 'slot-motor-baru-04'
  from public.zones z
 where z.svg_group_id = 'zone-motor-baru'
on conflict (svg_element_id) do nothing;

delete from public.slots s
 using public.zones z
 where z.id = s.zone_id
   and z.svg_group_id = 'zone-mobil-motor'
   and s.slot_number between 9 and 14
   and not exists (select 1 from public.bookings b where b.slot_id = s.id)
   and not exists (select 1 from public.booking_dates bd where bd.slot_id = s.id)
   and not exists (select 1 from public.vehicle_listings v where v.slot_id = s.id);
