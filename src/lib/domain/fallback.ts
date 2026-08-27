import type { SlotRow, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { FLOOR_PLAN_ZONES } from "@/lib/domain/layout";

/**
 * Denah cadangan (fallback) yang dibangun murni dari geometri di domain/layout.ts.
 *
 * Dipakai halaman publik saat Supabase belum dikonfigurasi atau query gagal:
 * pengunjung tetap melihat denah lengkap (semua slot dianggap "available"),
 * hanya saja tombol pemesanan dimatikan karena id-nya bukan uuid database.
 *
 * Nilai admin_fee di bawah harus sama dengan supabase/seed.sql.
 */

export const ADMIN_FEE_BY_ZONE_TYPE: Record<ZoneType, number> = {
  mobil_baru: 2_500_000,
  mobil_bekas: 750_000,
  mobil_motor_bekas: 600_000,
  umkm: 300_000,
  warung: 500_000,
  facility: 0,
};

/** Timestamp tetap supaya render server & client identik (tidak ada Date.now()). */
const FALLBACK_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** Id semu; sengaja bukan uuid supaya gampang dibedakan dari data asli. */
export const FALLBACK_EVENT_ID = "fallback-event";

/** Semua slot tersedia, urutan zona mengikuti display_order 1..6 di layout. */
export function fallbackZonesFromLayout(): ZoneWithSlots[] {
  return FLOOR_PLAN_ZONES.map((zone, index) => {
    const slots: SlotRow[] = zone.slots.map((slot) => ({
      id: slot.svgElementId,
      zone_id: zone.svgGroupId,
      slot_number: slot.slotNumber,
      // Unit bernama (warung/fasilitas) memakai label; slot bernomor tidak punya label di DB.
      slot_label: slot.slotNumber === null ? slot.label : null,
      status: "available",
      svg_element_id: slot.svgElementId,
      created_at: FALLBACK_TIMESTAMP,
      updated_at: FALLBACK_TIMESTAMP,
    }));

    return {
      id: zone.svgGroupId,
      event_id: FALLBACK_EVENT_ID,
      name: zone.name,
      zone_type: zone.zoneType,
      svg_group_id: zone.svgGroupId,
      admin_fee: ADMIN_FEE_BY_ZONE_TYPE[zone.zoneType],
      description: null,
      display_order: index + 1,
      created_at: FALLBACK_TIMESTAMP,
      slots,
    };
  });
}

/** True kalau daftar zona berasal dari fallback (id-nya svg_group_id, bukan uuid). */
export function isFallbackZones(zones: ZoneWithSlots[]): boolean {
  return zones.length > 0 && zones[0].event_id === FALLBACK_EVENT_ID;
}
