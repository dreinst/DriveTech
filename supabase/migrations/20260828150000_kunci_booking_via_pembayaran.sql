-- =============================================================================
-- Drive Tech — Booking dikunci lewat pembayaran (keputusan pemilik, 2026-08-28)
-- =============================================================================
-- Opsi bayar cash DIHAPUS dari alur booking: setiap booking wajib transfer +
-- unggah bukti. Konsekuensinya booking yang tidak kunjung membayar tidak boleh
-- menyandera pasangan (slot, tanggal) selamanya:
--
-- 1. Fungsi expire_unpaid_bookings(batas): membatalkan booking pending_payment
--    yang tagihannya masih 'unpaid' (tidak pernah kirim bukti) lebih lama dari
--    `batas` sejak dibuat, atau 'rejected' dan tidak diunggah ulang selama
--    `batas` sejak ditolak. Pembatalan memicu trigger
--    bookings_sync_booking_dates_active sehingga (slot, tanggal) lepas kembali
--    dan denah realtime ikut berubah. Pembayaran 'submitted'/'verified' TIDAK
--    pernah disentuh.
-- 2. Jadwal pg_cron tiap 15 menit dengan batas default 24 jam. Mengubah batas:
--    cukup jadwalkan ulang dengan argumen lain, mis.
--      select cron.schedule('expire-unpaid-bookings', '*/15 * * * *',
--        $x$select public.expire_unpaid_bookings(interval '6 hours')$x$);
-- 3. Index unik tenants (phone, tenant_type): menutup balapan find-or-create
--    di createBooking yang bisa menghasilkan baris tenant ganda (redundansi
--    data PII) saat dua booking masuk bersamaan dari nomor yang sama.
--
-- Catatan: nilai enum payment_method 'cash' TIDAK dihapus (drop nilai enum
-- butuh rebuild tipe); aplikasi berhenti memakainya dan validasi zod hanya
-- menerima 'transfer'.
--
-- Idempotent: aman dijalankan ulang; pg_cron di-guard sehingga skrip tetap
-- jalan di Postgres lokal tanpa pg_cron.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Anti-duplikat tenant per (telepon, jenis)
-- -----------------------------------------------------------------------------
create unique index if not exists tenants_phone_type_uidx
  on public.tenants (phone, tenant_type)
  where phone is not null;

-- -----------------------------------------------------------------------------
-- 2. Fungsi kedaluwarsa booking belum bayar
-- -----------------------------------------------------------------------------
create or replace function public.expire_unpaid_bookings(
  batas interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  jumlah integer;
begin
  with kandidat as (
    select b.id
    from public.bookings b
    left join public.admin_fee_payments p on p.booking_id = b.id
    where b.status = 'pending_payment'
      and (
        (coalesce(p.status, 'unpaid'::public.payment_status) = 'unpaid'
          and b.created_at < now() - batas)
        or (p.status = 'rejected' and p.updated_at < now() - batas)
      )
  )
  update public.bookings b
     set status = 'cancelled'
    from kandidat k
   where b.id = k.id;

  get diagnostics jumlah = row_count;
  if jumlah > 0 then
    raise log 'expire_unpaid_bookings: % booking dibatalkan otomatis', jumlah;
  end if;
  return jumlah;
end;
$fn$;

-- Fungsi housekeeping internal — bukan untuk RPC publik.
revoke execute on function public.expire_unpaid_bookings(interval) from public;
do $do$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.expire_unpaid_bookings(interval) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.expire_unpaid_bookings(interval) from authenticated;
  end if;
end $do$;

-- -----------------------------------------------------------------------------
-- 3. Jadwal pg_cron (tiap 15 menit, batas default 24 jam)
-- -----------------------------------------------------------------------------
do $do$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'expire-unpaid-bookings') then
      perform cron.unschedule('expire-unpaid-bookings');
    end if;
    perform cron.schedule(
      'expire-unpaid-bookings',
      '*/15 * * * *',
      'select public.expire_unpaid_bookings()'
    );
  end if;
end $do$;
