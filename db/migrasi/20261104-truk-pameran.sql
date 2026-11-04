-- =============================================================================
-- Truk Pameran 1 dan 2 dipakai unit panitia (Mitsubishi Ragasa dan Hino Dutro, dibooking 4 November), jadi
-- dipindah dari zona fasilitas ke zona Mobil Bekas sebagai nomor 21 dan 22 supaya tampil terisi di denah.
-- UUID slot tetap, jadi booking dan katalog yang menempel tidak berubah.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261104-truk-pameran.sql
-- =============================================================================
begin;

update public.slots s
   set zone_id = z.id,
       slot_number = v.nomor,
       slot_label = v.label,
       svg_element_id = v.svg_baru
  from public.zones z,
       (values ('slot-fasilitas-truk-1', 21, 'Truk 1', 'slot-mobil-bekas-truk-1'),
               ('slot-fasilitas-truk-2', 22, 'Truk 2', 'slot-mobil-bekas-truk-2')) as v(svg_lama, nomor, label, svg_baru)
 where z.svg_group_id = 'zone-mobil-bekas'
   and s.svg_element_id = v.svg_lama;

commit;
