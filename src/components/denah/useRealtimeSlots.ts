"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { compareSlots } from "@/lib/domain/urutan";
import type { SlotRow, ZoneWithSlots } from "@/lib/types/database";

export type UseRealtimeSlotsResult = {
  zones: ZoneWithSlots[];
  connected: boolean;
  lastUpdatedAt: Date | null;
};

const CHANNEL_NAME = "denah-slots";

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
 * Langganan realtime tabel `slots` (Supabase Realtime, lihat bagian 3 arsitektur).
 * Kalau env Supabase belum diisi, hook ini diam saja: denah tetap tampil statis.
 */
export function useRealtimeSlots(initialZones: ZoneWithSlots[]): UseRealtimeSlotsResult {
  const [zones, setZones] = useState<ZoneWithSlots[]>(initialZones);
  const [connected, setConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Data server bisa berubah (navigasi / revalidate) -> pakai data terbaru sebagai dasar.
  useEffect(() => {
    setZones(initialZones);
  }, [initialZones]);

  const enabled = useMemo(() => isSupabaseConfigured(), []);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const supabase = createBrowserSupabase();
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
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { zones, connected, lastUpdatedAt };
}
