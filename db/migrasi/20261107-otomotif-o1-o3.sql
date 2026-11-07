-- =============================================================================
-- Otomotif mengikuti nomor di Draf v3 (keputusan Andrew 7 Nov): O1 Hotel Alana, O2 Bejo Ban, O3 Halim Accu.
-- Booking tetap milik tenant yang sama, hanya pindah slot (meniru adminMoveBookingSlot):
--   Bejo Ban   BK-DA06B82C52  nomor 3 ke 2 (nomor 2 sebelumnya ditutup panitia, kosong)
--   Halim Accu BK-39B8AE5E21  nomor 4 ke 3
-- Nomor 4 tidak digambar lagi dan diblokir.
-- Jalankan: docker exec -i <container> psql -U drivetech_app -d drivetech -v ON_ERROR_STOP=1 < berkas.sql
-- =============================================================================
begin;

create temp table pindah (urut int, booking_code text, tujuan text) on commit drop;
insert into pindah values (1, 'BK-DA06B82C52', 'slot-otomotif-02'),
                          (2, 'BK-39B8AE5E21', 'slot-otomotif-03');

do $$
declare
  r record;
  v_booking uuid;
  v_tujuan uuid;
begin
  for r in select * from pindah order by urut loop
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
   set status = v.status::slot_status, peruntukan = v.isi
  from (values ('slot-otomotif-02', 'available', 'Bejo Ban'),
               ('slot-otomotif-03', 'available', 'Halim Accu'),
               ('slot-otomotif-04', 'pending', 'Dihapus dari layout 7 Nov (Halim Accu pindah ke nomor 3)')) as v(svg, status, isi)
 where s.svg_element_id = v.svg;

commit;
