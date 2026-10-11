/**
 * Tanda tangan HMAC-SHA256 (rahasia AUTH_SECRET) untuk cookie sesi admin dan
 * URL berkas bukti. Memakai Web Crypto supaya bisa jalan di middleware (edge
 * runtime) maupun di server Node. Tanpa AUTH_SECRET semua verifikasi gagal
 * (fail closed).
 */

export const SESI_COOKIE = "drivetech_sesi";

/** Umur sesi admin: 12 jam. */
export const SESI_UMUR_DETIK = 12 * 60 * 60;

export function isAuthConfigured(): boolean {
  return (process.env.AUTH_SECRET ?? "").length >= 16;
}

/** HMAC-SHA256 dari `data` dalam base64url; null kalau AUTH_SECRET belum diisi. */
export async function tandaTangan(data: string): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  const enc = new TextEncoder();
  const kunci = await crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", kunci, enc.encode(data)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Bandingkan dua string tanpa berhenti di karakter pertama yang beda. */
function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i += 1) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

/**
 * Apakah `tanda` adalah tanda tangan sah untuk `data` dan `kedaluwarsa`
 * (detik epoch) belum lewat?
 */
export async function tandaSah(data: string, kedaluwarsa: number, tanda: string): Promise<boolean> {
  if (!Number.isFinite(kedaluwarsa) || kedaluwarsa * 1000 <= Date.now()) return false;
  const harapan = await tandaTangan(`${data}.${kedaluwarsa}`);
  return harapan !== null && samaAman(harapan, tanda);
}

/** Isi cookie sesi: "<id admin>.<kedaluwarsa>.<tanda tangan>"; null tanpa AUTH_SECRET. */
export async function buatSesi(adminId: string): Promise<string | null> {
  const kedaluwarsa = Math.floor(Date.now() / 1000) + SESI_UMUR_DETIK;
  const tanda = await tandaTangan(`sesi:${adminId}.${kedaluwarsa}`);
  return tanda === null ? null : `${adminId}.${kedaluwarsa}.${tanda}`;
}

/** Id admin dari cookie sesi yang tanda tangannya sah dan belum kedaluwarsa; selain itu null. */
export async function bacaSesi(cookie: string | undefined): Promise<string | null> {
  const [adminId, kedaluwarsa, tanda, ...sisa] = (cookie ?? "").split(".");
  if (!adminId || !kedaluwarsa || !tanda || sisa.length > 0) return null;
  return (await tandaSah(`sesi:${adminId}`, Number(kedaluwarsa), tanda)) ? adminId : null;
}
