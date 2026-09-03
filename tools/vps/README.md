# Worker VPS — antrean WhatsApp penyewa

Aplikasi (Vercel) tidak mengirim WhatsApp sendiri. Ia menulis pesan ke tabel
`public.notification_outbox` (mode `WA_PROVIDER=outbox`, bawaan — lihat
`src/lib/notifications.ts`), lalu worker di VPS dreinst mengirimnya lewat
`hermes send` = bot WhatsApp Hermes di **nomor kantor 6282232999900**
(keputusan pemilik 2026-09-03). Penyewa menerima kode booking, tenggat bayar,
hasil verifikasi, dan pembatalan dari nomor itu.

| Berkas | Fungsi |
| --- | --- |
| `drivetech-wa-outbox.py` | Worker: ambil ≤15 baris `pending`, kirim satu per satu (jeda acak 4–9 detik), tandai `sent`/`failed`. |
| `drivetech-wa-outbox.service` | Unit oneshot yang menjalankan worker (HOME=/root agar `hermes` menemukan `~/.hermes`). |
| `drivetech-wa-outbox.timer` | Pemicu tiap menit. |

Prasyarat di VPS: migrasi `20260903120000_notification_outbox.sql` sudah
dijalankan, container `supabase-db` jalan, gateway Hermes aktif dengan
WhatsApp terhubung (`hermes send --list whatsapp`).

## Pasang / perbarui

```bash
# dari Mac, di root repo
scp tools/vps/drivetech-wa-outbox.py tools/vps/drivetech-wa-outbox.service \
    tools/vps/drivetech-wa-outbox.timer root@187.53.129.205:/tmp/

# di VPS
install -m 755 /tmp/drivetech-wa-outbox.py /usr/local/bin/drivetech-wa-outbox.py
install -m 644 /tmp/drivetech-wa-outbox.service /tmp/drivetech-wa-outbox.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now drivetech-wa-outbox.timer
systemctl list-timers drivetech-wa-outbox.timer
```

## Memantau

```bash
tail -f /var/log/drivetech-wa-outbox.log          # hasil per pesan (nomor disamarkan)
journalctl -u drivetech-wa-outbox.service -n 50   # galat unit
docker exec supabase-db psql -U postgres -d postgres -c \
  "select status, count(*) from public.notification_outbox group by 1;"
```

## Kirim ulang pesan yang gagal

Setelah `MAX_ATTEMPTS` (5) percobaan gagal, baris berstatus `failed` dan
`last_error` berisi alasannya. Untuk mencoba lagi:

```sql
update public.notification_outbox
   set status = 'pending', attempts = 0, last_error = null
 where status = 'failed' and created_at > now() - interval '1 day';
```

Menjalankan worker manual: `python3 /usr/local/bin/drivetech-wa-outbox.py`.

## Catatan risiko

Bot Hermes memakai koneksi WhatsApp Web tiruan (Baileys), bukan API resmi.
WhatsApp dapat memblokir nomor yang mengirim banyak pesan ke kontak baru.
Karena itu worker memberi jeda acak antar pesan, hanya mengirim pesan
transaksional ke nomor yang diisi penyewa sendiri, dan berhenti setelah 50
detik per run. Bila nomor kantor terblokir, pesan menumpuk di antrean
(`pending`/`failed`) — pindahkan ke `WA_PROVIDER=fonnte` di Vercel sebagai
cadangan, lalu antre ulang seperti di atas.
