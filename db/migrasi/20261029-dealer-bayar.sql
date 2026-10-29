-- =============================================================================
-- Pembayaran lapak dealer dan kwitansi DPRO otomatis.
--
-- Tagihan dibuat saat panitia menerima formulir: amount = biaya lapak (hitungBiaya), ditambah kode unik 501..999
-- (booking lapak memakai 350..500, jalan sehat 1..349, jadi nominal ketiganya tidak pernah sama). Dibayar lewat
-- QRIS DriveTech di /dealer/<token>.
-- status_bayar: belum (belum ada bukti) -> dicek (bukti diunggah) -> lunas. Lunas bisa lewat tombol admin,
--   kartu Setujui/Tolak di Discord, atau halaman cocok (lunas_lewat). Saat lunas, nomor kwitansi seri
--   NNN/DPRO-DT-KW/<bulan romawi>/<tahun> dibuat sekali dan tidak berubah lagi.
-- kabar_bayar: kabar untuk bot WhatsApp kantor ('lunas' kirim kwitansi, 'ditolak' minta bukti ulang). Kolom
--   terpisah dari kabar formulir supaya bot yang belum dipasang patch kwitansi tidak salah kirim.
-- kwitansi_ttd: satu baris goresan tanda tangan penanda tangan kwitansi (PNG transparan), digambar superadmin
--   di /drivetechadmin/kwitansi.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/20261029-dealer-bayar.sql
-- =============================================================================
begin;

alter table public.dealer_pendaftaran
    add column if not exists amount integer,
    add column if not exists unique_code integer,
    add column if not exists status_bayar text default 'belum' not null,
    add column if not exists proof_url text,
    add column if not exists submitted_at timestamp with time zone,
    add column if not exists alasan_tolak text,
    add column if not exists lunas_at timestamp with time zone,
    add column if not exists lunas_oleh uuid references public.admin_users (id),
    add column if not exists lunas_lewat text,
    add column if not exists kwitansi_no text unique,
    add column if not exists kabar_bayar text;

alter table public.dealer_pendaftaran
    drop constraint if exists dealer_pendaftaran_kode_unik_check,
    drop constraint if exists dealer_pendaftaran_status_bayar_check,
    drop constraint if exists dealer_pendaftaran_lunas_lewat_check,
    drop constraint if exists dealer_pendaftaran_kabar_bayar_check;
alter table public.dealer_pendaftaran
    add constraint dealer_pendaftaran_kode_unik_check check (unique_code between 501 and 999),
    add constraint dealer_pendaftaran_status_bayar_check check (status_bayar in ('belum', 'dicek', 'lunas')),
    add constraint dealer_pendaftaran_lunas_lewat_check check (lunas_lewat in ('admin', 'discord', 'cocok')),
    add constraint dealer_pendaftaran_kabar_bayar_check check (kabar_bayar in ('lunas', 'ditolak'));

create sequence if not exists public.kwitansi_dealer_seq;

create table if not exists public.kwitansi_ttd (
    id smallint default 1 primary key constraint kwitansi_ttd_satu check (id = 1),
    png bytea not null,
    updated_at timestamp with time zone default now() not null,
    updated_by uuid references public.admin_users (id)
);

-- Kode unik tagihan dealer: nominal bayarnya tidak sama dengan tagihan dealer lain yang belum lunas.
create or replace function public.alokasi_kode_unik_dl(p_dealer bigint) returns integer
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_amount int;
  v_code   int;
  v_free   int[];
begin
  perform pg_advisory_xact_lock(hashtext('drivetech:kode_unik_dl'));

  select amount, unique_code into v_amount, v_code
    from public.dealer_pendaftaran where id = p_dealer for update;
  if not found then raise exception 'dealer % tidak ditemukan', p_dealer; end if;
  if v_code is not null or v_amount is null then return v_code; end if;

  select array_agg(c) into v_free
    from generate_series(501, 999) c
   where not exists (
     select 1 from public.dealer_pendaftaran d
      where d.id <> p_dealer
        and d.unique_code is not null
        and d.status_bayar in ('belum', 'dicek')
        and d.amount + d.unique_code = v_amount + c
   );
  if v_free is null then return null; end if;

  v_code := v_free[1 + floor(random() * array_length(v_free, 1))::int];
  update public.dealer_pendaftaran set unique_code = v_code where id = p_dealer;
  return v_code;
end $$;

commit;
