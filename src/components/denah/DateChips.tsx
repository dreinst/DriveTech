"use client";

import { formatTanggalPendek } from "@/app/booking/_components/tanggal";
import { cn, formatTanggal } from "@/lib/utils";

/** Status satu tanggal untuk slot yang sedang dilihat (lihat dateStatusForSlot). */
export type DateChipStatus = "free" | "pending" | "confirmed";

/** Label kecil pada chip yang tidak bisa dipilih. */
const TAKEN_LABEL: Record<Exclude<DateChipStatus, "free">, string> = {
  pending: "Tertunda",
  confirmed: "Terisi",
};

export type DateChipsProps = {
  /** Tanggal gelaran aktif mendatang ("YYYY-MM-DD", urut naik). */
  dates: string[];
  /** Status per tanggal untuk slot ini — chip non-"free" dinonaktifkan. */
  statusFor: (iso: string) => DateChipStatus;
  /** Tanggal yang sedang terpilih (subset tanggal "free"). */
  selected: string[];
  onToggle: (iso: string) => void;
  className?: string;
};

/**
 * Chip tanggal SADAR-SLOT (model "slot dulu, tanggal belakangan") — dipakai
 * panel detail slot di denah dan formulir /booking/[slotId]:
 *   - tanggal bebas  : bisa dipilih (multi-select), pil oranye teks gelap saat terpilih;
 *   - tanggal terisi : dinonaktifkan dengan label kecil "Tertunda"/"Terisi".
 * Sumber kebenaran terakhir tetap validasi server createBooking (DATE_TAKEN).
 */
export function DateChips({ dates, statusFor, selected, onToggle, className }: DateChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {dates.map((iso) => {
        const status = statusFor(iso);
        const terisi = status !== "free";
        const aktif = !terisi && selected.includes(iso);
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onToggle(iso)}
            disabled={terisi}
            aria-pressed={terisi ? undefined : aktif}
            title={formatTanggal(iso)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
              terisi
                ? "cursor-not-allowed border-line bg-surface-2 text-subtle"
                : aktif
                  ? "border-accent bg-accent text-app"
                  : "border-line bg-card text-ink hover:border-accent",
            )}
          >
            <span className="tabular leading-tight">{formatTanggalPendek(iso)}</span>
            {terisi ? (
              <span className="text-[0.6875rem] font-medium leading-tight">
                {TAKEN_LABEL[status]}
                <span className="sr-only"> — sudah dipesan untuk slot ini</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
