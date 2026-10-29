import { pdfTiket } from "@/lib/jalan-sehat-gambar";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { pesananByToken, tiketPesanan } from "@/lib/services/jalan-sehat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/jalan-sehat/tiket/{token pesanan}: semua tiket undian satu pesanan lunas sebagai PDF (satu halaman
 * A6 per peserta). Dikirim bot WhatsApp kantor setelah pembayaran diverifikasi dan bisa diunduh dari halaman
 * pesanan. Token 32 heks tidak bisa ditebak.
 */
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const laju = checkRateLimit(`tiket-js:${clientIpFrom(request)}`, 30, 60_000);
  if (!laju.allowed) return new Response("Terlalu banyak permintaan", { status: 429 });

  const { token } = await params;
  const p = await pesananByToken(token);
  if (!p || p.status !== "lunas") return new Response("Tiket tidak ditemukan", { status: 404 });
  const tiket = await tiketPesanan(p.id);
  if (!tiket.ok || tiket.data.length === 0) return new Response("Tiket belum siap", { status: 404 });

  return new Response(new Uint8Array(await pdfTiket(p, tiket.data)), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Tiket-Jalan-Sehat-${p.kode}.pdf"`,
    },
  });
}
