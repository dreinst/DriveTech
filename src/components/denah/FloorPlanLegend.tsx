import type { ReactNode } from "react";

import { SLOT_SELECTED_STYLE, SLOT_STATUS_STYLE } from "@/lib/domain/constants";
import type { SlotDateVerdict } from "@/lib/domain/ketersediaan";
import { TANK_STYLE } from "@/lib/domain/layout";
import { cn } from "@/lib/utils";

/** Ikon tank mini, memakai warna yang sama dengan gambar tank di denah. */
function TankIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 14" className="h-3.5 w-[30px] shrink-0">
      <rect x="0" y="0" width="22" height="4" rx="2" fill={TANK_STYLE.track} />
      <rect x="0" y="10" width="22" height="4" rx="2" fill={TANK_STYLE.track} />
      <rect
        x="1.5"
        y="2.5"
        width="19"
        height="9"
        rx="3"
        fill={TANK_STYLE.hullFill}
        stroke={TANK_STYLE.hullStroke}
        strokeWidth="1"
      />
      <rect x="10" y="6" width="19" height="2" rx="1" fill={TANK_STYLE.barrel} />
      <circle cx="10" cy="7" r="3.5" fill={TANK_STYLE.turret} />
    </svg>
  );
}

/** Kotak kecil warna status, meniru kotak slot pada denah. */
function Swatch({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-5 shrink-0 rounded-md border-2"
      style={{ backgroundColor: fill, borderColor: stroke }}
    />
  );
}

type LegendRowProps = {
  swatch: ReactNode;
  title: string;
  description?: string;
  count?: number;
  highlighted?: boolean;
};

function LegendRow({ swatch, title, description, count, highlighted = false }: LegendRowProps) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5",
        highlighted ? "border-accent bg-accent-soft" : "border-line bg-surface-2",
      )}
    >
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
      {typeof count === "number" ? (
        <span className="tabular shrink-0 text-sm font-semibold text-ink">{count}</span>
      ) : null}
    </li>
  );
}

export type FloorPlanLegendProps = {
  className?: string;
  /**
   * Hitungan live per verdict ketersediaan LINTAS seluruh tanggal gelaran
   * mendatang (slot bookable saja). Kosongkan untuk tanpa angka.
   */
  counts?: Partial<Record<SlotDateVerdict, number>>;
};

/**
 * Legenda status denah ala panel mockup — model per tanggal, alur "slot dulu,
 * tanggal belakangan": tiga verdict slot LINTAS tanggal gelaran mendatang
 * (dengan hitungan live bila tersedia), status "Dipilih" disorot aksen oranye,
 * satu item netral untuk slot yang diblokir panitia + fasilitas & warung,
 * dan ikon tank display. Aksen per zona sengaja tidak dilegendakan — nama zona
 * sudah tertulis di denahnya sendiri.
 */
export function FloorPlanLegend({ className, counts }: FloorPlanLegendProps) {
  const facility = SLOT_STATUS_STYLE.facility;

  return (
    <ul className={cn("space-y-1", className)}>
      <LegendRow
        swatch={<Swatch fill={SLOT_STATUS_STYLE.available.fill} stroke={SLOT_STATUS_STYLE.available.stroke} />}
        title="Tersedia"
        description="Masih ada tanggal kosong"
        count={counts?.available}
      />
      <LegendRow
        swatch={<Swatch fill={SLOT_STATUS_STYLE.pending.fill} stroke={SLOT_STATUS_STYLE.pending.stroke} />}
        title="Tertunda"
        description="Menunggu pembayaran (semua tanggal)"
        count={counts?.pending}
      />
      <LegendRow
        swatch={<Swatch fill={SLOT_STATUS_STYLE.confirmed.fill} stroke={SLOT_STATUS_STYLE.confirmed.stroke} />}
        title="Terisi"
        description="Penuh di semua tanggal"
        count={counts?.confirmed}
      />
      <LegendRow
        swatch={<Swatch fill={SLOT_SELECTED_STYLE.fill} stroke={SLOT_SELECTED_STYLE.stroke} />}
        title="Dipilih"
        description="Sedang dilihat"
        highlighted
      />
      <LegendRow
        swatch={<Swatch fill={facility.fill} stroke={facility.stroke} />}
        title="Diblokir / fasilitas"
        description="Ditutup panitia atau tidak disewakan online"
        count={counts?.blocked}
      />
      <LegendRow swatch={<TankIcon />} title="Tank display Kostrad" />
    </ul>
  );
}
