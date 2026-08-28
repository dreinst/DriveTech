import type { SlotRow, ZoneRow } from "@/lib/types/database";

/**
 * SATU-SATUNYA sumber resolusi harga admin fee per tanggal untuk sebuah slot.
 *
 * Aturan (keputusan pemilik, migrasi 20260827150000_harga_per_slot.sql):
 *   harga efektif slot = slots.admin_fee_override ?? zones.admin_fee ?? 0.
 * Override dipakai mis. slot UMKM 11-20 ("Booth Leasing"/"Booth Otomotif",
 * Rp 500.000) sementara slot UMKM lain ikut harga zona (Rp 250.000).
 *
 * Modul murni (tanpa Supabase/server) supaya bisa dipakai komponen client
 * (panel detail slot, kartu zona) maupun service server (createBooking).
 */
export function slotAdminFee(
  slot: Pick<SlotRow, "admin_fee_override">,
  zone: Pick<ZoneRow, "admin_fee">,
): number {
  return Number(slot.admin_fee_override ?? zone.admin_fee ?? 0);
}

/**
 * Harga admin fee TERENDAH di sebuah zona ("mulai Rp X" pada kartu zona).
 * Kalau zona tidak punya slot, kembali ke harga dasar zona.
 */
export function zoneMinAdminFee(
  zone: Pick<ZoneRow, "admin_fee">,
  slots: readonly Pick<SlotRow, "admin_fee_override">[],
): number {
  if (slots.length === 0) return Number(zone.admin_fee ?? 0);
  return Math.min(...slots.map((slot) => slotAdminFee(slot, zone)));
}

/**
 * True kalau harga slot di zona ini beragam (ada override yang berbeda dari
 * harga dasar) — dipakai kartu zona untuk memutuskan menampilkan "mulai Rp X".
 */
export function zoneHasVariedFees(
  zone: Pick<ZoneRow, "admin_fee">,
  slots: readonly Pick<SlotRow, "admin_fee_override">[],
): boolean {
  const base = Number(zone.admin_fee ?? 0);
  return slots.some((slot) => slotAdminFee(slot, zone) !== base);
}
