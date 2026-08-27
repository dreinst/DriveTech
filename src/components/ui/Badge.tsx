import type { ReactNode } from "react";

export type BadgeTone = "green" | "amber" | "red" | "slate" | "blue";

const TONE_CLASS: Record<BadgeTone, string> = {
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
};

/** Label kecil berwarna untuk status, kategori, atau penanda singkat. */
export function Badge({ tone = "slate", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5 ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
