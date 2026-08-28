-- =============================================================================
-- Drive Tech — Index penutup FK + hardening (temuan audit 2026-08-28)
-- =============================================================================
-- 1. Advisor performa Supabase: enam foreign key belum punya covering index,
--    sehingga JOIN/cascade harus seq-scan. Ditambah satu index booking_dates
--    (slot_id): unique index parsialnya (where is_active) tidak menutupi baris
--    nonaktif saat FK dicek.
-- 2. Advisor keamanan: fungsi event trigger rls_auto_enable() (dibuat otomatis
--    di project remote, bukan oleh migrasi repo ini) bisa dieksekusi anon via
--    /rest/v1/rpc. Fungsi internal — cabut EXECUTE dari role publik.
--
-- Idempotent: aman dijalankan berulang, dan aman di DB lokal yang tidak punya
-- rls_auto_enable().
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Index penutup foreign key
-- -----------------------------------------------------------------------------
create index if not exists bookings_slot_id_idx
  on public.bookings (slot_id);
create index if not exists bookings_tenant_id_idx
  on public.bookings (tenant_id);
create index if not exists booking_dates_slot_id_idx
  on public.booking_dates (slot_id);
create index if not exists event_dates_event_id_idx
  on public.event_dates (event_id);
create index if not exists leasing_applications_partner_id_idx
  on public.leasing_applications (leasing_partner_id);
create index if not exists purchase_transactions_slot_id_idx
  on public.purchase_transactions (slot_id);
create index if not exists zones_event_id_idx
  on public.zones (event_id);
-- booking_dates.booking_id sudah tercakup unique (booking_id, event_date).

-- -----------------------------------------------------------------------------
-- 2. rls_auto_enable() bukan untuk RPC publik
-- -----------------------------------------------------------------------------
do $$ begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
