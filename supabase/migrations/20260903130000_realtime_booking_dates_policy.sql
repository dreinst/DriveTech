-- =============================================================================
-- Drive Tech — Realtime pembatalan sampai ke pengunjung — 2026-09-03
-- =============================================================================
-- Uji 2026-09-03 (langganan anon ke booking_dates): INSERT dan DELETE sampai,
-- tetapi UPDATE is_active=false (booking dibatalkan) TIDAK sampai karena
-- policy select `using (is_active)` menolak baris yang baru dinonaktifkan,
-- sehingga denah pengunjung lain tetap menampilkan slot "tertunda".
-- Policy dilonggarkan ke `using (true)`: aman karena anon hanya diberi grant
-- kolom slot_id, event_date, is_active, booking_status, id (tanpa booking_id
-- / data tenant), dan sumber okupansi tetap view slot_date_status yang hanya
-- memuat baris aktif. Idempotent.
-- =============================================================================

set search_path = public, extensions;

drop policy if exists booking_dates_select_public on public.booking_dates;
create policy booking_dates_select_public
  on public.booking_dates
  for select
  to public
  using (true);
