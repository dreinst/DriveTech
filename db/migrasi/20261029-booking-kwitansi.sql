-- =============================================================================
-- Kwitansi DPRO untuk pembayaran booking lapak, satu seri nomor dengan kwitansi dealer.
--
-- nomor_kwitansi_berikut(): NNN/DPRO-DT-KW/<bulan romawi>/<tahun> (WIB) dari kwitansi_dealer_seq, dipakai
--   booking dan dealer supaya seri nomornya satu.
-- admin_fee_payments.kwitansi_no: diisi trigger saat pembayaran menjadi verified (verifikasi admin, kartu Discord,
--   halaman cocok, atau booking manual yang langsung dikonfirmasi) dan tidak berubah lagi.
-- Backfill: pembayaran yang sudah verified dibuatkan nomor urut waktu verifikasi. BK-A7E7ED88BE (Hyundai Perdana
--   Malang) memakai 001/DPRO-DT-KW/X/2026 yang sudah dikirim manual ke WhatsApp Joe pada 29 Oktober 2026.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261029-booking-kwitansi.sql
-- =============================================================================
begin;

create or replace function public.nomor_kwitansi_berikut() returns text
    language sql
    set search_path to 'public'
    as $$
  select lpad(nextval('public.kwitansi_dealer_seq')::text, 3, '0') || '/DPRO-DT-KW/'
         || trim(to_char(now() at time zone 'Asia/Jakarta', 'RM')) || '/'
         || to_char(now() at time zone 'Asia/Jakarta', 'YYYY')
$$;

alter table public.admin_fee_payments add column if not exists kwitansi_no text unique;

create or replace function public.isi_kwitansi_booking() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.status = 'verified' and new.kwitansi_no is null then
    new.kwitansi_no := public.nomor_kwitansi_berikut();
  end if;
  return new;
end $$;

drop trigger if exists admin_fee_payments_kwitansi on public.admin_fee_payments;
create trigger admin_fee_payments_kwitansi
    before insert or update of status on public.admin_fee_payments
    for each row execute function public.isi_kwitansi_booking();

update public.admin_fee_payments p set kwitansi_no = '001/DPRO-DT-KW/X/2026'
  from public.bookings b
 where b.id = p.booking_id and b.booking_code = 'BK-A7E7ED88BE' and p.kwitansi_no is null
   and not exists (select 1 from public.admin_fee_payments x where x.kwitansi_no = '001/DPRO-DT-KW/X/2026')
   and not exists (select 1 from public.dealer_pendaftaran d where d.kwitansi_no = '001/DPRO-DT-KW/X/2026');

do $$
declare r record;
begin
  for r in select id from public.admin_fee_payments
            where status = 'verified' and kwitansi_no is null order by verified_at nulls last, created_at
  loop
    update public.admin_fee_payments set kwitansi_no = public.nomor_kwitansi_berikut() where id = r.id;
  end loop;
end $$;

commit;
