import type { CSSProperties } from "react";

/**
 * Tema bersama semua chart Recharts di panel admin (kartu gelap).
 * SEMUA warna diambil dari token desain (globals.css) — satu-satunya
 * pengecualian: hex literal di defs gradien fade oranye milik tiap chart.
 */

export const CHART_COLOR = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  subtle: "var(--subtle)",
  line: "var(--line)",
  lineStrong: "var(--line-strong)",
  muted: "var(--muted)",
  ink: "var(--ink)",
} as const;

/** Properti tick sumbu yang konsisten. */
export const AXIS_TICK = { fill: "var(--subtle)", fontSize: 12 } as const;

/** Gaya kotak tooltip ala kartu kecil. */
export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--shadow-md)",
  fontSize: "0.8125rem",
  color: "var(--ink)",
  padding: "0.5rem 0.75rem",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--ink)",
  fontWeight: 600,
  marginBottom: "0.125rem",
};

export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "var(--muted)",
  padding: 0,
};

export type LegendItem = { label: string; color: string };
