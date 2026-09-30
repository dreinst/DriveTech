-- Kode unik DriveTech 350..500 (keputusan Donny 30 Sep 2026): nominal QRIS dinaikkan sedikit untuk menutup biaya
-- tarik tunai. KUWERA memakai 200..349 di merchant GoPay yang sama, jadi nominal kedua acara tetap tidak kembar.
-- Isi fungsi sama dengan 20260929130000_bayar_manual_kode_unik.sql, hanya rentangnya yang berubah.
-- Rollback: jalankan ulang definisi fungsi dari migrasi 20260929130000.

create or replace function public.alokasi_kode_unik(p_payment uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_code   int;
  v_free   int[];
begin
  perform pg_advisory_xact_lock(hashtext('drivetech:kode_unik'));

  select amount, unique_code into v_amount, v_code
    from public.admin_fee_payments where id = p_payment for update;
  if not found then raise exception 'tagihan % tidak ditemukan', p_payment; end if;
  if v_code is not null then return v_code; end if;

  -- Kode bebas = nominal transfernya tidak sama dengan tagihan lain yang masih hidup.
  select array_agg(c) into v_free
    from generate_series(350, 500) c
   where not exists (
     select 1
       from public.admin_fee_payments p
       join public.bookings b on b.id = p.booking_id
      where p.id <> p_payment
        and p.unique_code is not null
        and p.status <> 'verified'
        and b.status = 'pending_payment'
        and p.amount + p.unique_code = v_amount + c
   );
  if v_free is null then return null; end if;

  v_code := v_free[1 + floor(random() * array_length(v_free, 1))::int];
  update public.admin_fee_payments set unique_code = v_code, updated_at = now() where id = p_payment;
  return v_code;
end $$;
