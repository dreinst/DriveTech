"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { PaymentMethod } from "@/lib/types/database";
import { ChartLegend } from "./ChartLegend";
import {
  CHART_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

export type MetodePembayaranDatum = {
  metode: PaymentMethod;
  /** Label Indonesia siap tampil (dipetakan di server dari PAYMENT_METHOD_LABEL). */
  label: string;
  jumlah: number;
};

const METHOD_COLOR: Record<PaymentMethod, string> = {
  transfer: CHART_COLOR.accent,
  cash: CHART_COLOR.ok,
};

/** Donat kecil: perbandingan pembayaran biaya admin tunai vs transfer. */
export function MetodePembayaranChart({ data }: { data: MetodePembayaranDatum[] }) {
  const total = data.reduce((jumlah, titik) => jumlah + titik.jumlah, 0);

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Pie
              data={data}
              dataKey="jumlah"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((titik) => (
                <Cell key={titik.metode} fill={METHOD_COLOR[titik.metode]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Angka total di tengah donat. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="tabular text-2xl font-semibold tracking-[-0.01em] text-ink">
            {total}
          </span>
          <span className="text-xs text-subtle">pembayaran</span>
        </div>
      </div>

      <ChartLegend
        items={data.map((titik) => ({
          label: `${titik.label} (${titik.jumlah})`,
          color: METHOD_COLOR[titik.metode],
        }))}
      />
    </div>
  );
}
