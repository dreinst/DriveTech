import type { ZoneType } from "@/lib/types/database";

/**
 * GEOMETRI DENAH, sengaja HARDCODE (keputusan di "Sistem Pameran Arsitektur.md":
 * sistem ini khusus satu event, layout boleh hardcode).
 *
 * Sumber angka: Figma "Layout Konstrad" frame "Draf Revisi Andrew 3 Nov" (layout final 4 November 2026,
 * menggantikan frame "Layout Final" 23 Oktober),
 * hasil konversi DWG "kostrad 2" dengan skala 10 px = 1 m. Koordinat di bawah
 * ditulis dalam satuan frame Figma itu lalu digeser ASAL supaya viewBox mulai
 * dari 0. Garis gedung dan jalan ada di denah-dasar.ts.
 * Kalau denah berubah, ubah file ini saja, lalu jalankan `npm run denah` untuk
 * membuat ulang public/denah.svg (tools/generate-denah-svg.ts).
 *
 * svgElementId WAJIB identik dengan kolom slots.svg_element_id di database
 * (db/seed.sql).
 *
 * Layout final 4 November: semua lapak dipadatkan ke Area A dan B dekat stage.
 * Lapak yang bisa dipesan: mobil baru 6 (Area A 1-3 dan 6-8), mobil bekas 6 plus 2 truk pameran (21-22),
 * motor baru 3 (D1-D2 dan opsi tenda Yamaha D3), motor bekas 8, otomotif 4,
 * UMKM 7, semuanya di Area B kecuali mobil baru. Total 36. Nomor lain
 * (mobil baru 4, 5, 9-13, mobil bekas 7-20, motor baru 4-8, motor bekas 9-14,
 * otomotif 5-16) tidak digambar lagi; barisnya di database tetap ada tetapi
 * diblokir (db/migrasi/20261104-layout-final.sql) supaya booking lama tetap utuh.
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
   * dipakai lapak yang miring. Teks nomor
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

/* ---------- Mobil Baru: Area A, tenda 5 x 5 m, deret depan 1-3 dan deret belakang 6-8 ---------- */

const mobilBaruSlots: LayoutSlot[] = [
  ...deret("mobil-baru", 3, { x: 1045, y: 320, width: 50, height: 50 }, { dx: 51, dy: 0 }, 1),
  ...deret("mobil-baru", 3, { x: 1045, y: 430, width: 50, height: 50 }, { dx: 51, dy: 0 }, 6),
];

/* ---------- Mobil Bekas: Area B, slot 4,5 x 2,5 m, 1-3 di kiri bawah dan 4-6 di kanan atas ---------- */

const mobilBekasSlots: LayoutSlot[] = [
  ...deret("mobil-bekas", 3, { x: 802, y: 732, width: 45, height: 25 }, { dx: 0, dy: 33 }, 1),
  ...deret("mobil-bekas", 3, { x: 942, y: 600, width: 45, height: 25 }, { dx: 0, dy: 33 }, 4),
  // Truk pameran 8 x 3,5 m (unit panitia), nomor 21 dan 22 di zona mobil bekas.
  { ...kotak(802, 836, 80, 35), svgElementId: "slot-mobil-bekas-truk-1", label: "Truk 1", slotNumber: 21, labelOrientation: "horizontal" },
  { ...kotak(802, 881, 80, 35), svgElementId: "slot-mobil-bekas-truk-2", label: "Truk 2", slotNumber: 22, labelOrientation: "horizontal" },
];

/* ---------- Otomotif: Area B, tenda 3 x 3 m, satu kolom 1-4 di sisi kiri ---------- */

const otomotifSlots: LayoutSlot[] = deret("otomotif", 4, { x: 802, y: 600, width: 30, height: 30 }, { dx: 0, dy: 30 }, 1);

/* ---------- Motor Baru: Area B, tenda dealer 3 x 3 m (D3 = opsi tenda Yamaha, berjarak dari D1-D2) ---------- */

const motorBaruSlots: LayoutSlot[] = [
  ...deret("motor-baru", 2, { x: 957, y: 739, width: 30, height: 30 }, { dx: 0, dy: 30 }, 1),
  numberedSlot("motor-baru", 3, kotak(906, 884, 30, 30)),
];

/* ---------- Motor Bekas: Area B, satu kolom 8 lapak di bawah D2 ---------- */

const mobilMotorSlots: LayoutSlot[] = deret(
  "mobil-motor",
  8,
  { x: 960, y: 803, width: 24, height: 9.5 },
  { dx: 0, dy: 12 },
  1,
);

/* ---------- UMKM: Area B 1-7, kolom tengah ---------- */

const umkmSlots: LayoutSlot[] = [
  ...deret("umkm", 7, { x: 882.5, y: 600, width: 30, height: 30 }, { dx: 0, dy: 30 }, 1),
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
  namedSlot("slot-fasilitas-komunitas-kanan", "Area Komunitas", kotak(1200.5, 631.5, 107.5, 284.5), "vertical"),
  namedSlot("slot-fasilitas-komunitas-kiri", "Area Komunitas", kotak(1038, 712, 144, 204)),
  namedSlot("slot-fasilitas-stage", "Stage LED", kotak(925.2, 320, 60, 30)),
  namedSlot("slot-fasilitas-foh", "FOH", kotak(883, 320, 40, 20)),
  namedSlot("slot-fasilitas-tenda-vip", "Tenda VIP", kotak(929, 470, 60, 120), "vertical"),
  namedSlot("slot-fasilitas-wahana", "Wahana", kotak(1037, 545, 40, 150), "vertical"),
  namedSlot("slot-fasilitas-photobooth", "Photobooth", kotak(1278, 543, 30, 60), "vertical"),
  namedSlot("slot-fasilitas-service-gratis", "Service Gratis", kotak(1061.5, 1325.5, 30, 110), "vertical"),
  namedSlot("slot-fasilitas-ganti-oli", "Cek Motor Gratis", kotak(1061.5, 1478.5, 30, 110), "vertical"),
  namedSlot("slot-fasilitas-gerbang", "Gerbang", kotak(1228, 370, 40, 60), "vertical"),
];

/* ---------- Daftar zona, urut display_order ---------- */
/* container null: zona tidak digambar sebagai kotak berpita. Target zoom dihitung
 * dari gabungan kotak lapaknya (zoneBoundingRect) atau kotak bagian per area. */

export const FLOOR_PLAN_ZONES: LayoutZone[] = [
  // Fasilitas digambar paling awal supaya lapak yang bersebelahan selalu di atasnya.
  { svgGroupId: "zone-fasilitas", name: "Fasilitas Umum", zoneType: "facility", accent: "#8f887b", container: null, slots: fasilitasSlots },
  {
    svgGroupId: "zone-mobil-baru", name: "Area Mobil Baru", zoneType: "mobil_baru", accent: "#0a0a0a", container: null,
    sections: [{ area: "A", nomorAwal: 1, nomorAkhir: 8 }],
    slots: mobilBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-bekas", name: "Area Mobil Bekas", zoneType: "mobil_bekas", accent: "#ff7b00", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 22 }],
    slots: mobilBekasSlots,
  },
  {
    svgGroupId: "zone-motor-baru", name: "Area Motor Baru", zoneType: "motor_baru", accent: "#ff7b00", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 3 }],
    slots: motorBaruSlots,
  },
  {
    svgGroupId: "zone-mobil-motor", name: "Area Motor Bekas", zoneType: "mobil_motor_bekas", accent: "#ffc892", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 8 }],
    slots: mobilMotorSlots,
  },
  {
    svgGroupId: "zone-umkm", name: "Area UMKM", zoneType: "umkm", accent: "#8f887b", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 7 }],
    slots: umkmSlots,
  },
  {
    svgGroupId: "zone-booth-khusus", name: "Area Otomotif", zoneType: "booth_khusus", accent: "#0a0a0a", container: null,
    sections: [{ area: "B", nomorAwal: 1, nomorAkhir: 4 }],
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
    [1036, 391, "AREA A"], [893, 822, "AREA B"], [1089, 548, "AREA C"], [902, 403, "AREA D"],
    [1119, 1189, "AREA E"], [754, 1237, "AREA F"], [2047, 1096, "AREA G"], [2108, 620, "AREA H"],
    [1275, 391, "GERBANG MASUK"],
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

/** Total kotak di denah: 52 (36 bisa dipesan + 16 fasilitas). */
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
