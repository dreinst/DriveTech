"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartLegend } from "./ChartLegend";
import {
  AXIS_TICK,
  CHART_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

export type OkupansiZonaDatum = {
  zona: string;
  terisi: number;
  menunggu: number;
  tersedia: number;
  /** Slot yang ditutup panitia untuk semua tanggal (slots.status != 'available'). */
  diblokir: number;
};

/**
 * Bar mendatar bertumpuk per zona bookable: terisi vs menunggu vs tersedia vs
 * diblokir panitia — okupansi dihitung untuk satu tanggal gelaran (per tanggal).
 * Layout mendatar dipilih supaya nama zona panjang tetap terbaca di 375px.
 */
/** Putih transparan untuk segmen "tersedia" di kartu gelap (spesifikasi tema). */
const WARNA_TERSEDIA = "rgba(255,255,255,0.14)";

export function OkupansiZonaChart({ data }: { data: OkupansiZonaDatum[] }) {
  // Tinggi mengikuti jumlah zona supaya 1-2 baris pun tetap proporsional.
  const tinggi = Math.max(140, data.length * 52 + 40);

  return (
    <div>
      <ResponsiveContainer width="100%" height={tinggi}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART_COLOR.line} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="zona"
            width={128}
            tick={{ ...AXIS_TICK, fill: "var(--muted)" }}
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
            dataKey="terisi"
            name="Terisi"
            stackId="okupansi"
            fill={CHART_COLOR.accent}
            isAnimationActive={false}
            barSize={16}
          />
          <Bar
            dataKey="menunggu"
            name="Menunggu Pembayaran"
            stackId="okupansi"
            fill={CHART_COLOR.warn}
            isAnimationActive={false}
            barSize={16}
          />
          <Bar
            dataKey="tersedia"
            name="Tersedia"
            stackId="okupansi"
            fill={WARNA_TERSEDIA}
            isAnimationActive={false}
            barSize={16}
          />
          <Bar
            dataKey="diblokir"
            name="Diblokir"
            stackId="okupansi"
            fill={CHART_COLOR.subtle}
            isAnimationActive={false}
            barSize={16}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: "Terisi", color: CHART_COLOR.accent },
          { label: "Menunggu Pembayaran", color: CHART_COLOR.warn },
          { label: "Tersedia", color: WARNA_TERSEDIA },
          { label: "Diblokir", color: CHART_COLOR.subtle },
        ]}
      />
    </div>
  );
}
