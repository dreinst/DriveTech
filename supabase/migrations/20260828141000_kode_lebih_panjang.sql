-- =============================================================================
-- Drive Tech — Perpanjang kode booking & transaksi (temuan audit 2026-08-28)
-- =============================================================================
-- booking_code / transaction_code dipakai publik sebagai "kunci" cek status
-- (mengembalikan data pribadi tenant + kemampuan membatalkan). Default lama
-- hanya 6 digit hex (24 bit) — terlalu mudah ditebak lewat brute force.
-- Naik ke 10 digit hex (40 bit): tetap nyaman diketik, ~65 ribu kali lebih sulit
-- ditebak. Baris lama (kalau ada) tidak diubah — hanya default insert baru.
-- =============================================================================

set search_path = public, extensions;

alter table public.bookings
  alter column booking_code
  set default ('BK-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10)));

alter table public.purchase_transactions
  alter column transaction_code
  set default ('TX-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10)));
