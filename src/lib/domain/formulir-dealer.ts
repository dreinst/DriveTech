/**
 * Formulir pendaftaran dan komitmen dealer mobil dan motor baru (PDF 3 halaman).
 * Template PDF dan posisi kolomnya ada di src/assets/formulir-dealer, dibuat dari
 * formulir-dealer-baru.py (folder Draf PR 28 Okt) dengan opsi --ke.
 * Data isian disimpan datar dengan kunci = nama kolom di PDF (nama_dealer, unit_1_tipe, tgl_3, ...).
 */

import { WA_BOT_PHONE, waHref } from "./constants";

export type DataDealer = Record<string, string>;

/** Pilihan lapak bagian C. Harga per tanggal sama dengan tabel di PDF. */
export const LAPAK_DEALER = [
  { kode: "mb", label: "Mobil baru (MB), 5 x 5 m", harga: 1_000_000 },
  { kode: "d", label: "Motor baru (D), 3 x 3 m", harga: 500_000 },
] as const;

/** Bagian D. Urutan = tgl_1 sampai tgl_8 di PDF. */
export const TANGGAL_DEALER = [
  "Pembukaan 7 dan 8 Nov",
  "Minggu, 15 Nov",
  "Minggu, 22 Nov",
  "Minggu, 29 Nov",
  "Minggu, 6 Des",
  "Minggu, 13 Des",
  "Minggu, 20 Des",
  "Minggu, 27 Des",
] as const;

export const JUMLAH_BARIS_UNIT = 4;

/** Kolom per baris unit bagian E: unit_<n>_<kolom>. */
export const KOLOM_UNIT = [
  { kolom: "tipe", label: "Merek dan tipe" },
  { kolom: "warna", label: "Warna" },
  { kolom: "tahun", label: "Tahun model" },
  { kolom: "jumlah", label: "Jumlah" },
  { kolom: "test_drive", label: "Test drive" },
] as const;

/** Isi Surat Pernyataan Komitmen Dealer (halaman 3 PDF), ditampilkan di halaman web sebelum tanda tangan. */
export const KOMITMEN_DEALER = [
  "Mengikuti DriveTech Vol. 1 pada tanggal yang dipilih dan membuka booth selama jam operasional acara: Sabtu, 7 November 2026 pukul 12.00 sampai 22.00 WIB, dan setiap hari Minggu pukul 06.00 sampai 12.00 WIB.",
  "Melunasi biaya lapak paling lambat 3 hari sebelum tanggal ikut pertama. Lapak yang belum lunas dapat dialihkan ke peserta lain.",
  "Memajang unit sesuai data yang didaftarkan, dengan dokumen unit yang sah (faktur atau surat jalan).",
  "Menyediakan penjaga booth selama jam operasional, serta tenda, dekorasi, brosur, meja, dan kursi sendiri di luar fasilitas panitia pada bagian G formulir.",
  "Datang dan membongkar sesuai jadwal loading dari panitia, tidak mengeluarkan unit sebelum acara selesai kecuali seizin panitia, tetap berada di dalam batas lapak, dan tidak menghalangi jalur pengunjung.",
  "Tidak memindahkan atau menyewakan kembali lapak kepada pihak lain tanpa persetujuan tertulis panitia.",
  "Menggunakan pengeras suara dengan volume yang tidak mengganggu lapak lain, menjaga kebersihan lapak, serta mematuhi tata tertib kawasan Kampung Tentara dan arahan panitia serta petugas.",
  "Menjaga unit, kunci, dan barang berharga sendiri. Panitia tidak menanggung kehilangan atau kerusakan barang milik dealer.",
  "Menyelesaikan transaksi jual beli, kredit, dan garansi unit langsung dengan pembeli. Panitia tidak ikut dalam transaksi.",
  "Mengirim materi promosi (logo, foto unit, program promo) paling lambat 5 hari sebelum tanggal ikut pertama untuk publikasi di Instagram @drivetechmalang dan katalog drivetech.dpro.events.",
  "Menerima bahwa panitia dapat menyesuaikan posisi lapak demi keamanan dan kelancaran acara, dengan pemberitahuan kepada dealer.",
  "Menerima bahwa biaya lapak tidak dikembalikan apabila dealer membatalkan sepihak. Apabila acara dibatalkan oleh panitia, pengembalian dana mengikuti kebijakan panitia.",
] as const;

/** Penanda tangan panitia di PDF setelah pendaftaran diterima. */
export const PENANDATANGAN_PANITIA = "Donatus Purbandono";

/** Batas ukuran gambar tanda tangan dan foto stempel (byte, sebelum base64). */
export const MAKS_TTD_BYTES = 200 * 1024;
export const MAKS_STEMPEL_BYTES = 350 * 1024;

/** DL-0001 */
export function kodeDealer(id: number): string {
  return `DL-${String(id).padStart(4, "0")}`;
}

export function jumlahTanggal(data: DataDealer): number {
  return TANGGAL_DEALER.filter((_, i) => data[`tgl_${i + 1}`] === "ya").length;
}

/** Biaya lapak = harga per tanggal x jumlah lapak x jumlah tanggal (bagian H). */
export function hitungBiaya(data: DataDealer): { lapak: number; tanggal: number; total: number } {
  const tanggal = jumlahTanggal(data);
  let lapak = 0;
  let total = 0;
  for (const l of LAPAK_DEALER) {
    const n = Number(data[`jumlah_${l.kode}`] ?? 0) || 0;
    lapak += n;
    total += l.harga * n * tanggal;
  }
  return { lapak, tanggal, total };
}

/**
 * Kode yang diketik di chat WhatsApp kantor untuk meminta PDF: DL-0001-A1B2C3D4. Delapan huruf token
 * ikut disertakan supaya orang lain tidak bisa meminta PDF dealer lain hanya dengan menebak nomor urut.
 */
export function kodeWaDealer(id: number, token: string): string {
  return `${kodeDealer(id)}-${token.slice(0, 8).toUpperCase()}`;
}

export const KODE_WA_DEALER_RE = /DL-(\d{4,})-([0-9A-F]{8})/i;

/** Tautan wa.me ke nomor kantor dengan pesan berisi kode, supaya bot langsung membalas dengan PDF. */
export function waDealerHref(id: number, token: string): string {
  return waHref(WA_BOT_PHONE, `Halo, mohon kirim PDF formulir dealer ${kodeWaDealer(id, token)}`);
}

/** "Rp2.500.000", tanpa spasi seperti di PDF. */
export function rupiah(n: number): string {
  return `Rp${n.toLocaleString("id-ID")}`;
}
