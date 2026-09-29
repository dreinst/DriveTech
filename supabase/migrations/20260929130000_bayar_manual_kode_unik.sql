-- Bayar manual seperti KUWERA 5K (keputusan pemilik 2026-09-29).
--
-- DriveTech dan KUWERA masuk ke merchant GoPay yang sama, jadi panitia mengenali pembayaran dari NOMINALNYA.
-- Setiap tagihan mendapat kode unik 500..999 (KUWERA memakai 1..499), dan penyewa membayar amount + unique_code
-- lewat QRIS dinamis yang dikirim bot WhatsApp kantor. Kode 212 yang lama tidak dipakai lagi.
--
--  - unique_code : kode unik tagihan; dipilih alokasi_kode_unik() di dalam kunci supaya dua tagihan hidup
--                  tidak pernah punya nominal transfer yang sama.
--  - wa_chat     : chat WhatsApp penyewa yang pernah meminta QRIS; bot hanya mengirim kabar ke chat ini
--                  (tidak ada pesan pertama dari nomor kantor, supaya nomor tidak diblokir).
--  - reminded_at : pengingat bayar sudah dikirim (sekali per tagihan).

set search_path = public, extensions;

alter table public.admin_fee_payments
  add column if not exists unique_code int,
  add column if not exists wa_chat     text,
  add column if not exists reminded_at timestamptz;

do $$ begin
  alter table public.admin_fee_payments
    add constraint admin_fee_payments_unique_code_range check (unique_code is null or unique_code between 500 and 999);
exception when duplicate_object then null; end $$;

-- Pesan yang sengaja tidak dikirim (penyewa belum pernah chat bot) dicatat sebagai skipped.
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_status_check check (status in ('pending', 'sent', 'failed', 'skipped'));

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
    from generate_series(500, 999) c
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

revoke all on function public.alokasi_kode_unik(uuid) from public, anon, authenticated;
grant execute on function public.alokasi_kode_unik(uuid) to service_role;

-- Tagihan lama yang masih menunggu bayar ikut mendapat kode.
do $$
declare r record;
begin
  for r in
    select p.id from public.admin_fee_payments p join public.bookings b on b.id = p.booking_id
     where p.unique_code is null and p.status <> 'verified' and b.status = 'pending_payment'
  loop
    perform public.alokasi_kode_unik(r.id);
  end loop;
end $$;
