"use client";

import { useMemo } from "react";

import { FloorPlan } from "@/components/denah/FloorPlan";
import { useMapViewport } from "@/components/denah/useMapViewport";
import { useRealtimeSlots } from "@/components/denah/useRealtimeSlots";
import { ZoomControls } from "@/components/denah/ZoomControls";
import {
  slotStatusAcrossDates,
  type OccupancyRow,
  type SlotDateVerdict,
} from "@/lib/domain/ketersediaan";
import type { ZoneWithSlots } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export type DenahViewerProps = {
  zones: ZoneWithSlots[];
  /** Tanggal gelaran aktif >= hari ini (ISO, urut naik) untuk verdict warna. */
  activeDates: string[];
  occupancy: OccupancyRow[];
  className?: string;
};

/**
 * Denah LENGKAP untuk khalayak umum (halaman /denah): bebas zoom, geser, dan
 * pinch supaya tata letak & urutan slot bisa dipelajari — tetapi TANPA
 * onSelectSlot, jadi tidak ada slot yang bisa diklik dan tidak ada pemesanan
 * dari sini. Pemesanan hanya lewat alur per zona di beranda, yang petanya
 * terkunci pada zona terpilih. Warna status ikut realtime bila terhubung.
 */
export function DenahViewer({
  zones: initialZones,
  activeDates,
  occupancy: initialOccupancy,
  className,
}: DenahViewerProps) {
  const { zones, occupancy, connected } = useRealtimeSlots(initialZones, initialOccupancy);
  const { containerRef, contentRef, containerHandlers, zoomIn, zoomOut, reset } = useMapViewport();

  // Verdict lintas tanggal yang sama dengan peta booking, supaya warna slot
  // di kedua tempat tidak saling bertentangan.
  const verdicts = useMemo(() => {
    const map = new Map<string, SlotDateVerdict>();
    for (const zone of zones) {
      for (const slot of zone.slots) {
        map.set(
          slot.id,
          slotStatusAcrossDates({ slot, zoneType: zone.zone_type, activeDates, occupancy }),
        );
      }
    }
    return map;
  }, [zones, activeDates, occupancy]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-map-canvas shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <div
        ref={containerRef}
        {...containerHandlers}
        className="relative h-[26rem] w-full cursor-grab select-none active:cursor-grabbing sm:h-[34rem] lg:h-[calc(100vh-10rem)] lg:max-h-[50rem] lg:min-h-[36rem]"
      >
        <div ref={contentRef} className="absolute inset-0">
          <FloorPlan zones={zones} verdicts={verdicts} />
        </div>
      </div>

      <p className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs font-medium text-muted shadow-[var(--shadow-sm)] backdrop-blur">
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            connected ? "animate-pulse bg-ok" : "bg-line-strong",
          )}
        />
        {connected ? "Live" : "Statis"} &middot; hanya melihat
      </p>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={reset} />
    </div>
  );
}
