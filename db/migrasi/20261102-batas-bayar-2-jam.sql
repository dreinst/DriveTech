-- =============================================================================
-- Batas bayar booking lapak dipersingkat dari 24 jam menjadi 2 jam (keputusan pemilik 2 November 2026).
--
-- Booking pending yang belum dibayar (atau buktinya ditolak) kini batal otomatis setelah 2 jam, supaya
-- lapak tidak tertahan seharian oleh pemesan yang tidak jadi bayar. Bukti yang sudah dikirim dan menunggu
-- verifikasi tetap ditahan sampai 72 jam. Harus sama dengan PAYMENT_DEADLINE_HOURS di
-- src/lib/domain/constants.ts.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261102-batas-bayar-2-jam.sql
-- =============================================================================
begin;

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
