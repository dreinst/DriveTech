/**
 * Util tanggal kecil untuk alur booking per tanggal (model Drive Tech).
 * Modul MURNI (tanpa Supabase/DOM) sehingga aman diimpor server maupun client.
 */

const TANGGAL_POLOS = /^\d{4}-\d{2}-\d{2}$/;

/** Parse "YYYY-MM-DD" sebagai waktu lokal (hindari geser hari akibat UTC). */
function keDate(tanggal: string): Date | null {
  if (!TANGGAL_POLOS.test(tanggal)) return null;
  const parsed = new Date(`${tanggal}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const formatterPendek = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Sab, 29 Agu" — untuk chip tanggal yang ringkas. */
export function formatTanggalPendek(tanggal: string): string {
  const date = keDate(tanggal);
  return date ? formatterPendek.format(date) : tanggal;
}

/**
 * Baca searchParams "tanggal" (CSV ISO, mis. "2026-08-29,2026-08-30") menjadi
 * array "YYYY-MM-DD" unik & urut naik. Nilai tak valid dibuang diam-diam —
 * halaman yang memanggil bertanggung jawab memvalidasi terhadap event_dates.
 */
export function parseTanggalCsv(raw: string | string[] | undefined): string[] {
  const teks = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const hasil = new Set<string>();
  for (const bagian of teks.split(",")) {
    const t = bagian.trim();
    if (TANGGAL_POLOS.test(t)) hasil.add(t);
  }
  return Array.from(hasil).sort();
}
