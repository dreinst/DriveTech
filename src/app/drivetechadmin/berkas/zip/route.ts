import { getCurrentAdmin } from "@/lib/services/auth";
import { listBukti } from "@/lib/services/bukti";
import { catatLog } from "@/lib/services/log";
import { tanggalHariIniJakarta } from "@/lib/services/slots";
import { bacaBukti } from "@/lib/storage";
import { buatZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /drivetechadmin/berkas/zip: semua bukti bayar dalam satu ZIP, nama berkas
 * memakai kode booking. Wajib sesi admin aktif (admin maupun superadmin, sama
 * dengan yang boleh melihat bukti di halaman Pemesanan). Bukti lama yang
 * menunjuk penyimpanan luar tidak ikut karena berkasnya tidak ada di disk.
 */
export async function GET(): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Tidak diizinkan", { status: 403 });

  const daftar = await listBukti();
  if (!daftar.ok) return new Response(daftar.error, { status: 503 });

  const berkas: { nama: string; isi: Buffer }[] = [];
  for (const bukti of daftar.data) {
    const isi = await bacaBukti(bukti.proof_url);
    if (isi) berkas.push({ nama: `${bukti.booking_code}.${isi.ekstensi}`, isi: isi.data });
  }
  await catatLog(admin.id, "unduh_zip_bukti", `${berkas.length} berkas`);

  return new Response(new Uint8Array(buatZip(berkas)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="bukti-bayar-drivetech-${tanggalHariIniJakarta()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
