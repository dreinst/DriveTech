# Worker VPS — antrean WhatsApp penyewa

Aplikasi tidak mengirim WhatsApp sendiri. Ia menulis pesan ke tabel
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

Prasyarat di VPS: container Postgres DriveTech jalan (skema `db/skema.sql`),
gateway Hermes aktif dengan WhatsApp terhubung (`hermes send --list whatsapp`).

Worker dan skrip backup menjangkau database lewat `docker exec <container> psql`.
Nama container, user, dan database diatur lewat env `DRIVETECH_DB_CONTAINER`
(bawaan `drivetech-db`), `DRIVETECH_DB_USER` (bawaan `postgres`), dan
`DRIVETECH_DB_NAME` (bawaan `drivetech`); skrip backup juga membaca
`DRIVETECH_UPLOAD_DIR` (folder host dari volume `UPLOAD_DIR` aplikasi). Isi
lewat baris `Environment=` di unit systemd kalau nilainya berbeda.

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
docker exec drivetech-db psql -U postgres -d drivetech -c \
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
(`pending`/`failed`) — pindahkan ke `WA_PROVIDER=fonnte` di env aplikasi sebagai
cadangan, lalu antre ulang seperti di atas.

## Tugas rutin database (pengganti pg_cron)

Tiga tugas rutin (membatalkan booking yang lewat tenggat bayar, membersihkan
`rate_limit_events` dan `email_verifications` yang lebih tua dari 1 hari)
dijalankan aplikasi lewat `GET /api/cron/rutin`. Pemicunya timer systemd:

| Berkas | Fungsi |
| --- | --- |
| `drivetech-cron-rutin.service` | Unit oneshot: `curl` ke `/api/cron/rutin` dengan `Authorization: Bearer $CRON_SECRET`. |
| `drivetech-cron-rutin.timer` | Pemicu tiap 15 menit. |

`CRON_SECRET` dibaca dari `/etc/drivetech-cron.env` (mode 600, satu baris
`CRON_SECRET=...`, nilainya sama dengan env aplikasi).

```bash
# di VPS
install -m 600 /dev/null /etc/drivetech-cron.env   # lalu isi CRON_SECRET=...
install -m 644 /tmp/drivetech-cron-rutin.service /tmp/drivetech-cron-rutin.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now drivetech-cron-rutin.timer
journalctl -u drivetech-cron-rutin.service -n 20
```

## Pendaftaran jalan sehat lewat WhatsApp kantor

Chat di nomor kantor 0822-3299-9900 ditangani `kantor_cs.py` (layanan systemd
`kantor-cs` di `/opt/kantor-cs`, tidak ada di repo ini).
`kantor-cs-jalan-sehat.py` menambahkan pendaftaran jalan sehat berbayar:

1. Peserta mengirim `DAFTAR JALAN SEHAT`. Bot menanyakan nama pemesan,
   domisili, dan jumlah peserta, lalu membuat pesanan lewat
   `POST /api/bot/jalan-sehat`.
2. Bot mengirim kartu QRIS (`/api/jalan-sehat/qris/<kode>`). Screenshot bukti
   bayar di chat itu diunggah ke `/api/bot/jalan-sehat/<kode>/bukti`, lalu
   muncul sebagai kartu Setujui/Tolak di Discord #chatbot (bot D'Pro Ops).
   Andrew dikabari lewat WA hanya kalau bukti gagal tersimpan.
3. Admin menekan Setujui/Tolak di kartu Discord, atau Lunas/Tolak bukti di
   `/drivetechadmin/jalan-sehat`. Bot
   mengambil `/api/bot/jalan-sehat/kabar` tiap putaran, lalu mengirim tiket PDF
   atau meminta bukti ulang.

Pemesan lewat web masuk ke alur yang sama begitu mengirim pesan berisi kode
`JS-XXXXXXXX` (tombol "Kirim bukti bayar lewat WhatsApp" di halaman pesanan).
`TIKET JALAN SEHAT` mengirim ulang tiket pesanan yang sudah lunas. Kunci dan
alamat API memakai `DT_KEY` dan `DT_API` yang sudah dipakai untuk bayar lapak.

Patch dipasang lewat jendela perawatan (02.00 WIB) karena layanan perlu
di-restart. Isi skrip antrean:

```bash
# tugas: kantor-cs jalan sehat
# rollback: cp /opt/kantor-cs/kantor_cs.py.bak-<tanggal>-jalan-sehat /opt/kantor-cs/kantor_cs.py, lalu restart kantor-cs
cp /opt/kantor-cs/kantor_cs.py /opt/kantor-cs/kantor_cs.py.bak-$(date +%Y%m%d)-jalan-sehat
python3 /root/kantor-cs-jalan-sehat.py /opt/kantor-cs/kantor_cs.py
python3 -m py_compile /opt/kantor-cs/kantor_cs.py && systemctl restart kantor-cs
```

Pantau: `journalctl -u kantor-cs -f | grep -i "jalan sehat"`.

## PDF formulir dealer lewat WhatsApp kantor

`kantor-cs-dealer.py` menambahkan pengiriman PDF formulir dealer ke `kantor_cs.py`.
Nomor kantor tetap tidak mengirim pesan pertama, jadi dealer yang memulai:

1. Di `/dealer/<token>` dealer menekan "Kirim PDF ke WhatsApp saya" atau memindai
   QR-nya dengan HP. Pesan berisi kode `DL-0001-XXXXXXXX` terkirim ke nomor kantor.
2. Bot memanggil `POST /api/bot/dealer` (chat disimpan di DriveTech) lalu
   membalas dengan PDF formulir terbaru.
3. Setelah tanda tangan menyusul atau panitia menekan Terima di
   `/drivetechadmin/dealer`, bot mengambil `/api/bot/dealer/kabar` dan mengirim
   PDF versi baru ke chat yang sama.

Patch ini bisa dipasang sebelum atau sesudah patch jalan sehat. Dipasang lewat
jendela perawatan:

```bash
# tugas: kantor-cs formulir dealer
# rollback: cp /opt/kantor-cs/kantor_cs.py.bak-<tanggal>-dealer /opt/kantor-cs/kantor_cs.py, lalu restart kantor-cs
cp /opt/kantor-cs/kantor_cs.py /opt/kantor-cs/kantor_cs.py.bak-$(date +%Y%m%d)-dealer
python3 /root/kantor-cs-dealer.py /opt/kantor-cs/kantor_cs.py
python3 -m py_compile /opt/kantor-cs/kantor_cs.py && systemctl restart kantor-cs
```

Pantau: `journalctl -u kantor-cs -f | grep -i dealer`.
