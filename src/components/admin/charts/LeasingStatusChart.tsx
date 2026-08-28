"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { LeasingStatus } from "@/lib/types/database";
import {
  AXIS_TICK,
  CHART_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

export type LeasingStatusDatum = {
  status: LeasingStatus;
  /** Label Indonesia siap tampil (dipetakan di server dari LEASING_STATUS_LABEL). */
  label: string;
  jumlah: number;
};

/** Warna batang per status — semuanya token (accent, ok, warn, subtle). */
const STATUS_COLOR: Record<LeasingStatus, string> = {
  submitted: CHART_COLOR.warn,
  verifying: CHART_COLOR.accent,
  approved: CHART_COLOR.ok,
  rejected: CHART_COLOR.subtle,
  completed: CHART_COLOR.ok,
};

/** Jumlah pengajuan leasing per status. */
export function LeasingStatusChart({ data }: { data: LeasingStatusDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLOR.line} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-18}
          height={48}
          textAnchor="end"
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--accent-soft)" }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Bar
          dataKey="jumlah"
          name="Pengajuan"
          isAnimationActive={false}
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
        >
          {data.map((titik) => (
            <Cell key={titik.status} fill={STATUS_COLOR[titik.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
