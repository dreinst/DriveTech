import { buatPdfKwitansi, PENANDATANGAN_KWITANSI } from "@/lib/pdf-kwitansi-dealer";
import { getCurrentAdmin } from "@/lib/services/auth";
import { getTtdKwitansi } from "@/lib/services/formulir-dealer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /drivetechadmin/kwitansi/contoh: kwitansi berdata contoh dengan tanda tangan saat ini (khusus superadmin). */
export async function GET(): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (admin?.role !== "superadmin") return new Response("Tidak ditemukan.", { status: 404 });
  const pdf = await buatPdfKwitansi({
    nomor: "000/DPRO-DT-KW/X/2026",
    terimaDari: "Nama Pimpinan, Contoh Dealer (DL-0000)",
    jumlah: 6018054,
    untuk: [
      "Sewa lapak dealer DriveTech 2026 di Rest Area Singosari Malang",
      "1 lapak Mobil baru (MB) 5 x 5 m dan 2 lapak Motor baru (D) 3 x 3 m",
      "3 tanggal: Pembukaan 7 dan 8 Nov; Minggu, 15 Nov; Minggu, 22 Nov",
    ],
    kotaTanggal: "Malang, 29 Oktober 2026",
    catatan: ["NB : CONTOH, bukan kwitansi sah", "termasuk kode unik dan biaya layanan QRIS"],
    penandatangan: PENANDATANGAN_KWITANSI,
    ttd: await getTtdKwitansi(),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Contoh Kwitansi Dealer.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
