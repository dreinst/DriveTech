-- =============================================================================
-- Migrasi denah ke Layout Final 23 Oktober 2026 (Figma "Layout Konstrad").
-- Dari 153 lapak (Area A sampai H versi 9 Oktober) menjadi 108 lapak:
--   mobil baru 10 -> 13, mobil bekas 60 -> 20, motor baru 5 -> 8,
--   motor bekas 20 -> 14 (hanya Area C; deret Area E di Figma tidak dijual),
--   UMKM 43 -> 37, otomotif 15 -> 16.
-- Warung dihapus (tidak ada di Layout Final). Fasilitas diganti daftar baru.
--
-- Booking yang ada (mobil bekas 01-03, motor bekas 01-04) tetap di slotnya,
-- karena svg_element_id dan nomor slot itu tidak berubah.
-- Slot mobil bekas 25 hanya dipakai booking UJI REKAMAN REELS 22 Okt
-- (BK-3D3BD971AC, sudah dibatalkan); booking uji itu dihapus supaya slotnya
-- bisa dibuang. Migrasi berhenti kalau ada booking lain di slot yang dibuang.
--
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261023-layout-final.sql
-- =============================================================================
begin;

-- 1. Booking uji di slot yang akan dibuang (tenant contoh ikut dihapus bila tidak dipakai lagi)
delete from public.bookings
where booking_code = 'BK-3D3BD971AC' and status = 'cancelled';
delete from public.vehicle_listings v
using public.slots s
where v.slot_id = s.id and s.svg_element_id = 'slot-mobil-bekas-25' and v.booking_id is null;
delete from public.tenants t
where t.email = 'contohpenyewa-dt@mailinator.com'
  and not exists (select 1 from public.bookings b where b.tenant_id = t.id);

-- 2. Slot yang tidak ada di Layout Final
create temp table slot_dibuang on commit drop as
select s.id, s.svg_element_id
from public.slots s
join public.zones z on z.id = s.zone_id
where (z.svg_group_id = 'zone-mobil-bekas' and s.slot_number > 20)
   or (z.svg_group_id = 'zone-umkm' and s.slot_number > 37)
   or (z.svg_group_id = 'zone-mobil-motor' and s.slot_number > 14)
   or z.svg_group_id in ('zone-warung', 'zone-fasilitas');

do $$
declare n int;
begin
  select count(*) into n from (
    select slot_id from public.bookings where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.booking_dates where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.vehicle_listings where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.purchase_transactions where slot_id in (select id from slot_dibuang)
  ) x;
  if n > 0 then
    raise exception 'Ada % data yang masih memakai slot yang akan dibuang, migrasi dibatalkan', n;
  end if;
end $$;

delete from public.slots where id in (select id from slot_dibuang);
delete from public.zones where svg_group_id = 'zone-warung';

-- 3. Slot baru
insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, v.slug || lpad(i::text, 2, '0')
from (values
  ('zone-mobil-baru', 'slot-mobil-baru-', 13),
  ('zone-motor-baru', 'slot-motor-baru-', 8),
  ('zone-booth-khusus', 'slot-otomotif-', 16)
) as v(grup, slug, jumlah)
join public.zones z on z.svg_group_id = v.grup
cross join lateral generate_series(1, v.jumlah) as i
on conflict (svg_element_id) do nothing;

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

-- 4. Keterangan zona dan urutan
update public.zones z set description = v.d, display_order = v.o
from (values
  ('zone-mobil-baru',   'Area A dan Area C, tenda pameran mobil baru 5 x 5 m, 13 lapak.', 1),
  ('zone-mobil-bekas',  'Area C, slot 4,5 x 2,5 m untuk perorangan dan dealer, 20 lapak.', 2),
  ('zone-motor-baru',   'Area C, tenda dealer motor baru 3 x 3 m, 8 lapak.', 3),
  ('zone-mobil-motor',  'Area C, pameran motor bekas, 14 lapak.', 4),
  ('zone-umkm',         'Area B, F, G, dan H, tenant UMKM 3 x 3 m, 37 lapak.', 5),
  ('zone-booth-khusus', 'Area B, tenant otomotif 3 x 3 m, 16 lapak.', 6),
  ('zone-fasilitas',    'Fasilitas non-sewa: tampil di denah tetapi tidak bisa dibooking.', 7)
) as v(g, d, o)
where z.svg_group_id = v.g;

-- 5. Periksa hasil
do $$
declare n int;
begin
  select count(*) into n from public.slots s join public.zones z on z.id = s.zone_id where z.zone_type <> 'facility';
  if n <> 108 then raise exception 'Jumlah lapak bisa dipesan % (seharusnya 108)', n; end if;
  select count(*) into n from public.slots s join public.zones z on z.id = s.zone_id where z.zone_type = 'facility';
  if n <> 13 then raise exception 'Jumlah fasilitas % (seharusnya 13)', n; end if;
end $$;

commit;
