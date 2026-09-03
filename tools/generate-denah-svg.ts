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
  FLOOR_PLAN_FRAME,
  FLOOR_PLAN_VIEWBOX,
  FLOOR_PLAN_ZONES,
  layoutSlotCount,
  slotFontSize,
  slotsInContainer,
  TANK_STYLE,
  wrapLabel,
  zoneContainers,
  type DecorItem,
  type LabelOrientation,
  type LayoutContainer,
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
  A(`        <rect x="${g(s.x)}" y="${g(s.y)}" width="${g(s.width)}" height="${g(s.height)}" rx="4"/>`);
  A(`        ${isNumber ? numberLabel(s, s.label, style.text) : boxLabel(s, s.label, s.labelOrientation, style.text)}`);
  A("      </g>");
  if (bookable) A("      </a>");
}

/* ---------- Dekor ---------- */

function taman(item: DecorItem): void {
  const style = DECOR_STYLE[item.kind];
  const rx = item.kind === "pagar" ? 3 : 6;
  const stroke = style.stroke ? ` stroke="${style.stroke}" stroke-width="1"` : "";
  A(`    <rect id="${item.id}" x="${g(item.x)}" y="${g(item.y)}" width="${g(item.width)}" height="${g(item.height)}" rx="${rx}" fill="${style.fill}"${stroke}/>`);
  if (item.label && item.width >= 40 && item.height >= 30) {
    const orientation: LabelOrientation = item.height > item.width * 1.6 ? "vertical" : "horizontal";
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const tf = orientation === "vertical" ? ` transform="rotate(-90 ${g(cx)} ${g(cy)})"` : "";
    A(`    <text class="decor-label" x="${g(cx)}" y="${g(cy)}"${tf} text-anchor="middle" dominant-baseline="middle">${esc(item.label)}</text>`);
  }
}

/** Tank display Kostrad — port TankDecor di FloorPlan.tsx. */
function tank(item: DecorItem, withLabel = true): void {
  const { x, y, width: w, height: h } = item;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotate = item.rotate ?? 0;
  const trackH = Math.max(6, Math.round(h * 0.2));
  const turretR = Math.min(11, h * 0.3);
  const turretCx = x + w * 0.44;
  const barrelEnd = x + w + 22;

  A(`    <g id="${item.id}">`);
  A(`      <g${rotate !== 0 ? ` transform="rotate(${rotate} ${g(cx)} ${g(cy)})"` : ""}>`);
  A(`        <rect x="${g(x)}" y="${g(y)}" width="${g(w)}" height="${trackH}" rx="3" fill="${TANK_STYLE.track}"/>`);
  A(`        <rect x="${g(x)}" y="${g(y + h - trackH)}" width="${g(w)}" height="${trackH}" rx="3" fill="${TANK_STYLE.track}"/>`);
  A(`        <rect x="${g(x + 3)}" y="${g(y + trackH - 2)}" width="${g(w - 6)}" height="${g(h - 2 * trackH + 4)}" rx="5" fill="${TANK_STYLE.hullFill}" stroke="${TANK_STYLE.hullStroke}" stroke-width="${TANK_STYLE.hullStrokeWidth}"/>`);
  A(`        <rect x="${g(turretCx)}" y="${g(cy - 1.5)}" width="${g(barrelEnd - turretCx)}" height="3" rx="1.5" fill="${TANK_STYLE.barrel}"/>`);
  A(`        <circle cx="${g(turretCx)}" cy="${g(cy)}" r="${g(turretR)}" fill="${TANK_STYLE.turret}"/>`);
  A("      </g>");
  if (withLabel) {
    const rad = (rotate * Math.PI) / 180;
    const belowExtent = (w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad))) / 2 + (Math.sin(rad) > 0.01 ? 22 : 0);
    const labelY = cy + belowExtent + 7;
    if (labelY < FLOOR_PLAN_FRAME.y + FLOOR_PLAN_FRAME.height - 6) {
      A(`      <text x="${g(cx)}" y="${g(labelY)}" font-size="${TANK_STYLE.labelFontSize}" font-weight="600" fill="${TANK_STYLE.label}" text-anchor="middle" dominant-baseline="middle">Tank</text>`);
    }
  }
  A("    </g>");
}

/* ---------- Container zona + pita judul (port ZoneContainer) ---------- */

function bandTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

function zoneContainer(zone: LayoutZone, c: LayoutContainer, total: number): void {
  const band = 24;
  const vertical = c.labelOrientation === "vertical";
  const title = c.title ?? zone.name;
  const stat = `${total} slot`;
  const along = vertical ? c.height : c.width;
  const showStat = bandTextWidth(title, 12) / 2 + bandTextWidth(stat, 10) + 20 < along / 2;

  A(`    <rect class="zone-box" x="${g(c.x)}" y="${g(c.y)}" width="${g(c.width)}" height="${g(c.height)}" rx="10"/>`);
  A(`    <rect x="${g(c.x + 2)}" y="${g(c.y + 2)}" width="${g(c.width - 4)}" height="${g(c.height - 4)}" rx="8" fill="none" stroke="${zone.accent}" stroke-width="2" opacity="0.55"/>`);
  if (vertical) {
    const cx = c.x + band / 2;
    const cy = c.y + c.height / 2;
    A(`    <rect x="${g(c.x)}" y="${g(c.y)}" width="${band}" height="${g(c.height)}" rx="10" fill="${zone.accent}"/>`);
    A(`    <text class="zone-title" x="${g(cx)}" y="${g(cy)}" transform="rotate(-90 ${g(cx)} ${g(cy)})" text-anchor="middle" dominant-baseline="middle">${esc(title)}</text>`);
    if (showStat) {
      A(`    <text class="zone-count" x="${g(cx - (c.height / 2 - 8))}" y="${g(cy)}" transform="rotate(-90 ${g(cx)} ${g(cy)})" text-anchor="start" dominant-baseline="middle">${esc(stat)}</text>`);
    }
  } else {
    A(`    <rect x="${g(c.x)}" y="${g(c.y)}" width="${g(c.width)}" height="${band}" rx="10" fill="${zone.accent}"/>`);
    A(`    <rect x="${g(c.x)}" y="${g(c.y + band - 10)}" width="${g(c.width)}" height="10" fill="${zone.accent}"/>`);
    A(`    <text class="zone-title" x="${g(c.x + 10)}" y="${g(c.y + band / 2 + 1)}" text-anchor="start" dominant-baseline="middle">${esc(title)}</text>`);
    if (showStat) {
      A(`    <text class="zone-count" x="${g(c.x + c.width - 10)}" y="${g(c.y + band / 2 + 1)}" text-anchor="end" dominant-baseline="middle">${esc(stat)}</text>`);
    }
  }
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
A('  <title id="denah-title">Denah Drive Tech — Kampung Tentara, Singosari, Malang</title>');
A(
  '  <desc id="denah-desc">Denah lokasi pameran (Layout v2): Area A tenda dealer mobil baru, Area B area pameran ' +
    'mobil bekas, Area C tenda motor baru dan area motor bekas, Area D tenda UMKM serta tenda otomotif dan leasing, ' +
    'deretan warung (belum dibuka untuk booking online), fasilitas umum, dan tiga tank display Kostrad sebagai dekorasi. ' +
    'Setiap slot punya id yang sama dengan kolom svg_element_id di database dan atribut data-status yang menentukan ' +
    'warnanya (available, pending, confirmed, facility). Slot yang dapat disewa online adalah tautan menuju ' +
    '/booking/by-svg/&lt;id&gt; (atribut data-form berisi URL yang sama).</desc>',
);
A(`  <style>
    .slot rect { fill:${SLOT_STATUS_STYLE.available.fill}; stroke:${SLOT_STATUS_STYLE.available.stroke}; stroke-width:2; transition:fill .15s ease; }
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
A(`  <rect width="${W}" height="${H}" fill="#f8fafc"/>`);
A(
  `  <rect x="${FLOOR_PLAN_FRAME.x}" y="${FLOOR_PLAN_FRAME.y}" width="${FLOOR_PLAN_FRAME.width}" height="${FLOOR_PLAN_FRAME.height}" rx="8" fill="none" stroke="#1e293b" stroke-width="2"/>`,
);
A(`  <text x="${W / 2}" y="64" text-anchor="middle" font-size="21" font-weight="800" fill="#0f172a">DENAH DRIVE TECH — KAMPUNG TENTARA, SINGOSARI</text>`);

// dekor
A('  <g id="denah-dekor" aria-hidden="true" pointer-events="none">');
for (const item of FLOOR_PLAN_DECOR) {
  if (item.kind === "tank") tank(item);
  else taman(item);
}
A("  </g>");

// container zona
A('  <g id="denah-container" aria-hidden="true" pointer-events="none">');
for (const zone of FLOOR_PLAN_ZONES) {
  for (const c of zoneContainers(zone)) zoneContainer(zone, c, slotsInContainer(zone, c).length);
}
A("  </g>");

// slot per zona
for (const zone of FLOOR_PLAN_ZONES) {
  A(`  <g id="${zone.svgGroupId}" data-zone-type="${zone.zoneType}" data-zone-type-accent="${zone.accent}">`);
  A('    <g class="slots">');
  for (const s of zone.slots) slot(zone, s);
  A("    </g>");
  if (zone.annotations && zone.annotations.length > 0) {
    A('    <g class="zone-annotations" aria-hidden="true" pointer-events="none">');
    for (const ann of zone.annotations) {
      const keluar = ann.text.trim().toUpperCase().startsWith("KELUAR");
      const tx = ann.x - 30;
      const points = keluar
        ? `${g(tx - 5)},${g(ann.y - 1)} ${g(tx + 5)},${g(ann.y - 1)} ${g(tx)},${g(ann.y - 9)}`
        : `${g(tx - 5)},${g(ann.y - 9)} ${g(tx + 5)},${g(ann.y - 9)} ${g(tx)},${g(ann.y - 1)}`;
      A(`      <polygon points="${points}" fill="#334155"/>`);
      A(`      <text x="${g(ann.x)}" y="${g(ann.y)}" fill="#334155" font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="middle">${esc(ann.text)}</text>`);
    }
    A("    </g>");
  }
  A("  </g>");
}

// anotasi bebas
A('  <g id="denah-anotasi" aria-hidden="true" pointer-events="none">');
for (const ann of FLOOR_PLAN_ANNOTATIONS) {
  A(`    <text class="note" x="${g(ann.x)}" y="${g(ann.y)}" text-anchor="middle" dominant-baseline="middle" font-weight="${ann.bold ? 700 : 400}">${esc(ann.text)}</text>`);
}
A("  </g>");

// legenda
A('  <g id="denah-legenda" aria-hidden="true" pointer-events="none">');
A('    <line x1="60" y1="1448" x2="1063" y2="1448" stroke="#cbd5e1" stroke-width="1"/>');
A('    <text x="60" y="1472" font-size="14" font-weight="800" fill="#0f172a">KETERANGAN</text>');
const statusLegend: Array<[number, string, string, string]> = [
  [60, SLOT_STATUS_STYLE.available.fill, SLOT_STATUS_STYLE.available.stroke, "Tersedia"],
  [175, SLOT_STATUS_STYLE.pending.fill, SLOT_STATUS_STYLE.pending.stroke, "Menunggu Pembayaran"],
  [366, SLOT_STATUS_STYLE.confirmed.fill, SLOT_STATUS_STYLE.confirmed.stroke, "Terisi"],
  [466, SLOT_STATUS_STYLE.facility.fill, SLOT_STATUS_STYLE.facility.stroke, "Fasilitas & warung (tidak disewakan online)"],
];
for (const [x, fill, stroke, label] of statusLegend) {
  A(`    <rect x="${x}" y="1486" width="24" height="20" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
  A(`    <text class="legend-label" x="${x + 32}" y="1496" dominant-baseline="middle">${esc(label)}</text>`);
}
tank({ id: "legenda-tank", x: 830, y: 1489, width: 26, height: 14, label: "", kind: "tank" }, false);
A('    <text class="legend-label" x="872" y="1496" dominant-baseline="middle">Tank display Kostrad</text>');
let lx = 60;
for (const zone of FLOOR_PLAN_ZONES) {
  const label = zone.name;
  A(`    <rect x="${lx}" y="1526" width="16" height="16" rx="3" fill="${zone.accent}"/>`);
  A(`    <text class="legend-label" x="${lx + 22}" y="1535" font-size="11" dominant-baseline="middle">${esc(label)}</text>`);
  lx += 22 + Math.round(bandTextWidth(label, 11)) + 18;
}
A(
  `    <text x="1063" y="1562" text-anchor="end" font-size="11" fill="#94a3b8">Sumber: layout-venue-v2.jpeg &#183; ${layoutSlotCount()} kotak (${bookableCount} dapat disewa online) &#183; id tiap kotak = kolom svg_element_id di database &#183; klik slot = /booking/by-svg/&lt;id&gt;</text>`,
);
A("  </g>");
A("</svg>");

const svg = `${out.join("\n")}\n`;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "public", "denah.svg");
writeFileSync(target, svg);
console.log(`ditulis: ${target} (${svg.length} bytes, ${layoutSlotCount()} kotak)`);
