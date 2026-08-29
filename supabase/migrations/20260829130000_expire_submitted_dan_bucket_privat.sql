-- Audit 2026-08-29, poin 4 & 5:
-- (a) expire_unpaid_bookings kini juga membatalkan booking yang buktinya
--     berstatus 'submitted' tapi tidak kunjung diverifikasi (anti "squat"
--     slot lewat bukti asal-asalan). Batas terpisah & lebih longgar: 72 jam.
-- (b) Bucket bukti-transfer jadi PRIVATE + batas ukuran/tipe di level bucket.

-- Signature lama (satu argumen) di-drop dulu; kalau dibiarkan, panggilan tanpa
-- argumen dari pg_cron menjadi ambigu antara dua overload berdefault.
drop function if exists public.expire_unpaid_bookings(interval);

create or replace function public.expire_unpaid_bookings(
  batas interval default '24:00:00'::interval,
  batas_submitted interval default '72:00:00'::interval
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
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
        -- lepaskan tanggalnya. updated_at ikut terisi oleh trigger
        -- bookings_set_updated_at, jadi rekonsiliasi sheet bisa menemukannya.
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

-- Bukti transfer = data finansial pribadi: bucket jadi private, akses baca
-- lewat signed URL yang dibuat server (lihat src/lib/storage.ts). Batas 2 MB
-- dan tipe gambar kini juga ditegakkan di level bucket (sebelumnya hanya
-- di aplikasi).
update storage.buckets
   set public = false,
       file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'bukti-transfer';

drop policy if exists bukti_transfer_public_read on storage.objects;

-- foto-kendaraan tetap publik (dipakai katalog), cukup batasi ukuran & tipe.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'foto-kendaraan';
