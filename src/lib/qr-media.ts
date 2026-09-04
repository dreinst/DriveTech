/**
 * Konstanta QR "masuk situs" — AMAN dipakai di client maupun server (tanpa
 * dependency Node). Generator SVG-nya ada di lib/qr-brand.ts (server-only).
 *
 * Alur: QR berisi `${siteUrl}/go?dari=<slug>`. Halaman /go mencatat scan per
 * media lalu memutar animasi mobil sebelum masuk beranda. Satu QR untuk satu
 * media supaya panitia tahu media mana yang paling banyak di-scan.
 */

/** Slug media: huruf kecil/angka/strip, 1–32 karakter, tidak diawali/diakhiri strip. */
export const QR_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** Slug yang dicatat saat /go dibuka tanpa parameter (mis. diketik manual). */
export const QR_MEDIA_TANPA_PARAM = "langsung";

/** Slug khusus tautan uji dari panel admin — dipisahkan agar statistik media asli tidak tercemar. */
export const QR_MEDIA_UJI = "uji-admin";

export type QrMediaPreset = {
  slug: string;
  label: string;
  /** Saran ukuran cetak / pemakaian. */
  hint: string;
};

/**
 * Media yang umum dipakai panitia. Aturan praktis ukuran QR cetak:
 * sisi QR >= jarak scan / 10 (spanduk dilihat dari 2,5 m -> QR >= 25 cm).
 */
export const QR_MEDIA_PRESETS: readonly QrMediaPreset[] = [
  { slug: "spanduk", label: "Spanduk / Banner", hint: "Dilihat dari 2–3 m — cetak QR minimal 25–30 cm." },
  { slug: "flyer", label: "Flyer / Brosur", hint: "Dipegang tangan — QR minimal 2,5 cm dengan tepi putih." },
  { slug: "poster", label: "Poster", hint: "Dilihat dari ±1 m — QR minimal 10 cm." },
  { slug: "led", label: "Layar LED lokasi", hint: "Tampilkan besar dan kontras; boleh dianimasikan bingkainya, modul QR-nya jangan." },
  { slug: "instagram", label: "Instagram / Story", hint: "Pakai PNG 1024 px agar tetap tajam saat dikompresi." },
  { slug: "whatsapp", label: "WhatsApp broadcast", hint: "Kirim sebagai gambar PNG, bukan dokumen SVG." },
  { slug: "kartu-nama", label: "Kartu nama / Stiker", hint: "QR minimal 2 cm, jangan sampai terpotong lipatan." },
];

/** Path relatif halaman splash untuk sebuah media. */
export function goPath(slug: string): string {
  return `/go?dari=${encodeURIComponent(slug)}`;
}

/** URL lengkap yang di-encode ke dalam QR. */
export function goUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${goPath(slug)}`;
}

/** Rapikan input bebas admin menjadi slug (huruf kecil, spasi -> strip). */
export function rapikanSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
