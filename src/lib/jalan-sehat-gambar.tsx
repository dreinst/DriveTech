import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";

import { totalBayar } from "@/lib/domain/harga";
import { HARGA_TIKET_JS, JALAN_SEHAT, nomorTiket, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";
import { dynamicQris, qrisStatic } from "@/lib/qris";
import { hitungBiaya, kodeDealer } from "@/lib/domain/formulir-dealer";
import type { PendaftaranDealer } from "@/lib/services/formulir-dealer";
import type { PesananJalanSehat, PesertaJalanSehat } from "@/lib/services/jalan-sehat";
import { getSiteUrl } from "@/lib/site-url";
import { formatRupiah, formatTanggalWaktu } from "@/lib/utils";

/**
 * Gambar jalan sehat untuk WhatsApp dan unduhan: kartu QRIS pesanan dan tiket undian (PNG/PDF).
 * Gaya mengikuti kartu QRIS lapak (api/qris). Modul KHUSUS SERVER.
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/jalan-sehat-gambar.tsx hanya boleh dipakai di server.");
}

const ORANYE = "#ff7b00";
const MERAH = "#F04E23";
const PUBLIK = path.join(process.cwd(), "public");
// Tiket sebanding A6 tegak (105 x 148 mm), jadi PDF-nya pas dicetak di kertas kecil.
const TIKET = { w: 1050, h: 1480 };
const A6 = { w: 297.6, h: 419.5 }; // poin PDF

/** Font judul situs (Barlow Condensed) dan logo DT; dibaca sekali per proses. */
const aset = Promise.all([
  readFile(path.join(PUBLIK, "fonts/BarlowCondensed-BlackItalic.ttf")),
  readFile(path.join(PUBLIK, "fonts/BarlowCondensed-SemiBold.ttf")),
  readFile(path.join(PUBLIK, "logo-drivetech.svg"), "utf8"),
]);

async function font() {
  const [judul, isi, logoSvg] = await aset;
  return {
    logo: `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`,
    fonts: [
      { name: "BarlowJudul", data: judul, weight: 900 as const, style: "italic" as const },
      { name: "Barlow", data: isi, weight: 600 as const, style: "normal" as const },
    ],
  };
}

function Kepala({ logo, pita, kanan }: { logo: string; pita: string; kanan: string }) {
  // Satori menyusun anak fragment ke samping, jadi kepala dibungkus div kolom.
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "56px 64px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
        <img src={logo} width={110} height={110} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 26 }}>
          <span style={{ fontFamily: "BarlowJudul", fontSize: 84, lineHeight: 0.9, color: MERAH }}>DRIVE TECH</span>
          <span style={{ fontSize: 28, letterSpacing: 6, color: "#d4d4d4", marginTop: 8 }}>AUTO & TECHNO SHOW 2026</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 44, background: ORANYE, padding: "18px 64px", transform: "skewY(-2deg)" }}>
        <span style={{ fontFamily: "BarlowJudul", fontSize: 64, color: "#0a0a0a", lineHeight: 1 }}>{pita}</span>
        <span style={{ fontFamily: "BarlowJudul", fontSize: 52, color: "#0a0a0a", marginLeft: "auto", lineHeight: 1 }}>{kanan}</span>
      </div>
    </div>
  );
}

/** Kartu QRIS dinamis bernominal pesanan, dikirim bot WhatsApp dan tampil di halaman pesanan. */
export async function kartuQrisPesanan(p: PesananJalanSehat): Promise<ImageResponse> {
  const { logo, fonts } = await font();
  const total = totalBayar(p);
  const qr = await QRCode.toDataURL(dynamicQris(qrisStatic(), total), { margin: 1, width: 620, errorCorrectionLevel: "M" });
  const W = 1050;
  const H = 1790;
  const baris = (label: string, nilai: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
      <span style={{ fontSize: 32, color: "#a3a3a3", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 36, color: "#ffffff", maxWidth: 620, textAlign: "right" }}>{nilai}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#ffffff", fontFamily: "Barlow" }}>
        <Kepala logo={logo} pita="JALAN SEHAT" kanan={p.kode} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
          <div style={{ display: "flex", background: "#ffffff", padding: 26, border: `8px solid ${ORANYE}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
            <img src={qr} width={600} height={600} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "36px 64px 0" }}>
          {baris("ATAS NAMA", p.nama)}
          {baris("PESERTA", `${p.jumlah} x ${formatRupiah(HARGA_TIKET_JS)}`)}
          {baris("KODE UNIK", formatRupiah(p.unique_code ?? 0))}
          {total - p.amount - (p.unique_code ?? 0) > 0 && baris("BIAYA LAYANAN QRIS", formatRupiah(total - p.amount - (p.unique_code ?? 0)))}
          <div style={{ display: "flex", height: 4, background: ORANYE, marginTop: 24 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 54, color: ORANYE }}>TOTAL BAYAR</span>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 88, color: ORANYE }}>{formatRupiah(total)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", margin: "40px 64px 0", padding: "22px 26px", border: "2px solid #333333", fontSize: 30, lineHeight: 1.35 }}>
          <span>Pindai dengan aplikasi bank atau e-wallet berlogo QRIS. Nominal sudah terisi otomatis.</span>
          <span style={{ marginTop: 10, color: ORANYE }}>
            Kirim screenshot bukti bayar di chat WhatsApp DriveTech. Tiket undian dikirim setelah pembayaran dicek.
          </span>
          <span style={{ marginTop: 10, color: "#d4d4d4" }}>{`Bayar sebelum ${formatTanggalWaktu(p.batas_bayar)} WIB`}</span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Kartu QRIS tagihan lapak dealer, tampil di /dealer/<token>. Gaya sama dengan kartu QRIS jalan sehat. */
export async function kartuQrisDealer(d: PendaftaranDealer): Promise<ImageResponse> {
  const { logo, fonts } = await font();
  const total = totalBayar({ amount: d.amount ?? 0, unique_code: d.unique_code });
  const biaya = hitungBiaya(d.data);
  const layanan = total - (d.amount ?? 0) - (d.unique_code ?? 0);
  const qr = await QRCode.toDataURL(dynamicQris(qrisStatic(), total), { margin: 1, width: 620, errorCorrectionLevel: "M" });
  const W = 1050;
  const H = 1720;
  const baris = (label: string, nilai: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
      <span style={{ fontSize: 32, color: "#a3a3a3", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 36, color: "#ffffff", maxWidth: 620, textAlign: "right" }}>{nilai}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#ffffff", fontFamily: "Barlow" }}>
        <Kepala logo={logo} pita="LAPAK DEALER" kanan={kodeDealer(d.id)} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
          <div style={{ display: "flex", background: "#ffffff", padding: 26, border: `8px solid ${ORANYE}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
            <img src={qr} width={600} height={600} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "36px 64px 0" }}>
          {baris("DEALER", d.data.nama_dealer ?? "")}
          {baris("BIAYA LAPAK", `${formatRupiah(d.amount ?? 0)} (${biaya.lapak} lapak x ${biaya.tanggal} tanggal)`)}
          {baris("KODE UNIK", formatRupiah(d.unique_code ?? 0))}
          {layanan > 0 && baris("BIAYA LAYANAN QRIS", formatRupiah(layanan))}
          <div style={{ display: "flex", height: 4, background: ORANYE, marginTop: 24 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 54, color: ORANYE }}>TOTAL BAYAR</span>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 88, color: ORANYE }}>{formatRupiah(total)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", margin: "40px 64px 0", padding: "22px 26px", border: "2px solid #333333", fontSize: 30, lineHeight: 1.35 }}>
          <span>Pindai dengan aplikasi bank atau e-wallet berlogo QRIS. Nominal sudah terisi otomatis.</span>
          <span style={{ marginTop: 10, color: ORANYE }}>
            Unggah screenshot bukti bayar di halaman formulir dealer. Kwitansi dikirim setelah pembayaran dicek panitia.
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Satu tiket undian sebagai PNG. `ke`/`dari` = urutan tiket di dalam pesanan. */
async function tiketPng(t: PesertaJalanSehat, ke: number, dari: number): Promise<Uint8Array> {
  const { logo, fonts } = await font();
  const nomor = nomorTiket(t.id);
  const qr = await QRCode.toDataURL(`${getSiteUrl()}/drivetechadmin/jalan-sehat?q=${nomor}`, {
    margin: 1,
    width: 300,
    errorCorrectionLevel: "M",
  });
  const { w: W, h: H } = TIKET;
  const gambar = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#ffffff", fontFamily: "Barlow" }}>
        <Kepala logo={logo} pita="JALAN SEHAT" kanan="TIKET UNDIAN" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 40 }}>
          <span style={{ fontSize: 34, letterSpacing: 6, color: "#a3a3a3" }}>NOMOR UNDIAN</span>
          <span style={{ fontFamily: "BarlowJudul", fontSize: 330, lineHeight: 1, color: ORANYE }}>{nomor}</span>
          <span style={{ fontSize: 52, marginTop: 4, maxWidth: 900, textAlign: "center" }}>{t.nama ?? "Peserta jalan sehat"}</span>
          <span style={{ fontSize: 34, color: "#a3a3a3", marginTop: 6 }}>
            {[t.domisili, dari > 1 ? `peserta ${ke} dari ${dari}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", margin: "auto 64px 0", paddingTop: 28, borderTop: "3px solid #333333" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, fontSize: 32, lineHeight: 1.3 }}>
            <span style={{ color: "#a3a3a3", fontSize: 26, letterSpacing: 4 }}>WAKTU</span>
            <span>{`${JALAN_SEHAT.tanggal}, mulai ${JALAN_SEHAT.mulai}`}</span>
            <span style={{ color: "#a3a3a3", fontSize: 26, letterSpacing: 4, marginTop: 14 }}>LOKASI</span>
            <span>{JALAN_SEHAT.lokasi}</span>
          </div>
          <div style={{ display: "flex", background: "#ffffff", padding: 12, marginLeft: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
            <img src={qr} width={210} height={210} />
          </div>
        </div>
        <div style={{ display: "flex", margin: "28px 64px 56px", padding: "18px 24px", border: `2px solid ${ORANYE}`, fontSize: 30, color: ORANYE }}>
          {SYARAT_AMBIL_HADIAH}
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
  return new Uint8Array(await gambar.arrayBuffer());
}

/** Semua tiket satu pesanan dalam satu PDF, satu halaman A6 per tiket. */
export async function pdfTiket(p: PesananJalanSehat, tiket: PesertaJalanSehat[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tiket ${JALAN_SEHAT.judul} ${p.kode}`);
  for (const [i, t] of tiket.entries()) {
    const halaman = pdf.addPage([A6.w, A6.h]);
    halaman.drawImage(await pdf.embedPng(await tiketPng(t, i + 1, tiket.length)), { x: 0, y: 0, width: A6.w, height: A6.h });
  }
  return pdf.save();
}
