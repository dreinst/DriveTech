import { STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { bacaBerkas, tandaBuktiSah } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bucket: string; nama: string }> };

const TIPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * GET /unggahan/{bucket}/{nama}: melayani berkas unggahan dari disk.
 * foto-kendaraan terbuka untuk publik; bukti-transfer hanya bisa dibuka lewat
 * URL bertanda tangan (?exp=&sig=) yang dibuat resolveProofUrl.
 */
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const { bucket, nama } = await params;
  const privat = bucket === STORAGE_BUCKET_BUKTI;

  if (privat) {
    const query = new URL(request.url).searchParams;
    if (!(await tandaBuktiSah(nama, query.get("exp"), query.get("sig")))) {
      return new Response("Tidak diizinkan.", { status: 403 });
    }
  }

  const tipe = TIPE[nama.split(".").pop() ?? ""];
  const isi = tipe ? await bacaBerkas(bucket, nama) : null;
  if (!isi) return new Response("Berkas tidak ditemukan.", { status: 404 });

  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": tipe,
      "Cache-Control": privat ? "private, no-store" : "public, max-age=3600",
    },
  });
}
