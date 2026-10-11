--
-- Migrasi alat admin (2026-10-11) untuk database yang SUDAH berisi skema lama.
-- Idempoten: aman dijalankan berulang.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrasi/2026-10-11-alat-admin.sql
--
-- Database baru tidak perlu berkas ini, db/skema.sql sudah memuat semuanya.
--

BEGIN;

-- Log aktivitas admin.
CREATE TABLE IF NOT EXISTS public.admin_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    waktu timestamp with time zone DEFAULT now() NOT NULL,
    admin_id uuid,
    username text NOT NULL,
    aksi text NOT NULL,
    rincian text DEFAULT ''::text NOT NULL
);

COMMENT ON TABLE public.admin_log IS 'Log aksi admin yang mengubah data. Tidak pernah memuat sandi.';

CREATE INDEX IF NOT EXISTS admin_log_waktu_idx ON public.admin_log USING btree (waktu DESC);

-- Kelola akun admin: akun bisa dinonaktifkan tanpa dihapus.
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS aktif boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.admin_users.aktif IS 'false = akun dinonaktifkan: tidak bisa login dan sesi berjalan ditolak.';

-- Penarikan saldo.
CREATE TABLE IF NOT EXISTS public.penarikan_saldo (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal date NOT NULL,
    nominal numeric NOT NULL,
    catatan text DEFAULT ''::text NOT NULL,
    dicatat_oleh text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT penarikan_saldo_nominal_check CHECK ((nominal > (0)::numeric))
);

COMMENT ON TABLE public.penarikan_saldo IS 'Catatan penarikan saldo QRIS ke rekening, diisi superadmin.';

COMMIT;
