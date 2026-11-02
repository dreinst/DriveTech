-- =============================================================================
-- Pengecualian batas bayar per booking: bookings.tahan_sampai.
--
-- Booking yang belum dibayar hangus otomatis setelah 2 jam (lihat 20261102-batas-bayar-2-jam.sql). Kalau panitia
-- sudah sepakat dengan penyewa untuk menahan lapak lebih lama (misalnya kasir dealer baru bisa membayar besok),
-- isi tahan_sampai. Selama tahan_sampai belum lewat, expire_unpaid_bookings() tidak membatalkan booking itu.
-- Kosong = ikut batas bayar biasa.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261102-tahan-booking.sql
-- =============================================================================
begin;

alter table public.bookings add column if not exists tahan_sampai timestamptz;

CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings(batas interval DEFAULT '02:00:00'::interval, batas_submitted interval DEFAULT '72:00:00'::interval) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  jumlah integer;
begin
  with kandidat as (
    select b.id
    from public.bookings b
    left join public.admin_fee_payments p on p.booking_id = b.id
    where b.status = 'pending_payment'
      -- Ditahan panitia sampai waktu tertentu: jangan dibatalkan dulu.
      and (b.tahan_sampai is null or b.tahan_sampai < now())
      and (
        (coalesce(p.status, 'unpaid'::public.payment_status) = 'unpaid'
          and b.created_at < now() - batas)
        or (p.status = 'rejected' and p.updated_at < now() - batas)
        -- Bukti dikirim tapi tidak diverifikasi siapa pun selama batas_submitted:
        -- lepaskan tanggalnya.
        or (p.status = 'submitted'
          and coalesce(p.submitted_at, p.updated_at, b.created_at) < now() - batas_submitted)
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
$$;

commit;
