import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatCardTone = "slate" | "green" | "amber" | "red" | "blue";

/** Warna keping ikon per nada. Kartunya sendiri tetap gelap bg-card ala mockup;
 *  nada netral ikut aksen oranye seperti referensi Stitch. */
const CHIP_CLASS: Record<StatCardTone, string> = {
  slate: "bg-accent-soft text-accent",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  blue: "bg-accent-soft text-accent",
};

/** Aksen bingkai tipis untuk nada yang butuh perhatian. */
const BORDER_CLASS: Record<StatCardTone, string> = {
  slate: "border-line",
  green: "border-line",
  amber: "border-warn/40",
  red: "border-danger/40",
  blue: "border-line",
};

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatCardTone;
  /** Ikon kecil di keping kiri atas (SVG inline). */
  icon?: ReactNode;
  /** 0-100: menampilkan bar progres tipis di bawah nilai (dipakai kartu okupansi). */
  progressPct?: number;
};

/** Kartu angka ringkas ala mockup dasbor (server-safe, tanpa "use client"). */
export function StatCard({ label, value, hint, tone = "slate", icon, progressPct }: StatCardProps) {
  const pct =
    typeof progressPct === "number" ? Math.max(0, Math.min(100, Math.round(progressPct))) : null;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]",
        BORDER_CLASS[tone],
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)]",
            CHIP_CLASS[tone],
          )}
        >
          {icon}
        </span>
      ) : null}

      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-3xl">
        {value}
      </p>

      {pct !== null ? (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3"
          role="img"
          aria-label={`${pct}% dari kapasitas`}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
