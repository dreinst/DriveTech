-- =============================================================================
-- Drive Tech: denah baru Area A sampai H (gambar pemilik, 9 Oktober 2026)
-- =============================================================================
-- Jumlah lapak yang bisa dipesan naik dari 82 ke 153:
--   zone-mobil-baru   : 10 (tetap)          Area A
--   zone-mobil-bekas  : 30 -> 60            Area B, C, D
--   zone-booth-khusus : 10 -> 15, jadi "Area Otomotif" (id slot-otomotif-NN)  Area D
--   zone-motor-baru   : 4 -> 5              Area E
--   zone-mobil-motor  : 8 -> 20             Area E
--   zone-umkm         : 20 -> 43 (nomor 1..43 berurutan)  Area F, G, H
-- Tarif per zona tidak berubah.
-- Penghapusan hanya menyentuh lapak yang belum pernah dipakai booking.
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

begin;

update public.zones set name = 'Area Mobil Baru',  description = 'Area A, tenda pameran mobil baru di dekat gerbang masuk, 10 lapak.' where svg_group_id = 'zone-mobil-baru';
update public.zones set name = 'Area Mobil Bekas', description = 'Area B, C, dan D, terbuka untuk perorangan dan dealer, 60 lapak.'      where svg_group_id = 'zone-mobil-bekas';
update public.zones set name = 'Area Motor Baru',  description = 'Area E, tenda pameran motor baru, 5 lapak.'                           where svg_group_id = 'zone-motor-baru';
update public.zones set name = 'Area Motor Bekas', description = 'Area E, pameran motor bekas, 20 lapak.'                               where svg_group_id = 'zone-mobil-motor';
update public.zones set name = 'Area UMKM',        description = 'Area F, G, dan H, tenant UMKM, 43 lapak.'                             where svg_group_id = 'zone-umkm';
update public.zones set name = 'Area Otomotif',    description = 'Area D, di tengah pameran mobil bekas, 15 lapak.'                     where svg_group_id = 'zone-booth-khusus';

-- Lapak lama zona booth memakai id slot-umkm-11..20. Dihapus dulu supaya id itu
-- bisa dipakai zona UMKM yang sekarang bernomor 1..43.
delete from public.slots s
 using public.zones z
 where z.id = s.zone_id
   and z.svg_group_id = 'zone-booth-khusus'
   and s.svg_element_id like 'slot-umkm-%'
   and not exists (select 1 from public.bookings b where b.slot_id = s.id)
   and not exists (select 1 from public.booking_dates bd where bd.slot_id = s.id)
   and not exists (select 1 from public.vehicle_listings v where v.slot_id = s.id);

insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, i, null, 'slot-' || v.slug || '-' || lpad(i::text, 2, '0')
  from (values
         ('zone-mobil-bekas',  'mobil-bekas', 60),
         ('zone-booth-khusus', 'otomotif',    15),
         ('zone-motor-baru',   'motor-baru',   5),
         ('zone-mobil-motor',  'mobil-motor', 20),
         ('zone-umkm',         'umkm',        43)
       ) as v(grup, slug, jumlah)
  join public.zones z on z.svg_group_id = v.grup
 cross join lateral generate_series(1, v.jumlah) as i
on conflict (svg_element_id) do nothing;

-- Fasilitas: dua unit hilang dari denah, dua unit baru, beberapa nama berubah.
delete from public.slots
 where svg_element_id in ('slot-fasilitas-vip-lounge', 'slot-fasilitas-parkiran');

insert into public.slots (zone_id, slot_number, slot_label, svg_element_id)
select z.id, null, v.label, v.id
  from public.zones z
 cross join (values
         ('Kolam Renang', 'slot-fasilitas-kolam-renang'),
         ('Tempat Gym',   'slot-fasilitas-tempat-gym')
       ) as v(label, id)
 where z.svg_group_id = 'zone-fasilitas'
on conflict (svg_element_id) do nothing;

update public.slots set slot_label = v.label
  from (values
         ('slot-fasilitas-area-wahana',        'Playground'),
         ('slot-fasilitas-stage-utama',        'Panggung'),
         ('slot-fasilitas-led',                'Layar LED'),
         ('slot-fasilitas-musholah',           'Mushola'),
         ('slot-fasilitas-tempat-cuci',        'Cuci Mobil & Motor'),
         ('slot-fasilitas-kantor-sekretariat', 'Sekretariat')
       ) as v(id, label)
 where svg_element_id = v.id;

commit;
