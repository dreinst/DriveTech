"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_TICK,
  CHART_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

export type BookingHarianDatum = {
  /** Label tanggal siap tampil, mis. "27 Agu". */
  label: string;
  jumlah: number;
};

/**
 * Tren jumlah booking per hari (dari created_at, dikelompokkan di server).
 * Titik data sedikit itu wajar untuk event baru: dot selalu digambar supaya
 * 1-2 titik pun tetap terlihat.
 */
export function BookingHarianChart({ data }: { data: BookingHarianDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          {/* Gradien fade oranye ala referensi Stitch — hex literal hanya di defs ini. */}
          <linearGradient id="isian-booking-harian" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff7b00" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#ff7b00" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_COLOR.line} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ stroke: CHART_COLOR.lineStrong, strokeDasharray: "3 3" }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Area
          type="monotone"
          dataKey="jumlah"
          name="Booking"
          stroke={CHART_COLOR.accent}
          strokeWidth={2}
          fill="url(#isian-booking-harian)"
          dot={{ r: 3, fill: CHART_COLOR.accent, strokeWidth: 0 }}
          activeDot={{ r: 4.5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
