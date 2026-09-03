#!/usr/bin/env bash
# =============================================================================
# Backup mingguan database Drive Tech (Supabase self-hosted di VPS) ke NAS UGREEN
# — dengan PENGULANGAN OTOMATIS bila NAS/Tailscale mati dan NOTIFIKASI WhatsApp.
#
# Hasil di NAS (modul rsync VPS-BACKUP):
#   VPS-BACKUP/DRIVE TECH/Database Minggu <N>/
#     drivetech-db-<tgl>.dump         dump penuh (pg_dump -Fc, untuk pg_restore)
#     drivetech-db-<tgl>.sql.gz       skema public dalam SQL teks (mudah dibaca)
#     drivetech-storage-<tgl>.tar.gz  berkas Storage (foto kendaraan, bukti QRIS)
#     INFO-<tgl>.txt                  ringkasan isi backup
#
# Penomoran minggu mengikuti Musim 1 Drive Tech: pekan pembukaan 12-13 Sep 2026
# = "Database Minggu 1" (SEASON_MONDAY = Senin pekan itu). Sebelum itu masuk
# "Database Pra-Musim".
#
# Cara kerja:
#   run      (timer drivetech-backup-nas.timer, Minggu 22:00 WIB)
#            1) dump DB + arsip storage ke folder lokal (selalu, walau NAS mati)
#            2) kirim ke NAS; dicoba UPLOAD_TRIES kali berjarak UPLOAD_WAIT detik
#            3) gagal -> tulis penanda .pending-upload + notifikasi WhatsApp
#   --retry  (timer drivetech-backup-retry.timer, tiap jam)
#            hanya bekerja bila penanda ada: coba kirim lagi; berhasil ->
#            penanda dihapus + notifikasi; masih gagal -> diingatkan tiap
#            REMIND_EVERY pengulangan (~harian).
# Notifikasi lewat drivetech-alert.sh: WhatsApp (bot Hermes di nomor kantor
# 6282232999900 -> pemilik) dengan fallback Telegram bila WA gagal. Salinan lokal disimpan di /root/backups/drivetech (KEEP_LOCAL).
# =============================================================================
set -euo pipefail
export TZ=Asia/Jakarta
export HOME="${HOME:-/root}"

MODE="${1:-run}"                                   # run | --retry
NAS_HOST="${NAS_HOST:-100.119.211.48}"             # dpro-storage lewat Tailscale
NAS_USER="DPRO"
NAS_MODULE="VPS-BACKUP"
PASS_FILE="/root/.rsync-nas.pass"
TOP="DRIVE TECH"
ROOT_LOCAL="/root/backups/drivetech"
PENDING="$ROOT_LOCAL/.pending-upload"              # ada = upload ke NAS belum berhasil
DB_CONTAINER="supabase-db"
STORAGE_DIR="/root/supabase-selfhost/volumes/storage"
LOG="/var/log/drivetech-backup.log"
KEEP_LOCAL=4
SEASON_MONDAY="2026-09-07"
UPLOAD_TRIES="${UPLOAD_TRIES:-3}"                  # percobaan langsung dalam satu jalan
UPLOAD_WAIT="${UPLOAD_WAIT:-120}"                  # jeda antar percobaan (detik)
REMIND_EVERY="${REMIND_EVERY:-24}"                 # ingatkan lagi tiap N pengulangan (~24 jam)
NOTIF_WA_TO="${NOTIF_WA_TO:-6282228555254}"        # penerima WhatsApp (Panitia 1 / pemilik)
NOTIF_PREFIX="${NOTIF_PREFIX:-}"                   # mis. "[UJI] " saat menguji
HERMES="/usr/local/bin/hermes"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') $*" | tee -a "$LOG"; }

# Notifikasi ke pemilik lewat drivetech-alert.sh: WhatsApp dulu, kalau gagal
# (mis. nomor kantor diblokir/terputus) jatuh ke Telegram. Tidak pernah
# menggagalkan backup.
notify() {
  local text="${NOTIF_PREFIX}$1"
  if [ -x /usr/local/bin/drivetech-alert.sh ]; then
    if /usr/local/bin/drivetech-alert.sh "$text" >>"$LOG" 2>&1; then
      log "notifikasi terkirim (WA atau Telegram, lihat /var/log/drivetech-alert.log)"
    else
      log "PERINGATAN: notifikasi gagal di WA maupun Telegram"
    fi
  else
    log "drivetech-alert.sh tidak ditemukan, notifikasi dilewati: $text"
  fi
}

nas_reachable() { timeout 8 bash -c "</dev/tcp/$NAS_HOST/873" 2>/dev/null; }

upload() {
  rsync -rlt --timeout=90 --password-file="$PASS_FILE" \
    "$ROOT_LOCAL/$TOP" "rsync://$NAS_USER@$NAS_HOST/$NAS_MODULE/"
}

exec 9>/run/lock/drivetech-backup.lock
flock -n 9 || { log "backup lain masih berjalan, lewati"; exit 0; }
mkdir -p "$ROOT_LOCAL"

# ------------------------------------------------------------ mode pengulangan
if [ "$MODE" = "--retry" ]; then
  [ -f "$PENDING" ] || exit 0
  folder=$(sed -n 1p "$PENDING"); n=$(sed -n 2p "$PENDING"); n=${n:-0}
  log "pengulangan ke-$((n + 1)) untuk '$folder'"
  if nas_reachable && upload; then
    rm -f "$PENDING"
    log "pengulangan berhasil: '$TOP/$folder' tersimpan di NAS"
    notify "✅ Backup Drive Tech '$folder' akhirnya tersimpan di NAS ($NAS_MODULE/$TOP/$folder) setelah $((n + 1)) pengulangan. NAS/Tailscale sudah terjangkau lagi."
    exit 0
  fi
  n=$((n + 1)); printf '%s\n%s\n' "$folder" "$n" > "$PENDING"
  log "masih gagal (pengulangan ke-$n), dicoba lagi jam depan"
  if (( n % REMIND_EVERY == 0 )); then
    notify "⚠️ Backup Drive Tech '$folder' masih belum bisa dikirim ke NAS setelah $n pengulangan (NAS/Tailscale tidak terjangkau dari VPS). Salinan aman di VPS; pengulangan berlanjut tiap jam. Cek NAS DPRO-STORAGE & Tailscale."
  fi
  exit 0
fi

# ------------------------------------------------------------ mode utama (run)
NOW=$(date +%Y-%m-%d)
TS=$(date +%Y%m%d-%H%M)
days=$(( ( $(date -d "$NOW" +%s) - $(date -d "$SEASON_MONDAY" +%s) ) / 86400 ))
if (( days < 0 )); then week=0; else week=$(( days / 7 + 1 )); fi
if (( week >= 1 )); then FOLDER="Database Minggu $week"; else FOLDER="Database Pra-Musim"; fi
DEST="$ROOT_LOCAL/$TOP/$FOLDER"
mkdir -p "$DEST"

log "mulai: '$TOP/$FOLDER' (tanggal $NOW, pekan ke-$week)"

# 1. Dump penuh (semua skema) format custom -> pg_restore
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc \
  > "$DEST/drivetech-db-$TS.dump"

# 2. Skema public sebagai SQL teks terkompresi (untuk dibaca/grep tanpa restore)
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres --schema=public --no-owner --no-privileges \
  | gzip -9 > "$DEST/drivetech-db-$TS.sql.gz"

# 3. Berkas Storage (foto kendaraan & bukti pembayaran)
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$DEST/drivetech-storage-$TS.tar.gz" -C "$STORAGE_DIR" .
else
  log "PERINGATAN: folder storage $STORAGE_DIR tidak ada, dilewati"
fi

# 4. Ringkasan isi
q() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -c "$1"; }
BOOKING=$(q 'select count(*) from public.bookings;'); TENANT=$(q 'select count(*) from public.tenants;')
{
  echo "Drive Tech — backup database $NOW ($FOLDER)"
  echo "Sumber      : VPS dreinst, container $DB_CONTAINER (PostgreSQL $(q 'show server_version;'))"
  echo "Migrasi     : $(q 'select max(version) from supabase_migrations.schema_migrations;')"
  echo "Zona        : $(q 'select count(*) from public.zones;')   Slot: $(q 'select count(*) from public.slots;')   Tanggal event aktif: $(q 'select count(*) from public.event_dates where is_active;')"
  echo "Booking     : $BOOKING (terkonfirmasi $(q "select count(*) from public.bookings where status='confirmed';"), menunggu $(q "select count(*) from public.bookings where status='pending_payment';"), batal $(q "select count(*) from public.bookings where status='cancelled';"))"
  echo "Tenant      : $TENANT   Pembayaran: $(q 'select count(*) from public.admin_fee_payments;')   Listing katalog: $(q 'select count(*) from public.vehicle_listings;')"
  echo "Objek storage: $(q 'select count(*) from storage.objects;')"
  echo
  echo "Pulihkan database : pg_restore -U postgres -d postgres --clean --if-exists drivetech-db-$TS.dump"
  echo "Pulihkan storage  : tar -xzf drivetech-storage-$TS.tar.gz -C /root/supabase-selfhost/volumes/storage"
  echo
  echo "Berkas:"; ls -l --time-style=long-iso "$DEST" | tail -n +2
} > "$DEST/INFO-$TS.txt"
SIZE=$(du -sh "$DEST" | cut -f1)
log "dump lokal selesai: $DEST ($SIZE)"

# 5. Retensi lokal: simpan KEEP_LOCAL folder terbaru saja (NAS menyimpan semua)
ls -1dt "$ROOT_LOCAL/$TOP"/*/ 2>/dev/null | tail -n +$((KEEP_LOCAL + 1)) | while read -r old; do
  rm -rf "$old"; log "salinan lokal lama dihapus: $old"
done

# 6. Kirim ke NAS dengan beberapa percobaan
ok=0
for i in $(seq 1 "$UPLOAD_TRIES"); do
  if nas_reachable && upload; then ok=1; break; fi
  log "upload gagal (percobaan $i/$UPLOAD_TRIES) — NAS/Tailscale belum terjangkau"
  [ "$i" -lt "$UPLOAD_TRIES" ] && sleep "$UPLOAD_WAIT"
done

if [ "$ok" = 1 ]; then
  rm -f "$PENDING"
  log "terkirim ke NAS: $NAS_MODULE/$TOP/$FOLDER ($SIZE)"
  notify "✅ Backup Drive Tech '$FOLDER' ($NOW) tersimpan di NAS: $NAS_MODULE/$TOP/$FOLDER — $BOOKING booking, $TENANT tenant, $SIZE."
  log "selesai"
  exit 0
fi

printf '%s\n%s\n' "$FOLDER" "0" > "$PENDING"
log "GAGAL kirim ke NAS; penanda pengulangan ditulis, dicoba lagi tiap jam"
notify "⚠️ Backup Drive Tech '$FOLDER' ($NOW) BELUM bisa dikirim ke NAS: NAS/Tailscale tidak terjangkau dari VPS. Salinan aman di VPS ($SIZE); pengiriman akan diulang otomatis tiap jam sampai berhasil."
exit 1
