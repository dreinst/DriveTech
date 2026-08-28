import type { ReactNode } from "react";

export type BadgeTone = "green" | "amber" | "red" | "slate" | "blue";

const TONE_CLASS: Record<BadgeTone, string> = {
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  slate: "bg-surface-3 text-muted",
  blue: "bg-accent-soft text-accent",
};

export type BadgeProps = {
  tone?: BadgeTone;
  /** Tampilkan titik bulat kecil di depan teks (dipakai badge status). */
  dot?: boolean;
  children: ReactNode;
};

/** Pil kecil untuk status, kategori, atau penanda singkat. */
export function Badge({ tone = "slate", dot = false, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ${TONE_CLASS[tone]}`}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
