"""Pasang pendaftaran jalan sehat berbayar lewat chat di jembatan nomor kantor (/opt/kantor-cs/kantor_cs.py).

Alur di chat WhatsApp kantor:
  1. Peserta mengirim "DAFTAR JALAN SEHAT". Bot bertanya nama pemesan, domisili, dan jumlah peserta.
  2. Bot membuat pesanan lewat /api/bot/jalan-sehat lalu mengirim kartu QRIS bernominal (jumlah x Rp10.000 + kode unik).
  3. Screenshot bukti bayar di chat itu diunggah ke DriveTech (status "dicek") dan Andrew dikabari.
  4. Setelah admin menekan Lunas di /drivetechadmin/jalan-sehat, kabar dari /api/bot/jalan-sehat/kabar dikirim:
     tiket PDF (lunas) atau permintaan bukti ulang (ditolak).
Pemesan lewat web masuk ke alur yang sama begitu mengirim pesan berisi kode pesanan JS-XXXXXXXX. Nomor yang sudah lunas
bisa meminta tiketnya lagi dengan "TIKET JALAN SEHAT". "BATAL" menghentikan pengisian data. Status percakapan disimpan
di data/jalan-sehat.json.

Memakai DT_API dan DT_KEY yang sudah ada untuk bayar lapak DriveTech. Aman dijalankan ulang (berhenti kalau sudah
terpasang). Setelah dipasang, layanan kantor-cs perlu di-restart (lewat jendela perawatan).

Pakai: python3 kantor-cs-jalan-sehat.py /opt/kantor-cs/kantor_cs.py
"""
import sys

p = sys.argv[1]
s = open(p).read()
if "def jalan_sehat(" in s:
    sys.exit("sudah terpasang")


def ganti(lama, baru):
    global s
    if s.count(lama) != 1:
        sys.exit(f"jangkar tidak ditemukan atau ganda: {lama[:60]!r}")
    s = s.replace(lama, baru)


# Galat API dibaca isinya supaya pesan dari DriveTech (tutup, isian salah) bisa diteruskan ke peserta.
ganti("""    except urllib.error.HTTPError as e:
        return e.code, {}
""", """    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
""")

ganti('''ANDREW = "6282228555254@c.us"
''', r'''ANDREW = "6282228555254@c.us"
# jid -> {tahap: nama|domisili|jumlah|bayar, nama, domisili, kode, t}: pendaftaran jalan sehat yang sedang berjalan
DT_JS = f"{DATA}/jalan-sehat.json"
JS_KODE = re.compile(r"JS-[0-9A-F]{8}", re.I)
JS_DAFTAR = re.compile(r"\b(daftar|ikut|tiket|kupon|pesan)\b.*jalan\s*sehat|jalan\s*sehat.*\b(daftar|ikut|tiket|kupon|pesan)\b", re.I | re.S)
JS_TIKET = re.compile(r"\btiket\b", re.I)
JS_BARU = re.compile(r"\b(baru|tambah|lagi)\b", re.I)
JS_BATAL = re.compile(r"\s*(batal|batalkan|stop)\s*[.!]*\s*", re.I)
JS_UMUR = {"bayar": 48 * 3600}  # tahap lain kedaluwarsa setelah 1 jam tanpa balasan
LUAR_NEGERI = "Mohon maaf Kak, pendaftaran lewat WhatsApp hanya untuk nomor Indonesia (08...). Silakan daftar lewat drivetech.dpro.events/jalan-sehat ya 🙏"
''')

ganti('''def kabar_drivetech():''', r'''def kirim_qris_js(jid, d):
    """Kartu QRIS pesanan jalan sehat; kalau gambar gagal diambil, kirim tautan halaman pesanannya."""
    import base64
    caption = "\n".join([
        f"QRIS pembayaran jalan sehat {d['kode']}",
        f"Atas nama {d['nama']}, {d['jumlah']} peserta",
        f"Total bayar: {d['totalTeks']} (Rp10.000 per orang + kode unik)",
        "",
        "Silakan pindai dari aplikasi bank atau e-wallet berlogo QRIS. Nominalnya sudah terisi otomatis, mohon dibayar sesuai angka itu ya Kak.",
        f"Setelah membayar, kirim screenshot bukti bayarnya di chat ini sebelum {d['batasTeks']}.",
        "Tiket undian kami kirim di chat ini setelah pembayaran dicek panitia 🙏",
    ])
    if CEK:
        return log("cek, qris tidak dikirim:", jid, d["kode"])
    try:
        kartu = urllib.request.urlopen(urllib.request.Request(d["qris"], headers={"User-Agent": "kantor-cs"}), timeout=60).read()
        waha("/api/sendImage", {"session": SESI, "chatId": jid, "caption": caption,
                                "file": {"mimetype": "image/png", "filename": f"QRIS-{d['kode']}.png", "data": base64.b64encode(kartu).decode()}})
    except Exception as e:
        log("jalan sehat qris gagal", d["kode"], e)
        kirim_teks(jid, f"{caption}\n\nQRIS: {d['halaman']}")


def kirim_tiket_js(jid, d, judul):
    """Tiket undian satu pesanan (PDF); kalau PDF gagal diambil, kirim tautan halamannya."""
    import base64
    nomor = ", ".join(d.get("tiket") or [])
    caption = "\n".join([
        judul,
        f"Pesanan {d['kode']} atas nama {d['nama']}, {d['jumlah']} peserta.",
        f"Nomor undian: {nomor}",
        "",
        "Minggu, 8 November 2026 mulai 06.00 WIB di Kampung Tentara, Rest Area Singosari.",
        "Simpan tiket ini. Saat undian doorprize, nomor yang keluar dicocokkan dengan tiket ini (di HP atau dicetak).",
    ])
    if CEK:
        return log("cek, tiket tidak dikirim:", jid, d["kode"])
    try:
        pdf = urllib.request.urlopen(urllib.request.Request(d["tiketPdf"], headers={"User-Agent": "kantor-cs"}), timeout=120).read()
        waha("/api/sendFile", {"session": SESI, "chatId": jid, "caption": caption,
                               "file": {"mimetype": "application/pdf", "filename": f"Tiket-Jalan-Sehat-{d['kode']}.pdf",
                                        "data": base64.b64encode(pdf).decode()}})
    except Exception as e:
        log("jalan sehat pdf gagal", d["kode"], e)
        kirim_teks(jid, f"{caption}\n\nTiket: {d['halaman']}")


def bukti_js(jid, m, d):
    """Unggah screenshot bukti bayar pesanan jalan sehat lalu kabari Andrew."""
    full = waha(f"/api/{SESI}/chats/{urllib.parse.quote(jid)}/messages/{urllib.parse.quote(m['id'])}?downloadMedia=true")
    media = (full or {}).get("media") or {}
    tipe = (media.get("mimetype") or "").split(";")[0]
    if tipe not in ("image/jpeg", "image/png", "image/webp"):
        kirim_teks(jid, f"Mohon kirim bukti bayar pesanan {d['kode']} berupa gambar (screenshot) ya Kak 🙏")
        return
    req = urllib.request.Request(URL + urllib.parse.urlparse(media["url"]).path, headers={"X-Api-Key": KEY})
    status, _ = dt_api(f"/api/bot/jalan-sehat/{d['kode']}/bukti", data=urllib.request.urlopen(req, timeout=60).read(), tipe=tipe)
    log("jalan sehat bukti", d["kode"], status)
    kirim_teks(jid, f"Terima kasih Kak, bukti bayar pesanan {d['kode']} sudah kami terima 🙏 Setelah dicek panitia, tiket undiannya kami kirim di chat ini.")
    kirim_teks(ANDREW, "\n".join([
        f"Bukti bayar jalan sehat {d['kode']} masuk di nomor kantor",
        f"Pemesan: {d['nama']} ({nomor(jid)}), {d['jumlah']} peserta",
        f"Nominal yang harus masuk: {d['totalTeks']}",
        "Bukti tersimpan di admin DriveTech." if status == 200 else f"Bukti GAGAL tersimpan ({status}), cek gambar di chat WA kantor.",
        f"Cocokkan dengan GoPay Merchant lalu tekan Lunas: {DT_API}/drivetechadmin/jalan-sehat",
    ]))


def tangani_pesanan_js(jid, m, d, js, teks=""):
    """Balas sesuai status pesanan yang sedang dibahas di chat ini."""
    st = d["status"]
    if st in ("menunggu", "dicek", "batal") and m.get("hasMedia"):
        js[jid] = {"tahap": "bayar", "kode": d["kode"], "t": time.time()}
        bukti_js(jid, m, d)
    elif st == "menunggu":
        js[jid] = {"tahap": "bayar", "kode": d["kode"], "t": time.time()}
        if d.get("alasan"):
            kirim_teks(jid, f"Bukti bayar pesanan {d['kode']} sebelumnya belum bisa kami terima: {d['alasan']}. Mohon kirim ulang screenshot bukti bayar yang benar ya Kak 🙏")
        if re.search(r"\bbukti\b", teks, re.I):  # tombol "Kirim bukti bayar" di halaman pesanan web
            kirim_teks(jid, f"Siap Kak 🙏 Silakan kirim screenshot bukti bayar pesanan {d['kode']} ({d['totalTeks']}) di chat ini.")
        else:
            kirim_qris_js(jid, d)
    elif st == "dicek":
        kirim_teks(jid, f"Bukti bayar pesanan {d['kode']} sedang dicek panitia ya Kak 🙏 Tiket undiannya kami kirim di chat ini setelah selesai.")
    elif st == "lunas":
        js.pop(jid, None)
        kirim_tiket_js(jid, d, "Pesanan jalan sehat Kakak sudah lunas, ini tiketnya ya 🙏")
    else:
        js.pop(jid, None)
        kirim_teks(jid, f"Pesanan {d['kode']} sudah batal karena lewat batas bayar. Kalau sudah terlanjur membayar, kirim screenshot bukti bayarnya di chat ini. Kalau belum, kirim DAFTAR JALAN SEHAT untuk pesan lagi ya Kak.")


def mulai_js(jid, teks, js):
    """Kata kunci daftar/tiket tanpa percakapan berjalan."""
    status, d = dt_api("/api/bot/jalan-sehat", {"phone": nomor(jid)})
    log("jalan sehat cek", nomor(jid), status)
    if status == 400:
        kirim_teks(jid, LUAR_NEGERI)
        return
    if status != 200:
        raise RuntimeError(f"API jalan sehat {status}")
    if JS_TIKET.search(teks) and d.get("lunas") and not JS_BARU.search(teks):
        for p in d["lunas"]:
            kirim_tiket_js(jid, p, "Ini tiket jalan sehat Kakak ya 🙏")
        return
    if d.get("menunggu") and not JS_BARU.search(teks):
        kirim_teks(jid, "Kakak masih punya pesanan jalan sehat yang belum selesai. Kalau mau pesanan tambahan, kirim DAFTAR JALAN SEHAT BARU ya.")
        tangani_pesanan_js(jid, {}, d["menunggu"], js)
        return
    if not d.get("dibuka"):
        kirim_teks(jid, "Mohon maaf Kak, pendaftaran jalan sehat lewat WhatsApp sudah ditutup. Kalau Kakak sudah di lokasi, tiket undian masih bisa dibeli tunai di panitia jalan sehat 🙏")
        return
    js[jid] = {"tahap": "nama", "t": time.time()}
    kirim_teks(jid, "Halo Kak! Terima kasih mau ikut Jalan Sehat DriveTech, Minggu 8 November 2026 😊\nTiketnya Rp10.000 per orang, dan setiap peserta dapat nomor undian doorprize sendiri.\n\nBoleh tahu nama Kakak sebagai pemesan?\n(Ketik BATAL kalau tidak jadi.)")


def jalan_sehat(jid, m, teks, js):
    """True kalau pesan ini urusan jalan sehat dan sudah ditangani; False = teruskan ke alur lain."""
    st = js.get(jid)
    if st and time.time() - st.get("t", 0) > JS_UMUR.get(st.get("tahap"), 3600):
        js.pop(jid, None)
        st = None
    if not DT_KEY:
        return False
    kode = JS_KODE.search(teks or "")
    if kode:
        status, d = dt_api(f"/api/bot/jalan-sehat/{kode.group(0).upper()}", {} if CEK else {"chat": jid})
        if status == 404:
            kirim_teks(jid, f"Mohon maaf Kak, kode pesanan {kode.group(0).upper()} tidak kami temukan. Boleh dicek lagi kodenya di halaman pesanan? 🙏")
            return True
        if status != 200:
            raise RuntimeError(f"API jalan sehat {status}")
        tangani_pesanan_js(jid, m, d, js, teks)
        return True
    if st and st["tahap"] == "bayar":
        if m.get("hasMedia"):
            status, d = dt_api(f"/api/bot/jalan-sehat/{st['kode']}", {} if CEK else {"chat": jid})
            if status != 200:
                raise RuntimeError(f"API jalan sehat {status}")
            tangani_pesanan_js(jid, m, d, js)
            return True
        st = None  # menunggu bukti: chat biasa tetap dijawab alur lain
    if not st:
        if not JS_DAFTAR.search(teks or ""):
            return False
        mulai_js(jid, teks, js)
        return True

    if JS_BATAL.fullmatch(teks or ""):
        js.pop(jid, None)
        kirim_teks(jid, "Baik Kak, pendaftaran jalan sehat dibatalkan. Kalau mau daftar lagi, kirim DAFTAR JALAN SEHAT ya.")
        return True
    tanya = {"nama": "Nama Kakak sebagai pemesan siapa?", "domisili": "Domisili Kakak di mana?", "jumlah": "Berapa orang pesertanya?"}
    if m.get("hasMedia") or not teks:
        kirim_teks(jid, "Mohon balas dengan tulisan ya Kak 🙏 " + tanya[st["tahap"]])
        return True
    if st["tahap"] == "nama":
        if not 2 <= len(teks) <= 80:
            kirim_teks(jid, "Nama minimal 2 dan maksimal 80 huruf ya Kak. Boleh ditulis lagi namanya?")
            return True
        js[jid] = {"tahap": "domisili", "nama": teks, "t": time.time()}
        kirim_teks(jid, f"Terima kasih, {teks}. Domisili Kakak di mana? Cukup kecamatan atau kota, misalnya Singosari.")
        return True
    if st["tahap"] == "domisili":
        if not 3 <= len(teks) <= 80:
            kirim_teks(jid, "Tulis kecamatan atau kota tempat tinggal ya Kak, misalnya Singosari.")
            return True
        js[jid] = {**st, "tahap": "jumlah", "domisili": teks, "t": time.time()}
        kirim_teks(jid, "Berapa orang yang ikut jalan sehat, termasuk Kakak? Tulis angkanya saja, misalnya 4.")
        return True

    angka = re.search(r"\d+", teks)
    if not angka or int(angka.group(0)) < 1:
        kirim_teks(jid, "Mohon tulis jumlah peserta dengan angka ya Kak, misalnya 4.")
        return True
    status, d = dt_api("/api/bot/jalan-sehat", {"phone": nomor(jid), "nama": st["nama"], "domisili": st["domisili"],
                                                "jumlah": int(angka.group(0)), "chat": jid})
    log("jalan sehat pesan", nomor(jid), status, d.get("kode"))
    if status == 400:
        galat = d.get("fieldErrors") or {}
        if "phone" in galat:
            js.pop(jid, None)
            kirim_teks(jid, LUAR_NEGERI)
        elif "jumlah" in galat:
            kirim_teks(jid, f"{galat['jumlah']} Berapa orang pesertanya, Kak?")
        else:
            js.pop(jid, None)
            kirim_teks(jid, f"Mohon maaf Kak, data pendaftarannya belum sesuai ({'; '.join(galat.values())}). Kirim DAFTAR JALAN SEHAT untuk mengulang ya.")
        return True
    if status == 403:
        js.pop(jid, None)
        kirim_teks(jid, d.get("error") or "Mohon maaf Kak, pendaftaran jalan sehat sudah ditutup.")
        return True
    if status != 201:
        raise RuntimeError(f"API jalan sehat {status}")
    tangani_pesanan_js(jid, m, d, js)
    return True


def kabar_jalan_sehat(js):
    """Pesanan yang baru diverifikasi (kirim tiket) atau buktinya ditolak (minta bukti ulang)."""
    if not DT_KEY:
        return
    status, data = dt_api("/api/bot/jalan-sehat/kabar")
    for d in data.get("kabar", []) if status == 200 else []:
        try:
            if d["jenis"] == "lunas":
                js.pop(d["chat"], None)
                kirim_tiket_js(d["chat"], d, "Pembayaran jalan sehat sudah kami terima, terima kasih! 🎉 Ini tiket undiannya.")
            else:
                js[d["chat"]] = {"tahap": "bayar", "kode": d["kode"], "t": time.time()}
                kirim_teks(d["chat"], f"Mohon maaf Kak, bukti bayar pesanan {d['kode']} belum bisa kami terima: {d.get('alasan') or 'nominal belum masuk'}. Mohon cek lagi lalu kirim ulang screenshot bukti bayarnya di chat ini sebelum {d['batasTeks']} ya 🙏")
            dt_api("/api/bot/jalan-sehat/kabar", {"kode": d["kode"]})
            log("jalan sehat kabar", d["kode"], d["jenis"])
        except Exception as e:
            log("jalan sehat kabar gagal", d.get("kode"), e)


def kabar_drivetech():''')

ganti('''def masuk(seen, chats):''', '''def masuk(seen, chats, js):''')

ganti('''        for m in baru:
            try:
                if drivetech(jid, m, (m.get("body") or "").strip(), chats):
                    continue
''', '''        for m in baru:
            try:
                if jalan_sehat(jid, m, (m.get("body") or "").strip(), js):
                    continue
            except Exception as e:  # API galat: pesan tetap ke worker CS, Andrew dikabari
                js.pop(jid, None)
                log("jalan sehat galat", hp, e)
                if not CEK:
                    kirim_teks(ANDREW, f"Jalan sehat: pesan dari {hp} gagal diproses otomatis ({str(e)[:120]}). Mohon cek chat WA kantor.")
            try:
                if drivetech(jid, m, (m.get("body") or "").strip(), chats):
                    continue
''')

ganti('''seen, chats = muat(SEEN, {}), muat(DT_CHAT, {})''', '''seen, chats, js = muat(SEEN, {}), muat(DT_CHAT, {}), muat(DT_JS, {})''')
ganti('''        masuk(seen, chats)''', '''        masuk(seen, chats, js)''')
ganti('''        json.dump(chats, open(DT_CHAT, "w"))
        kabar_drivetech()
''', '''        json.dump(chats, open(DT_CHAT, "w"))
        kabar_drivetech()
        kabar_jalan_sehat(js)
        json.dump(js, open(DT_JS, "w"))
''')

open(p, "w").write(s)
print("terpasang")
