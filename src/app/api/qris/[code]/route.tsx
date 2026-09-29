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

/**
 * GET /api/qris/{kode booking}: kartu bayar PNG berisi QRIS dinamis bernominal tagihan + kode unik. Dikirim bot
 * WhatsApp kantor setelah penyewa menekan "Minta QRIS via WhatsApp". Hanya untuk booking yang masih menunggu
 * bayar. Tidak memuat data pribadi selain nama lapak, jadi aman dibuka siapa pun yang memegang kode booking.
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

  const total = totalBayar(b.payment);
  const qr = await QRCode.toDataURL(dynamicQris(qrisStatic(), total), { margin: 2, width: 700, errorCorrectionLevel: "M" });
  const batas = batasPembayaran(b, b.payment);
  const W = 900;
  const H = 1500;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", background: "linear-gradient(160deg, #1a1a1a 0%, #0a0a0a 100%)", color: "#ffffff", padding: "56px 60px" }}>
        <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: 2, color: "#ff7a1a" }}>DRIVE TECH</div>
        <div style={{ fontSize: 34, marginTop: 6 }}>Pembayaran biaya admin lapak</div>
        <div style={{ fontSize: 30, color: "#ffb37a", marginTop: 8 }}>{`Kode booking ${b.booking_code}`}</div>
        <div style={{ display: "flex", marginTop: 30, background: "#ffffff", borderRadius: 28, padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- gambar di dalam ImageResponse */}
          <img src={qr} width={640} height={640} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 30, fontSize: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Lapak</span>
            <span>{`${slotDisplayName(b.slot)}`}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>Biaya admin</span>
            <span>{formatRupiah(Number(b.payment.amount))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>Kode unik</span>
            <span>{formatRupiah(b.payment.unique_code ?? 0)}</span>
          </div>
          <div style={{ display: "flex", height: 3, background: "#ff7a1a", marginTop: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, color: "#ff7a1a" }}>
            <span style={{ fontSize: 40, fontWeight: 700 }}>TOTAL BAYAR</span>
            <span style={{ fontSize: 56, fontWeight: 700 }}>{formatRupiah(total)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 26, fontSize: 26, lineHeight: 1.45, textAlign: "center" }}>
          <span>Pindai QRIS di atas, nominalnya sudah terisi otomatis.</span>
          <span>Setelah membayar, kirim screenshot buktinya di chat WhatsApp ini.</span>
          {batas ? <span style={{ color: "#ffb37a" }}>{`Mohon bayar sebelum ${formatTanggalWaktu(batas)} WIB`}</span> : null}
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "private, no-store" } },
  );
}
