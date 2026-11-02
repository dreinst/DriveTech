import type { VehicleListingRow } from "@/lib/types/database";

/**
 * Unit katalog dianggap sudah terjual (tampil "Sold Out") begitu waktu sekarang
 * melewati terjual_mulai. Dipakai supaya panitia bisa menjadwalkan label Sold Out
 * tepat saat pembukaan tanpa perlu deploy ulang.
 */
export function sudahTerjual(
  listing: Pick<VehicleListingRow, "terjual_mulai">,
  sekarang: Date = new Date(),
): boolean {
  if (!listing.terjual_mulai) return false;
  const mulai = new Date(listing.terjual_mulai);
  return !Number.isNaN(mulai.getTime()) && sekarang >= mulai;
}
