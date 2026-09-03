#!/usr/bin/env python3
"""
Worker antrean WhatsApp Drive Tech — dijalankan di VPS dreinst (root) oleh
timer systemd tiap menit (tools/vps/drivetech-wa-outbox.timer).

Alur (keputusan pemilik 2026-09-03): aplikasi di Vercel menulis pesan ke
public.notification_outbox (lihat src/lib/notifications.ts mode "outbox");
worker ini membaca baris berstatus pending lalu mengirimnya lewat
`hermes send --to whatsapp:<nomor>` = bot WhatsApp Hermes di NOMOR KANTOR
6282232999900. Sukses -> status 'sent'; gagal -> attempts+1, dan setelah
MAX_ATTEMPTS kali jadi 'failed' (bisa diantre ulang dengan set status='pending').

Hanya stdlib Python 3. Akses database lewat `docker exec supabase-db psql`
(tanpa driver tambahan). Jeda acak antar pesan untuk mengurangi risiko
pemblokiran WhatsApp (koneksi Baileys tidak resmi). Isi pesan TIDAK pernah
ditulis ke log; nomor penerima disamarkan kecuali 4 digit terakhir.
"""
import fcntl
import json
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

HERMES = "/usr/local/bin/hermes"
DB_CONTAINER = "supabase-db"
LOG = "/var/log/drivetech-wa-outbox.log"
LOCK = "/run/lock/drivetech-wa-outbox.lock"

BATCH = 15            # maksimal baris per run
MAX_ATTEMPTS = 240    # percobaan nyata (bukan saat bridge putus); worker jalan tiap menit
RUN_BUDGET_S = 50     # hentikan run sebelum timer berikutnya (tiap 60 detik)
SEND_TIMEOUT_S = 60
PAUSE_MIN_S, PAUSE_MAX_S = 4.0, 9.0   # jeda acak antar pesan (anti-blokir)

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
DIGITS_RE = re.compile(r"^\d{8,16}$")
WIB = timezone(timedelta(hours=7))


def log(msg: str) -> None:
    line = f"{datetime.now(WIB).strftime('%Y-%m-%d %H:%M:%S WIB')} {msg}"
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
    print(line)


def mask(recipient: str) -> str:
    return "…" + recipient[-4:] if len(recipient) >= 4 else "…"


def esc(value: str) -> str:
    """Escape literal SQL: petik tunggal digandakan (tanpa parameter binding di psql)."""
    return value.replace("'", "''")


def psql(sql: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
         "-At", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True, timeout=30,
    )


def ambil_pending() -> list:
    sql = (
        "select coalesce(json_agg(t), '[]') from ("
        "select id, recipient, body, kind, booking_code, attempts "
        "from public.notification_outbox where status='pending' "
        f"order by created_at limit {BATCH}) t;"
    )
    hasil = psql(sql)
    if hasil.returncode != 0:
        raise RuntimeError(f"psql gagal: {hasil.stderr.strip()[:300]}")
    return json.loads(hasil.stdout.strip() or "[]")


def tandai_terkirim(row_id: str) -> None:
    psql(
        "update public.notification_outbox set status='sent', sent_at=now(), "
        f"attempts=attempts+1, last_error=null where id='{row_id}';"
    )


def tandai_gagal(row_id: str, error: str, final: bool = False) -> None:
    pesan = esc(error.strip()[:300] or "gagal tanpa keterangan")
    status = "'failed'" if final else f"case when attempts+1 >= {MAX_ATTEMPTS} then 'failed' else status end"
    psql(
        "update public.notification_outbox set attempts=attempts+1, "
        f"last_error='{pesan}', status={status} where id='{row_id}';"
    )


BRIDGE_PUTUS_RE = re.compile(r"Not connected to WhatsApp|Cannot connect to host|bridge error \(503\)|Connection refused", re.I)


def catat_error_saja(row_id: str, error: str) -> None:
    """Simpan keterangan galat tanpa menaikkan attempts (gangguan bridge, bukan pesan)."""
    pesan = esc(error.strip()[:300])
    psql(f"update public.notification_outbox set last_error='{pesan}' where id='{row_id}';")


def kirim(recipient: str, body: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "HOME": "/root",
           "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
    return subprocess.run(
        [HERMES, "send", "-q", "--to", f"whatsapp:{recipient}", "--file", "-"],
        input=body, text=True, capture_output=True, timeout=SEND_TIMEOUT_S, env=env,
    )


ALERT = "/usr/local/bin/drivetech-alert.sh"
ALERT_MARK = "/run/drivetech-wa-outbox.alert"
ALERT_EVERY_S = 3600  # alert diulang paling cepat tiap 1 jam


def bridge_hidup() -> bool:
    """True bila proses bridge WhatsApp Hermes (Baileys) sedang berjalan."""
    hasil = subprocess.run(["pgrep", "-f", "whatsapp-bridge/bridge.js"], capture_output=True)
    return hasil.returncode == 0


def alert_pemilik(text: str) -> None:
    """Alert ke pemilik lewat Telegram (jalur WA sedang diragukan), maks sekali per jam."""
    try:
        if os.path.exists(ALERT_MARK) and time.time() - os.path.getmtime(ALERT_MARK) < ALERT_EVERY_S:
            return
        subprocess.run([ALERT, "--telegram", text], capture_output=True, timeout=60)
        with open(ALERT_MARK, "w") as fh:
            fh.write(str(int(time.time())))
        log("alert Telegram dikirim ke pemilik")
    except Exception as exc:  # noqa: BLE001
        log(f"alert Telegram gagal: {exc}")


def main() -> int:
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    lock_fh = open(LOCK, "w")
    try:
        fcntl.flock(lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("run sebelumnya masih berjalan, lewati")
        return 0

    mulai = time.monotonic()
    try:
        rows = ambil_pending()
    except Exception as exc:  # noqa: BLE001 — worker tidak boleh mati tanpa log
        log(f"GAGAL membaca antrean: {exc}")
        return 1
    if not rows:
        return 0

    log(f"{len(rows)} pesan pending")
    terkirim = gagal = 0
    bridge_putus = False
    for i, row in enumerate(rows):
        if time.monotonic() - mulai > RUN_BUDGET_S:
            log("batas waktu run tercapai, sisanya menunggu run berikutnya")
            break

        row_id = str(row.get("id", ""))
        if not UUID_RE.match(row_id):
            log(f"id tidak valid, dilewati: {row_id[:40]!r}")
            continue
        recipient = str(row.get("recipient", "")).strip()
        body = str(row.get("body", ""))
        kind = str(row.get("kind", "other"))
        kode = str(row.get("booking_code") or "-")

        if not DIGITS_RE.match(recipient):
            tandai_gagal(row_id, "nomor penerima tidak valid", final=True)
            log(f"[{kind} {kode}] {row_id[:8]} -> nomor tidak valid, ditandai failed")
            gagal += 1
            continue
        if not body.strip():
            tandai_gagal(row_id, "isi pesan kosong", final=True)
            log(f"[{kind} {kode}] {row_id[:8]} -> isi kosong, ditandai failed")
            gagal += 1
            continue

        if i > 0:
            time.sleep(random.uniform(PAUSE_MIN_S, PAUSE_MAX_S))

        try:
            hasil = kirim(recipient, body)
        except subprocess.TimeoutExpired:
            tandai_gagal(row_id, "hermes send timeout")
            log(f"[{kind} {kode}] {row_id[:8]} -> {mask(recipient)} TIMEOUT (percobaan {int(row.get('attempts', 0)) + 1})")
            gagal += 1
            continue

        if hasil.returncode == 0:
            tandai_terkirim(row_id)
            terkirim += 1
            log(f"[{kind} {kode}] {row_id[:8]} -> {mask(recipient)} terkirim")
        else:
            err = (hasil.stderr or hasil.stdout or f"exit {hasil.returncode}").strip()
            if BRIDGE_PUTUS_RE.search(err):
                # Bridge WhatsApp sedang putus/tidak terhubung: bukan salah pesan.
                # Jangan hitung sebagai percobaan, hentikan run ini, dan beri tahu pemilik.
                catat_error_saja(row_id, err)
                bridge_putus = True
                log(f"[{kind} {kode}] {row_id[:8]} -> bridge WhatsApp tidak terhubung; antrean ditunda: {err[:120]}")
                break
            tandai_gagal(row_id, err)
            gagal += 1
            attempt = int(row.get("attempts", 0)) + 1
            log(f"[{kind} {kode}] {row_id[:8]} -> {mask(recipient)} GAGAL (percobaan {attempt}/{MAX_ATTEMPTS}): {err[:120]}")

    log(f"selesai: {terkirim} terkirim, {gagal} gagal" + (", bridge putus" if bridge_putus else ""))
    if gagal > 0 or bridge_putus or not bridge_hidup():
        sebab = (
            "bridge WhatsApp tidak berjalan" if not bridge_hidup()
            else "bridge WhatsApp tidak terhubung ke WhatsApp (pesan penyewa tertunda)" if bridge_putus
            else f"{gagal} pesan gagal terkirim"
        )
        alert_pemilik(
            f"⚠️ Notifikasi WhatsApp Drive Tech bermasalah: {sebab}. "
            "Kemungkinan nomor kantor terputus/diblokir WhatsApp. Cek: journalctl --user -u hermes-gateway, "
            "`hermes whatsapp` untuk pairing ulang, dan tabel notification_outbox (status failed bisa diantre ulang)."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
