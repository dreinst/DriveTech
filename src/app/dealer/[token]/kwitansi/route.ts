import { buatPdfKwitansi, isiKwitansiDealer } from "@/lib/pdf-kwitansi-dealer";
import { getDealerByToken, getTtdKwitansi } from "@/lib/services/formulir-dealer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/** GET /dealer/{token}/kwitansi: kwitansi DPRO pembayaran lapak, hanya setelah lunas. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { token } = await params;
  const dealer = await getDealerByToken(token);
  if (!dealer || dealer.status_bayar !== "lunas" || !dealer.kwitansi_no) {
    return new Response("Kwitansi belum tersedia.", { status: 404 });
  }
  const pdf = await buatPdfKwitansi(isiKwitansiDealer(dealer, await getTtdKwitansi()));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Kwitansi ${dealer.kwitansi_no.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
