-- Jadwal Musim 1 mundur 8 pekan (keputusan pemilik 2026-09-17): pembukaan
-- Sabtu-Minggu 7-8 November 2026, lalu setiap hari Minggu sampai 27 Desember
-- 2026 (8 pekan, 9 tanggal). Pola sama dengan 20260902101000_layout_v2.sql:
-- tanggal baru diaktifkan, tanggal lama dihapus bila belum pernah disewa,
-- selain itu hanya dinonaktifkan supaya booking lama tetap utuh.
-- Dibungkus transaksi karena tabel sementara bersifat on commit drop.
begin;
create temporary table if not exists jadwal_musim_1 (d date primary key) on commit drop;
insert into jadwal_musim_1 (d) values
  ('2026-11-07'), ('2026-11-08'),
  ('2026-11-15'), ('2026-11-22'), ('2026-11-29'),
  ('2026-12-06'), ('2026-12-13'), ('2026-12-20'),
  ('2026-12-27')
on conflict do nothing;

insert into public.event_dates (event_id, event_date, is_active)
select e.id, j.d, true
  from public.events e
 cross join jadwal_musim_1 j
 where e.id = '11111111-1111-4111-8111-111111111111'
on conflict (event_date) do update set is_active = true;

delete from public.event_dates ed
 where ed.event_date not in (select d from jadwal_musim_1)
   and not exists (
     select 1 from public.booking_dates bd where bd.event_date = ed.event_date
   );

update public.event_dates
   set is_active = false
 where event_date not in (select d from jadwal_musim_1)
   and is_active;
commit;
