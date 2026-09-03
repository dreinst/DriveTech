-- =============================================================================
-- Drive Tech — Nilai enum baru untuk revisi Layout v2 + Deck v4 (2026-09-02)
-- =============================================================================
-- 1. zone_type 'motor_baru'      : Area C dipecah jadi Motor Baru (3 slot,
--                                  Rp500.000/hari) + Motor Bekas (14 slot).
-- 2. tenant_type 'dealer_motor_baru' : penyewa zona motor baru.
-- 3. payment_method 'qris'       : biaya admin kini dibayar lewat QRIS
--                                  (opsi transfer bank dihapus, keputusan
--                                  pemilik 2026-09-02).
-- Nilai enum HARUS ditambah di migrasi terpisah — Postgres melarang nilai enum
-- baru dipakai dalam transaksi yang sama dengan pembuatannya
-- (migrasi datanya: 20260902101000_layout_v2.sql).
-- =============================================================================

alter type public.zone_type add value if not exists 'motor_baru';
alter type public.tenant_type add value if not exists 'dealer_motor_baru';
alter type public.payment_method add value if not exists 'qris';
