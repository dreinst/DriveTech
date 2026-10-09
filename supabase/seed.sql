-- =============================================================================
-- Drive Tech — Data Awal (seed)
-- =============================================================================
-- Sumber kebenaran inventaris: gambar denah "layout-venue.jpeg" di root
-- proyek. Di mana pun gambar berbeda dari "Sistem Pameran Arsitektur.md",
-- GAMBAR YANG MENANG. Perbedaan yang diketahui:
--   * Warung  : 12 unit di gambar (dokumen menulis "~9")
--   * Fasilitas: 8 unit di gambar (dokumen menyebut 6)
--
-- Total baris slots = 10 (mobil baru) + 30 (mobil bekas) + 14 (mobil & motor)
--                   + 30 (UMKM) + 12 (warung) + 8 (fasilitas) = 104 baris.
-- Yang bisa dibooking = 96 (semua kecuali 8 fasilitas).
--
-- Seluruh insert memakai "on conflict do nothing" / "where not exists"
-- sehingga aman dijalankan berulang kali (mis. setelah `supabase db reset`).
-- =============================================================================

set search_path = public, extensions;

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
-- 2. Zona (8 zona) — nama sesuai Deck v4 slide 7, admin_fee flat per zona (rupiah)
-- -----------------------------------------------------------------------------
insert into public.zones (event_id, name, zone_type, svg_group_id, admin_fee, description, display_order)
values
  ('11111111-1111-4111-8111-111111111111', 'Area Mobil Baru',
   'mobil_baru',        'zone-mobil-baru',  1000000,
   'Area A, tenda pameran mobil baru di dekat gerbang masuk, 10 lapak.',                                    1),
  ('11111111-1111-4111-8111-111111111111', 'Area Mobil Bekas',
   'mobil_bekas',       'zone-mobil-bekas',   50000,
   'Area B, C, dan D, terbuka untuk perorangan dan dealer, 60 lapak.',            2),
  ('11111111-1111-4111-8111-111111111111', 'Area Motor Baru',
   'motor_baru',        'zone-motor-baru',   500000,
   'Area E, tenda pameran motor baru, 5 lapak.',                                           3),
  ('11111111-1111-4111-8111-111111111111', 'Area Motor Bekas',
   'mobil_motor_bekas', 'zone-mobil-motor',   25000,
   'Area E, pameran motor bekas, 20 lapak.',                                         4),
  ('11111111-1111-4111-8111-111111111111', 'Area UMKM',
   'umkm',              'zone-umkm',         250000,
   'Area F, G, dan H, tenant UMKM, 43 lapak.', 5),
  ('11111111-1111-4111-8111-111111111111', 'Area Otomotif',
   'booth_khusus',      'zone-booth-khusus', 500000,
   'Area D, di tengah pameran mobil bekas, 15 lapak.', 6),
  ('11111111-1111-4111-8111-111111111111', 'Warung',
   'warung',            'zone-warung',       500000,
   'Unit warung/kuliner, 12 unit termasuk unit bernama.',                                 7),
  ('11111111-1111-4111-8111-111111111111', 'Fasilitas Umum',
   'facility',          'zone-fasilitas',          0,
   'Fasilitas non-sewa: tampil di denah tetapi tidak bisa dibooking.',                    8)
on conflict (svg_group_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Slot zona bernomor (generate_series) — 10 + 60 + 5 + 20 + 43 + 15 = 153 baris
--    svg_element_id = 'slot-<zoneSlug>-<NN>' dengan NN dua digit mulai 01.
-- -----------------------------------------------------------------------------

-- 3a. zone-mobil-baru : slot 1..10  -> slot-mobil-baru-01 .. slot-mobil-baru-10
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-baru-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 10) as i
where z.svg_group_id = 'zone-mobil-baru'
on conflict (svg_element_id) do nothing;

-- 3b. zone-mobil-bekas : slot 1..60 -> slot-mobil-bekas-01 .. slot-mobil-bekas-60
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-bekas-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 60) as i
where z.svg_group_id = 'zone-mobil-bekas'
on conflict (svg_element_id) do nothing;

-- 3c0. zone-motor-baru : slot 1..5 -> slot-motor-baru-01 .. slot-motor-baru-05
--      (4 + 8 mengikuti gambar Layout v2, keputusan pemilik 2026-09-03)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-motor-baru-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 5) as i
where z.svg_group_id = 'zone-motor-baru'
on conflict (svg_element_id) do nothing;

-- 3c. zone-mobil-motor : slot 1..20 -> slot-mobil-motor-01 .. slot-mobil-motor-20
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-mobil-motor-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 20) as i
where z.svg_group_id = 'zone-mobil-motor'
on conflict (svg_element_id) do nothing;

-- 3d. zone-umkm : slot 1..43 -> slot-umkm-01 .. slot-umkm-43 (Area F, G, H)
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-umkm-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 43) as i
where z.svg_group_id = 'zone-umkm'
on conflict (svg_element_id) do nothing;

-- 3e. zone-booth-khusus (Area Otomotif) : slot 1..15 -> slot-otomotif-01 .. slot-otomotif-15
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-otomotif-' || lpad(i::text, 2, '0')
from public.zones z
cross join generate_series(1, 15) as i
where z.svg_group_id = 'zone-booth-khusus'
on conflict (svg_element_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Warung — 12 unit, ditulis eksplisit sesuai urutan pada denah.
--    KEPUTUSAN: di gambar hanya dua unit yang bernama (Warmindo dan
--    "Warung Sate & Gule"); sepuluh kotak "WARUNG" polos lainnya KITA beri
--    nomor 1..10 supaya bisa dibooking lewat sistem.
-- -----------------------------------------------------------------------------
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, v.slot_number, v.slot_label, v.svg_element_id
from public.zones z
cross join (values
  (null::int, 'Warmindo'::text,            'slot-warung-warmindo'::text),
  (1,          'Warung 1',                 'slot-warung-01'),
  (2,          'Warung 2',                 'slot-warung-02'),
  (3,          'Warung 3',                 'slot-warung-03'),
  (4,          'Warung 4',                 'slot-warung-04'),
  (5,          'Warung 5',                 'slot-warung-05'),
  (6,          'Warung 6',                 'slot-warung-06'),
  (7,          'Warung 7',                 'slot-warung-07'),
  (8,          'Warung 8',                 'slot-warung-08'),
  (9,          'Warung 9',                 'slot-warung-09'),
  (10,         'Warung 10',                'slot-warung-10'),
  (null,      'Warung Sate & Gule',        'slot-warung-sate-gule')
) as v(slot_number, slot_label, svg_element_id)
where z.svg_group_id = 'zone-warung'
on conflict (svg_element_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Fasilitas umum — 13 unit, slot_number NULL, TIDAK BISA DIBOOKING.
--    Ditulis eksplisit sesuai urutan pada denah.
-- -----------------------------------------------------------------------------
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, null::int, v.slot_label, v.svg_element_id
from public.zones z
cross join (values
  ('Sekretariat'::text, 'slot-fasilitas-kantor-sekretariat'::text),
  ('Panggung',                                  'slot-fasilitas-stage-utama'),
  ('Cuci Mobil & Motor',                    'slot-fasilitas-tempat-cuci'),
  ('Area Zumba',                                   'slot-fasilitas-area-zumba'),
  ('Mushola',                                     'slot-fasilitas-musholah'),
  ('Lapangan Tembak',                              'slot-fasilitas-lapangan-tembak'),
  ('Kolam Renang',                    'slot-fasilitas-kolam-renang'),
  ('Kolam Pemancingan',                            'slot-fasilitas-kolam-pemancingan'),
  -- Layout v2 (2026-09-02): hanya gambar di denah, tidak bisa dibooking
  ('Tempat Gym',                                   'slot-fasilitas-tempat-gym'),
  ('Layar LED',                                          'slot-fasilitas-led'),
  ('Tenda VIP',                                    'slot-fasilitas-tenda-vip'),
  ('Playground',                                  'slot-fasilitas-area-wahana'),
  ('Toilet',                                       'slot-fasilitas-toilet')
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
--     zone-fasilitas    8
--     zone-mobil-baru  10
--     zone-mobil-bekas 30
--     zone-mobil-motor 14
--     zone-umkm        30
--     zone-warung      12
--   Total 104 baris; 96 di antaranya bisa dibooking (semua kecuali fasilitas).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- CATATAN: MENDAFTARKAN ADMIN PERTAMA  (komentar saja, BUKAN SQL aktif)
-- =============================================================================
-- Baris admin TIDAK di-seed otomatis karena admin_users.id harus mengacu ke
-- auth.users(id) yang baru ada setelah user dibuat di Supabase Auth.
--
-- Langkah:
--   1) Buat user di Supabase Studio: Authentication > Users > "Add user"
--      (email + password, centang "Auto Confirm User").
--      Atau via CLI/API admin dengan service role key.
--   2) Salin UUID user tersebut, lalu jalankan di SQL Editor:
--
--        insert into public.admin_users (id, email, full_name, role)
--        values (
--          '00000000-0000-0000-0000-000000000000',  -- ganti dengan UUID user
--          'admin@example.com',                     -- ganti dengan email user
--          'Nama Admin',
--          'admin'                                  -- 'admin' atau 'verifikator'
--        );
--
--   3) Cara lain tanpa menyalin UUID manual (email harus sudah terdaftar
--      di Supabase Auth):
--
--        insert into public.admin_users (id, email, full_name, role)
--        select u.id, u.email, 'Nama Admin', 'admin'
--        from auth.users u
--        where u.email = 'admin@example.com'
--        on conflict (id) do nothing;
--
-- Role 'admin' bisa semua hal; 'verifikator' ditujukan untuk verifikasi
-- pembayaran admin fee saja.
-- =============================================================================
