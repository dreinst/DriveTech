import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { STORAGE_BUCKET_BUKTI, STORAGE_BUCKET_FOTO_KENDARAAN } from "@/lib/domain/constants";
import { tandaSah, tandaTangan } from "@/lib/sesi";
import { getSiteUrl } from "@/lib/site-url";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/storage.ts hanya boleh dipakai di server.");
}

/**
 * Berkas unggahan disimpan di disk: <UPLOAD_DIR>/<bucket>/<nama>, dan dilayani
 * route /unggahan/[bucket]/[nama].
 *  - foto-kendaraan : publik (foto katalog).
 *  - bukti-transfer : PRIVAT (bukti transfer = data finansial pribadi). Kolom
 *    proof_url menyimpan URL identitas berkas (`<situs>/unggahan/bukti-transfer/<nama>`)
 *    yang TIDAK bisa dibuka langsung; halaman yang menampilkan bukti wajib
 *    menukarnya dulu lewat resolveProofUrl menjadi URL bertanda tangan.
 */
const BUCKETS: readonly string[] = [STORAGE_BUCKET_BUKTI, STORAGE_BUCKET_FOTO_KENDARAAN];

/** Nama berkas yang diterima: tanpa garis miring dan tidak diawali titik, jadi tidak bisa keluar dari foldernya. */
const NAMA_AMAN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;

const AWALAN_BUKTI = `/unggahan/${STORAGE_BUCKET_BUKTI}/`;

/** Lokasi berkas di disk; null kalau bucket tidak dikenal atau namanya tidak aman. */
function jalurBerkas(bucket: string, nama: string): string | null {
  if (!BUCKETS.includes(bucket) || !NAMA_AMAN.test(nama)) return null;
  const akar = path.resolve(process.env.UPLOAD_DIR?.trim() || "./data/unggahan");
  const jalur = path.resolve(akar, bucket, nama);
  // Jaring pengaman kedua terhadap path traversal.
  return jalur.startsWith(path.join(akar, bucket) + path.sep) ? jalur : null;
}

/**
 * Simpan satu berkas (menimpa kalau namanya sama) dan kembalikan URL
 * identitasnya; null kalau gagal. Tipe dan ukuran divalidasi pemanggil.
 */
export async function simpanBerkas(
  bucket: string,
  nama: string,
  isi: File | Buffer,
): Promise<string | null> {
  const jalur = jalurBerkas(bucket, nama);
  if (!jalur) return null;
  try {
    await mkdir(path.dirname(jalur), { recursive: true });
    await writeFile(jalur, Buffer.isBuffer(isi) ? isi : Buffer.from(await isi.arrayBuffer()));
    return `${getSiteUrl().replace(/\/+$/, "")}/unggahan/${bucket}/${nama}`;
  } catch (error) {
    console.error(`[storage] gagal menyimpan ${bucket}/${nama}`, error);
    return null;
  }
}

/** Isi berkas; null kalau tidak ada atau namanya tidak aman. */
export async function bacaBerkas(bucket: string, nama: string): Promise<Buffer | null> {
  const jalur = jalurBerkas(bucket, nama);
  if (!jalur) return null;
  try {
    return await readFile(jalur);
  } catch {
    return null;
  }
}

/** Nama berkas bukti dari sebuah URL identitas; null kalau bentuknya bukan itu. */
function namaBukti(url: string): string | null {
  try {
    const { pathname } = new URL(url, getSiteUrl());
    if (!pathname.startsWith(AWALAN_BUKTI)) return null;
    const nama = pathname.slice(AWALAN_BUKTI.length);
    return NAMA_AMAN.test(nama) ? nama : null;
  } catch {
    return null;
  }
}

/** Isi berkas bukti dari proof_url tersimpan, untuk unduhan admin; null kalau berkasnya tidak ada di disk kita. */
export async function bacaBukti(url: string): Promise<{ data: Buffer; ekstensi: string } | null> {
  const nama = namaBukti(url);
  const data = nama ? await bacaBerkas(STORAGE_BUCKET_BUKTI, nama) : null;
  return nama && data ? { data, ekstensi: path.extname(nama).slice(1) || "jpg" } : null;
}

/**
 * Apakah URL ini benar-benar menunjuk berkas bukti DI PENYIMPANAN KITA?
 *
 * Endpoint pembayaran menerima proofUrl berupa teks (jalur JSON untuk integrasi
 * eksternal). Tanpa pemeriksaan ini, siapa pun bisa mengirim tautan gambar acak
 * dari internet, status pembayaran menjadi "submitted", dan slot ikut terkunci
 * sampai 72 jam TANPA pernah membayar apa pun (temuan audit 2026-08-30).
 * Bukti yang sah hanya bisa lahir dari unggahan lewat sistem ini sendiri.
 */
export function isProofUrlMilikKita(url: string): boolean {
  try {
    return new URL(url).host === new URL(getSiteUrl()).host && namaBukti(url) !== null;
  } catch {
    return false;
  }
}

/** Umur URL bertanda tangan: cukup untuk satu sesi memeriksa bukti, tidak permanen. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Tukar proof_url tersimpan menjadi URL yang benar-benar bisa dibuka:
 *  - URL berkas bukti kita -> URL bertanda tangan berumur 1 jam;
 *  - tautan lain (mis. baris lama yang masih menunjuk penyimpanan sebelumnya)
 *    -> diteruskan apa adanya;
 *  - null -> null. Kalau penandatanganan gagal, URL asli dikembalikan supaya
 *    UI tetap merender tautan (walau kemungkinan 403).
 */
export async function resolveProofUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const nama = namaBukti(url);
  if (!nama) return url;

  const kedaluwarsa = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const tanda = await tandaTangan(`berkas:${nama}.${kedaluwarsa}`);
  if (!tanda) return url;
  return `${AWALAN_BUKTI}${nama}?exp=${kedaluwarsa}&sig=${tanda}`;
}

/** Apakah pasangan exp + sig dari URL bertanda tangan sah untuk berkas bukti `nama`? */
export function tandaBuktiSah(nama: string, exp: string | null, sig: string | null): Promise<boolean> {
  return tandaSah(`berkas:${nama}`, Number(exp ?? NaN), sig ?? "");
}
