import { ZONE_TYPE_FALLBACK } from "@/lib/domain/constants";
import type { SlotDetail } from "@/lib/types/database";

/**
 * Logika "Slot Penuh -> Saran Slot Lain" (bagian 4 "Sistem Pameran Arsitektur.md").
 * MURNI: tanpa Supabase, gampang diuji. Service tinggal menyuplai daftar slot.
 *
 * Aturan:
 * 1. Slot available di zone_id yang sama, urut jarak |slot_number - target| lalu nomor naik.
 * 2. Kalau zona itu penuh total, fallback ke zona lain: pertama zona ber-zone_type
 *    sama, lalu zona yang terdaftar di ZONE_TYPE_FALLBACK (mis. Area Pameran Mobil
 *    penuh -> Area Pameran Mobil & Motor, contoh eksplisit di .md yang justru
 *    melintasi zone_type). Keduanya diurut display_order zona lalu nomor slot.
 * 3. Tidak pernah auto-assign — hasilnya cuma daftar saran.
 * 4. Zona facility dan slot target sendiri selalu dikecualikan.
 */

const DEFAULT_LIMIT = 6;

function labelOf(slot: SlotDetail): string {
  return slot.slot_label ?? slot.svg_element_id ?? slot.id;
}

/** Slot tanpa nomor selalu diurutkan setelah slot bernomor, lalu by label. */
function compareUnnumbered(a: SlotDetail, b: SlotDetail): number {
  return labelOf(a).localeCompare(labelOf(b), "id-ID");
}

function compareInSameZone(target: SlotDetail) {
  return (a: SlotDetail, b: SlotDetail): number => {
    const an = a.slot_number;
    const bn = b.slot_number;
    if (an === null && bn === null) return compareUnnumbered(a, b);
    if (an === null) return 1;
    if (bn === null) return -1;

    const ref = target.slot_number;
    if (ref !== null) {
      const distance = Math.abs(an - ref) - Math.abs(bn - ref);
      if (distance !== 0) return distance;
    }
    return an - bn;
  };
}

function compareAcrossZones(a: SlotDetail, b: SlotDetail): number {
  const order = a.zone.display_order - b.zone.display_order;
  if (order !== 0) return order;

  const an = a.slot_number;
  const bn = b.slot_number;
  if (an === null && bn === null) return compareUnnumbered(a, b);
  if (an === null) return 1;
  if (bn === null) return -1;
  return an - bn;
}

export function suggestAlternatives(params: {
  target: SlotDetail;
  allSlots: SlotDetail[];
  limit?: number;
}): SlotDetail[] {
  const { target, allSlots } = params;
  const limit = Math.max(0, params.limit ?? DEFAULT_LIMIT);
  if (limit === 0) return [];
  // Fasilitas umum tidak disewakan, jadi tidak punya alternatif.
  if (target.zone.zone_type === "facility") return [];

  const candidates = allSlots.filter(
    (slot) =>
      slot.id !== target.id &&
      slot.status === "available" &&
      slot.zone.zone_type !== "facility",
  );

  const sameZone = candidates
    .filter((slot) => slot.zone_id === target.zone_id)
    .sort(compareInSameZone(target));

  if (sameZone.length > 0) return sameZone.slice(0, limit);

  const lain = candidates.filter((slot) => slot.zone_id !== target.zone_id);

  // 2a. Zona lain dengan zone_type persis sama.
  const tipeSama = lain
    .filter((slot) => slot.zone.zone_type === target.zone.zone_type)
    .sort(compareAcrossZones);
  if (tipeSama.length >= limit) return tipeSama.slice(0, limit);

  // 2b. Zona pengganti lintas tipe, urut sesuai prioritas di ZONE_TYPE_FALLBACK.
  const kompatibel = ZONE_TYPE_FALLBACK[target.zone.zone_type] ?? [];
  if (kompatibel.length === 0) return tipeSama.slice(0, limit);

  const tipeLain = lain
    .filter(
      (slot) =>
        slot.zone.zone_type !== target.zone.zone_type &&
        kompatibel.includes(slot.zone.zone_type),
    )
    .sort((a, b) => {
      const prioritas =
        kompatibel.indexOf(a.zone.zone_type) - kompatibel.indexOf(b.zone.zone_type);
      return prioritas !== 0 ? prioritas : compareAcrossZones(a, b);
    });

  return [...tipeSama, ...tipeLain].slice(0, limit);
}
