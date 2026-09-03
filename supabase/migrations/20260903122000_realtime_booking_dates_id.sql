-- =============================================================================
-- Drive Tech — Realtime booking_dates untuk pengunjung (anon) — 2026-09-03
-- =============================================================================
-- Temuan audit: anon hanya punya grant kolom tanpa kunci utama `id`, sehingga
-- Realtime Supabase (realtime.apply_rls) dapat menolak langganan booking_dates
-- dan denah tidak memperbarui okupansi antar pengunjung. Grant kolom `id`
-- saja tidak membuka data pribadi (booking_id tetap tidak diberikan).
-- Idempotent.
-- =============================================================================

grant select (id) on public.booking_dates to anon, authenticated;
