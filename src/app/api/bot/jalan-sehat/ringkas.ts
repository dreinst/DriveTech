import { totalBayar } from "@/lib/domain/harga";
import { nomorTiket } from "@/lib/domain/jalan-sehat";
import { tiketPesanan, type PesananJalanSehat } from "@/lib/services/jalan-sehat";
import { getSiteUrl } from "@/lib/site-url";
import { formatRupiah, formatTanggalWaktu } from "@/lib/utils";

/** Ringkasan pesanan jalan sehat yang dibutuhkan bot WhatsApp kantor untuk membalas peserta. */
export function ringkasPesanan(p: PesananJalanSehat) {
  const situs = getSiteUrl();
  const total = totalBayar(p);
  return {
    kode: p.kode,
    status: p.status,
    nama: p.nama,
    jumlah: p.jumlah,
    total,
    totalTeks: formatRupiah(total),
    batasTeks: `${formatTanggalWaktu(p.batas_bayar)} WIB`,
    alasan: p.alasan_tolak,
    qris: `${situs}/api/jalan-sehat/qris/${p.kode}`,
    tiketPdf: p.status === "lunas" ? `${situs}/api/jalan-sehat/tiket/${p.token}` : null,
    halaman: `${situs}/jalan-sehat/pesanan/${p.token}`,
  };
}

/** Ringkasan plus nomor tiket (hanya pesanan lunas yang punya tiket). */
export async function ringkasDenganTiket(p: PesananJalanSehat) {
  const tiket = p.status === "lunas" ? await tiketPesanan(p.id) : null;
  return { ...ringkasPesanan(p), tiket: tiket?.ok ? tiket.data.map((t) => nomorTiket(t.id)) : [] };
}
