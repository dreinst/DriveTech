/**
 * URL publik situs, tahan terhadap env kosong.
 *
 * `NEXT_PUBLIC_SITE_URL ?? fallback` saja tidak cukup: di Vercel variabel bisa
 * ada tapi berisi string kosong, dan `new URL("")` meledakkan build
 * (ERR_INVALID_URL saat collect page data). Urutan resolusi:
 *   1. NEXT_PUBLIC_SITE_URL (di-trim; kosong = dianggap tidak ada)
 *   2. VERCEL_URL (diset otomatis oleh Vercel, tanpa protokol)
 *   3. http://localhost:3001 (dev lokal)
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3001";
}
