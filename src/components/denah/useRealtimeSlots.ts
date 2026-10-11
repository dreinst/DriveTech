"use client";

import { useCallback, useEffect, useState } from "react";

import type { OccupancyRow } from "@/lib/domain/ketersediaan";
import type { SlotStatus, ZoneWithSlots } from "@/lib/types/database";

export type UseRealtimeSlotsResult = {
  zones: ZoneWithSlots[];
  /** Okupansi per (slot, tanggal) dari view slot_date_status — bahan slotStatusForDates. */
  occupancy: OccupancyRow[];
  connected: boolean;
  lastUpdatedAt: Date | null;
};

/**
 * Jeda polling status denah selama tab terlihat. Status juga langsung diambil
 * ulang begitu tab kembali aktif (pengunjung sering meninggalkan tab denah
 * lalu kembali beberapa menit kemudian).
 */
const POLL_MS = 10_000;

type StatusDenah = { occupancy: OccupancyRow[]; slots: { id: string; status: SlotStatus }[] };

/** Pasang status blokir terbaru ke struktur zona; referensi lama dipakai kalau tidak ada yang berubah. */
function terapkanStatus(zones: ZoneWithSlots[], slots: StatusDenah["slots"]): ZoneWithSlots[] {
  const status = new Map(slots.map((slot) => [slot.id, slot.status]));
  let changed = false;
  const updated = zones.map((zone) => ({
    ...zone,
    slots: zone.slots.map((slot) => {
      const baru = status.get(slot.id);
      if (baru === undefined || baru === slot.status) return slot;
      changed = true;
      return { ...slot, status: baru };
    }),
  }));
  return changed ? updated : zones;
}

/**
 * Status denah yang selalu segar (model per tanggal) lewat polling
 * GET /api/slots/status tiap 10 detik selama tab terlihat:
 * - `slots`     : blokir/buka slot oleh panitia;
 * - `occupancy` : okupansi per (slot, tanggal) dari view `slot_date_status`.
 *
 * Sumber data awal dari props (hasil getFloorPlan() di server). Kalau endpoint
 * gagal dijangkau (mis. database belum dikonfigurasi), hook ini diam saja:
 * denah tetap tampil statis dan `connected` bernilai false.
 */
export function useRealtimeSlots(
  initialZones: ZoneWithSlots[],
  initialOccupancy: OccupancyRow[] = [],
): UseRealtimeSlotsResult {
  const [zones, setZones] = useState<ZoneWithSlots[]>(initialZones);
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>(initialOccupancy);
  const [connected, setConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Data server bisa berubah (navigasi / revalidate) -> pakai data terbaru sebagai dasar.
  useEffect(() => {
    setZones(initialZones);
  }, [initialZones]);

  useEffect(() => {
    setOccupancy(initialOccupancy);
  }, [initialOccupancy]);

  const refetch = useCallback(async () => {
    try {
      const response = await fetch("/api/slots/status", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as StatusDenah;
      setOccupancy(data.occupancy);
      setZones((current) => terapkanStatus(current, data.slots));
      setConnected(true);
      setLastUpdatedAt(new Date());
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    const segarkan = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    segarkan();
    const pollTimer = setInterval(segarkan, POLL_MS);
    document.addEventListener("visibilitychange", segarkan);

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", segarkan);
    };
  }, [refetch]);

  return { zones, occupancy, connected, lastUpdatedAt };
}
