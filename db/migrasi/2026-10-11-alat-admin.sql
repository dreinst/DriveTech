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

COMMIT;
