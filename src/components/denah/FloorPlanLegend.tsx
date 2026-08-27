import { SLOT_STATUS_STYLE } from "@/lib/domain/constants";
import { SLOT_LEGEND_LABEL } from "@/lib/domain/labels";
import { FLOOR_PLAN_ZONES } from "@/lib/domain/layout";
import type { SlotStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const LEGEND_ORDER: Array<SlotStatus | "facility"> = [
  "available",
  "pending",
  "confirmed",
  "facility",
];

export type FloorPlanLegendProps = {
  className?: string;
};

/** Legenda denah: warna status kotak slot + warna aksen tiap zona. */
export function FloorPlanLegend({ className }: FloorPlanLegendProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">Status slot</p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {LEGEND_ORDER.map((status) => {
            const style = SLOT_STATUS_STYLE[status];
            return (
              <li key={status} className="flex items-center gap-1.5 text-xs text-slate-700">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 rounded-[3px] border"
                  style={{ backgroundColor: style.fill, borderColor: style.stroke }}
                />
                {SLOT_LEGEND_LABEL[status]}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">Warna zona</p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {FLOOR_PLAN_ZONES.map((zone) => (
            <li
              key={zone.svgGroupId}
              className="flex items-center gap-1.5 text-[11px] text-slate-600"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-6 shrink-0 rounded-full"
                style={{ backgroundColor: zone.accent }}
              />
              {zone.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
