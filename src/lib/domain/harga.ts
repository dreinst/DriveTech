import type { SlotRow, ZoneRow } from "@/lib/types/database";

/**
 * SATU-SATUNYA sumber resolusi harga admin fee per tanggal untuk sebuah slot.
 *
 * Aturan (keputusan pemilik, migrasi 20260827150000_harga_per_slot.sql):
 *   harga efektif slot = slots.admin_fee_override ?? zones.admin_fee ?? 0.
 * Override dipakai mis. slot UMKM 11-20 ("Booth Leasing"/"Booth Otomotif",
 * Rp 500.000) sementara slot UMKM lain ikut harga zona (Rp 250.000).
 *
 * Modul murni (tanpa database/server) supaya bisa dipakai komponen client
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

/** MDR QRIS GoPay Merchant (data GoBiz): 0% sampai Rp 500.000, di atasnya 0,3% dari seluruh nominal. */
export const MDR_BATAS = 500_000;
export const MDR_PER_SERIBU = 3;

/**
 * Biaya layanan QRIS yang ditanggung penyewa supaya uang bersih setelah potongan MDR tetap = `bersih`.
 * Nominal bayar terkecil yang potongannya (dibulatkan ke atas, kemungkinan terburuk) masih menyisakan `bersih`.
 */
export function biayaLayanan(bersih: number): number {
  if (bersih <= MDR_BATAS) return 0;
  let bayar = Math.ceil((bersih * 1000) / (1000 - MDR_PER_SERIBU));
  while (bayar - Math.ceil((bayar * MDR_PER_SERIBU) / 1000) < bersih) bayar++;
  return bayar - bersih;
}

/**
 * Uang bersih yang harus masuk: tagihan + kode unik (350..500) dari alokasi_kode_unik(). Kode unik membuat
 * setiap tagihan hidup punya nominal berbeda, jadi panitia bisa mencocokkan uang masuk di GoPay Merchant.
 */
export function totalBersih(payment: { amount: number | string; unique_code?: number | null }): number {
  return Number(payment.amount) + (payment.unique_code ?? 0);
}

/**
 * Nominal yang dibayar penyewa: uang bersih + biaya layanan QRIS. Tetap unik per tagihan karena biayaLayanan
 * membuat nominal bayar naik searah uang bersih.
 */
export function totalBayar(payment: { amount: number | string; unique_code?: number | null }): number {
  const bersih = totalBersih(payment);
  return bersih + biayaLayanan(bersih);
}
