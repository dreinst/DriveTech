import type { ZoneType } from "@/lib/types/database";

/**
 * GEOMETRI DENAH, sengaja HARDCODE (keputusan di "Sistem Pameran Arsitektur.md":
 * sistem ini khusus satu event, layout boleh hardcode).
 *
 * Sumber angka: gambar denah "Welcome gate (3).png" dari pemilik (9 Oktober 2026,
 * 2000 x 1519 px, Area A sampai H). Koordinat di bawah ditulis dalam satuan
 * gambar itu lalu digeser (SUMBER_X, SUMBER_Y) supaya viewBox mulai dari 0.
 * Posisi diperkirakan dari gambar, belum berskala.
 * Kalau denah berubah, ubah file ini saja, lalu jalankan `npm run denah` untuk
 * membuat ulang public/denah.svg (tools/generate-denah-svg.ts).
 *
 * svgElementId WAJIB identik dengan kolom slots.svg_element_id di database
 * (supabase/seed.sql dan migrasi 20261009120000_denah_area_a_h.sql).
 *
 * Jumlah lapak yang bisa dipesan: mobil baru 10 (Area A), mobil bekas 60
 * (Area B, C, D), otomotif 15 (Area D), motor baru 5 dan motor bekas 20
 * (Area E), UMKM 43 (Area F, G, H). Total 153.
 *
 * Catatan render:
 * - `label` adalah teks di dalam kotak. Zona bernomor berisi angka lapak,
 *   warung dan fasilitas berisi nama unit.
 * - Warna isi kotak ditentukan STATUS (SLOT_STATUS_STYLE di domain/constants.ts).
 */

export const FLOOR_PLAN_VIEWBOX = { width: 1680, height: 1170 };

const SUMBER_X = 150;
const SUMBER_Y = 165;

/** Garis batas lokasi (path SVG, sudah dalam satuan viewBox). */
export const FLOOR_PLAN_OUTLINE =
  "M 20 1145 L 20 645 Q 30 445 112 347 L 230 280 L 380 115 L 445 20 L 1655 20 L 1655 1145 Z";

export type Rect = { x: number; y: number; width: number; height: number };

export type LabelOrientation = "horizontal" | "vertical";

export type LayoutSlot = Rect & {
  svgElementId: string;
  label: string;
  slotNumber: number | null;
  labelOrientation: LabelOrientation;
  /**
   * Derajat rotasi KOTAK (searah jarum jam) mengelilingi titik tengahnya,
   * dipakai lapak UMKM Area G yang mengikuti bangunan miring. Teks nomor
   * tetap tegak.
   */
  rotate?: number;
};

/**
 * Kotak container zona + pita judul. `title` (opsional) menggantikan nama zona
 * pada pita — dipakai zona yang punya lebih dari satu kolom fisik (UMKM) atau
 * pita yang terlalu pendek untuk nama lengkap.
 */
export type LayoutContainer = Rect & { labelOrientation: LabelOrientation; title?: string };

export type LayoutZone = {
  svgGroupId: string;
  name: string;
  zoneType: ZoneType;
  accent: string;
  /** Container utama (target zoom & pita judul). null = zona tersebar tanpa kotak. */
  container: LayoutContainer | null;
  /** Container tambahan untuk zona yang menempati lebih dari satu blok fisik. */
  extraContainers?: LayoutContainer[];
  annotations?: { x: number; y: number; text: string }[];
  slots: LayoutSlot[];
};

export type DecorKind = "taman" | "bangunan" | "gerbang";

/** `rotate` = derajat searah jarum jam mengelilingi titik tengah rect. */
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

function namedSlot(
  svgElementId: string,
  label: string,
  rect: Rect,
  labelOrientation: LabelOrientation = "horizontal",
  slotNumber: number | null = null,
): LayoutSlot {
  return { ...rect, svgElementId, label, slotNumber, labelOrientation };
}

/** Kotak dalam satuan gambar sumber, digeser ke satuan viewBox. */
function kotak(x: number, y: number, width: number, height: number): Rect {
  return { x: round1(x - SUMBER_X), y: round1(y - SUMBER_Y), width, height };
}

/** Deret lapak bernomor: kotak ke-i bergeser (dx, dy), nomornya `nomor(i)`. */
function deret(
  zoneSlug: string,
  jumlah: number,
  awal: { x: number; y: number; width: number; height: number },
  langkah: { dx: number; dy: number },
  nomor: (i: number) => number,
): LayoutSlot[] {
  return Array.from({ length: jumlah }, (_, i) =>
    numberedSlot(
      zoneSlug,
      nomor(i),
      kotak(awal.x + i * langkah.dx, awal.y + i * langkah.dy, awal.width, awal.height),
    ),
  );
}

/** Deret lapak miring di sepanjang garis (x1,y1) ke (x2,y2), dipakai Area G. */
function deretMiring(
  zoneSlug: string,
  jumlah: number,
  garis: { x1: number; y1: number; x2: number; y2: number },
  ukuran: { width: number; height: number; geser: number },
  nomor: (i: number) => number,
): LayoutSlot[] {
  const dx = garis.x2 - garis.x1;
  const dy = garis.y2 - garis.y1;
  const panjang = Math.hypot(dx, dy);
  const ux = dx / panjang;
  const uy = dy / panjang;
  const rotate = round1((Math.atan2(dy, dx) * 180) / Math.PI);
  const langkah = panjang / jumlah;
  return Array.from({ length: jumlah }, (_, i) => {
    const cx = garis.x1 + ux * (i + 0.5) * langkah + uy * ukuran.geser;
    const cy = garis.y1 + uy * (i + 0.5) * langkah - ux * ukuran.geser;
    return {
      ...numberedSlot(
        zoneSlug,
        nomor(i),
        kotak(cx - ukuran.width / 2, cy - ukuran.height / 2, ukuran.width, ukuran.height),
      ),
      rotate,
    };
  });
}

/* ---------- Area A: Mobil Baru (10 lapak, dua baris tenda dekat gerbang) ---------- */

const mobilBaruSlots: LayoutSlot[] = [
  ...deret("mobil-baru", 5, { x: 980, y: 1254, width: 42, height: 40 }, { dx: 45.5, dy: 0 }, (i) => i + 1),
  ...deret("mobil-baru", 5, { x: 980, y: 1165, width: 42, height: 40 }, { dx: 45.5, dy: 0 }, (i) => i + 6),
];

/* ---------- Area B, C, D: Mobil Bekas (60 lapak, enam kolom, nomor naik ke atas) ---------- */

const mobilBekasSlots: LayoutSlot[] = [
  ...deret("mobil-bekas", 10, { x: 947, y: 812, width: 30, height: 26 }, { dx: 0, dy: 29.5 }, (i) => 10 - i),
  ...deret("mobil-bekas", 10, { x: 1034, y: 848, width: 40, height: 23 }, { dx: 0, dy: 26.5 }, (i) => 20 - i),
  ...deret("mobil-bekas", 10, { x: 1078, y: 848, width: 40, height: 23 }, { dx: 0, dy: 26.5 }, (i) => 30 - i),
  ...deret("mobil-bekas", 10, { x: 1166, y: 812, width: 30, height: 26 }, { dx: 0, dy: 29.5 }, (i) => 40 - i),
  ...deret("mobil-bekas", 10, { x: 1241, y: 808, width: 38, height: 23 }, { dx: 0, dy: 26.8 }, (i) => 50 - i),
  ...deret("mobil-bekas", 10, { x: 1355, y: 808, width: 38, height: 23 }, { dx: 0, dy: 26.8 }, (i) => 60 - i),
];

/* ---------- Area D: Otomotif (15 lapak di antara kolom mobil bekas 41-50 dan 51-60) ---------- */

const otomotifSlots: LayoutSlot[] = deret(
  "otomotif",
  15,
  { x: 1300, y: 843, width: 34, height: 13 },
  { dx: 0, dy: 15.2 },
  (i) => 15 - i,
);

/* ---------- Area E: Motor Baru (5 lapak) dan Motor Bekas (20 lapak) ---------- */

const motorBaruSlots: LayoutSlot[] = deret(
  "motor-baru",
  5,
  { x: 1084, y: 386, width: 26, height: 24 },
  { dx: 0, dy: 28 },
  (i) => 5 - i,
);

const mobilMotorSlots: LayoutSlot[] = [
  ...deret("mobil-motor", 7, { x: 1126, y: 386, width: 24, height: 17 }, { dx: 0, dy: 20 }, (i) => 7 - i),
  ...deret("mobil-motor", 7, { x: 1126, y: 228, width: 24, height: 17 }, { dx: 0, dy: 20 }, (i) => 14 - i),
  ...deret("mobil-motor", 6, { x: 1086, y: 228, width: 24, height: 17 }, { dx: 0, dy: 20 }, (i) => 15 + i),
];

/* ---------- Area F, G, H: UMKM (43 lapak) ---------- */

const umkmSlots: LayoutSlot[] = [
  // Area F: dua baris mengapit playground.
  ...deret("umkm", 8, { x: 1236, y: 528, width: 21, height: 21 }, { dx: 24, dy: 0 }, (i) => i + 1),
  ...deret("umkm", 8, { x: 1236, y: 192, width: 21, height: 21 }, { dx: 24, dy: 0 }, (i) => i + 9),
  // Area G: mengikuti dua sisi bangunan miring.
  ...deretMiring("umkm", 5, { x1: 274, y1: 536, x2: 397, y2: 476 }, { width: 24, height: 22, geser: 11 }, (i) => 21 - i),
  ...deretMiring("umkm", 4, { x1: 274, y1: 546, x2: 312, y2: 672 }, { width: 29, height: 22, geser: -11 }, (i) => 22 + i),
  // Area H: dua kolom di sisi kiri kolam renang.
  ...deret("umkm", 8, { x: 174, y: 812, width: 24, height: 22 }, { dx: 0, dy: 25 }, (i) => 26 + i),
  ...deret("umkm", 10, { x: 272, y: 812, width: 24, height: 21 }, { dx: 0, dy: 24 }, (i) => 34 + i),
];

/* ---------- Warung (12 unit, belum dibuka untuk pemesanan online) ---------- */

const warungSlots: LayoutSlot[] = [
  namedSlot("slot-warung-sate-gule", "Warung Sate & Gule", kotak(982, 685, 120, 80)),
  ...Array.from({ length: 5 }, (_, i) =>
    namedSlot(`slot-warung-${pad2(i + 1)}`, `Warung ${i + 1}`, kotak(1165 + i * 48, 685, 44, 80), "vertical", i + 1),
  ),
  namedSlot("slot-warung-06", "Warung 6", kotak(1405, 685, 68, 60), "horizontal", 6),
  namedSlot("slot-warung-07", "Warung 7", kotak(1397, 750, 76, 38), "horizontal", 7),
  namedSlot("slot-warung-08", "Warung 8", kotak(1397, 790, 76, 38), "horizontal", 8),
  namedSlot("slot-warung-09", "Warung 9", kotak(1397, 832, 76, 38), "horizontal", 9),
  namedSlot("slot-warung-10", "Warung 10", kotak(1397, 876, 76, 68), "horizontal", 10),
  namedSlot("slot-warung-warmindo", "Warmindo", kotak(1397, 995, 76, 80)),
];

/* ---------- Fasilitas Umum (13 unit, TIDAK bisa dipesan) ---------- */
/* Urutan = urutan gambar: kotak besar dulu, lalu kotak kecil yang menumpang
 * di dalamnya (Tenda VIP di dalam Area Zumba) supaya tergambar di atas. */

const fasilitasSlots: LayoutSlot[] = [
  namedSlot("slot-fasilitas-kolam-pemancingan", "Kolam Pemancingan", kotak(622, 210, 434, 285)),
  namedSlot("slot-fasilitas-lapangan-tembak", "Lapangan Tembak", kotak(1483, 198, 165, 355)),
  namedSlot("slot-fasilitas-area-wahana", "Playground", kotak(1232, 218, 195, 305)),
  namedSlot("slot-fasilitas-kolam-renang", "Kolam Renang", kotak(300, 808, 555, 245)),
  namedSlot("slot-fasilitas-tempat-gym", "Tempat Gym", kotak(200, 1057, 660, 115)),
  namedSlot("slot-fasilitas-musholah", "Mushola", kotak(862, 1078, 78, 80)),
  namedSlot("slot-fasilitas-stage-utama", "Panggung", kotak(485, 630, 70, 42)),
  namedSlot("slot-fasilitas-area-zumba", "Area Zumba", kotak(1240, 1082, 155, 113)),
  namedSlot("slot-fasilitas-tenda-vip", "Tenda VIP", kotak(1246, 1150, 46, 34)),
  namedSlot("slot-fasilitas-led", "Layar LED", kotak(1243, 1257, 54, 34)),
  namedSlot("slot-fasilitas-tempat-cuci", "Cuci Mobil & Motor", kotak(1397, 1078, 76, 118), "vertical"),
  namedSlot("slot-fasilitas-toilet", "Toilet", kotak(1405, 602, 68, 26)),
  namedSlot("slot-fasilitas-kantor-sekretariat", "Sekretariat", kotak(1357, 1238, 118, 56)),
];

/* ---------- Daftar zona, urut display_order 1..8 ---------- */
/* container null: zona tidak digambar sebagai kotak berpita. Target zoom dihitung
 * dari gabungan kotak lapaknya (zoneBoundingRect). */

export const FLOOR_PLAN_ZONES: LayoutZone[] = [
  { svgGroupId: "zone-mobil-baru", name: "Area Mobil Baru", zoneType: "mobil_baru", accent: "#0a0a0a", container: null, slots: mobilBaruSlots },
  { svgGroupId: "zone-mobil-bekas", name: "Area Mobil Bekas", zoneType: "mobil_bekas", accent: "#ff7b00", container: null, slots: mobilBekasSlots },
  { svgGroupId: "zone-motor-baru", name: "Area Motor Baru", zoneType: "motor_baru", accent: "#ff7b00", container: null, slots: motorBaruSlots },
  { svgGroupId: "zone-mobil-motor", name: "Area Motor Bekas", zoneType: "mobil_motor_bekas", accent: "#ffc892", container: null, slots: mobilMotorSlots },
  { svgGroupId: "zone-umkm", name: "Area UMKM", zoneType: "umkm", accent: "#8f887b", container: null, slots: umkmSlots },
  { svgGroupId: "zone-booth-khusus", name: "Area Otomotif", zoneType: "booth_khusus", accent: "#0a0a0a", container: null, slots: otomotifSlots },
  { svgGroupId: "zone-warung", name: "Warung", zoneType: "warung", accent: "#8f887b", container: null, slots: warungSlots },
  { svgGroupId: "zone-fasilitas", name: "Fasilitas Umum", zoneType: "facility", accent: "#8f887b", container: null, slots: fasilitasSlots },
];

/* ---------- Dekor: hanya visual, tidak ada di database, tidak bisa diklik ---------- */

const TAMAN: [number, number, number, number][] = [
  [598, 522, 335, 48], [955, 522, 125, 48], [598, 596, 258, 74], [862, 602, 76, 470],
  [985, 602, 415, 78], [1145, 556, 290, 18], [465, 1276, 335, 28], [1480, 1246, 320, 58],
  [1205, 808, 30, 300], [1155, 228, 70, 125], [1155, 388, 70, 130], [1432, 196, 40, 90],
];

const BANGUNAN: [number, number, number, number][] = [
  [1693, 192, 108, 82], [1693, 318, 108, 75], [1693, 398, 108, 150],
  [1480, 602, 320, 160], [1520, 810, 280, 155], [1520, 1010, 280, 185], [495, 1170, 80, 80],
];

export const FLOOR_PLAN_DECOR: DecorItem[] = [
  ...TAMAN.map(([x, y, w, h], i) => ({ id: `taman-${i + 1}`, ...kotak(x, y, w, h), label: "", kind: "taman" as const })),
  ...BANGUNAN.map(([x, y, w, h], i) => ({ id: `bangunan-${i + 1}`, ...kotak(x, y, w, h), label: "", kind: "bangunan" as const })),
  { id: "bangunan-area-g", ...kotak(303, 512, 132, 100), label: "", kind: "bangunan", rotate: -26 },
  { id: "gerbang-masuk", ...kotak(938, 1206, 26, 50), label: "", kind: "gerbang" },
];

export const DECOR_STYLE: Record<DecorItem["kind"], { fill: string; stroke: string | null }> = {
  taman: { fill: "#dfe4d3", stroke: null },
  bangunan: { fill: "#f1ede5", stroke: null },
  gerbang: { fill: "none", stroke: "#ff7b00" },
};

/** Label area di denah (kotak hitam kecil, teks putih). x,y = pojok kiri atas. */
export const FLOOR_PLAN_ANNOTATIONS: { x: number; y: number; text: string }[] = (
  [
    [980, 1216, "AREA A"], [985, 1122, "AREA B"], [1090, 1122, "AREA C"], [1246, 1088, "AREA D"],
    [1084, 536, "AREA E"], [1350, 226, "AREA F"], [460, 548, "AREA G"], [204, 780, "AREA H"],
    [858, 1262, "GERBANG MASUK"],
  ] as [number, number, string][]
).map(([x, y, text]) => ({ x: x - SUMBER_X, y: y - SUMBER_Y, text }));

/* ---------- Helper pencarian & teks ---------- */

const SLOT_INDEX: Map<string, LayoutSlot> = new Map(
  FLOOR_PLAN_ZONES.flatMap((zone) => zone.slots).map((slot) => [slot.svgElementId, slot]),
);

export function findLayoutSlot(svgElementId: string): LayoutSlot | undefined {
  return SLOT_INDEX.get(svgElementId);
}

/** Total kotak di denah: 178 (153 bisa dipesan + 12 warung + 13 fasilitas). */
export function layoutSlotCount(): number {
  return SLOT_INDEX.size;
}

/** Semua container sebuah zona (utama + tambahan), urut. */
export function zoneContainers(zone: LayoutZone): LayoutContainer[] {
  return [...(zone.container ? [zone.container] : []), ...(zone.extraContainers ?? [])];
}

/**
 * Slot sebuah zona yang titik tengahnya berada di dalam `container` — dipakai
 * pita judul untuk menampilkan statistik PER KOLOM (zona UMKM punya dua kolom).
 */
export function slotsInContainer(zone: LayoutZone, container: Rect): LayoutSlot[] {
  return zone.slots.filter((slot) => {
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    return (
      cx >= container.x &&
      cx <= container.x + container.width &&
      cy >= container.y &&
      cy <= container.y + container.height
    );
  });
}

/** Gabungan beberapa rect jadi satu kotak pembungkus; null bila kosong. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Kotak target zoom sebuah zona: gabungan seluruh container-nya, atau bounding
 * box slotnya bila zona tidak punya container.
 */
export function zoneBoundingRect(zone: LayoutZone): Rect | null {
  const containers = zoneContainers(zone);
  if (containers.length > 0) return unionRect(containers);
  return unionRect(zone.slots);
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
