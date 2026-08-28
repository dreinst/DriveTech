"use client";

import type { LegendItem } from "./theme";

/** Legenda kecil di bawah chart: titik warna + label, gaya caption. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
