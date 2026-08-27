import type { SlotRow } from "@/lib/types/database";

/**
 * Urutan slot: bernomor dulu (naik), slot tanpa nomor di belakang, lalu id.
 *
 * Sengaja ditaruh di domain/ (bukan services/) supaya bisa dipakai komponen client:
 * modul di services/ punya penjaga runtime `if (typeof window !== "undefined") throw`,
 * jadi mengimpornya dari browser akan melempar saat modul dimuat.
 */
export function compareSlots(
  a: Pick<SlotRow, "id" | "slot_number">,
  b: Pick<SlotRow, "id" | "slot_number">,
): number {
  const an = a.slot_number;
  const bn = b.slot_number;
  if (an !== null && bn !== null && an !== bn) return an - bn;
  if (an === null && bn !== null) return 1;
  if (an !== null && bn === null) return -1;
  return a.id.localeCompare(b.id);
}
