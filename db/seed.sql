-- =============================================================================
-- Drive Tech — Data Awal (seed)
-- =============================================================================
-- Sumber kebenaran inventaris: Figma "Layout Konstrad" frame "Layout Final"
-- (23 Oktober 2026), sama dengan src/lib/domain/layout.ts.
--
-- Total baris slots = 13 (mobil baru) + 20 (mobil bekas) + 8 (motor baru)
--                   + 14 (motor bekas) + 7 (UMKM) + 16 (otomotif)
--                   + 13 (fasilitas) = 91 baris.
-- Yang bisa dibooking = 78 (semua kecuali 13 fasilitas).
--
-- Seluruh insert memakai "on conflict do nothing" / "where not exists"
-- sehingga aman dijalankan berulang kali.
-- =============================================================================

set search_path = public;

-- -----------------------------------------------------------------------------
-- 1. Event (satu event saja, id di-hardcode agar seed idempotent)
--    Model per tanggal: start_date/end_date tidak dipakai lagi (null); jadwal
--    sesungguhnya ada di tabel event_dates (pembukaan 7-8 November 2026, lalu setiap hari Minggu s.d. 27 Desember 2026).
-- -----------------------------------------------------------------------------
insert into public.events (id, name, location, start_date, end_date, is_active)
values (
  '11111111-1111-4111-8111-111111111111',
  'Drive Tech',
  'Kampung Tentara di Rest Area Singosari, Malang',
  null,
  null,
  true
)
on conflict (id) do update
  set name       = excluded.name,
      location   = excluded.location,
      start_date = excluded.start_date,
      end_date   = excluded.end_date,
      is_active  = excluded.is_active;

-- -----------------------------------------------------------------------------
-- 1b. Tanggal gelaran Musim 1 (keputusan pemilik 2026-09-17, mundur 8 pekan
--     dari Deck v4): pembukaan Sabtu-Minggu 7-8 November 2026, selanjutnya
--     setiap hari Minggu sampai 27 Desember 2026 (8 pekan, 9 tanggal).
-- -----------------------------------------------------------------------------
insert into public.event_dates (event_id, event_date, is_active)
select '11111111-1111-4111-8111-111111111111', v.d, true
from (values
  (date '2026-11-07'), (date '2026-11-08'),
  (date '2026-11-15'), (date '2026-11-22'), (date '2026-11-29'),
  (date '2026-12-06'), (date '2026-12-13'), (date '2026-12-20'),
  (date '2026-12-27')
) as v(d)
on conflict (event_date) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Zona (7 zona) — nama sesuai Deck v4 slide 7, admin_fee flat per zona (rupiah)
-- -----------------------------------------------------------------------------
insert into public.zones (event_id, name, zone_type, svg_group_id, admin_fee, description, display_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Area Mobil Baru',
   'mobil_baru',        'zone-mobil-baru',  1000000,
   'Area A dan Area C, tenda pameran mobil baru 5 x 5 m, 13 lapak.',                                    1),
  ('11111111-1111-4111-8111-111111111111', 'Area Mobil Bekas',
   'mobil_bekas',       'zone-mobil-bekas',   50000,
   'Area C, slot 4,5 x 2,5 m untuk perorangan dan dealer, 20 lapak.',            2),
  ('11111111-1111-4111-8111-111111111111', 'Area Motor Baru',
   'motor_baru',        'zone-motor-baru',   500000,
   'Area C, tenda dealer motor baru 3 x 3 m, 8 lapak.',                                           3),
  ('11111111-1111-4111-8111-111111111111', 'Area Motor Bekas',
   'mobil_motor_bekas', 'zone-mobil-motor',   25000,
   'Area C, pameran motor bekas, 14 lapak.',                                         4),
  ('11111111-1111-4111-8111-111111111111', 'Area UMKM',
   'umkm',              'zone-umkm',         250000,
   'Area B, tenant UMKM 3 x 3 m, 7 lapak.', 5),
  ('11111111-1111-4111-8111-111111111111', 'Area Otomotif',
   'booth_khusus',      'zone-booth-khusus', 500000,
   'Area B, tenant otomotif 3 x 3 m, 16 lapak.', 6),
  ('11111111-1111-4111-8111-111111111111', 'Fasilitas Umum',
   'facility',          'zone-fasilitas',          0,
   'Fasilitas non-sewa: tampil di denah tetapi tidak bisa dibooking.',                    7)
on conflict (svg_group_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Slot zona bernomor (generate_series) — 13 + 20 + 8 + 14 + 9 + 16 = 80 baris
--    (Layout Final 23 Oktober 2026, Figma "Layout Konstrad")
--    svg_element_id = 'slot-<zoneSlug>-<NN>' dengan NN dua digit mulai 01.
-- -----------------------------------------------------------------------------

-- 3a. zone-mobil-baru : slot 1..13  -> slot-mobil-baru-01 .. slot-mobil-baru-13 (Area A 1-10, Area C 11-13)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-baru-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 13) as i
where z.svg_group_id = 'zone-mobil-baru'
on conflict (svg_element_id) do nothing;

-- 3b. zone-mobil-bekas : slot 1..20 -> slot-mobil-bekas-01 .. slot-mobil-bekas-20 (Area C)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-bekas-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 20) as i
where z.svg_group_id = 'zone-mobil-bekas'
on conflict (svg_element_id) do nothing;

-- 3c0. zone-motor-baru : slot 1..8 -> slot-motor-baru-01 .. slot-motor-baru-08 (Area C, tenda dealer)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-motor-baru-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 8) as i
where z.svg_group_id = 'zone-motor-baru'
on conflict (svg_element_id) do nothing;

-- 3c. zone-mobil-motor : slot 1..14 -> slot-mobil-motor-01 .. slot-mobil-motor-14 (Area C)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-motor-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 14) as i
where z.svg_group_id = 'zone-mobil-motor'
on conflict (svg_element_id) do nothing;

-- 3d. zone-umkm : slot 1..7 -> slot-umkm-01 .. slot-umkm-07 (Area B)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-umkm-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 7) as i
where z.svg_group_id = 'zone-umkm'
on conflict (svg_element_id) do nothing;

-- 3e. zone-booth-khusus (Area Otomotif) : slot 1..16 -> slot-otomotif-01 .. slot-otomotif-16 (Area B)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-otomotif-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 16) as i
where z.svg_group_id = 'zone-booth-khusus'
on conflict (svg_element_id) do nothing;

-- 4. Warung: tidak ada di Layout Final 23 Oktober 2026, zona warung dihapus.

-- -----------------------------------------------------------------------------
-- 5. Fasilitas umum — 13 unit, slot_number NULL, TIDAK BISA DIBOOKING.
--    Ditulis eksplisit sesuai urutan pada denah.
-- -----------------------------------------------------------------------------
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, null::int, v.slot_label, v.svg_element_id
from public.zones z
cross join (values
  ('Playground'::text,       'slot-fasilitas-playground'::text),
  ('Parkir Mobil',            'slot-fasilitas-parkir-mobil'),
  ('Parkir Mobil Bekas',      'slot-fasilitas-parkir-mobil-bekas'),
  ('Parkir Motor Bekas',      'slot-fasilitas-parkir-motor-bekas'),
  ('Area Slalom',             'slot-fasilitas-area-slalom'),
  ('Mushola',                 'slot-fasilitas-mushola'),
  ('Stage LED',               'slot-fasilitas-stage'),
  ('Tenda VIP',               'slot-fasilitas-tenda-vip'),
  ('Wahana',                  'slot-fasilitas-wahana'),
  ('Photobooth',              'slot-fasilitas-photobooth'),
  ('Service Gratis',          'slot-fasilitas-service-gratis'),
  ('Ganti Oli Gratis',        'slot-fasilitas-ganti-oli'),
  ('Gerbang',                 'slot-fasilitas-gerbang')
) as v(slot_label, svg_element_id)
where z.svg_group_id = 'zone-fasilitas'
on conflict (svg_element_id) do nothing;

-- -----------------------------------------------------------------------------
-- 6. Leasing partner (3 mitra, semua aktif)
--    Tabel tidak punya unique pada name, jadi pakai "where not exists".
-- -----------------------------------------------------------------------------
-- Mitra leasing contoh di-seed NONAKTIF (keputusan pemilik 2026-09-04): nama
-- mitra sungguhan + kredensialnya dimasukkan panitia lewat /admin/leasing,
-- bukan data contoh. Baris nonaktif tidak tampil di beranda/form kredit.
insert into public.leasing_partners (name, contact, commission_rate, is_active)
select v.name, v.contact, v.commission_rate, false
from (values
  ('Adira Finance'::text,          '0800-1-500-989'::text, 2.5::numeric),
  ('BAF Finance',                  '0804-1-800-888',       2.0),
  ('Mandiri Tunas Finance',        '0804-1-505-000',       2.25)
) as v(name, contact, commission_rate)
where not exists (
  select 1 from public.leasing_partners p where p.name = v.name
);

-- -----------------------------------------------------------------------------
-- 7. Verifikasi cepat (opsional) — jalankan manual di SQL editor:
--
--   select z.svg_group_id, count(s.id)
--   from public.zones z left join public.slots s on s.zone_id = z.id
--   group by z.svg_group_id order by z.svg_group_id;
--
--   Hasil yang diharapkan:
--     zone-booth-khusus 16
--     zone-fasilitas    13
--     zone-mobil-baru   13
--     zone-mobil-bekas  20
--     zone-mobil-motor  14
--     zone-motor-baru    8
--     zone-umkm          7
--   Total 91 baris; 78 di antaranya bisa dibooking (semua kecuali fasilitas).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- CATATAN: MENDAFTARKAN ADMIN PERTAMA  (komentar saja, BUKAN SQL aktif)
-- =============================================================================
-- Baris admin TIDAK di-seed otomatis supaya tidak ada sandi bawaan di repo.
-- Jalankan sendiri lewat psql (ganti username, nama, dan sandinya):
--
--        insert into public.admin_users (email, username, full_name, role, password_hash)
--        values (
--          'superadmin@drivetech.local',         -- identitas internal, tidak dikirimi email
--          'superadmin',                            -- nama login, HURUF KECIL
--          'Nama Admin',
--          'superadmin',                            -- 'superadmin' atau 'admin'
--          crypt('sandi-yang-kuat', gen_salt('bf', 10))
--        );
--
-- Ganti sandi:
--        update public.admin_users
--           set password_hash = crypt('sandi-baru', gen_salt('bf', 10))
--         where username = 'superadmin';
--
-- Role 'superadmin' bisa semua hal; 'admin' ditujukan untuk verifikasi
-- pembayaran admin fee saja.
-- =============================================================================
