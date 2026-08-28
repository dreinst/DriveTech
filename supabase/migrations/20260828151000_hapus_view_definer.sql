-- =============================================================================
-- Drive Tech — slot_date_status tanpa SECURITY DEFINER (advisor Supabase)
-- =============================================================================
-- View lama memakai SECURITY DEFINER karena harus join ke `bookings` (kolom
-- status) padahal `bookings` tidak boleh terbaca publik: UUID + booking_code di
-- dalamnya adalah kapabilitas halaman status/pembatalan.
--
-- Solusi tanpa definer: status booking DIDENORMALISASI ke kolom baru
-- booking_dates.booking_status (dirawat trigger), sehingga view cukup membaca
-- booking_dates saja dan bisa berjalan sebagai SECURITY INVOKER dengan:
--   * policy select publik `using (is_active)` di booking_dates, dan
--   * GRANT per kolom — booking_id & id TIDAK diekspos ke anon.
-- Bonus: langganan realtime publik `booking_dates` (useRealtimeSlots) kini
-- benar-benar menerima event, karena realtime menghormati policy RLS dan
-- sebelumnya booking_dates tidak punya policy sama sekali.
--
-- Idempotent: aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Kolom status terdenormalisasi + backfill
-- -----------------------------------------------------------------------------
alter table public.booking_dates
  add column if not exists booking_status public.booking_status
    not null default 'pending_payment';

comment on column public.booking_dates.booking_status is
  'Salinan bookings.status (dirawat trigger) agar okupansi publik tidak perlu membaca tabel bookings.';

update public.booking_dates bd
   set booking_status = b.status
  from public.bookings b
 where b.id = bd.booking_id
   and bd.booking_status is distinct from b.status;

-- -----------------------------------------------------------------------------
-- 2. Trigger perawat kolom
-- -----------------------------------------------------------------------------
-- Saat baris tanggal dibuat, salin status booking induknya.
create or replace function public.booking_dates_copy_status()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  select status into new.booking_status
    from public.bookings
   where id = new.booking_id;
  if new.booking_status is null then
    new.booking_status := 'pending_payment';
  end if;
  new.is_active := new.booking_status in ('pending_payment', 'confirmed');
  return new;
end;
$fn$;

drop trigger if exists booking_dates_copy_status on public.booking_dates;
create trigger booking_dates_copy_status
  before insert on public.booking_dates
  for each row execute function public.booking_dates_copy_status();

-- Saat status booking berubah, baris tanggalnya ikut (menggantikan versi lama
-- yang hanya menyetel is_active; trigger bookings_sync_booking_dates_active
-- sudah terpasang ke fungsi ini oleh migrasi per_tanggal).
create or replace function public.sync_booking_dates_active()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  update public.booking_dates
     set is_active = (new.status in ('pending_payment', 'confirmed')),
         booking_status = new.status
   where booking_id = new.id;
  return new;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. View SECURITY INVOKER (bentuk kolom persis sama dengan view lama)
-- -----------------------------------------------------------------------------
drop view if exists public.slot_date_status;
create view public.slot_date_status
  with (security_invoker = true) as
select bd.slot_id, bd.event_date, bd.booking_status as status
from public.booking_dates bd
where bd.is_active
  and bd.booking_status in ('pending_payment', 'confirmed');

-- -----------------------------------------------------------------------------
-- 4. Policy + grant per kolom
-- -----------------------------------------------------------------------------
drop policy if exists "booking_dates_select_public" on public.booking_dates;
create policy "booking_dates_select_public"
  on public.booking_dates for select
  using (is_active);

do $do$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select on public.booking_dates from anon;
    grant select (slot_id, event_date, booking_status, is_active)
      on public.booking_dates to anon;
    grant select on public.slot_date_status to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke select on public.booking_dates from authenticated;
    grant select (slot_id, event_date, booking_status, is_active)
      on public.booking_dates to authenticated;
    grant select on public.slot_date_status to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.booking_dates, public.slot_date_status to service_role;
  end if;
end $do$;
