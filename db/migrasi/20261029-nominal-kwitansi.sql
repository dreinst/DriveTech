-- =============================================================================
-- Nominal kwitansi booking yang berbeda dari totalBayar().
--
-- totalBayar() menambahkan biaya layanan QRIS yang baru berlaku 26 Oktober 2026 pukul 11.39 WIB (commit 02c2335).
-- Pembayaran sebelum itu dibayar tanpa biaya layanan, jadi kwitansinya memakai nominal yang benar-benar masuk
-- (lihat bukti transfer). Kosong = nominal kwitansi mengikuti totalBayar().
-- BK-39B8AE5E21 (Rifqi): bukti BCA 26 Oktober 2026 11.18 sebesar Rp2.000.466.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261029-nominal-kwitansi.sql
-- =============================================================================
begin;

alter table public.admin_fee_payments add column if not exists nominal_kwitansi integer;

update public.admin_fee_payments p set nominal_kwitansi = 2000466
  from public.bookings b
 where b.id = p.booking_id and b.booking_code = 'BK-39B8AE5E21' and p.nominal_kwitansi is null;

commit;
