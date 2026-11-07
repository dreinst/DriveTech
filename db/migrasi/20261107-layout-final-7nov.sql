-- =============================================================================
-- Layout final 7 November (Draf v3 Andrew).
-- 1. Mobil baru: MB4 BYD (tenda panitia) dan MB6-MB10 dealer bawa tenda sendiri ditahan panitia.
-- 2. Mobil bekas: Vinfast (Rizki, BK-8F5395A45F) pindah dari nomor 4 ke nomor 2, sesuai label MK2 di draf.
--    Unit panitia Ford Everest (BK-1EDB7E98FF) dilepas dari nomor 1 ke nomor 7 (tidak digambar). Booking
--    dan listing katalognya tetap utuh. Nomor 1, 3, 4 ditahan panitia untuk Suzuki CF, Innova, Terrano.
--    Booking nomor 5 (Jo Haan) dan 6 (Gulit Efendi) TIDAK disentuh.
-- 3. Otomotif: tidak ada perubahan data (nomor 1, 3, 4 tetap, cukup posisi gambar di layout.ts).
-- Pemindahan booking meniru adminMoveBookingSlot: bookings, booking_dates aktif, dan vehicle_listings.
-- Jalankan: docker exec -i <container> psql -U drivetech_app -d drivetech -v ON_ERROR_STOP=1 < berkas.sql
-- =============================================================================
begin;

-- 1. Mobil baru
update public.slots s
   set status = 'pending', peruntukan = v.isi
  from (values ('slot-mobil-baru-04', 'BYD (Haka Auto Malang), tenda panitia'),
               ('slot-mobil-baru-06', 'Wuling, tenda sendiri dealer'),
               ('slot-mobil-baru-07', 'Aion unit 1 dari 2, tenda sendiri dealer'),
               ('slot-mobil-baru-08', 'Aion unit 2 dari 2, tenda sendiri dealer'),
               ('slot-mobil-baru-09', 'Changan, tenda sendiri dealer'),
               ('slot-mobil-baru-10', 'MG, tenda sendiri dealer')) as v(svg, isi)
 where s.svg_element_id = v.svg;

-- 2. Pindah booking mobil bekas
create temp table pindah (booking_code text, tujuan text) on commit drop;
insert into pindah values ('BK-8F5395A45F', 'slot-mobil-bekas-02'),
                          ('BK-1EDB7E98FF', 'slot-mobil-bekas-07');

do $$
declare
  r record;
  v_booking uuid;
  v_tujuan uuid;
begin
  for r in select * from pindah loop
    select id into strict v_booking from public.bookings where booking_code = r.booking_code and status <> 'cancelled';
    select id into strict v_tujuan from public.slots where svg_element_id = r.tujuan;
    if exists (select 1 from public.booking_dates where slot_id = v_tujuan and is_active) then
      raise exception 'Slot % sudah terisi', r.tujuan;
    end if;
    update public.bookings set slot_id = v_tujuan, updated_at = now() where id = v_booking;
    update public.booking_dates set slot_id = v_tujuan where booking_id = v_booking and is_active;
    update public.vehicle_listings set slot_id = v_tujuan where booking_id = v_booking;
  end loop;
end $$;

update public.slots s
   set status = 'pending', peruntukan = v.isi
  from (values ('slot-mobil-bekas-01', 'Ditahan panitia: Suzuki CF'),
               ('slot-mobil-bekas-03', 'Ditahan panitia: Innova'),
               ('slot-mobil-bekas-04', 'Ditahan panitia: Terrano'),
               ('slot-mobil-bekas-07', 'Unit panitia Ford Everest (dilepas dari MK1, 7 Nov), tidak digambar')) as v(svg, isi)
 where s.svg_element_id = v.svg;

commit;
