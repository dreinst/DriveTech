/**
 * Simulasi cicilan sederhana untuk alur "beli unit" (/beli).
 *
 * PENTING: seluruh angka di modul ini adalah ESTIMASI dan tidak mengikat.
 * Besaran DP, tenor, bunga, biaya administrasi, dan asuransi yang sebenarnya
 * ditentukan mitra leasing setelah verifikasi data pembeli.
 *
 * Rumus yang dipakai: bunga FLAT tahunan atas pokok pembiayaan.
 *   pokok            = harga - dp
 *   total bunga      = pokok x bunga_flat_tahunan x (tenor_bulan / 12)
 *   angsuran/bulan   = (pokok + total bunga) / tenor_bulan
 */

/** Asumsi bunga flat tahunan untuk simulasi di sisi pengunjung: 12% per tahun. */
export const SIMULASI_BUNGA_FLAT_TAHUNAN = 0.12;

/** DP yang diisikan otomatis saat pembeli mengetik harga unit: 20% dari harga. */
export const PERSEN_DP_DEFAULT = 0.2;

/** Kalimat penyangkalan wajib yang ditampilkan bersama hasil simulasi. */
export const SIMULASI_DISCLAIMER =
  "Perhitungan ini hanya estimasi dengan asumsi bunga flat 12% per tahun dan sifatnya tidak mengikat. Besaran DP, tenor, bunga, biaya admin, dan asuransi yang berlaku ditentukan sepenuhnya oleh mitra leasing setelah data Anda diverifikasi.";

export type HitungAngsuranInput = {
  harga: number | null | undefined;
  dp: number | null | undefined;
  tenorBulan: number | null | undefined;
  /** Default SIMULASI_BUNGA_FLAT_TAHUNAN (0.12 = 12% per tahun). */
  bungaFlatTahunan?: number;
};

export type HasilAngsuran = {
  /** true kalau harga, tenor, dan pokok pembiayaan cukup untuk dihitung. */
  valid: boolean;
  harga: number;
  /** DP setelah dibatasi pada rentang 0..harga. */
  dp: number;
  /** Pokok pembiayaan = harga - dp. */
  pokok: number;
  tenorBulan: number;
  bungaFlatTahunan: number;
  totalBunga: number;
  /** Pokok + total bunga (belum termasuk DP). */
  totalPembayaran: number;
  angsuranPerBulan: number;
};

/** Angka aman: bukan NaN/Infinity dan tidak negatif. */
function angkaAman(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
}

/**
 * Fungsi murni penghitung estimasi angsuran. Tidak melempar error:
 * data yang belum lengkap dikembalikan sebagai hasil dengan valid = false.
 */
export function hitungAngsuran({
  harga,
  dp,
  tenorBulan,
  bungaFlatTahunan = SIMULASI_BUNGA_FLAT_TAHUNAN,
}: HitungAngsuranInput): HasilAngsuran {
  const hargaAman = angkaAman(harga);
  const bunga = angkaAman(bungaFlatTahunan);
  const tenor = Math.trunc(angkaAman(tenorBulan));
  const dpAman = Math.min(angkaAman(dp), hargaAman);
  const pokok = Math.max(hargaAman - dpAman, 0);

  const dasar: HasilAngsuran = {
    valid: false,
    harga: hargaAman,
    dp: dpAman,
    pokok,
    tenorBulan: tenor,
    bungaFlatTahunan: bunga,
    totalBunga: 0,
    totalPembayaran: pokok,
    angsuranPerBulan: 0,
  };

  if (hargaAman <= 0 || tenor <= 0 || pokok <= 0) return dasar;

  const totalBunga = Math.round(pokok * bunga * (tenor / 12));
  const totalPembayaran = pokok + totalBunga;

  return {
    ...dasar,
    valid: true,
    totalBunga,
    totalPembayaran,
    angsuranPerBulan: Math.round(totalPembayaran / tenor),
  };
}

/** DP anjuran (20% dari harga), dibulatkan ke rupiah penuh. */
export function dpDefault(harga: number | null | undefined): number {
  return Math.round(angkaAman(harga) * PERSEN_DP_DEFAULT);
}

/* ------------------------------------------------------------------ */
/* Pembantu isian rupiah pada form simulasi                            */
/* ------------------------------------------------------------------ */

/** Sisakan digit saja dari ketikan pengguna ("Rp 150.000" -> "150000"). */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

const ribuanFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** "150000000" -> "150.000.000" (tanpa awalan "Rp", dipakai di dalam input). */
export function formatRibuan(value: number | null | undefined): string {
  return ribuanFormatter.format(angkaAman(value));
}

/** Ketikan bebas -> angka rupiah. Kosong / bukan angka menjadi 0. */
export function parseRupiahInput(text: string): number {
  const bersih = digitsOnly(text);
  if (bersih === "") return 0;
  const nilai = Number(bersih);
  return Number.isFinite(nilai) ? nilai : 0;
}
