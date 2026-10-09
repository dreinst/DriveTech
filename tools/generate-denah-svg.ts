/**
 * Generator public/denah.svg — denah STATIS (fallback tanpa JavaScript) yang
 * dibangun dari geometri yang SAMA dengan denah interaktif React:
 * src/lib/domain/layout.ts. Tidak ada koordinat yang ditulis ulang di sini,
 * jadi kedua denah tidak bisa saling tidak sinkron.
 *
 * Jalankan:  npm run denah
 *            (= node --experimental-strip-types tools/generate-denah-svg.ts;
 *             Node >= 22.6. Di Node 23.6+ flag itu sudah bawaan.)
 *
 * Kontrak keluaran (dipakai alat luar & README):
 * - Setiap slot = <g id="<svg_element_id>" class="slot" data-status="...">.
 *   id-nya identik dengan kolom slots.svg_element_id di database.
 * - Slot yang bisa disewa online dibungkus <a href="/booking/by-svg/<id>"> dan
 *   punya data-form berisi URL yang sama; rute itu menerjemahkan id SVG ke uuid
 *   slot lalu mengarahkan ke form booking. Fasilitas & warung tanpa <a>.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isBookableZoneType, SLOT_STATUS_STYLE } from "../src/lib/domain/constants.ts";
import {
  DECOR_STYLE,
  FLOOR_PLAN_ANNOTATIONS,
  FLOOR_PLAN_DECOR,
  FLOOR_PLAN_OUTLINE,
  FLOOR_PLAN_VIEWBOX,
  FLOOR_PLAN_ZONES,
  layoutSlotCount,
  slotFontSize,
  wrapLabel,
  type DecorItem,
  type LabelOrientation,
  type LayoutSlot,
  type LayoutZone,
  type Rect,
} from "../src/lib/domain/layout.ts";

const W = FLOOR_PLAN_VIEWBOX.width;
const H = FLOOR_PLAN_VIEWBOX.height;
const out: string[] = [];
const A = (line: string): void => {
  out.push(line);
};

const g = (n: number): string => String(Math.round(n * 100) / 100);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ---------- Teks di dalam kotak (port dari fitLabel di FloorPlan.tsx) ---------- */

const LINE_HEIGHT_EM = 1.05;
const CHAR_WIDTH_RATIO = 0.56;

function maxCharsFor(lengthAvailable: number, fontSize: number): number {
  return Math.max(4, Math.floor((lengthAvailable * 0.92) / (fontSize * CHAR_WIDTH_RATIO)));
}

function fitLabel(text: string, rect: Rect, orientation: LabelOrientation): { fontSize: number; lines: string[] } {
  const along = orientation === "vertical" ? rect.height : rect.width;
  const across = orientation === "vertical" ? rect.width : rect.height;
  let fontSize = clamp(Math.round(Math.min(across * 0.28, along * 0.1, 16)), 9, 16);
  let lines = wrapLabel(text, maxCharsFor(along, fontSize));
  const maxLines = Math.max(1, Math.floor((across * 0.9) / (fontSize * LINE_HEIGHT_EM)));
  if (lines.length > maxLines) {
    fontSize = clamp(Math.floor((across * 0.9) / (lines.length * LINE_HEIGHT_EM)), 7, fontSize);
    lines = wrapLabel(text, maxCharsFor(along, fontSize));
  }
  return { fontSize, lines };
}

function boxLabel(rect: Rect, text: string, orientation: LabelOrientation, fill: string): string {
  const { fontSize, lines } = fitLabel(text, rect, orientation);
  if (lines.length === 0) return "";
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const firstDy = -(((lines.length - 1) * LINE_HEIGHT_EM) / 2);
  const tf = orientation === "vertical" ? ` transform="rotate(-90 ${g(cx)} ${g(cy)})"` : "";
  const spans = lines
    .map((line, i) => `<tspan x="${g(cx)}" dy="${i === 0 ? g(firstDy) : LINE_HEIGHT_EM}em">${esc(line)}</tspan>`)
    .join("");
  return (
    `<text x="${g(cx)}" y="${g(cy)}"${tf} fill="${fill}" font-size="${fontSize}" font-weight="600" ` +
    `text-anchor="middle" dominant-baseline="middle">${spans}</text>`
  );
}

function numberLabel(rect: Rect, text: string, fill: string): string {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    `<text x="${g(cx)}" y="${g(cy)}" fill="${fill}" font-size="${slotFontSize(rect)}" font-weight="600" ` +
    `text-anchor="middle" dominant-baseline="middle">${esc(text)}</text>`
  );
}

/* ---------- Slot ---------- */

function slotDisplayName(slot: LayoutSlot): string {
  return slot.slotNumber !== null && /^\d+$/.test(slot.label) ? `Slot ${slot.slotNumber}` : slot.label;
}

function slot(zone: LayoutZone, s: LayoutSlot): void {
  const bookable = isBookableZoneType(zone.zoneType);
  const status = bookable ? "available" : "facility";
  const style = SLOT_STATUS_STYLE[status];
  const isNumber = /^\d+$/.test(s.label);
  const aria = esc(`${zone.name}, ${slotDisplayName(s)}`);
  const formUrl = `/booking/by-svg/${s.svgElementId}`;

  if (bookable) {
    A(`      <a href="${formUrl}" aria-label="${aria} — buka form booking">`);
    A(`      <g id="${s.svgElementId}" class="slot" data-status="${status}" data-slot="${s.svgElementId}" data-form="${formUrl}">`);
  } else {
    const keterangan = zone.zoneType === "warung" ? "belum dibuka untuk booking online" : "fasilitas umum, tidak disewakan";
    A(`      <g id="${s.svgElementId}" class="slot facility" data-status="facility" data-slot="${s.svgElementId}" aria-label="${aria} — ${keterangan}">`);
  }
  const tf = s.rotate ? ` transform="rotate(${s.rotate} ${g(s.x + s.width / 2)} ${g(s.y + s.height / 2)})"` : "";
  A(`        <rect x="${g(s.x)}" y="${g(s.y)}" width="${g(s.width)}" height="${g(s.height)}" ${tf}/>`);
  A(`        ${isNumber ? numberLabel(s, s.label, style.text) : boxLabel(s, s.label, s.labelOrientation, style.text)}`);
  A("      </g>");
  if (bookable) A("      </a>");
}

/* ---------- Dekor ---------- */

function dekor(item: DecorItem): void {
  const style = DECOR_STYLE[item.kind];
  const stroke = style.stroke ? ` stroke="${style.stroke}" stroke-width="5"` : "";
  const tf = item.rotate ? ` transform="rotate(${item.rotate} ${g(item.x + item.width / 2)} ${g(item.y + item.height / 2)})"` : "";
  A(`    <rect id="${item.id}" x="${g(item.x)}" y="${g(item.y)}" width="${g(item.width)}" height="${g(item.height)}" fill="${style.fill}"${stroke}${tf}/>`);
}

/* ================================================================ */
/* Susun dokumen                                                     */
/* ================================================================ */

const bookableCount = FLOOR_PLAN_ZONES.filter((z) => isBookableZoneType(z.zoneType)).reduce(
  (n, z) => n + z.slots.length,
  0,
);

A(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    'preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="denah-title denah-desc" ' +
    'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">',
);
A('  <title id="denah-title">Denah Drive Tech, Kampung Tentara, Singosari, Malang</title>');
A(
  '  <desc id="denah-desc">Denah lokasi pameran: Area A mobil baru, Area B, C, dan D mobil bekas serta otomotif, ' +
    'Area E motor baru dan motor bekas, Area F, G, dan H UMKM, deretan warung (belum dibuka untuk pemesanan online), ' +
    'dan fasilitas umum. Setiap lapak punya id yang sama dengan kolom svg_element_id di database dan atribut ' +
    'data-status yang menentukan warnanya (available, pending, confirmed, facility). Lapak yang dapat disewa online ' +
    'adalah tautan menuju /booking/by-svg/&lt;id&gt; (atribut data-form berisi URL yang sama).</desc>',
);
A(`  <style>
    .slot rect { fill:${SLOT_STATUS_STYLE.available.fill}; stroke:${SLOT_STATUS_STYLE.available.stroke}; stroke-width:1.5; transition:fill .15s ease; }
    .slot[data-status="pending"]   rect { fill:${SLOT_STATUS_STYLE.pending.fill}; stroke:${SLOT_STATUS_STYLE.pending.stroke}; }
    .slot[data-status="confirmed"] rect { fill:${SLOT_STATUS_STYLE.confirmed.fill}; stroke:${SLOT_STATUS_STYLE.confirmed.stroke}; }
    .slot[data-status="facility"]  rect { fill:${SLOT_STATUS_STYLE.facility.fill}; stroke:${SLOT_STATUS_STYLE.facility.stroke}; }
    a { cursor:pointer; }
    a:hover .slot rect { stroke-width:3.5; }
    a:focus-visible .slot rect { stroke:#0f172a; stroke-width:3.5; outline:none; }
    .zone-box   { fill:#ffffff; stroke:#cbd5e1; stroke-width:1; }
    .zone-title { fill:#ffffff; font-weight:700; font-size:12px; }
    .zone-count { fill:#ffffff; fill-opacity:0.9; font-weight:600; font-size:10px; }
    .decor-label { fill:#4b7f52; font-size:12px; font-weight:600; opacity:0.85; }
    .note { fill:#1e293b; font-size:12px; font-weight:700; }
    .legend-label { fill:#334155; font-size:13px; }
  </style>`);
A(`  <rect width="${W}" height="${H}" fill="#f2eee6"/>`);
A(`  <path d="${FLOOR_PLAN_OUTLINE}" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.5"/>`);

A('  <g id="denah-dekor" aria-hidden="true" pointer-events="none">');
for (const item of FLOOR_PLAN_DECOR) dekor(item);
A("  </g>");

for (const zone of FLOOR_PLAN_ZONES) {
  A(`  <g id="${zone.svgGroupId}" data-zone-type="${zone.zoneType}">`);
  A('    <g class="slots">');
  for (const s of zone.slots) slot(zone, s);
  A("    </g>");
  A("  </g>");
}

A('  <g id="denah-anotasi" aria-hidden="true" pointer-events="none">');
for (const ann of FLOOR_PLAN_ANNOTATIONS) {
  const w = ann.text.length * 8.2 + 14;
  A(`    <rect x="${g(ann.x)}" y="${g(ann.y)}" width="${g(w)}" height="22" fill="#0a0a0a"/>`);
  A(`    <text x="${g(ann.x + w / 2)}" y="${g(ann.y + 12)}" fill="#ffffff" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(ann.text)}</text>`);
}
A("  </g>");
A(`  <!-- ${layoutSlotCount()} kotak, ${bookableCount} dapat disewa online. id tiap kotak = kolom svg_element_id di database. -->`);
A("</svg>");

const svg = `${out.join("\n")}\n`;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "public", "denah.svg");
writeFileSync(target, svg);
console.log(`ditulis: ${target} (${svg.length} bytes, ${layoutSlotCount()} kotak)`);
