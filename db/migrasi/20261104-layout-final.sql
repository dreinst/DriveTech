-- =============================================================================
-- Layout final 4 November 2026 (revisi Andrew): lapak dipadatkan ke Area A dan B dekat stage.
--
-- Geometri baru ada di src/lib/domain/layout.ts. Migrasi ini menyesuaikan tabel slots:
-- 1. Nomor lapak yang tidak digambar lagi DIBLOKIR (status 'pending' = diblokir panitia), tidak dihapus,
--    supaya booking lama (termasuk yang sudah lunas) tetap utuh sampai penyewanya memilih slot baru.
-- 2. Motor baru 3 dipakai untuk opsi tenda Yamaha 3 x 3 m (berjarak dari tenda Honda NSS D1-D2).
-- 3. Fasilitas baru: area komunitas (2 kotak), FOH, dan 2 truk pameran. Ganti oli gratis menjadi cek motor gratis.
-- Booking TIDAK dipindah di sini.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261104-layout-final.sql
-- =============================================================================
begin;

update public.slots s
   set status = 'pending'
  from public.zones z
 where s.zone_id = z.id
   and (   (z.svg_group_id = 'zone-mobil-baru'   and s.slot_number in (4, 5, 9, 10, 11, 12, 13))
        or (z.svg_group_id = 'zone-mobil-bekas'  and s.slot_number between 7 and 20)
        or (z.svg_group_id = 'zone-motor-baru'   and s.slot_number between 4 and 8)
        or (z.svg_group_id = 'zone-mobil-motor'  and s.slot_number between 9 and 14)
        or (z.svg_group_id = 'zone-booth-khusus' and s.slot_number between 5 and 16));

update public.slots
   set peruntukan = 'Opsi tenda dealer Yamaha'
 where svg_element_id = 'slot-motor-baru-03';

update public.slots
   set slot_label = 'Cek Motor Gratis'
 where svg_element_id = 'slot-fasilitas-ganti-oli';

insert into public.slots (zone_id, slot_number, slot_label, status, svg_element_id)
select z.id, null, v.label, 'available', v.svg
  from public.zones z
 cross join (values
   ('Area Komunitas', 'slot-fasilitas-komunitas-kanan'),
   ('Area Komunitas', 'slot-fasilitas-komunitas-kiri'),
   ('FOH',            'slot-fasilitas-foh'),
   ('Truk Pameran',   'slot-fasilitas-truk-1'),
   ('Truk Pameran',   'slot-fasilitas-truk-2')
 ) as v(label, svg)
 where z.svg_group_id = 'zone-fasilitas'
on conflict (svg_element_id) do nothing;

commit;
