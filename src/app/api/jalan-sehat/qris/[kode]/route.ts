import { kartuQrisPesanan } from "@/lib/jalan-sehat-gambar";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { pesananByKode } from "@/lib/services/jalan-sehat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ kode: string }> };

/**
 * GET /api/jalan-sehat/qris/{kode pesanan}: kartu bayar PNG berisi QRIS dinamis bernominal pesanan jalan sehat.
 * Hanya untuk pesanan yang masih menunggu bayar. Tidak memuat data pribadi selain nama pemesan.
 */
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const laju = checkRateLimit(`qris-js:${clientIpFrom(request)}`, 60, 60_000);
  if (!laju.allowed) return new Response("Terlalu banyak permintaan", { status: 429 });

  const { kode } = await params;
  const p = await pesananByKode(kode);
  if (!p || p.status !== "menunggu") return new Response("Pesanan tidak sedang menunggu pembayaran", { status: 404 });
  return kartuQrisPesanan(p);
}
