import type { ZoneType } from "@/lib/types/database";

/**
 * GEOMETRI DENAH, sengaja HARDCODE (keputusan di "Sistem Pameran Arsitektur.md":
 * sistem ini khusus satu event, layout boleh hardcode).
 *
 * Sumber angka: Figma "Layout Konstrad" frame "Layout Final" (23 Oktober 2026),
 * hasil konversi DWG "kostrad 2" dengan skala 10 px = 1 m. Koordinat di bawah
 * ditulis dalam satuan frame Figma itu lalu digeser ASAL supaya viewBox mulai
 * dari 0. Garis gedung dan jalan ada di denah-dasar.ts.
 * Kalau denah berubah, ubah file ini saja, lalu jalankan `npm run denah` untuk
 * membuat ulang public/denah.svg (tools/generate-denah-svg.ts).
 *
 * svgElementId WAJIB identik dengan kolom slots.svg_element_id di database
 * (db/seed.sql).
 *
 * Jumlah lapak yang bisa dipesan: mobil baru 13 (Area A 1-10, Area C 11-13),
 * mobil bekas 20 (Area C), motor baru 8 (Area C), motor bekas 42 (Area C 1-14,
 * Area E 15-42), otomotif 16 (Area B), UMKM 37 (Area B 1-7, F 8-9, G 10-19,
 * H 20-37). Total 136.
 *
 * Catatan render:
 * - `label` adalah teks di dalam kotak. Zona bernomor berisi angka lapak,
 *   fasilitas berisi nama unit.
 * - Warna isi kotak ditentukan STATUS (SLOT_STATUS_STYLE di domain/constants.ts).
 */

export const FLOOR_PLAN_VIEWBOX = { width: 2050, height: 1420 };

/** Titik frame Figma yang menjadi (0, 0) viewBox. */
const ASAL = 280;

/** Batas lahan (path SVG, sudah dalam satuan viewBox). */
export const FLOOR_PLAN_OUTLINE = "M 20 20 L 2027.1 20 L 2027.1 1400.5 L 20 1400.5 Z";

export type Rect = { x: number; y: number; width: number; height: number };

export type LabelOrientation = "horizontal" | "vertical";

export type LayoutSlot = Rect & {
  svgElementId: string;
  label: string;
  slotNumber: number | null;
  labelOrientation: LabelOrientation;
  /**
   * Derajat rotasi KOTAK (searah jarum jam) mengelilingi titik tengahnya,
   * dipakai lapak yang miring (UMKM Area G, motor bekas Area E). Teks nomor
   * tetap tegak.
   */
  rotate?: number;
};

/**
 * Kotak container zona + pita judul. `title` (opsional) menggantikan nama zona
 * pada pita.
 */
export type LayoutContainer = Rect & { labelOrientation: LabelOrientation; title?: string };

/** Bagian zona per area denah, dipakai langkah "Pilih Zona" untuk zoom ke kelompok slot. */
export type ZoneSection = { area: string; nomorAwal: number; nomorAkhir: number };

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
  /** Pembagian nomor lapak per area, urut. Kosong untuk zona non-pesan. */
  sections?: ZoneSection[];
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

/** Kotak dalam satuan frame Figma, digeser ke satuan viewBox. */
function kotak(x: number, y: number, width: number, height: number): Rect {
  return { x: round1(x - ASAL), y: round1(y - ASAL), width, height };
}

function numberedSlot(zoneSlug: string, slotNumber: number, rect: Rect, rotate?: number): LayoutSlot {
  return {
    ...rect,
    svgElementId: `slot-${zoneSlug}-${pad2(slotNumber)}`,
    label: String(slotNumber),
    slotNumber,
    labelOrientation: "horizontal",
    ...(rotate ? { rotate } : {}),
  };
}

function namedSlot(
  svgElementId: string,
  label: string,
  rect: Rect,
  labelOrientation: LabelOrientation = "horizontal",
  rotate?: number,
): LayoutSlot {
  return { ...rect, svgElementId, label, slotNumber: null, labelOrientation, ...(rotate ? { rotate } : {}) };
}

/** Deret lapak bernomor dalam satuan frame: kotak ke-i bergeser (dx, dy), nomor mulai `awalNomor`. */
function deret(
  zoneSlug: string,
  jumlah: number,
  awal: { x: number; y: number; width: number; height: number },
  langkah: { dx: number; dy: number },
  awalNomor: number,
  rotate?: number,
): LayoutSlot[] {
  return Array.from({ length: jumlah }, (_, i) =>
    numberedSlot(
      zoneSlug,
      awalNomor + i,
      kotak(awal.x + i * langkah.dx, awal.y + i * langkah.dy, awal.width, awal.height),
      rotate,
    ),
  );
}

/**
 * Lapak miring: titik tengah dari bounding box Figma (pojok kiri atas bx, by,
 * ukuran bw x bh), kotak asli width x height diputar `rotate` derajat.
 */
function miring(
  zoneSlug: string,
  slotNumber: number,
  bbox: [number, number, number, number],
  ukuran: { width: number; height: number },
  rotate: number,
): LayoutSlot {
  const [bx, by, bw, bh] = bbox;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  return numberedSlot(
    zoneSlug,
    slotNumber,
    kotak(cx - ukuran.width / 2, cy - ukuran.height / 2, ukuran.width, ukuran.height),
    rotate,
  );
}

/* ---------- Mobil Baru: tenda 5 x 5 m, Area A 1-10 dan Area C 11-13 ---------- */

const mobilBaruSlots: LayoutSlot[] = [
  ...deret("mobil-baru", 5, { x: 1035, y: 320, width: 50, height: 50 }, { dx: 56, dy: 0 }, 1),
  ...deret("mobil-baru", 5, { x: 1035, y: 430, width: 50, height: 50 }, { dx: 56, dy: 0 }, 6),
  ...deret("mobil-baru", 3, { x: 1036, y: 546, width: 50, height: 50 }, { dx: 0, dy: 51 }, 11),
];

/* ---------- Mobil Bekas: Area C, dua kolom slot 4,5 x 2,5 m ---------- */

const mobilBekasSlots: LayoutSlot[] = [
  ...deret("mobil-bekas", 10, { x: 1144.5, y: 549.7, width: 45, height: 25 }, { dx: 0, dy: 33 }, 1),
  ...deret("mobil-bekas", 10, { x: 1194.5, y: 549.7, width: 45, height: 25 }, { dx: 0, dy: 33 }, 11),
];

/* ---------- Otomotif: Area B, tenant 3 x 3 m (kolom 1-10 dan 11-16) ---------- */

const otomotifSlots: LayoutSlot[] = [
  ...deret("otomotif", 10, { x: 802, y: 601, width: 30, height: 30 }, { dx: 0, dy: 30 }, 1),
  ...deret("otomotif", 6, { x: 958.5, y: 739, width: 30, height: 30 }, { dx: 0, dy: 30 }, 11),
];

/* ---------- Motor Baru: Area C, tenda dealer 3 x 3 m ---------- */

const motorBaruSlots: LayoutSlot[] = deret(
  "motor-baru",
  8,
  { x: 1278, y: 676, width: 30, height: 30 },
  { dx: 0, dy: 30 },
  1,
);

/* ---------- Motor Bekas: Area C 1-14 (satu kolom), Area E 15-42 (miring 45 derajat) ---------- */

const MOTOR_E = { width: 11, height: 24 };
const motorEKolom = (x: number, y0: number, awal: number, rotate: number) =>
  Array.from({ length: 7 }, (_, i) =>
    miring("mobil-motor", awal + i, [x, y0 + i * 23.5, 23.7, 23.7], MOTOR_E, rotate),
  );

const mobilMotorSlots: LayoutSlot[] = [
  ...deret("mobil-motor", 14, { x: 1040, y: 746.8, width: 24, height: 11 }, { dx: 0, dy: 12 }, 1),
  ...motorEKolom(1101.5, 1276.8, 15, 45),
  ...motorEKolom(1159.8, 1276.8, 22, -45),
  ...motorEKolom(1101.5, 1472.8, 29, 45),
  ...motorEKolom(1159.8, 1472.8, 36, -45),
];

/* ---------- UMKM: Area B 1-7, F 8-9, G 10-19 (miring), H 20-37 ---------- */

const UMKM_G = { width: 28, height: 30 };

const umkmSlots: LayoutSlot[] = [
  ...deret("umkm", 7, { x: 882.5, y: 634.5, width: 30, height: 30 }, { dx: 0, dy: 30 }, 1),
  numberedSlot("umkm", 8, kotak(753, 1651.5, 30, 30)),
  numberedSlot("umkm", 9, kotak(970, 1651.5, 30, 30)),
  ...(
    [
      [2149.8, 1098.8], [2156.5, 1129], [2163.2, 1159.3], [2169.9, 1189.6], [2176.6, 1219.8],
    ] as [number, number][]
  ).map(([x, y], i) => miring("umkm", 10 + i, [x, y, 33.8, 35.3], UMKM_G, -12)),
  ...(
    [
      [2157.1, 1255.3], [2130.3, 1270.9], [2103.5, 1286.5], [2076.7, 1302.1], [2049.9, 1317.7],
    ] as [number, number][]
  ).map(([x, y], i) => miring("umkm", 15 + i, [x, y, 40, 39.3], UMKM_G, 60)),
  ...deret("umkm", 10, { x: 2157.1, y: 615.5, width: 30, height: 30 }, { dx: 0, dy: 30 }, 20),
  ...deret("umkm", 8, { x: 2277.1, y: 675.5, width: 30, height: 30 }, { dx: 0, dy: 30 }, 30),
];

/* ---------- Fasilitas & zona pendukung (TIDAK bisa dipesan) ---------- */
/* Urutan = urutan gambar: kotak besar dulu supaya kotak kecil tergambar di atas. */

const fasilitasSlots: LayoutSlot[] = [
  namedSlot("slot-fasilitas-playground", "Playground", kotak(760.3, 1301, 241.2, 333.6)),
  namedSlot("slot-fasilitas-parkir-mobil", "Parkir Mobil", kotak(2019, 1178, 122, 122), "horizontal", -29.2),
  namedSlot("slot-fasilitas-parkir-mobil-bekas", "Parkir Mobil Bekas", kotak(2190, 614, 84, 300), "vertical"),
  namedSlot("slot-fasilitas-parkir-motor-bekas", "Parkir Motor Bekas", kotak(1187, 1177, 277, 42)),
  namedSlot("slot-fasilitas-area-slalom", "Area Slalom", kotak(803, 446, 122, 139)),
  namedSlot("slot-fasilitas-mushola", "Mushola", kotak(1360.5, 491.5, 97, 97)),
  namedSlot("slot-fasilitas-stage", "Stage LED", kotak(925.2, 320, 60, 50)),
  namedSlot("slot-fasilitas-tenda-vip", "Tenda VIP", kotak(929, 533, 60, 57)),
  namedSlot("slot-fasilitas-wahana", "Wahana", kotak(944, 609, 40, 60), "vertical"),
  namedSlot("slot-fasilitas-photobooth", "Photobooth", kotak(1278, 543, 30, 60), "vertical"),
  namedSlot("slot-fasilitas-service-gratis", "Service Gratis", kotak(1061.5, 1325.5, 30, 110), "vertical"),
  namedSlot("slot-fasilitas-ganti-oli", "Ganti Oli Gratis", kotak(1061.5, 1478.5, 30, 110), "vertical"),
  namedSlot("slot-fasilitas-gerbang", "Gerbang", kotak(1319, 370, 40, 60), "vertical"),
];

/* ---------- Daftar zona, urut display_order ---------- */
/* container null: zona tidak digambar sebagai kotak berpita. Target zoom dihitung
 * dari gabungan kotak lapaknya (zoneBoundingRect) atau kotak bagian per area. */

export const FLOOR_PLAN_ZONES: LayoutZone[] = [
  // Fasilitas digambar paling awal supaya lapak yang bersebelahan selalu di atasnya.
  { svgGroupId: "zone-fasilitas", name: "Fasilitas Umum", zoneType: "facility", accent: "#8f887b", container: null, slots: fasilitasSlots },
  {
    svgGroupId: "zone-mobil-baru", name: "Area Mobil Baru", zoneType: "mobil_baru", accent: "#0a0a0a", container: null,
    sections: [{ area: "A", nomorAwal: 1, nomorAkhir: 10 }, { area: "C", nomorAwal: 11, nomorAkhir: 13 }],
    slots: mobilBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-bekas", name: "Area Mobil Bekas", zoneType: "mobil_bekas", accent: "#ff7b00", container: null,
    sections: [{ area: "C", nomorAwal: 1, nomorAkhir: 20 }],
    slots: mobilBekasSlots,
  },
  {
    svgGroupId: "zone-motor-baru", name: "Area Motor Baru", zoneType: "motor_baru", accent: "#ff7b00", container: null,
    sections: [{ area: "C", nomorAwal: 1, nomorAkhir: 8 }],
    slots: motorBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-motor", name: "Area Motor Bekas", zoneType: "mobil_motor_bekas", accent: "#ffc892", container: null,
    sections: [{ area: "C", nomorAwal: 1, nomorAkhir: 14 }, { area: "E", nomorAwal: 15, nomorAkhir: 42 }],
    slots: mobilMotorSlots,
  },
  {
    svgGroupId: "zone-umkm", name: "Area UMKM", zoneType: "umkm", accent: "#8f887b", container: null,
    sections: [
      { area: "B", nomorAwal: 1, nomorAkhir: 7 }, { area: "F", nomorAwal: 8, nomorAkhir: 9 },
      { area: "G", nomorAwal: 10, nomorAkhir: 19 }, { area: "H", nomorAwal: 20, nomorAkhir: 37 },
    ],
    slots: umkmSlots,
  },
  {
    svgGroupId: "zone-booth-khusus", name: "Area Otomotif", zoneType: "booth_khusus", accent: "#0a0a0a", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 16 }],
    slots: otomotifSlots,
  },
];

/* ---------- Dekor: hanya visual, tidak ada di database, tidak bisa diklik ---------- */
/* Gedung, jalan, dan kolam sudah tergambar sebagai garis di denah-dasar.ts. */

export const FLOOR_PLAN_DECOR: DecorItem[] = [];

export const DECOR_STYLE: Record<DecorItem["kind"], { fill: string; stroke: string | null }> = {
  taman: { fill: "#dfe4d3", stroke: null },
  bangunan: { fill: "#f1ede5", stroke: null },
  gerbang: { fill: "none", stroke: "#ff7b00" },
};

/** Label area di denah (kotak hitam kecil, teks putih). x,y = pojok kiri atas. Posisi = badge di Figma. */
export const FLOOR_PLAN_ANNOTATIONS: { x: number; y: number; text: string }[] = (
  [
    [1036, 391, "AREA A"], [928, 693, "AREA B"], [1089, 548, "AREA C"], [706, 450, "AREA D"],
    [1101, 1176, "AREA E"], [754, 1232, "AREA F"], [2047, 1096, "AREA G"], [2108, 620, "AREA H"],
    [1366, 391, "GERBANG MASUK"],
  ] as [number, number, string][]
).map(([x, y, text]) => ({ x: x - ASAL, y: y - ASAL, text }));

/** Slot milik satu bagian zona (nomor lapak dalam rentang bagian itu). */
export function slotsInSection(zone: LayoutZone, section: ZoneSection): LayoutSlot[] {
  return zone.slots.filter(
    (slot) => slot.slotNumber !== null && slot.slotNumber >= section.nomorAwal && slot.slotNumber <= section.nomorAkhir,
  );
}

/* ---------- Helper pencarian & teks ---------- */

const SLOT_INDEX: Map<string, LayoutSlot> = new Map(
  FLOOR_PLAN_ZONES.flatMap((zone) => zone.slots).map((slot) => [slot.svgElementId, slot]),
);

export function findLayoutSlot(svgElementId: string): LayoutSlot | undefined {
  return SLOT_INDEX.get(svgElementId);
}

/** Total kotak di denah: 149 (136 bisa dipesan + 13 fasilitas). */
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
