"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { compareSlots } from "@/lib/domain/urutan";
import type { OccupancyRow } from "@/lib/domain/ketersediaan";
import type { SlotRow, ZoneWithSlots } from "@/lib/types/database";

export type UseRealtimeSlotsResult = {
  zones: ZoneWithSlots[];
  /** Okupansi per (slot, tanggal) dari view slot_date_status — bahan slotStatusForDates. */
  occupancy: OccupancyRow[];
  connected: boolean;
  lastUpdatedAt: Date | null;
};

const CHANNEL_NAME = "denah-slots";
/** Jeda penggabung: beberapa event booking_dates beruntun -> satu refetch okupansi. */
const OCCUPANCY_REFETCH_DEBOUNCE_MS = 250;
/**
 * Jaring pengaman: refetch okupansi berkala saat tab terlihat, plus saat tab
 * kembali aktif. Menutup kasus event realtime yang terlewat (koneksi putus
 * sesaat, policy, dsb.) tanpa membebani server — satu select ringan per menit.
 */
const OCCUPANCY_POLL_MS = 60_000;

/** Tanggal "hari ini" (YYYY-MM-DD) menurut zona waktu acara (WIB), dihitung di browser. */
function tanggalHariIniWib(): string {
  // en-CA menghasilkan format ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function isSlotRow(value: unknown): value is SlotRow {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.zone_id === "string";
}

/**
 * Sisipkan atau ganti satu baris slot di dalam struktur zona.
 *
 * INSERT juga ditangani (bukan cuma UPDATE): kalau id belum ada, baris dimasukkan ke
 * zona yang cocok lalu diurutkan ulang. Tanpa ini slot yang baru ditambahkan admin
 * tidak muncul di denah sampai halaman di-refresh.
 */
function upsertSlot(zones: ZoneWithSlots[], next: SlotRow): ZoneWithSlots[] {
  let changed = false;
  const updated = zones.map((zone) => {
    const index = zone.slots.findIndex((slot) => slot.id === next.id);

    if (index === -1) {
      if (zone.id !== next.zone_id) return zone;
      changed = true;
      return { ...zone, slots: [...zone.slots, next].sort(compareSlots) };
    }

    // Slot pindah zona: buang dari zona lama, biar zona barunya yang menyisipkan.
    if (zone.id !== next.zone_id) {
      changed = true;
      return { ...zone, slots: zone.slots.filter((slot) => slot.id !== next.id) };
    }

    changed = true;
    const slots = [...zone.slots];
    slots[index] = { ...slots[index], ...next };
    return { ...zone, slots };
  });
  return changed ? updated : zones;
}

function removeSlot(zones: ZoneWithSlots[], slotId: string): ZoneWithSlots[] {
  let changed = false;
  const updated = zones.map((zone) => {
    if (!zone.slots.some((slot) => slot.id === slotId)) return zone;
    changed = true;
    return { ...zone, slots: zone.slots.filter((slot) => slot.id !== slotId) };
  });
  return changed ? updated : zones;
}

/**
 * Langganan realtime denah (model per tanggal):
 * - tabel `slots`   : blokir/buka slot oleh panitia + penambahan slot baru;
 * - tabel `booking_dates`: setiap perubahan (booking baru, batal, verifikasi)
 *   memicu REFETCH okupansi lewat select view publik `slot_date_status`
 *   (anon boleh membaca view ini) — payload eventnya sendiri tidak dipakai,
 *   view-lah sumber kebenaran gabungan booking_dates x status booking.
 *
 * Sumber data awal dari props (hasil getFloorPlan() di server). Kalau env
 * Supabase belum diisi, hook ini diam saja: denah tetap tampil statis.
 */
export function useRealtimeSlots(
  initialZones: ZoneWithSlots[],
  initialOccupancy: OccupancyRow[] = [],
): UseRealtimeSlotsResult {
  const [zones, setZones] = useState<ZoneWithSlots[]>(initialZones);
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>(initialOccupancy);
  const [connected, setConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data server bisa berubah (navigasi / revalidate) -> pakai data terbaru sebagai dasar.
  useEffect(() => {
    setZones(initialZones);
  }, [initialZones]);

  useEffect(() => {
    setOccupancy(initialOccupancy);
  }, [initialOccupancy]);

  const enabled = useMemo(() => isSupabaseConfigured(), []);

  const refetchOccupancy = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase
      .from("slot_date_status")
      .select("slot_id, event_date, status")
      .gte("event_date", tanggalHariIniWib());
    if (error || data === null) return;
    setOccupancy(data as OccupancyRow[]);
    setLastUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const supabase = createBrowserSupabase();

    // Gabungkan event booking_dates yang beruntun (satu booking = banyak baris
    // tanggal) menjadi satu refetch okupansi.
    const scheduleOccupancyRefetch = () => {
      if (refetchTimer.current !== null) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        refetchTimer.current = null;
        void refetchOccupancy();
      }, OCCUPANCY_REFETCH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "slots" },
        (payload: RealtimePostgresChangesPayload<SlotRow>) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old;
            if (isSlotRow(old)) {
              setZones((current) => removeSlot(current, old.id));
              setLastUpdatedAt(new Date());
            }
            return;
          }

          const next = payload.new;
          if (!isSlotRow(next)) return;
          setZones((current) => upsertSlot(current, next));
          setLastUpdatedAt(new Date());
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_dates" },
        () => {
          scheduleOccupancyRefetch();
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    // Jaring pengaman di luar realtime: poll tiap menit saat tab terlihat dan
    // refetch begitu tab kembali aktif (pengunjung sering meninggalkan tab
    // denah lalu kembali beberapa menit kemudian).
    const pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") void refetchOccupancy();
    }, OCCUPANCY_POLL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refetchOccupancy();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      setConnected(false);
      if (refetchTimer.current !== null) {
        clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refetchOccupancy]);

  return { zones, occupancy, connected, lastUpdatedAt };
}
