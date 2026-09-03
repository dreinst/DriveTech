import type { ZoneType } from "@/lib/types/database";

/**
 * GEOMETRI DENAH — sengaja HARDCODE (keputusan di "Sistem Pameran Arsitektur.md":
 * sistem ini khusus satu event, layout boleh hardcode).
 *
 * Sumber angka: berkas "layout-venue-v2.jpeg" di root proyek (Layout v2,
 * 2026-09-02; gambar asli 2941x4160 px), diekstrak ke satuan viewBox portrait
 * 1123 x 1600 (x dikali 0,3818; y dikali 0,3846). Kotak berwarna diukur
 * lewat segmentasi warna, kotak fasilitas bergaris hitam diukur manual.
 * Kalau denah asli berubah, ubah file ini saja — public/denah.svg dibuat ulang
 * dari data yang sama lewat `npm run denah` (tools/generate-denah-svg.ts).
 *
 * svgElementId WAJIB identik dengan kolom slots.svg_element_id di supabase/seed.sql.
 *
 * Perubahan Layout v2 dibanding v1:
 * - Area C dipecah: Tenda Motor Baru (4 slot, zona baru zone-motor-baru) di
 *   atas Area Motor Bekas (8 slot, dua kolom). Jumlah mengikuti GAMBAR
 *   (4 + 8; keputusan pemilik 2026-09-03) — teks Deck v4 menyebut 3 + 14.
 * - Area D jadi tiga kolom sama lebar: UMKM 1-10, Leasing & Otomotif 11-20,
 *   UMKM & Otomotif 21-30 — zona UMKM punya DUA container (extraContainers).
 * - Fasilitas baru: VIP Lounge, LED, Tenda VIP, Area Wahana, Toilet.
 * - Label huruf area (AREA A–D) mengikuti Deck v4 slide 10.
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

function namedSlot(
  svgElementId: string,
  label: string,
  rect: Rect,
  labelOrientation: LabelOrientation = "horizontal",
  slotNumber: number | null = null,
): LayoutSlot {
  return { ...rect, svgElementId, label, slotNumber, labelOrientation };
}

/* ---------- Area A: Tenda Dealer Mobil Baru (10 slot, 2 baris x 5) ---------- */

const MOBIL_BARU_X = [500, 563, 626, 689, 752];
const MOBIL_BARU_ROW_Y = [184, 296];

const mobilBaruSlots: LayoutSlot[] = MOBIL_BARU_ROW_Y.flatMap((y, row) =>
  MOBIL_BARU_X.map((x, col) =>
    numberedSlot("mobil-baru", row * MOBIL_BARU_X.length + col + 1, { x, y, width: 60, height: 56 }),
  ),
);

/* ---------- Area B: Area Pameran Mobil Bekas (30 slot, 3 kolom x 10) ---------- */
/* Kolom 1-10 di gambar digambar miring (mobil parkir serong) dan lebih panjang
 * dari dua kolom lain; di denah digital semuanya kotak lurus. */

const MOBIL_BEKAS_GROUPS = [
  { startNumber: 1, x: 498, width: 50, height: 33, baseY: 438, pitch: 40.5 },
  { startNumber: 11, x: 620, width: 50, height: 32, baseY: 438, pitch: 36.5 },
  { startNumber: 21, x: 674, width: 50, height: 32, baseY: 438, pitch: 36.5 },
];

const mobilBekasSlots: LayoutSlot[] = MOBIL_BEKAS_GROUPS.flatMap((group) =>
  Array.from({ length: 10 }, (_, i) =>
    numberedSlot("mobil-bekas", group.startNumber + i, {
      x: group.x,
      y: round1(group.baseY + i * group.pitch),
      width: group.width,
      height: group.height,
    }),
  ),
);

/* ---------- Area C (atas): Tenda Motor Baru (4 slot, satu kolom) ---------- */

const motorBaruSlots: LayoutSlot[] = Array.from({ length: 4 }, (_, i) =>
  numberedSlot("motor-baru", i + 1, { x: 762, y: 468 + i * 42, width: 70, height: 34 }),
);

/* ---------- Area C (bawah): Area Pameran Motor Bekas (8 slot, 2 kolom x 4) ---------- */
/* Gambar menunjukkan satu kolom motor serong; di denah digital dibagi dua
 * kolom kotak lurus supaya tetap terbaca: kiri 1-4, kanan 5-8. */

const MOTOR_BEKAS_COL_X = [762, 800];

const mobilMotorSlots: LayoutSlot[] = MOTOR_BEKAS_COL_X.flatMap((x, col) =>
  Array.from({ length: 4 }, (_, row) =>
    numberedSlot("mobil-motor", col * 4 + row + 1, {
      x,
      y: 674 + row * 38,
      width: 34,
      height: 30,
    }),
  ),
);

/* ---------- Area D: tiga kolom sama lebar (UMKM 1-10 | Leasing 11-20 | UMKM & Otomotif 21-30) ---------- */
/* Nomor 11-20 milik zona booth; svg_element_id tetap "slot-umkm-11..20"
 * agar cocok dengan database (keputusan 2026-08-29). */

const AREA_D_SLOT_RECT = { width: 40, height: 30 };
const areaDY = (i: number): number => round1(494 + i * 34);
const AREA_D_COLUMN_X = { umkm1: 268, booth: 340, umkm21: 412 } as const;

const umkmSlots: LayoutSlot[] = [
  ...Array.from({ length: 10 }, (_, i) =>
    numberedSlot("umkm", i + 1, { x: AREA_D_COLUMN_X.umkm1, y: areaDY(i), ...AREA_D_SLOT_RECT }),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    numberedSlot("umkm", i + 21, { x: AREA_D_COLUMN_X.umkm21, y: areaDY(i), ...AREA_D_SLOT_RECT }),
  ),
];

const boothKhususSlots: LayoutSlot[] = Array.from({ length: 10 }, (_, i) =>
  numberedSlot("umkm", i + 11, { x: AREA_D_COLUMN_X.booth, y: areaDY(i), ...AREA_D_SLOT_RECT }),
);

/* ---------- Warung (12 unit, posisi tersebar, ditulis eksplisit) ---------- */

const warungSlots: LayoutSlot[] = [
  namedSlot("slot-warung-warmindo", "Warmindo", { x: 127, y: 474, width: 111, height: 102 }),
  namedSlot("slot-warung-01", "Warung 1", { x: 127, y: 652, width: 111, height: 96 }, "horizontal", 1),
  namedSlot("slot-warung-02", "Warung 2", { x: 127, y: 756, width: 111, height: 48 }, "horizontal", 2),
  namedSlot("slot-warung-03", "Warung 3", { x: 127, y: 812, width: 111, height: 48 }, "horizontal", 3),
  namedSlot("slot-warung-04", "Warung 4", { x: 127, y: 864, width: 100, height: 40 }, "horizontal", 4),
  namedSlot("slot-warung-05", "Warung 5", { x: 129, y: 924, width: 93, height: 85 }, "vertical", 5),
  namedSlot("slot-warung-06", "Warung 6", { x: 240, y: 901, width: 45, height: 108 }, "vertical", 6),
  namedSlot("slot-warung-07", "Warung 7", { x: 291, y: 901, width: 61, height: 108 }, "vertical", 7),
  namedSlot("slot-warung-08", "Warung 8", { x: 356, y: 901, width: 63, height: 108 }, "vertical", 8),
  namedSlot("slot-warung-09", "Warung 9", { x: 423, y: 901, width: 63, height: 108 }, "vertical", 9),
  namedSlot("slot-warung-10", "Warung 10", { x: 490, y: 901, width: 64, height: 108 }, "vertical", 10),
  namedSlot("slot-warung-sate-gule", "Warung Sate & Gule", { x: 640, y: 901, width: 170, height: 108 }),
];

/* ---------- Fasilitas Umum (13 unit, TIDAK bisa dibooking) ---------- */
/* Urutan = urutan gambar: kotak besar dulu, lalu kotak kecil yang menumpang
 * di dalamnya (Tenda VIP di dalam Area Zumba) supaya tergambar di atas. */

const fasilitasSlots: LayoutSlot[] = [
  namedSlot("slot-fasilitas-kantor-sekretariat", "Kantor Sekretariat & Rest Area Kostrad", { x: 129, y: 170, width: 165, height: 33 }),
  namedSlot("slot-fasilitas-vip-lounge", "VIP Lounge", { x: 129, y: 207, width: 165, height: 41 }),
  namedSlot("slot-fasilitas-led", "LED", { x: 379, y: 166, width: 70, height: 13 }),
  namedSlot("slot-fasilitas-stage-utama", "Stage Utama", { x: 379, y: 183, width: 70, height: 44 }),
  namedSlot("slot-fasilitas-tempat-cuci", "Tempat Cuci Mobil & Motor", { x: 127, y: 302, width: 109, height: 170 }, "vertical"),
  namedSlot("slot-fasilitas-area-zumba", "Area Zumba", { x: 238, y: 302, width: 215, height: 150 }),
  namedSlot("slot-fasilitas-tenda-vip", "Tenda VIP", { x: 383, y: 396, width: 66, height: 48 }),
  namedSlot("slot-fasilitas-musholah", "Musholah", { x: 876, y: 368, width: 108, height: 96 }),
  namedSlot("slot-fasilitas-area-wahana", "Area Wahana", { x: 240, y: 852, width: 586, height: 42 }),
  namedSlot("slot-fasilitas-toilet", "Toilet", { x: 131, y: 1016, width: 28, height: 80 }, "vertical"),
  namedSlot("slot-fasilitas-lapangan-tembak", "Lapangan Tembak", { x: 127, y: 1172, width: 556, height: 236 }),
  namedSlot("slot-fasilitas-parkiran", "Parkiran Untuk Pengunjung", { x: 683, y: 1172, width: 108, height: 236 }, "vertical"),
  namedSlot("slot-fasilitas-kolam-pemancingan", "Kolam Pemancingan", { x: 791, y: 1172, width: 220, height: 236 }),
];

/* ---------- Daftar zona, urut display_order 1..8 ---------- */

export const FLOOR_PLAN_ZONES: LayoutZone[] = [
  {
    svgGroupId: "zone-mobil-baru",
    name: "Tenda Dealer Mobil Baru",
    zoneType: "mobil_baru",
    accent: "#7030a0",
    container: { x: 492, y: 154, width: 330, height: 212, labelOrientation: "horizontal" },
    slots: mobilBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-bekas",
    name: "Area Pameran Mobil Bekas",
    zoneType: "mobil_bekas",
    accent: "#c00000",
    container: { x: 492, y: 392, width: 236, height: 452, labelOrientation: "horizontal" },
    // Arah lalu lintas kendaraan di dalam zona (digambar dengan segitiga panah kecil).
    annotations: [
      { x: 600, y: 428, text: "MASUK" },
      { x: 700, y: 428, text: "KELUAR" },
    ],
    slots: mobilBekasSlots,
  },
  {
    svgGroupId: "zone-motor-baru",
    name: "Area Pameran Motor Baru",
    zoneType: "motor_baru",
    accent: "#00b050",
    container: { x: 734, y: 440, width: 106, height: 196, labelOrientation: "vertical", title: "Motor Baru" },
    slots: motorBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-motor",
    name: "Area Pameran Motor Bekas",
    zoneType: "mobil_motor_bekas",
    accent: "#ff00ff",
    container: { x: 734, y: 644, width: 106, height: 200, labelOrientation: "vertical", title: "Motor Bekas" },
    slots: mobilMotorSlots,
  },
  {
    // Dua kolom fisik yang mengapit kolom booth: container utama = kolom 1-10,
    // container tambahan = kolom 21-30. Pita VERTIKAL: kolom selebar 70 tidak
    // muat menampung judul mendatar.
    svgGroupId: "zone-umkm",
    name: "Tenda UMKM",
    zoneType: "umkm",
    accent: "#0070c0",
    container: { x: 240, y: 462, width: 70, height: 386, labelOrientation: "vertical", title: "UMKM 1-10" },
    extraContainers: [
      { x: 384, y: 462, width: 70, height: 386, labelOrientation: "vertical", title: "UMKM & Otomotif 21-30" },
    ],
    slots: umkmSlots,
  },
  {
    svgGroupId: "zone-booth-khusus",
    name: "Tenda Otomotif & Leasing",
    zoneType: "booth_khusus",
    accent: "#0f766e",
    container: { x: 312, y: 462, width: 70, height: 386, labelOrientation: "vertical", title: "Leasing & Otomotif 11-20" },
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
  { id: "pagar-atas", x: 127, y: 136, width: 740, height: 12, label: "", kind: "pagar" },
  { id: "taman-kanan", x: 876, y: 476, width: 108, height: 644, label: "Taman", kind: "taman" },
  { id: "taman-kiri-bawah", x: 165, y: 1016, width: 395, height: 104, label: "Taman", kind: "taman" },
  { id: "taman-tengah-bawah", x: 648, y: 1016, width: 168, height: 104, label: "Taman", kind: "taman" },

  // Tank display Kostrad (kendaraan hijau di gambar asli) — murni dekor, bukan slot.
  // Rect ditulis SEBELUM rotasi; laras menghadap sumbu +x, lalu dirotasi `rotate`°.
  { id: "tank-sekretariat", x: 300, y: 176, width: 80, height: 36, label: "Tank", kind: "tank", rotate: -60 },
  { id: "tank-umkm", x: 130, y: 592, width: 100, height: 38, label: "Tank", kind: "tank", rotate: 0 },
  { id: "tank-warung", x: 553, y: 937, width: 90, height: 36, label: "Tank", kind: "tank", rotate: 90 },
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

/** Anotasi teks bebas di denah (text-anchor middle, font 12). Huruf area ikut Deck v4 slide 10. */
export const FLOOR_PLAN_ANNOTATIONS: { x: number; y: number; text: string; bold?: boolean }[] = [
  { x: 917, y: 160, text: "PINTU MASUK & KELUAR", bold: true },
  { x: 917, y: 182, text: "REST AREA KOSTRAD", bold: true },
  { x: 917, y: 262, text: "AREA A", bold: true },
  { x: 610, y: 380, text: "AREA B", bold: true },
  { x: 787, y: 428, text: "AREA C", bold: true },
  { x: 290, y: 432, text: "AREA D", bold: true },
];

/* ---------- Helper pencarian & teks ---------- */

const SLOT_INDEX: Map<string, LayoutSlot> = new Map(
  FLOOR_PLAN_ZONES.flatMap((zone) => zone.slots).map((slot) => [slot.svgElementId, slot]),
);

export function findLayoutSlot(svgElementId: string): LayoutSlot | undefined {
  return SLOT_INDEX.get(svgElementId);
}

/** Total kotak slot di denah — harus 107 (82 bisa dibooking + 12 warung + 13 fasilitas). */
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
