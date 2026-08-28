import { cn } from "@/lib/utils";

/**
 * Chip tanggal sewa booking (model per tanggal) untuk panel admin.
 * Server-safe: tanpa "use client", murni render.
 */

/** "Sab 30 Agu" — kunci "YYYY-MM-DD" dibaca sebagai UTC supaya tidak bergeser hari. */
const chipFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Sabtu, 30 Agustus 2026" — untuk atribut title / aria. */
const panjangFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function keDate(tanggal: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const date = new Date(`${tanggal}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sab 30 Agu" — fallback ke string mentah kalau formatnya tak dikenal. */
export function formatTanggalChip(tanggal: string): string {
  const date = keDate(tanggal);
  return date ? chipFormatter.format(date) : tanggal;
}

/** "Sabtu, 30 Agustus 2026" — fallback ke string mentah. */
export function formatTanggalPanjang(tanggal: string): string {
  const date = keDate(tanggal);
  return date ? panjangFormatter.format(date) : tanggal;
}

/**
 * Ringkasan satu baris teks: "Sab 30 Agu · Min 31 Agu" (maks `max` tanggal,
 * sisanya jadi "+N"). Dipakai sel tabel yang sempit.
 */
export function ringkasTanggal(dates: string[], max = 3): string {
  if (dates.length === 0) return "—";
  const tampil = dates.slice(0, max).map(formatTanggalChip);
  const sisa = dates.length - tampil.length;
  return sisa > 0 ? `${tampil.join(" · ")} +${sisa}` : tampil.join(" · ");
}

export type BookingDateChipsProps = {
  /** Tanggal "YYYY-MM-DD" urut naik (BookingDetail.dates). */
  dates: string[];
  /** Batas chip yang dirender; sisanya diringkas jadi "+N". */
  max?: number;
  className?: string;
};

/** Deret pil kecil berisi tanggal sewa; kosong -> tanda "—". */
export function BookingDateChips({ dates, max = 4, className }: BookingDateChipsProps) {
  if (dates.length === 0) {
    return <span className="text-xs text-subtle">—</span>;
  }

  const tampil = dates.slice(0, max);
  const sisa = dates.length - tampil.length;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {tampil.map((tanggal) => (
        <span
          key={tanggal}
          title={formatTanggalPanjang(tanggal)}
          className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-surface-3 px-2 py-0.5 text-[11px] font-medium leading-4 text-muted"
        >
          {formatTanggalChip(tanggal)}
        </span>
      ))}
      {sisa > 0 ? (
        <span
          title={dates.slice(max).map(formatTanggalPanjang).join(", ")}
          className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-surface-3 px-2 py-0.5 text-[11px] font-medium leading-4 text-muted"
        >
          +{sisa}
        </span>
      ) : null}
    </span>
  );
}
