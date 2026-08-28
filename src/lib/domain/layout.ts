import type { ZoneType } from "@/lib/types/database";

/**
 * GEOMETRI DENAH — sengaja HARDCODE (keputusan di "Sistem Pameran Arsitektur.md":
 * sistem ini khusus satu event, layout boleh hardcode).
 *
 * Sumber angka: berkas "layout-venue.jpeg" di root proyek, diekstrak ke
 * satuan viewBox portrait 1123 x 1600. Kalau denah asli berubah, ubah file ini saja.
 *
 * svgElementId WAJIB identik dengan kolom slots.svg_element_id di supabase/seed.sql.
 *
 * Catatan render:
 * - `label` adalah teks yang harus digambar di dalam kotak. Untuk zona bernomor
 *   isinya angka slot saja ("1".."30"); untuk warung/fasilitas isinya nama unit.
 * - `slotNumber` hanya info penomoran database (null untuk unit bernama).
 * - Warna isi kotak ditentukan STATUS (SLOT_STATUS_STYLE di domain/constants.ts),
 *   sedangkan `accent` zona dipakai untuk pita judul container & garis tepi zona.
 */

export const FLOOR_PLAN_VIEWBOX = { width: 1123, height: 1600 };
export const FLOOR_PLAN_FRAME = { x: 24, y: 24, width: 1075, height: 1552 };

export type Rect = { x: number; y: number; width: number; height: number };

export type LabelOrientation = "horizontal" | "vertical";

export type LayoutSlot = Rect & {
  svgElementId: string;
  label: string;
  slotNumber: number | null;
  labelOrientation: LabelOrientation;
};

export type LayoutZone = {
  svgGroupId: string;
  name: string;
  zoneType: ZoneType;
  accent: string;
  container: (Rect & { labelOrientation: LabelOrientation }) | null;
  annotations?: { x: number; y: number; text: string }[];
  slots: LayoutSlot[];
};

export type DecorKind = "taman" | "pagar" | "tank";

/** `rotate` = derajat searah jarum jam mengelilingi titik tengah rect (dipakai tank). */
export type DecorItem = Rect & { id: string; label: string; kind: DecorKind; rotate?: number };

/* ---------- Helper deterministik untuk zona bernomor ---------- */

/** Bulatkan ke 1 desimal supaya koordinat hasil rumus tetap rapi di SVG. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function numberedSlot(zoneSlug: string, slotNumber: number, rect: Rect): LayoutSlot {
  return {
    ...rect,
    svgElementId: `slot-${zoneSlug}-${pad2(slotNumber)}`,
    label: String(slotNumber),
    slotNumber,
    labelOrientation: "horizontal",
  };
}

/* ---------- Zona 1: Tenda Pameran Mobil Baru (10 slot, 2 baris x 5) ---------- */

const MOBIL_BARU_X = [512, 579, 646, 713, 780];
const MOBIL_BARU_ROW_Y = [140, 258];

const mobilBaruSlots: LayoutSlot[] = MOBIL_BARU_ROW_Y.flatMap((y, row) =>
  MOBIL_BARU_X.map((x, col) =>
    numberedSlot("mobil-baru", row * MOBIL_BARU_X.length + col + 1, { x, y, width: 62, height: 58 }),
  ),
);

/* ---------- Zona 2: Area Pameran Mobil (30 slot, 3 kelompok x 10) ---------- */

const MOBIL_BEKAS_GROUPS = [
  { startNumber: 1, x: 520, width: 52, baseY: 416 },
  { startNumber: 11, x: 632, width: 56, baseY: 410 },
  { startNumber: 21, x: 698, width: 56, baseY: 410 },
];

const mobilBekasSlots: LayoutSlot[] = MOBIL_BEKAS_GROUPS.flatMap((group) =>
  Array.from({ length: 10 }, (_, i) =>
    numberedSlot("mobil-bekas", group.startNumber + i, {
      x: group.x,
      y: round1(group.baseY + i * 38.5),
      width: group.width,
      height: 33,
    }),
  ),
);

/* ---------- Zona 3: Area Pameran Mobil & Motor (14 slot, satu kolom) ---------- */

const mobilMotorSlots: LayoutSlot[] = Array.from({ length: 14 }, (_, i) =>
  numberedSlot("mobil-motor", i + 1, {
    x: 800,
    y: round1(462 + i * 27.6),
    width: 48,
    height: 24,
  }),
);

/* ---------- Zona 4: Area UMKM (20 slot: kolom kiri 1-10 & kanan 21-30) ---------- */
/* Kolom TENGAH (nomor 11-20) adalah zona terpisah Booth Leasing & Brand
 * Otomotif (booth 2 sisi) — keputusan pemilik 2026-08-29. svg_element_id
 * kolom tengah tetap "slot-umkm-11..20" agar cocok dengan database. */

const UMKM_SLOT_RECT = { width: 34, height: 32 };
const umkmY = (i: number): number => round1(474 + i * 34.4);

const umkmSlots: LayoutSlot[] = [
  ...Array.from({ length: 10 }, (_, i) =>
    numberedSlot("umkm", i + 1, { x: 240, y: umkmY(i), ...UMKM_SLOT_RECT }),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    numberedSlot("umkm", i + 21, { x: 430, y: umkmY(i), ...UMKM_SLOT_RECT }),
  ),
];

/* ---------- Zona 4b: Booth Leasing & Brand Otomotif (10 booth 2 sisi) ---------- */

const boothKhususSlots: LayoutSlot[] = Array.from({ length: 10 }, (_, i) =>
  numberedSlot("umkm", i + 11, { x: 322, y: umkmY(i), ...UMKM_SLOT_RECT }),
);

/* ---------- Zona 5: Warung (12 unit, posisi tersebar, ditulis eksplisit) ---------- */

const warungSlots: LayoutSlot[] = [
  { svgElementId: "slot-warung-warmindo", label: "Warmindo", slotNumber: null, labelOrientation: "horizontal", x: 122, y: 440, width: 113, height: 120 },
  { svgElementId: "slot-warung-01", label: "Warung 1", slotNumber: 1, labelOrientation: "horizontal", x: 122, y: 632, width: 113, height: 108 },
  { svgElementId: "slot-warung-02", label: "Warung 2", slotNumber: 2, labelOrientation: "horizontal", x: 122, y: 744, width: 113, height: 56 },
  { svgElementId: "slot-warung-03", label: "Warung 3", slotNumber: 3, labelOrientation: "horizontal", x: 122, y: 804, width: 113, height: 54 },
  { svgElementId: "slot-warung-04", label: "Warung 4", slotNumber: 4, labelOrientation: "horizontal", x: 122, y: 862, width: 113, height: 42 },
  { svgElementId: "slot-warung-05", label: "Warung 5", slotNumber: 5, labelOrientation: "vertical", x: 122, y: 908, width: 93, height: 96 },
  { svgElementId: "slot-warung-06", label: "Warung 6", slotNumber: 6, labelOrientation: "vertical", x: 219, y: 908, width: 64, height: 96 },
  { svgElementId: "slot-warung-07", label: "Warung 7", slotNumber: 7, labelOrientation: "vertical", x: 287, y: 908, width: 64, height: 96 },
  { svgElementId: "slot-warung-08", label: "Warung 8", slotNumber: 8, labelOrientation: "vertical", x: 355, y: 908, width: 64, height: 96 },
  { svgElementId: "slot-warung-09", label: "Warung 9", slotNumber: 9, labelOrientation: "vertical", x: 423, y: 908, width: 66, height: 96 },
  { svgElementId: "slot-warung-10", label: "Warung 10", slotNumber: 10, labelOrientation: "vertical", x: 493, y: 908, width: 66, height: 96 },
  { svgElementId: "slot-warung-sate-gule", label: "Warung Sate & Gule", slotNumber: null, labelOrientation: "horizontal", x: 655, y: 908, width: 185, height: 96 },
];

/* ---------- Zona 6: Fasilitas Umum (8 unit, TIDAK bisa dibooking) ---------- */

const fasilitasSlots: LayoutSlot[] = [
  { svgElementId: "slot-fasilitas-kantor-sekretariat", label: "Kantor Sekretariat & Rest Area Kostrad", slotNumber: null, labelOrientation: "horizontal", x: 122, y: 133, width: 168, height: 64 },
  { svgElementId: "slot-fasilitas-stage-utama", label: "Stage Utama", slotNumber: null, labelOrientation: "horizontal", x: 385, y: 138, width: 74, height: 48 },
  { svgElementId: "slot-fasilitas-tempat-cuci", label: "Tempat Cuci Mobil & Motor", slotNumber: null, labelOrientation: "vertical", x: 122, y: 272, width: 113, height: 164 },
  { svgElementId: "slot-fasilitas-area-zumba", label: "Area Zumba", slotNumber: null, labelOrientation: "horizontal", x: 239, y: 272, width: 222, height: 164 },
  { svgElementId: "slot-fasilitas-musholah", label: "Musholah", slotNumber: null, labelOrientation: "horizontal", x: 890, y: 325, width: 120, height: 126 },
  { svgElementId: "slot-fasilitas-lapangan-tembak", label: "Lapangan Tembak", slotNumber: null, labelOrientation: "horizontal", x: 120, y: 1180, width: 570, height: 250 },
  { svgElementId: "slot-fasilitas-parkiran", label: "Parkiran Untuk Pengunjung", slotNumber: null, labelOrientation: "vertical", x: 695, y: 1180, width: 110, height: 250 },
  { svgElementId: "slot-fasilitas-kolam-pemancingan", label: "Kolam Pemancingan", slotNumber: null, labelOrientation: "horizontal", x: 810, y: 1180, width: 225, height: 250 },
];

/* ---------- Daftar zona, urut display_order 1..6 ---------- */

export const FLOOR_PLAN_ZONES: LayoutZone[] = [
  {
    svgGroupId: "zone-mobil-baru",
    name: "Tenda Pameran Mobil Baru",
    zoneType: "mobil_baru",
    accent: "#7030a0",
    container: { x: 505, y: 110, width: 348, height: 216, labelOrientation: "horizontal" },
    slots: mobilBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-bekas",
    name: "Area Pameran Mobil",
    zoneType: "mobil_bekas",
    accent: "#c00000",
    container: { x: 514, y: 366, width: 250, height: 444, labelOrientation: "horizontal" },
    // Arah lalu lintas kendaraan di dalam zona (digambar dengan segitiga panah kecil).
    annotations: [
      { x: 556, y: 404, text: "MASUK" },
      { x: 742, y: 404, text: "KELUAR" },
    ],
    slots: mobilBekasSlots,
  },
  {
    svgGroupId: "zone-mobil-motor",
    name: "Area Pameran Motor",
    zoneType: "mobil_motor_bekas",
    accent: "#ff00ff",
    container: { x: 774, y: 430, width: 90, height: 430, labelOrientation: "vertical" },
    slots: mobilMotorSlots,
  },
  {
    svgGroupId: "zone-umkm",
    name: "Area UMKM",
    zoneType: "umkm",
    accent: "#0070c0",
    container: { x: 234, y: 444, width: 232, height: 386, labelOrientation: "horizontal" },
    slots: umkmSlots,
  },
  {
    // Kolom tengah area UMKM: booth premium 2 sisi (bank leasing & brand
    // otomotif). Tanpa container sendiri — secara fisik berada di dalam
    // kotak Area UMKM; pembeda visualnya label peruntukan di panel slot.
    svgGroupId: "zone-booth-khusus",
    name: "Booth Leasing & Brand Otomotif",
    zoneType: "booth_khusus",
    accent: "#0f766e",
    container: null,
    slots: boothKhususSlots,
  },
  {
    svgGroupId: "zone-warung",
    name: "Warung",
    zoneType: "warung",
    accent: "#bf8f00",
    container: null,
    slots: warungSlots,
  },
  {
    svgGroupId: "zone-fasilitas",
    name: "Fasilitas Umum",
    zoneType: "facility",
    accent: "#808080",
    container: null,
    slots: fasilitasSlots,
  },
];

/* ---------- Dekor: hanya visual, tidak ada di database, tidak bisa diklik ---------- */

export const FLOOR_PLAN_DECOR: DecorItem[] = [
  { id: "pagar-atas", x: 122, y: 96, width: 766, height: 10, label: "", kind: "pagar" },
  { id: "taman-tengah", x: 464, y: 378, width: 52, height: 452, label: "Taman", kind: "taman" },
  { id: "taman-kanan", x: 890, y: 456, width: 120, height: 674, label: "Taman", kind: "taman" },
  { id: "taman-kiri-bawah", x: 122, y: 1012, width: 440, height: 116, label: "Taman", kind: "taman" },
  { id: "taman-tengah-bawah", x: 655, y: 1012, width: 185, height: 116, label: "Taman", kind: "taman" },

  // Tank display Kostrad (kendaraan hijau di gambar asli) — murni dekor, bukan slot.
  // Rect ditulis SEBELUM rotasi; laras menghadap sumbu +x, lalu dirotasi `rotate`°.
  { id: "tank-sekretariat", x: 285, y: 150, width: 96, height: 40, label: "Tank", kind: "tank", rotate: -45 },
  { id: "tank-umkm", x: 125, y: 582, width: 100, height: 38, label: "Tank", kind: "tank", rotate: 0 },
  { id: "tank-warung", x: 573, y: 938, width: 96, height: 38, label: "Tank", kind: "tank", rotate: 90 },
];

/** Gaya dekor: taman hijau muda, pagar hijau solid tanpa garis tepi.
 *  Entri tank hanya fallback kotak (hull); gambar lengkapnya memakai TANK_STYLE. */
export const DECOR_STYLE: Record<DecorItem["kind"], { fill: string; stroke: string | null }> = {
  taman: { fill: "#e8f5e9", stroke: "#a5d6a7" },
  pagar: { fill: "#7cb342", stroke: null },
  tank: { fill: "#5f8f3e", stroke: "#3f6212" },
};

/** Warna tank display Kostrad, meniru kendaraan hijau di gambar asli (bukan chrome UI). */
export const TANK_STYLE = {
  track: "#3f6212",
  hullFill: "#5f8f3e",
  hullStroke: "#3f6212",
  hullStrokeWidth: 1.5,
  turret: "#46702e",
  barrel: "#3f6212",
  label: "#3f6212",
  labelFontSize: 9,
} as const;

/** Anotasi teks bebas di denah (text-anchor middle, font 12). */
export const FLOOR_PLAN_ANNOTATIONS: { x: number; y: number; text: string; bold?: boolean }[] = [
  { x: 970, y: 145, text: "PINTU MASUK & KELUAR", bold: true },
  { x: 970, y: 168, text: "REST AREA KOSTRAD", bold: true },
];

/* ---------- Helper pencarian & teks ---------- */

const SLOT_INDEX: Map<string, LayoutSlot> = new Map(
  FLOOR_PLAN_ZONES.flatMap((zone) => zone.slots).map((slot) => [slot.svgElementId, slot]),
);

export function findLayoutSlot(svgElementId: string): LayoutSlot | undefined {
  return SLOT_INDEX.get(svgElementId);
}

/** Total kotak slot di denah — harus 104 (96 bisa dibooking + 8 fasilitas). */
export function layoutSlotCount(): number {
  return SLOT_INDEX.size;
}

/** Penggal label jadi beberapa baris <tspan> agar muat di dalam kotak. */
export function wrapLabel(label: string, maxCharsPerLine: number): string[] {
  const max = Math.max(1, Math.floor(maxCharsPerLine));
  const words = label.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= max) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);

  // Kata tunggal yang lebih panjang dari batas tetap dipotong keras.
  return lines.flatMap((line) => {
    if (line.length <= max) return [line];
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += max) parts.push(line.slice(i, i + max));
    return parts;
  });
}

/** Ukuran font label di dalam kotak: proporsional tinggi kotak, dibatasi 9..16. */
export function slotFontSize(slot: Rect): number {
  const raw = Math.round(slot.height * 0.42);
  return Math.min(16, Math.max(9, raw));
}
