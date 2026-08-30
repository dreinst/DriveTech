/**
 * Kompresi gambar di sisi KLIEN memakai <canvas>.
 *
 * Dipakai form bukti transfer (src/components/forms/PaymentForm.tsx) dan foto
 * kendaraan katalog (src/components/forms/FotoInput.tsx) supaya berkas yang
 * dikirim ke Server Action sudah kecil. Modul ini murni browser: dipanggil
 * hanya dari komponen "use client". Kalau lingkungan tidak mendukung (SSR,
 * canvas gagal, format tidak terbaca), fungsi mengembalikan File ASLI apa
 * adanya — bukan melempar error.
 *
 * FORMAT KELUARAN: WebP kalau browser mendukung (sekitar 25-35% lebih kecil
 * daripada JPEG pada kualitas setara), otomatis mundur ke JPEG kalau tidak.
 * Server menerima keduanya (lihat JENIS_BUKTI_DIIZINKAN di route/action).
 *
 * CATATAN: mengubah FOTO menjadi SVG (vektorisasi) SENGAJA TIDAK dilakukan —
 * untuk citra foto hasilnya justru jauh lebih besar dan detailnya rusak. Cara
 * yang benar untuk "ringan" adalah format modern + dimensi secukupnya, yaitu
 * yang dikerjakan modul ini.
 */

export type CompressImageOptions = {
  /** Sisi terpanjang maksimum hasil kompresi (piksel). Default 1600. */
  maxDimension?: number;
  /** Kualitas encode awal, 0-1. Default 0.8. */
  quality?: number;
  /** Target ukuran berkas maksimum (byte). Default 2 MB. */
  maxBytes?: number;
};

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.8;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Batas bawah supaya bukti transfer tetap terbaca. */
const MIN_QUALITY = 0.4;
const MIN_DIMENSION = 640;
const QUALITY_STEP = 0.1;
const DIMENSION_STEP = 0.75;

const TYPE_WEBP = "image/webp";
const TYPE_JPEG = "image/jpeg";

/** Hasil deteksi dukungan WebP di-cache: pemeriksaannya sinkron tapi tak gratis. */
let dukunganWebp: boolean | null = null;

/**
 * Apakah canvas browser ini bisa meng-encode WebP? Browser yang tidak mendukung
 * diam-diam mengembalikan PNG, jadi tipe hasilnya yang diperiksa — bukan sekadar
 * mengasumsikan berhasil.
 */
function webpDidukung(): boolean {
  if (dukunganWebp !== null) return dukunganWebp;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    dukunganWebp = canvas.toDataURL(TYPE_WEBP).startsWith(`data:${TYPE_WEBP}`);
  } catch {
    dukunganWebp = false;
  }
  return dukunganWebp;
}

function ekstensiUntuk(tipe: string): string {
  return tipe === TYPE_WEBP ? ".webp" : ".jpg";
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */

/** "1,4 MB" / "820 KB" — untuk menampilkan ukuran sebelum & sesudah kompresi. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Ganti ekstensi berkas mengikuti format keluaran (.webp / .jpg). */
function namaKeluaran(nama: string, tipe: string): string {
  const dasar = nama.replace(/\.[^.]+$/, "");
  const bersih = dasar.trim().length > 0 ? dasar.trim() : "gambar";
  return `${bersih}${ekstensiUntuk(tipe)}`;
}

type SumberGambar = {
  width: number;
  height: number;
  source: CanvasImageSource;
  release: () => void;
};

/** Baca File jadi sumber yang bisa digambar ke canvas. */
async function muatSumber(file: File): Promise<SumberGambar> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      release: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Berkas gambar tidak bisa dibaca."));
      el.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasKeBlob(
  canvas: HTMLCanvasElement,
  tipe: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), tipe, quality);
  });
}

/** Gambar ulang sumber ke canvas dengan sisi terpanjang = batas. */
function gambar(sumber: SumberGambar, batas: number): HTMLCanvasElement | null {
  const terpanjang = Math.max(sumber.width, sumber.height);
  const skala = terpanjang > batas ? batas / terpanjang : 1;
  const lebar = Math.max(1, Math.round(sumber.width * skala));
  const tinggi = Math.max(1, Math.round(sumber.height * skala));

  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Latar putih: JPEG tidak punya alpha, PNG transparan jadi hitam kalau tidak dialasi.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lebar, tinggi);
  ctx.drawImage(sumber.source, 0, 0, lebar, tinggi);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* API utama                                                           */
/* ------------------------------------------------------------------ */

/**
 * Perkecil dimensi lalu encode ulang (WebP bila didukung, selain itu JPEG)
 * sampai ukurannya <= maxBytes.
 *
 * Strategi: turunkan quality bertahap (0.8 -> 0.4) pada satu ukuran; kalau masih
 * kebesaran, kecilkan dimensi 25% lalu ulangi, sampai batas MIN_DIMENSION.
 * Hasil terkecil yang pernah didapat dipakai; kalau tetap lebih besar dari
 * berkas asli (mis. gambar sudah sangat teroptimasi), File asli dikembalikan.
 */
export async function compressImage(file: File, opts?: CompressImageOptions): Promise<File> {
  const maxDimension = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const qualityAwal = opts?.quality ?? DEFAULT_QUALITY;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  // Lingkungan tanpa DOM (SSR / test node) — kembalikan apa adanya.
  if (typeof document === "undefined" || typeof URL === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  const tipeKeluaran = webpDidukung() ? TYPE_WEBP : TYPE_JPEG;

  let sumber: SumberGambar | null = null;
  try {
    sumber = await muatSumber(file);

    let terkecil: Blob | null = null;
    let batas = maxDimension;

    while (batas >= MIN_DIMENSION) {
      const canvas = gambar(sumber, batas);
      if (!canvas) break;

      for (let q = qualityAwal; q >= MIN_QUALITY - 0.001; q -= QUALITY_STEP) {
        const blob = await canvasKeBlob(canvas, tipeKeluaran, Math.round(q * 100) / 100);
        if (!blob) break;
        if (terkecil === null || blob.size < terkecil.size) terkecil = blob;
        if (blob.size <= maxBytes) {
          return jadikanFile(blob, file, tipeKeluaran);
        }
      }

      const berikutnya = Math.round(batas * DIMENSION_STEP);
      if (berikutnya >= batas) break;
      batas = berikutnya;
    }

    if (terkecil !== null && terkecil.size < file.size) {
      return jadikanFile(terkecil, file, tipeKeluaran);
    }
    return file;
  } catch {
    // Kompresi gagal (format tidak didukung, canvas ter-taint, dsb.) — pakai asli.
    return file;
  } finally {
    sumber?.release();
  }
}

/**
 * Bungkus Blob hasil canvas jadi File agar bisa masuk FormData Server Action.
 * `tipe` diambil dari blob (bukan asumsi) supaya nama & MIME selalu cocok.
 */
function jadikanFile(blob: Blob, asal: File, tipeDiminta: string): File {
  const tipe = blob.type || tipeDiminta;
  return new File([blob], namaKeluaran(asal.name, tipe), {
    type: tipe,
    lastModified: asal.lastModified,
  });
}
