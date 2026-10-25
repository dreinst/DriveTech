-- =============================================================================
-- UMKM hanya Area B 1-7 (Figma Layout Final). UMKM Area F, G, H tidak dijual.
-- Total lapak dijual 78. Booking yang sudah ada tidak disentuh.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261025-umkm-area-b-saja.sql
-- =============================================================================
begin;

create temp table slot_dibuang on commit drop as
select s.id from public.slots s join public.zones z on z.id = s.zone_id
where z.svg_group_id = 'zone-umkm' and s.slot_number > 7;

do $$
declare n int;
begin
  select count(*) into n from (
    select slot_id from public.bookings where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.booking_dates where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.vehicle_listings where slot_id in (select id from slot_dibuang)
    union all select slot_id from public.purchase_transactions where slot_id in (select id from slot_dibuang)
  ) x;
  if n > 0 then raise exception 'Ada % data yang masih memakai UMKM 8-37, migrasi dibatalkan', n; end if;
end $$;

delete from public.slots where id in (select id from slot_dibuang);
update public.zones set description = 'Area B, tenant UMKM 3 x 3 m, 7 lapak.' where svg_group_id = 'zone-umkm';

do $$
declare n int;
begin
  select count(*) into n from public.slots s join public.zones z on z.id = s.zone_id where z.zone_type <> 'facility';
  if n <> 78 then raise exception 'Jumlah lapak bisa dipesan % (seharusnya 78)', n; end if;
end $$;

commit;
