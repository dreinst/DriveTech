"""Pasang pengiriman kwitansi pembayaran lapak dealer di jembatan nomor kantor (/opt/kantor-cs/kantor_cs.py).

Butuh patch kantor-cs-dealer.py terpasang lebih dulu (chat dealer tersimpan di DriveTech lewat kode DL-...).
Setelah tagihan lapak ditandai lunas (tombol admin, kartu Discord, atau halaman cocok), /api/bot/dealer/kwitansi berisi
dealer itu dengan jenis 'lunas' dan bot mengirim kwitansi DPRO (PDF) ke chat dealer. Jenis 'ditolak' = bukti bayar tidak
cocok, bot meminta dealer mengunggah ulang bukti di halaman formulirnya. Setelah terkirim, bot POST { id } supaya
kabarnya tidak dikirim dua kali.

Aman dijalankan ulang (berhenti kalau sudah terpasang). Setelah dipasang, layanan kantor-cs perlu di-restart.

Pakai: python3 kantor-cs-dealer-kwitansi.py /opt/kantor-cs/kantor_cs.py
"""
import sys

p = sys.argv[1]
s = open(p).read()
if "def kabar_kwitansi_dealer(" in s:
    sys.exit("sudah terpasang")
if "def kabar_dealer(" not in s:
    sys.exit("pasang kantor-cs-dealer.py dulu")


def ganti(lama, baru):
    global s
    if s.count(lama) != 1:
        sys.exit(f"jangkar tidak ditemukan atau ganda: {lama[:60]!r}")
    s = s.replace(lama, baru)


ganti('''def kabar_drivetech():''', r'''def kabar_kwitansi_dealer():
    """Tagihan lapak dealer lunas (kirim kwitansi PDF) atau bukti bayar ditolak (minta unggah ulang)."""
    import base64
    if not DT_KEY:
        return
    status, data = dt_api("/api/bot/dealer/kwitansi")
    for d in data.get("kabar", []) if status == 200 else []:
        try:
            if CEK:
                log("cek, kabar kwitansi dealer tidak dikirim:", d["chat"], d["kode"], d["jenis"])
                continue
            if d["jenis"] == "ditolak":
                kirim_teks(d["chat"], "\n".join([
                    f"Mohon maaf Kak, bukti bayar lapak dealer {d['kode']} belum bisa kami terima: {d.get('alasan') or '-'}.",
                    f"Mohon unggah ulang screenshot bukti bayar ({d['totalTeks']}) di halaman formulir dealer: {d['halaman']} 🙏",
                ]))
            else:
                caption = "\n".join([
                    f"Terima kasih Kak 🙏 Pembayaran lapak dealer {d['kode']} ({d['nama']}) sebesar {d['totalTeks']} sudah LUNAS.",
                    f"Ini kwitansi {d['nomor']}, simpan sebagai bukti pembayaran ya.",
                ])
                try:
                    pdf = urllib.request.urlopen(urllib.request.Request(d["kwitansi"], headers={"User-Agent": "kantor-cs"}), timeout=120).read()
                    waha("/api/sendFile", {"session": SESI, "chatId": d["chat"], "caption": caption,
                                           "file": {"mimetype": "application/pdf",
                                                    "filename": f"Kwitansi-{d['nomor'].replace('/', '-')}.pdf",
                                                    "data": base64.b64encode(pdf).decode()}})
                except Exception as e:
                    log("kwitansi dealer pdf gagal", d["kode"], e)
                    kirim_teks(d["chat"], f"{caption}\n\nKwitansi: {d['kwitansi']}")
            dt_api("/api/bot/dealer/kwitansi", {"id": d["id"]})
            log("dealer kwitansi", d["kode"], d["jenis"])
        except Exception as e:
            log("dealer kwitansi gagal", d.get("kode"), e)


def kabar_drivetech():''')

ganti('''        kabar_dealer()
''', '''        kabar_dealer()
        kabar_kwitansi_dealer()
''')

open(p, "w").write(s)
print("terpasang")
