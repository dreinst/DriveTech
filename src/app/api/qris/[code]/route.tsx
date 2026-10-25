import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import QRCode from "qrcode";

import { totalBayar } from "@/lib/domain/harga";
import { batasPembayaran } from "@/lib/domain/tenggat";
import { dynamicQris, qrisStatic } from "@/lib/qris";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { bookingByCode } from "@/lib/services/bot";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

const ORANYE = "#ff7b00";
const MERAH = "#F04E23";
const PUBLIK = path.join(process.cwd(), "public");

/** Font judul situs (Barlow Condensed) dan logo DT; dibaca sekali per proses. */
const aset = Promise.all([
  readFile(path.join(PUBLIK, "fonts/BarlowCondensed-BlackItalic.ttf")),
  readFile(path.join(PUBLIK, "fonts/BarlowCondensed-SemiBold.ttf")),
  readFile(path.join(PUBLIK, "logo-drivetech.svg"), "utf8"),
]);

const tanggalPendek = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

/**
 * GET /api/qris/{kode booking}: kartu bayar PNG berisi QRIS dinamis bernominal tagihan + kode unik. Dikirim
 * nomor WhatsApp kantor begitu penyewa mengirim kode booking. Hanya untuk booking yang masih menunggu bayar.
 * Tidak memuat data pribadi selain lapak dan tanggal, jadi aman dibuka siapa pun yang memegang kode booking.
 */
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const laju = checkRateLimit(`qris:${clientIpFrom(request)}`, 60, 60_000);
  if (!laju.allowed) return new Response("Terlalu banyak permintaan", { status: 429 });

  const { code } = await params;
  const found = await bookingByCode(code);
  if (!found.ok) return new Response("Booking tidak ditemukan", { status: 404 });
  const b = found.data;
  if (b.status !== "pending_payment" || !b.payment || b.payment.status === "verified") {
    return new Response("Booking ini tidak sedang menunggu pembayaran", { status: 404 });
  }

  const [judul, isi, logoSvg] = await aset;
  const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
  const total = totalBayar(b.payment);
  const qr = await QRCode.toDataURL(dynamicQris(qrisStatic(), total), { margin: 1, width: 620, errorCorrectionLevel: "M" });
  const batas = batasPembayaran(b, b.payment);
  const tanggal = b.dates.map((d) => tanggalPendek.format(new Date(`${d}T00:00:00+07:00`))).join(", ");
  const W = 1080;
  const H = 1880;

  const baris = (label: string, nilai: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
      <span style={{ fontSize: 34, color: "#a3a3a3", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 38, color: "#ffffff", maxWidth: 640, textAlign: "right" }}>{nilai}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#ffffff", fontFamily: "Barlow" }}>
        {/* Kepala: logo + judul miring, garis oranye miring seperti hero situs */}
        <div style={{ display: "flex", alignItems: "center", padding: "56px 72px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
          <img src={logo} width={120} height={120} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 28 }}>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 92, lineHeight: 0.9, color: MERAH }}>DRIVE TECH</span>
            <span style={{ fontSize: 30, letterSpacing: 6, color: "#d4d4d4", marginTop: 8 }}>AUTO & TECHNO SHOW 2026</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 44, background: ORANYE, padding: "18px 72px", transform: "skewY(-2deg)" }}>
          <span style={{ fontFamily: "BarlowJudul", fontSize: 64, color: "#0a0a0a", lineHeight: 1 }}>BAYAR LAPAK</span>
          <span style={{ fontFamily: "BarlowJudul", fontSize: 64, color: "#0a0a0a", lineHeight: 1, marginLeft: "auto" }}>
            {b.booking_code}
          </span>
        </div>

        {/* QRIS */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
          <div style={{ display: "flex", background: "#ffffff", padding: 26, border: `8px solid ${ORANYE}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
            <img src={qr} width={620} height={620} />
          </div>
        </div>

        {/* Rincian */}
        <div style={{ display: "flex", flexDirection: "column", padding: "40px 72px 0" }}>
          {baris("LAPAK", `${b.slot.zone.name}, ${slotDisplayName(b.slot)}`)}
          {baris("TANGGAL", tanggal)}
          {baris("BIAYA ADMIN", formatRupiah(Number(b.payment.amount)))}
          {baris("KODE UNIK", formatRupiah(b.payment.unique_code ?? 0))}
          <div style={{ display: "flex", height: 4, background: ORANYE, marginTop: 24 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 56, color: ORANYE }}>TOTAL BAYAR</span>
            <span style={{ fontFamily: "BarlowJudul", fontSize: 92, color: ORANYE }}>{formatRupiah(total)}</span>
          </div>
        </div>

        {/* Catatan */}
        <div style={{ display: "flex", flexDirection: "column", margin: "48px 72px 0", padding: "24px 28px", border: "2px solid #333333", fontSize: 31, lineHeight: 1.35 }}>
          <span>Pindai dengan aplikasi bank atau e-wallet berlogo QRIS. Nominal sudah terisi otomatis.</span>
          <span style={{ marginTop: 10, color: ORANYE }}>
            Wajib kirim screenshot bukti bayar di chat WhatsApp ini. Tanpa bukti bayar, pembayaran tidak kami proses.
          </span>
          {batas ? (
            <span style={{ marginTop: 10, color: "#d4d4d4" }}>{`Bayar sebelum ${formatTanggalWaktu(batas)} WIB`}</span>
          ) : null}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "BarlowJudul", data: judul, weight: 900, style: "italic" },
        { name: "Barlow", data: isi, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
