import type { BookingStatus, SlotRow, ZoneType } from "@/lib/types/database";

import { isBookableZoneType } from "./constants";

/**
 * Aturan ketersediaan model "per tanggal" — modul MURNI (tanpa Supabase/DOM)
 * supaya bisa dipakai server (services) maupun komponen client (denah).
 *
 * Semantik (kontrak Drive Tech per tanggal), diberi pilihan tanggal S (>= 1) dan
 * occupancy dari view slot_date_status:
 *   - "blocked"   : slots.status != 'available' (DIBLOKIR PANITIA untuk semua
 *                   tanggal) ATAU zona tidak bisa dibooking online.
 *   - "confirmed" : ada baris (slot, d) dengan d dalam S berstatus confirmed.
 *   - "pending"   : tidak confirmed, tapi ada baris pending_payment.
 *   - "available" : bebas di SEMUA tanggal terpilih — hanya ini yang bisa dibooking.
 */

/** Satu baris okupansi dari view publik slot_date_status. */
export type OccupancyRow = {
  slot_id: string;
  event_date: string;
  status: BookingStatus;
};

/** Verdict ketersediaan satu slot untuk sekumpulan tanggal terpilih. */
export type SlotDateVerdict = "blocked" | "confirmed" | "pending" | "available";

/** Status slot untuk pilihan tanggal `dates` (lihat semantik di atas). */
export function slotStatusForDates(params: {
  slot: SlotRow;
  zoneType: ZoneType;
  dates: string[];
  occupancy: OccupancyRow[];
}): SlotDateVerdict {
  const { slot, zoneType, dates, occupancy } = params;

  if (slot.status !== "available" || !isBookableZoneType(zoneType)) return "blocked";

  const dipilih = new Set(dates);
  let adaPending = false;
  for (const row of occupancy) {
    if (row.slot_id !== slot.id || !dipilih.has(row.event_date)) continue;
    if (row.status === "confirmed") return "confirmed";
    if (row.status === "pending_payment") adaPending = true;
  }
  return adaPending ? "pending" : "available";
}

/**
 * Status satu tanggal untuk satu slot:
 *   - "confirmed" : ada booking terkonfirmasi di tanggal itu (menang atas pending);
 *   - "pending"   : dikunci booking pending_payment (masih mungkin batal);
 *   - "free"      : tidak ada baris occupancy — bebas dibooking.
 */
export function dateStatusForSlot(
  slotId: string,
  date: string,
  occupancy: OccupancyRow[],
): "free" | "pending" | "confirmed" {
  let adaPending = false;
  for (const row of occupancy) {
    if (row.slot_id !== slotId || row.event_date !== date) continue;
    if (row.status === "confirmed") return "confirmed";
    if (row.status === "pending_payment") adaPending = true;
  }
  return adaPending ? "pending" : "free";
}

/** Tanggal aktif yang masih BEBAS untuk sebuah slot (urutan mengikuti activeDates). */
export function freeDatesForSlot(params: {
  slotId: string;
  activeDates: string[];
  occupancy: OccupancyRow[];
}): string[] {
  const { slotId, activeDates, occupancy } = params;
  const terisi = new Set<string>();
  for (const row of occupancy) {
    if (row.slot_id === slotId) terisi.add(row.event_date);
  }
  return activeDates.filter((date) => !terisi.has(date));
}

/**
 * Status slot LINTAS seluruh tanggal aktif (alur "slot dulu, tanggal belakangan"
 * — peta diwarnai tanpa konteks tanggal terpilih):
 *   - "blocked"   : slots.status != 'available' ATAU zona non-bookable;
 *   - "available" : masih ada >= 1 tanggal aktif yang bebas;
 *   - "pending"   : tidak ada tanggal bebas, tapi ada tanggal pending_payment
 *                   (masih mungkin batal);
 *   - "confirmed" : SEMUA tanggal aktif terkonfirmasi (penuh).
 * Tanpa tanggal aktif (jadwal belum dibuka / fallback) slot non-blokir dianggap
 * "available" — konsisten dengan slotStatusForDates untuk dates kosong.
 */
export function slotStatusAcrossDates(params: {
  slot: SlotRow;
  zoneType: ZoneType;
  activeDates: string[];
  occupancy: OccupancyRow[];
}): SlotDateVerdict {
  const { slot, zoneType, activeDates, occupancy } = params;

  if (slot.status !== "available" || !isBookableZoneType(zoneType)) return "blocked";
  if (activeDates.length === 0) return "available";

  // Satu lintasan occupancy: kumpulkan status per tanggal aktif untuk slot ini.
  const aktif = new Set(activeDates);
  const perTanggal = new Map<string, "pending" | "confirmed">();
  for (const row of occupancy) {
    if (row.slot_id !== slot.id || !aktif.has(row.event_date)) continue;
    if (row.status === "confirmed") perTanggal.set(row.event_date, "confirmed");
    else if (row.status === "pending_payment" && perTanggal.get(row.event_date) !== "confirmed") {
      perTanggal.set(row.event_date, "pending");
    }
  }

  if (perTanggal.size < activeDates.length) return "available"; // masih ada tanggal bebas
  let adaPending = false;
  for (const status of perTanggal.values()) {
    if (status === "pending") adaPending = true;
  }
  return adaPending ? "pending" : "confirmed";
}

/** Total biaya admin = biaya per tanggal x jumlah tanggal terpilih. */
export function hitungTotalBiaya(adminFee: number, jumlahTanggal: number): number {
  return adminFee * Math.max(0, jumlahTanggal);
}
