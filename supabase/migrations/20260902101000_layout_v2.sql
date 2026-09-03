-- =============================================================================
-- Drive Tech — Revisi Layout v2 + Deck v4 (keputusan pemilik 2026-09-02)
-- =============================================================================
-- Sumber: "Layout v2.jpeg" (denah terbaru) dan "Drive Tech Deck v4" slide 6-7
-- (inventaris & tarif). Ringkasan:
--   * Nama zona disamakan dengan deck (Tenda Dealer Mobil Baru, Area Pameran
--     Mobil Bekas, Area Pameran Motor Baru/Bekas, Tenda UMKM, Tenda Otomotif &
--     Leasing). svg_group_id TIDAK berubah agar kode & denah tetap cocok.
--   * Zona baru 'zone-motor-baru' (Area C): 3 slot Rp500.000/hari.
--     Jumlah mengikuti TEKS deck (3 baru + 14 bekas = 17); gambar layout hanya
--     ilustrasi (4 + 8).
--   * Fasilitas baru dari Layout v2 (tidak bisa dibooking): VIP Lounge, LED,
--     Tenda VIP, Area Wahana, Toilet.
--   * Jadwal Musim 1 sesuai deck: pembukaan Sabtu-Minggu 12-13 Sep 2026, lalu
--     setiap hari Minggu s.d. 1 Nov 2026 (8 pekan, 9 tanggal). Tanggal lain
--     dihapus bila belum pernah disewa, selain itu dinonaktifkan.
--   * Harga Area D tetap mengikuti deck: 20 slot UMKM @Rp250.000 (kolom 1-10 &
--     21-30) + 10 slot Otomotif & Leasing @Rp500.000 (kolom 11-20).
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Nama & deskripsi zona (Deck v4 slide 7)
-- -----------------------------------------------------------------------------
update public.zones
   set name = 'Tenda Dealer Mobil Baru',
       description = 'Area A — tenda dealer resmi mobil baru, 10 slot.'
 where svg_group_id = 'zone-mobil-baru';

update public.zones
   set name = 'Area Pameran Mobil Bekas',
       description = 'Area B — area pameran mobil bekas untuk individu maupun dealer, 30 slot.'
 where svg_group_id = 'zone-mobil-bekas';

update public.zones
   set name = 'Area Pameran Motor Bekas',
       description = 'Area C — area pameran motor bekas, 14 slot.'
 where svg_group_id = 'zone-mobil-motor';

update public.zones
   set name = 'Tenda UMKM',
       description = 'Area D — tenda UMKM: kolom 1-10 untuk UMKM umum dan kolom 21-30 untuk UMKM & otomotif, 20 slot.'
 where svg_group_id = 'zone-umkm';

update public.zones
   set name = 'Tenda Otomotif & Leasing',
       description = 'Area D kolom 11-20 — tenda premium 2 sisi: 5 booth bank/leasing dan 5 booth brand otomotif, 10 slot.'
 where svg_group_id = 'zone-booth-khusus';

-- -----------------------------------------------------------------------------
-- 2. Zona Motor Baru (Area C) — 3 slot, Rp500.000/hari; tampil tepat sebelum
--    zona motor bekas.
-- -----------------------------------------------------------------------------
do $do$
declare
  ev uuid;
  urutan_motor_bekas int;
  zid uuid;
begin
  select event_id, display_order
    into ev, urutan_motor_bekas
    from public.zones
   where svg_group_id = 'zone-mobil-motor'
   limit 1;
  if ev is null then
    raise exception 'Zona zone-mobil-motor tidak ditemukan';
  end if;

  if not exists (select 1 from public.zones where svg_group_id = 'zone-motor-baru') then
    update public.zones
       set display_order = display_order + 1
     where display_order >= urutan_motor_bekas;

    insert into public.zones (event_id, name, zone_type, svg_group_id, admin_fee, description, display_order)
    values (
      ev,
      'Area Pameran Motor Baru',
      'motor_baru',
      'zone-motor-baru',
      500000,
      'Area C — tenda dealer motor baru, 3 slot.',
      urutan_motor_bekas
    );
  end if;

  select id into zid from public.zones where svg_group_id = 'zone-motor-baru';

  insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
  select zid, i, null, 'slot-motor-baru-' || lpad(i::text, 2, '0')
    from generate_series(1, 3) as i
  on conflict (svg_element_id) do nothing;
end $do$;

-- -----------------------------------------------------------------------------
-- 3. Fasilitas baru dari Layout v2 — hanya gambar di denah, tidak bisa dibooking
-- -----------------------------------------------------------------------------
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, null::int, v.slot_label, v.svg_element_id
  from public.zones z
 cross join (values
   ('VIP Lounge'::text,  'slot-fasilitas-vip-lounge'::text),
   ('LED',               'slot-fasilitas-led'),
   ('Tenda VIP',         'slot-fasilitas-tenda-vip'),
   ('Area Wahana',       'slot-fasilitas-area-wahana'),
   ('Toilet',            'slot-fasilitas-toilet')
 ) as v(slot_label, svg_element_id)
 where z.svg_group_id = 'zone-fasilitas'
on conflict (svg_element_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Jadwal Musim 1 (Deck v4 / Draf Isi): pembukaan 2 hari, lalu hari Minggu
-- -----------------------------------------------------------------------------
create temporary table if not exists jadwal_musim_1 (d date primary key) on commit drop;
insert into jadwal_musim_1 (d) values
  ('2026-09-12'), ('2026-09-13'),
  ('2026-09-20'), ('2026-09-27'),
  ('2026-10-04'), ('2026-10-11'), ('2026-10-18'), ('2026-10-25'),
  ('2026-11-01')
on conflict do nothing;

insert into public.event_dates (event_id, event_date, is_active)
select e.id, j.d, true
  from public.events e
 cross join jadwal_musim_1 j
 where e.id = '11111111-1111-4111-8111-111111111111'
on conflict (event_date) do update set is_active = true;

-- Tanggal di luar jadwal: hapus kalau belum pernah disewa siapa pun ...
delete from public.event_dates ed
 where ed.event_date not in (select d from jadwal_musim_1)
   and not exists (
     select 1 from public.booking_dates bd where bd.event_date = ed.event_date
   );

-- ... selain itu cukup dinonaktifkan (booking lama tetap utuh).
update public.event_dates
   set is_active = false
 where event_date not in (select d from jadwal_musim_1)
   and is_active;
