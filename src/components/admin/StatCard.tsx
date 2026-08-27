import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatCardTone = "slate" | "green" | "amber" | "red" | "blue";

const TONE_CLASS: Record<StatCardTone, string> = {
  slate: "border-slate-200",
  green: "border-green-200 bg-green-50/40",
  amber: "border-amber-200 bg-amber-50/50",
  red: "border-red-200 bg-red-50/40",
  blue: "border-blue-200 bg-blue-50/40",
};

const VALUE_CLASS: Record<StatCardTone, string> = {
  slate: "text-slate-900",
  green: "text-green-700",
  amber: "text-amber-700",
  red: "text-red-700",
  blue: "text-blue-700",
};

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatCardTone;
};

/** Kartu angka ringkas untuk dashboard admin (server-safe, tanpa "use client"). */
export function StatCard({ label, value, hint, tone = "slate" }: StatCardProps) {
  return (
    <div className={cn("rounded-xl border bg-white p-4 shadow-sm", TONE_CLASS[tone])}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums leading-tight", VALUE_CLASS[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
