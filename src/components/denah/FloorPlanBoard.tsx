"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { FloorPlan, type SelectedSlotPayload } from "@/components/denah/FloorPlan";
import { FloorPlanLegend } from "@/components/denah/FloorPlanLegend";
import { SlotSuggestions } from "@/components/denah/SlotSuggestions";
import { useRealtimeSlots } from "@/components/denah/useRealtimeSlots";
import { buttonClass } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { suggestAlternatives } from "@/lib/domain/suggestions";
import type { SlotDetail, ZoneWithSlots } from "@/lib/types/database";
import { cn, formatRupiah, slotDisplayName } from "@/lib/utils";

export type FloorPlanBoardProps = {
  zones: ZoneWithSlots[];
  /** True kalau data berasal dari fallback layout (database belum terhubung). */
  isFallback?: boolean;
  className?: string;
};

const SUGGESTION_LIMIT = 5;

function RealtimeIndicator({
  connected,
  lastUpdatedAt,
}: {
  connected: boolean;
  lastUpdatedAt: Date | null;
}) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-500">
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          connected ? "bg-green-500" : "bg-slate-300",
        )}
      />
      {connected ? "Realtime aktif" : "Realtime nonaktif"}
      {lastUpdatedAt ? (
        <span className="text-slate-400">
          &middot; diperbarui {lastUpdatedAt.toLocaleTimeString("id-ID")}
        </span>
      ) : null}
    </p>
  );
}

/** Denah + legenda + panel detail slot terpilih, tersinkron realtime dengan tabel slots. */
export function FloorPlanBoard({ zones: initialZones, isFallback = false, className }: FloorPlanBoardProps) {
  const { zones, connected, lastUpdatedAt } = useRealtimeSlots(initialZones);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const handleSelectSlot = useCallback((slot: SelectedSlotPayload) => {
    setSelectedSlotId(slot.id);
  }, []);

  const selected = useMemo(() => {
    if (!selectedSlotId) return null;
    for (const zone of zones) {
      const slot = zone.slots.find((item) => item.id === selectedSlotId);
      if (slot) return { slot, zone };
    }
    return null;
  }, [zones, selectedSlotId]);

  // Semua slot dalam bentuk SlotDetail, dipakai fungsi murni suggestAlternatives().
  const allSlots = useMemo<SlotDetail[]>(
    () => zones.flatMap((zone) => zone.slots.map((slot) => ({ ...slot, zone }))),
    [zones],
  );

  const suggestions = useMemo<SlotDetail[]>(() => {
    if (!selected || selected.slot.status === "available") return [];
    return suggestAlternatives({
      target: { ...selected.slot, zone: selected.zone },
      allSlots,
      limit: SUGGESTION_LIMIT,
    });
  }, [selected, allSlots]);

  const canBook = selected !== null && selected.slot.status === "available" && !isFallback;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FloorPlanLegend className="min-w-[220px] flex-1" />
        <RealtimeIndicator connected={connected} lastUpdatedAt={lastUpdatedAt} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-4">
        <FloorPlan
          zones={zones}
          selectedSlotId={selectedSlotId}
          onSelectSlot={handleSelectSlot}
        />
        {/*
          Tanpa JavaScript, denah interaktif di atas tidak dirender sama sekali.
          public/denah.svg adalah denah statis dengan geometri yang sama (dihasilkan
          tools/generate-denah-svg.py dari koordinat yang sama dengan domain/layout.ts),
          jadi pengunjung tetap bisa melihat tata letak lokasi. Statusnya tidak live.
        */}
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/denah.svg"
            alt="Denah lokasi pameran: tenda mobil baru, area pameran mobil, area mobil & motor, area UMKM, warung, dan fasilitas umum."
            className="mx-auto block w-full max-w-3xl"
          />
          <p className="mt-2 text-center text-xs text-slate-500">
            Denah statis. Aktifkan JavaScript untuk melihat status ketersediaan slot secara
            langsung dan memesan lapak.
          </p>
        </noscript>
      </div>

      {selected === null ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center">
          <p className="text-sm font-medium text-slate-900">Belum ada slot yang dipilih</p>
          <p className="mt-1 text-xs text-slate-500">
            Ketuk salah satu kotak pada denah untuk melihat detail slot, biaya admin, dan tombol
            pemesanan. Kotak abu-abu adalah fasilitas umum yang tidak disewakan.
          </p>
        </div>
      ) : (
        <>
          {/* Di layar kecil panel jadi lembar bawah (bottom sheet) sederhana. */}
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl md:static md:z-auto md:max-h-none md:rounded-xl md:border md:shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {selected.zone.name} &middot; {ZONE_TYPE_LABEL[selected.zone.zone_type]}
                </p>
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {slotDisplayName(selected.slot)}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={selected.slot.status} kind="slot" />
                <button
                  type="button"
                  onClick={() => setSelectedSlotId(null)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  Tutup
                </button>
              </div>
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-slate-500">Biaya admin</dt>
                <dd className="font-semibold text-slate-900">
                  {formatRupiah(selected.zone.admin_fee)}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-slate-500">Kode denah</dt>
                <dd className="font-mono text-xs text-slate-700">
                  {selected.slot.svg_element_id ?? "-"}
                </dd>
              </div>
            </dl>

            {isFallback ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Denah ini masih contoh karena database belum terhubung, jadi pemesanan belum bisa
                diproses.
              </p>
            ) : canBook ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/booking/${selected.slot.id}`} className={buttonClass("primary", "md")}>
                  Booking Slot Ini
                </Link>
                <Link href={`/beli/${selected.slot.id}`} className={buttonClass("secondary", "md")}>
                  Beli Unit di Slot Ini
                </Link>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-600">
                  Slot ini tidak tersedia. Berikut slot lain yang masih kosong:
                </p>
                <SlotSuggestions suggestions={suggestions} />
              </div>
            )}
          </div>

          {/* Ruang kosong supaya konten tidak tertutup lembar bawah di layar kecil. */}
          <div aria-hidden="true" className="h-64 md:hidden" />
        </>
      )}
    </div>
  );
}
