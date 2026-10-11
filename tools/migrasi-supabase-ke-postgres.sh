#!/usr/bin/env bash
# =============================================================================
# Pindah data Drive Tech dari database lama (container supabase-db) ke Postgres
# polos. Dijalankan SEKALI di VPS saat cutover, dari root repo.
#
#   DATABASE_URL_TUJUAN=postgres://user:sandi@host:5432/drivetech \
#     tools/migrasi-supabase-ke-postgres.sh
#
# Yang dikerjakan:
#   1. Tujuan belum punya skema -> muat db/skema.sql.
#      Tujuan sudah berisi data -> BERHENTI tanpa mengubah apa pun.
#   2. Salin seluruh data schema public dari sumber (pg_dump --data-only).
#   3. Isi admin_users.username + password_hash dari auth.users (hash bcrypt
#      dibawa apa adanya, jadi sandi admin tidak berubah).
#   4. Cetak jumlah baris per tabel di sumber dan tujuan; beda -> keluar 1.
#
# Langkah 2 dan 3 berjalan dalam SATU transaksi: kalau gagal di tengah, tujuan
# kembali kosong dan skrip aman dijalankan ulang. Sumber hanya dibaca.
#
# Matikan dulu aplikasi (atau pasang halaman perawatan) supaya tidak ada
# booking baru yang masuk ke sumber selama penyalinan.
#
# Env opsional:
#   SUMBER_CONTAINER  container database lama   (bawaan supabase-db)
#   SUMBER_USER       user database lama        (bawaan postgres)
#   SUMBER_DB         nama database lama        (bawaan postgres)
# Butuh `psql` di host; kalau tidak ada, dipakai `docker run postgres:16 psql`
# dengan jaringan host.
# =============================================================================
set -euo pipefail

: "${DATABASE_URL_TUJUAN:?isi DATABASE_URL_TUJUAN dengan alamat database tujuan}"
SUMBER_CONTAINER="${SUMBER_CONTAINER:-supabase-db}"
SUMBER_USER="${SUMBER_USER:-postgres}"
SUMBER_DB="${SUMBER_DB:-postgres}"
SKEMA="$(cd "$(dirname "$0")/.." && pwd)/db/skema.sql"

sumber() { docker exec -i "$SUMBER_CONTAINER" psql -U "$SUMBER_USER" -d "$SUMBER_DB" -v ON_ERROR_STOP=1 "$@"; }
if command -v psql >/dev/null 2>&1; then
  tujuan() { psql "$DATABASE_URL_TUJUAN" -v ON_ERROR_STOP=1 "$@"; }
else
  tujuan() { docker run --rm -i --network host postgres:16 psql "$DATABASE_URL_TUJUAN" -v ON_ERROR_STOP=1 "$@"; }
fi

# Jumlah baris satu tabel public; lewat query_to_xml supaya nama tabel tidak perlu disusun di shell.
HITUNG="select tablename || ' ' || (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', tablename), false, true, '')))[1]::text
          from pg_tables where schemaname = 'public' order by tablename"

echo "== Memeriksa sumber ($SUMBER_CONTAINER) dan tujuan"
sumber -At -c "select 1" >/dev/null
tujuan -At -c "select 1" >/dev/null

if [ "$(tujuan -At -c "select to_regclass('public.bookings') is null")" = "t" ]; then
  echo "== Tujuan belum punya skema, memuat db/skema.sql"
  tujuan -q --single-transaction -f - < "$SKEMA" >/dev/null
fi

TERISI="$(tujuan -At -c "$HITUNG" | awk '$2 > 0')"
if [ -n "$TERISI" ]; then
  echo "BERHENTI: database tujuan sudah berisi data, tidak ada yang diubah:" >&2
  echo "$TERISI" >&2
  exit 1
fi

echo "== Menyalin data schema public dan akun admin (satu transaksi)"
{
  # Baris khusus pg_dump/psql 17 dibuang supaya bisa dimuat ke Postgres 16.
  docker exec "$SUMBER_CONTAINER" pg_dump -U "$SUMBER_USER" -d "$SUMBER_DB" \
    --data-only --schema=public --no-owner --no-privileges \
    | sed -E '/^\\(un)?restrict /d; /^SET transaction_timeout /d'
  # Username = bagian depan email login lama (administrator@drivetech.local -> administrator).
  sumber -At -c "select format('update public.admin_users set username = %L, password_hash = %L where id = %L;',
                               lower(split_part(u.email, '@', 1)), u.encrypted_password, u.id)
                   from auth.users u join public.admin_users a on a.id = u.id"
} | tujuan -q --single-transaction -f - >/dev/null

echo "== Jumlah baris per tabel (sumber | tujuan)"
BEDA=0
HASIL_TUJUAN="$(tujuan -At -c "$HITUNG")"
while read -r tabel n_sumber; do
  n_tujuan="$(awk -v t="$tabel" '$1 == t { print $2 }' <<<"$HASIL_TUJUAN")"
  tanda="cocok"
  if [ "$n_sumber" != "${n_tujuan:-tidak ada}" ]; then tanda="BEDA"; BEDA=1; fi
  printf '%-26s %8s | %8s  %s\n' "$tabel" "$n_sumber" "${n_tujuan:-tidak ada}" "$tanda"
done < <(sumber -At -c "$HITUNG")

echo "== Akun admin di tujuan"
tujuan -At -c "select username || '  (' || role || ', sandi ' || case when password_hash is null then 'KOSONG' else 'terisi' end || ')' from public.admin_users order by created_at"

# Berkas unggahan lama tidak ikut disalin skrip ini.
OBJEK="$(sumber -At -c "select count(*) from storage.objects where bucket_id in ('bukti-transfer', 'foto-kendaraan')" 2>/dev/null || echo "?")"
echo "== Berkas di penyimpanan lama: $OBJEK (selain 0 berarti berkasnya harus dipindah manual ke UPLOAD_DIR)"

if [ "$BEDA" = 1 ]; then
  echo "GAGAL: ada tabel yang jumlah barisnya beda, periksa sebelum cutover." >&2
  exit 1
fi
echo "Selesai: semua tabel cocok."
