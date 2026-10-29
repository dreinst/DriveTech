import { kartuQrisDealer } from "@/lib/jalan-sehat-gambar";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { getDealerByToken } from "@/lib/services/formulir-dealer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/** GET /api/dealer/qris/{token formulir}: kartu bayar PNG berisi QRIS dinamis bernominal tagihan lapak dealer. */
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const laju = checkRateLimit(`qris-dl:${clientIpFrom(request)}`, 60, 60_000);
  if (!laju.allowed) return new Response("Terlalu banyak permintaan", { status: 429 });

  const d = await getDealerByToken((await params).token);
  if (!d || d.amount === null || d.status_bayar === "lunas") {
    return new Response("Tagihan tidak sedang menunggu pembayaran", { status: 404 });
  }
  return kartuQrisDealer(d);
}
