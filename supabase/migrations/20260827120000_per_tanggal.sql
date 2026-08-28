-- =============================================================================
-- Drive Tech — Migrasi "booking per tanggal"
-- =============================================================================
-- Model booking berubah: pemesan memilih >= 1 tanggal weekend (event_dates),
-- dan slot yang sama boleh disewa orang berbeda di tanggal berbeda.
--
-- Konsekuensi:
--   * Aturan lama "satu booking aktif per slot" (bookings_active_slot_idx) DIHAPUS.
--   * Anti double-booking pindah ke pasangan (slot_id, event_date) di tabel baru
--     booking_dates lewat unique index parsial booking_dates_active_slot_date_idx.
--   * Makna kolom slots.status BERUBAH: 'available' = normal; nilai lain berarti
--     slot DIBLOKIR PANITIA untuk semua tanggal (bukan lagi status booking).
--
-- Skrip ini idempotent (if not exists / create or replace / DO block) sehingga
-- aman dijalankan ulang.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Tabel event_dates — daftar tanggal gelaran (Sabtu & Minggu)
-- -----------------------------------------------------------------------------
create table if not exists public.event_dates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  event_date date not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Tabel booking_dates — tanggal-tanggal yang disewa satu booking
-- -----------------------------------------------------------------------------
create table if not exists public.booking_dates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  slot_id uuid not null references public.slots(id),
  event_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (booking_id, event_date)
);

-- KUNCI ANTI DOUBLE-BOOKING BARU: satu (slot, tanggal) hanya boleh dipegang
-- SATU baris booking_dates aktif. Baris nonaktif (booking cancelled) tidak
-- dihitung sehingga slot bisa dibooking ulang di tanggal itu.
create unique index if not exists booking_dates_active_slot_date_idx
  on public.booking_dates (slot_id, event_date)
  where is_active;

-- Aturan lama satu-booking-per-slot DIHAPUS (kini per tanggal).
drop index if exists public.bookings_active_slot_idx;

-- -----------------------------------------------------------------------------
-- 3. Trigger — booking_dates.is_active mengikuti status booking
-- -----------------------------------------------------------------------------
-- pending_payment / confirmed  -> baris tanggal aktif (mengunci slot+tanggal)
-- cancelled                    -> baris tanggal nonaktif (slot+tanggal lepas)
create or replace function public.sync_booking_dates_active()
returns trigger
language plpgsql
as $$
begin
  update public.booking_dates
     set is_active = (new.status in ('pending_payment', 'confirmed'))
   where booking_id = new.id;
  return new;
end;
$$;

drop trigger if exists bookings_sync_booking_dates_active on public.bookings;
create trigger bookings_sync_booking_dates_active
  after update of status on public.bookings
  for each row execute function public.sync_booking_dates_active();

-- -----------------------------------------------------------------------------
-- 4. View publik slot_date_status — okupansi per (slot, tanggal)
-- -----------------------------------------------------------------------------
-- security_invoker = false (security definer): view ini satu-satunya jalur baca
-- publik ke booking_dates/bookings; ia hanya mengekspos slot_id, tanggal, dan
-- status booking aktif — tanpa data pribadi tenant.
create or replace view public.slot_date_status
  with (security_invoker = false) as
select bd.slot_id, bd.event_date, b.status
from public.booking_dates bd
join public.bookings b on b.id = bd.booking_id
where bd.is_active
  and b.status in ('pending_payment', 'confirmed');

-- -----------------------------------------------------------------------------
-- 5. Row Level Security & grants
-- -----------------------------------------------------------------------------
alter table public.event_dates   enable row level security;
alter table public.booking_dates enable row level security;

-- Policy select publik HANYA untuk event_dates (tanggal aktif).
drop policy if exists "event_dates_select_public" on public.event_dates;
create policy "event_dates_select_public"
  on public.event_dates for select
  using (is_active);

-- booking_dates SENGAJA tanpa policy: akses publik hanya lewat view
-- slot_date_status (security definer) di atas.

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on public.event_dates, public.slot_date_status to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.event_dates, public.slot_date_status to authenticated;
  end if;
  -- Default privileges service_role sudah diatur migrasi awal; grant eksplisit
  -- tetap ditambahkan untuk objek baru agar tidak bergantung urutan pembuatan.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.event_dates, public.booking_dates, public.slot_date_status to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Realtime — peta publik ikut berubah saat booking_dates berubah
-- -----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'booking_dates'
     ) then
    alter publication supabase_realtime add table public.booking_dates;
  end if;
end $$;

-- Payload realtime butuh identitas baris lengkap saat update/delete.
alter table public.booking_dates replica identity full;
