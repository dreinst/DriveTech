"""Pasang pengiriman PDF formulir dealer lewat chat di jembatan nomor kantor (/opt/kantor-cs/kantor_cs.py).

Nomor kantor tidak pernah mengirim pesan pertama (risiko diblokir WhatsApp), jadi dealer yang memulai:
  1. Di /dealer/<token> dealer menekan "Kirim PDF ke WhatsApp saya" (atau memindai QR-nya dengan HP). Pesan berisi
     kode DL-0001-XXXXXXXX terkirim ke nomor kantor.
  2. Bot memanggil /api/bot/dealer (chat disimpan di DriveTech) lalu membalas dengan PDF formulir terbaru.
  3. Setelah tanda tangan menyusul atau panitia menekan Terima di /drivetechadmin/dealer, /api/bot/dealer/kabar
     berisi formulir itu dan bot mengirim PDF versi baru ke chat yang sama.
Delapan huruf token di kode membuat PDF dealer lain tidak bisa diminta dengan menebak nomor urut.

Memakai DT_API dan DT_KEY yang sudah ada untuk bayar lapak DriveTech. Bisa dipasang sebelum atau sesudah patch
kantor-cs-jalan-sehat.py, dan aman dijalankan ulang (berhenti kalau sudah terpasang). Setelah dipasang, layanan
kantor-cs perlu di-restart (lewat jendela perawatan).

Pakai: python3 kantor-cs-dealer.py /opt/kantor-cs/kantor_cs.py
"""
import sys

p = sys.argv[1]
s = open(p).read()
if "def dealer(" in s:
    sys.exit("sudah terpasang")


def ganti(lama, baru):
    global s
    if s.count(lama) != 1:
        sys.exit(f"jangkar tidak ditemukan atau ganda: {lama[:60]!r}")
    s = s.replace(lama, baru)


ganti('''ANDREW = "6282228555254@c.us"
''', '''ANDREW = "6282228555254@c.us"
DL = re.compile(r"DL-\\d{4,}-[0-9A-F]{8}", re.I)  # kode formulir dealer dari tombol WhatsApp di /dealer/<token>
''')

ganti('''def kabar_drivetech():''', r'''def kirim_pdf_dealer(jid, d, judul):
    """PDF formulir dealer; kalau PDF gagal diambil, kirim tautan halamannya."""
    import base64
    keterangan = {
        "belum": f"Formulir belum ditandatangani. Tanda tangan bisa menyusul di {d['halaman']}",
        "ditandatangani": "Formulir sudah ditandatangani dan menunggu konfirmasi panitia. PDF yang sudah ditandatangani panitia kami kirim di chat ini.",
        "diterima": "Formulir sudah diterima dan ditandatangani panitia. Simpan PDF ini sebagai arsip dealer.",
    }[d["status"]]
    caption = "\n".join([judul, f"Formulir {d['kode']} atas nama {d['nama']}.", "", keterangan])
    if CEK:
        return log("cek, pdf dealer tidak dikirim:", jid, d["kode"])
    try:
        pdf = urllib.request.urlopen(urllib.request.Request(d["pdf"], headers={"User-Agent": "kantor-cs"}), timeout=120).read()
        waha("/api/sendFile", {"session": SESI, "chatId": jid, "caption": caption,
                               "file": {"mimetype": "application/pdf", "filename": f"Formulir-Dealer-DriveTech-{d['kode']}.pdf",
                                        "data": base64.b64encode(pdf).decode()}})
    except Exception as e:
        log("dealer pdf gagal", d["kode"], e)
        kirim_teks(jid, f"{caption}\n\nPDF: {d['halaman']}")


def dealer(jid, m, teks):
    """True kalau pesan berisi kode formulir dealer dan sudah dibalas PDF; False = bukan urusan formulir dealer."""
    cocok = DL.search(teks or "")
    if not DT_KEY or not cocok:
        return False
    kode = cocok.group(0).upper()
    status, d = dt_api("/api/bot/dealer", {"kode": kode} if CEK else {"kode": kode, "chat": jid})
    if status == 404:
        kirim_teks(jid, f"Mohon maaf Kak, formulir dealer {kode} tidak kami temukan. Boleh dicek lagi kodenya di halaman formulir dealer DriveTech? 🙏")
        return True
    if status != 200:
        raise RuntimeError(f"API dealer {status}")
    log("dealer pdf", d["kode"], d["status"])
    kirim_pdf_dealer(jid, d, "Terima kasih Kak 🙏 Ini PDF formulir pendaftaran dan komitmen dealer DriveTech Vol. 1.")
    return True


def kabar_dealer():
    """Formulir yang PDF-nya berubah (tanda tangan menyusul atau diterima panitia): kirim versi terbaru."""
    if not DT_KEY:
        return
    status, data = dt_api("/api/bot/dealer/kabar")
    for d in data.get("kabar", []) if status == 200 else []:
        try:
            judul = ("Formulir dealer Kakak sudah diterima panitia DriveTech, terima kasih! 🎉 Ini PDF terbarunya."
                     if d["jenis"] == "diterima" else "Tanda tangan formulir dealer sudah kami terima 🙏 Ini PDF terbarunya.")
            kirim_pdf_dealer(d["chat"], d, judul)
            dt_api("/api/bot/dealer/kabar", {"id": d["id"]})
            log("dealer kabar", d["kode"], d["jenis"])
        except Exception as e:
            log("dealer kabar gagal", d.get("kode"), e)


def kabar_drivetech():''')

# Disisipkan sesudah blok drivetech (pesan berisi DL-... tidak pernah ditangani drivetech) supaya jangkar
# patch jalan sehat tetap utuh.
ganti('''            teks = (m.get("body") or "").strip() or ("[gambar]" if m.get("hasMedia") else "")
''', '''            try:
                if dealer(jid, m, (m.get("body") or "").strip()):
                    continue
            except Exception as e:  # API galat: pesan tetap ke worker CS, Andrew dikabari
                log("dealer galat", hp, e)
                if not CEK:
                    kirim_teks(ANDREW, f"Formulir dealer: pesan dari {hp} gagal diproses otomatis ({str(e)[:120]}). Mohon cek chat WA kantor.")
            teks = (m.get("body") or "").strip() or ("[gambar]" if m.get("hasMedia") else "")
''')

ganti('''        kabar_drivetech()
''', '''        kabar_drivetech()
        kabar_dealer()
''')

open(p, "w").write(s)
print("terpasang")
