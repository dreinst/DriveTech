import { buatPdfKwitansi, isiKwitansiBooking } from "@/lib/pdf-kwitansi-dealer";
import { getBookingDetail } from "@/lib/services/booking";
import { getTtdKwitansi } from "@/lib/services/formulir-dealer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Segmen bernama slotId mengikuti folder /booking/[slotId]; di bawah /status dan /kwitansi isinya id booking.
type RouteContext = { params: Promise<{ slotId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /booking/{id booking}/kwitansi: kwitansi DPRO pembayaran booking lapak, hanya setelah diverifikasi. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { slotId: id } = await params;
  if (!UUID.test(id)) return new Response("Kwitansi belum tersedia.", { status: 404 });
  const hasil = await getBookingDetail(id);
  const b = hasil.ok ? hasil.data : null;
  if (!b?.payment?.kwitansi_no || b.payment.status !== "verified" || b.status === "cancelled") {
    return new Response("Kwitansi belum tersedia.", { status: 404 });
  }
  const pdf = await buatPdfKwitansi(isiKwitansiBooking(b, await getTtdKwitansi()));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Kwitansi ${b.payment.kwitansi_no.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
