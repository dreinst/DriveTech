-- =============================================================================
-- Drive Tech — Nilai enum baru untuk zona Booth Leasing & Brand Otomotif
-- =============================================================================
-- Keputusan pemilik 2026-08-29: UMKM slot 11-20 (booth 2 sisi) dipisah jadi
-- zona sendiri. Nilai enum HARUS ditambah di migrasi terpisah — Postgres
-- melarang nilai enum baru dipakai dalam transaksi yang sama dengan
-- pembuatannya (migrasi datanya: 20260829091000_zona_booth_dan_motor.sql).
-- =============================================================================

alter type public.zone_type add value if not exists 'booth_khusus';
alter type public.tenant_type add value if not exists 'mitra_booth';
