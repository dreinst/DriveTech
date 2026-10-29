import { kodeDealer } from "@/lib/domain/formulir-dealer";
import { buatPdfTerisi } from "@/lib/pdf-formulir-dealer";
import { getDealerByToken, getGambarDealer } from "@/lib/services/formulir-dealer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/** GET /dealer/{token}/pdf: formulir dan surat komitmen terisi, dengan tanda tangan yang sudah ada. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { token } = await params;
  const dealer = await getDealerByToken(token);
  if (!dealer) return new Response("Formulir tidak ditemukan.", { status: 404 });

  const kode = kodeDealer(dealer.id);
  const gambar = await getGambarDealer(dealer.id);
  const pdf = await buatPdfTerisi({
    kode,
    data: dealer.data,
    ttd: gambar.ttd,
    stempel: gambar.stempel,
    ditandatanganiAt: dealer.ditandatangani_at ? new Date(dealer.ditandatangani_at) : null,
    diterimaAt: dealer.diterima_at ? new Date(dealer.diterima_at) : null,
  });
  // Nama berkas hanya huruf, angka, dan spasi supaya aman di header.
  const nama = `Formulir Dealer ${kode} ${dealer.data.nama_dealer ?? ""}`.replace(/[^A-Za-z0-9 -]/g, "").trim();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nama}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
