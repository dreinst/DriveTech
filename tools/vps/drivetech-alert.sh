#!/usr/bin/env bash
# =============================================================================
# Kirim alert operasional Drive Tech ke pemilik: WhatsApp dulu (bot Hermes di
# nomor kantor -> 6282228555254), kalau gagal jatuh ke Telegram (home channel
# Hermes = grup Agentic). Dipakai skrip backup, unit OnFailure, dan worker outbox.
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

mode=wa
if [ "${1:-}" = "--telegram" ]; then mode=tg; shift; fi
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
