#!/usr/bin/env bash
# =============================================================================
# Kirim alert operasional Drive Tech ke pemilik lewat TELEGRAM (home channel
# Hermes = grup Agentic). Jalur WhatsApp tersedia bila ALERT_CHANNEL=wa. Dipakai skrip backup, unit OnFailure, dan worker outbox.
#   drivetech-alert.sh "teks pesan"            # WA, fallback Telegram
#   drivetech-alert.sh --telegram "teks"       # langsung Telegram (mis. WA sedang bermasalah)
# Tidak pernah mengembalikan exit != 0 kecuali kedua jalur gagal.
# =============================================================================
set -u
export HOME="${HOME:-/root}"
HERMES=/usr/local/bin/hermes
WA_TO="${ALERT_WA_TO:-6282228555254}"
LOG=/var/log/drivetech-alert.log

log() { echo "$(TZ=Asia/Jakarta date '+%Y-%m-%d %H:%M:%S WIB') $*" >> "$LOG"; }

# Sejak 2026-09-03 sore: TELEGRAM SAJA (nomor kantor diblokir WhatsApp;
# keputusan pemilik kembali ke konsep awal). Set ALERT_CHANNEL=wa untuk
# mengaktifkan kembali jalur WhatsApp (dengan fallback Telegram).
mode="${ALERT_CHANNEL:-tg}"
if [ "${1:-}" = "--telegram" ]; then mode=tg; shift; fi
if [ "${1:-}" = "--whatsapp" ]; then mode=wa; shift; fi
text="${1:-}"
[ -n "$text" ] || { echo "pesan kosong" >&2; exit 2; }

if [ "$mode" = wa ]; then
  if "$HERMES" send -q --to "whatsapp:$WA_TO" "$text" >>"$LOG" 2>&1; then
    log "WA ok -> $WA_TO"; exit 0
  fi
  log "WA gagal, coba Telegram"
fi
if "$HERMES" send -q --to telegram "[Drive Tech] $text" >>"$LOG" 2>&1; then
  log "Telegram ok (home channel)"; exit 0
fi
log "GAGAL: WA dan Telegram sama-sama gagal"
exit 1
