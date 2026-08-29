/** Penggabung className sederhana (tanpa clsx / tailwind-merge). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Hanya izinkan tujuan redirect internal (anti open-redirect) untuk parameter
 * `next` di alur login admin. Backslash ditolak: browser menormalkan `\` jadi
 * `/`, sehingga `/\evil.com` berubah menjadi `//evil.com` (protocol-relative).
 */
export function tujuanAdminAman(next: string | string[] | undefined): string {
  const nilai = Array.isArray(next) ? next[0] : next;
  if (
    typeof nilai === "string" &&
    nilai.startsWith("/") &&
    !nilai.startsWith("//") &&
    !nilai.includes("\\")
  ) {
    return nilai;
  }
  return "/admin";
}

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "Rp2.500.000" — nilai kosong jadi "Rp0". */
export function formatRupiah(n: number | null | undefined): string {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return rupiahFormatter.format(value);
}

/** Terima Date, ISO string, atau tanggal polos "2026-09-12" (dibaca sebagai waktu lokal). */
function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * timeZone WAJIB Asia/Jakarta: di Vercel server berjalan di UTC, tanpa ini
 * jam tampil mundur 7 jam (temuan audit 2026-08-29). Tanggal polos
 * "YYYY-MM-DD" tetap aman: diparse sebagai 00:00 lokal lalu diformat WIB.
 */
const tanggalFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const tanggalWaktuFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12 September 2026" */
export function formatTanggal(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? tanggalFormatter.format(date) : "-";
}

/** "12 September 2026, 14.05" */
export function formatTanggalWaktu(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? tanggalWaktuFormatter.format(date) : "-";
}

/**
 * Nama tampilan slot: pakai slot_label kalau ada ("Warmindo", "Warung 3"),
 * selain itu nomor ("Slot 07").
 *
 * Label diprioritaskan supaya nama lapak sama persis dengan yang tertulis di denah;
 * kalau nomor didahulukan, unit warung bernomor tampil "Slot 03" di halaman booking
 * tapi "Warung 3" di denah.
 */
export function slotDisplayName(
  slot: { slot_number: number | null; slot_label: string | null } | null | undefined,
): string {
  if (!slot) return "Slot";
  if (slot.slot_label && slot.slot_label.trim().length > 0) return slot.slot_label;
  if (typeof slot.slot_number === "number") {
    return `Slot ${String(slot.slot_number).padStart(2, "0")}`;
  }
  return "Slot";
}
