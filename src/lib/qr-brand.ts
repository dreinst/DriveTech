import QRCode from "qrcode";

import { SITE_URL_PRODUKSI } from "@/lib/domain/constants";
import { QR_LOGO_DEFS, QR_LOGO_PATHS, QR_LOGO_SIZE } from "@/lib/qr-logo";

/**
 * Generator kode QR BERMEREK (SVG) untuk media promosi — modul membulat, mata
 * (finder pattern) membulat, dan emblem Drive Tech di tengah. KHUSUS SERVER
 * (pustaka `qrcode` memakai API Node), pola yang sama dengan lib/qr.ts.
 *
 * Keputusan yang menjaga QR tetap bisa di-scan:
 * - Koreksi galat level H (30%) — ruang emblem di tengah "memakan" ±6% modul.
 * - Modul dan mata tetap HITAM di atas putih. Warna oranye hanya di emblem;
 *   pemindai murah mem-binerisasi warna terang jadi putih, jadi mata QR tidak
 *   boleh diberi warna aksen.
 * - Quiet zone 4 modul (standar) di sekeliling kode.
 * - Modul membulat tetap berukuran penuh 1 unit (hanya sudutnya yang membulat),
 *   bukan titik-titik kecil yang mengurangi kontras.
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/qr-brand.ts hanya boleh dipakai di server.");
}

export type QrBrandVariant = "branded" | "plain";

export type QrBrandOptions = {
  /** "branded" = modul membulat + emblem; "plain" = kotak polos tanpa emblem (cadangan). */
  variant?: QrBrandVariant;
  /** Teks di bawah kode (mis. "Scan untuk pesan lapak"). Kosong = tanpa keterangan. */
  caption?: string;
  /** Baris kedua keterangan, lebih kecil (mis. alamat situs sebagai cadangan kalau QR gagal). */
  captionSub?: string;
  /** Warna modul. Default hitam pekat. */
  dark?: string;
  /** Warna latar. Default putih. */
  light?: string;
};

const QUIET_ZONE = 4;
/** Radius sudut modul (satuan modul). 0.3 = membulat jelas tapi tetap rapat. */
const MODULE_RADIUS = 0.3;
/** Porsi sisi QR (tanpa quiet zone) yang dikosongkan untuk emblem. */
const LOGO_RATIO = 0.24;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Apakah modul (r, c) termasuk salah satu dari tiga finder pattern 7x7. */
function dalamFinder(r: number, c: number, size: number): boolean {
  const kiriAtas = r < 7 && c < 7;
  const kananAtas = r < 7 && c >= size - 7;
  const kiriBawah = r >= size - 7 && c < 7;
  return kiriAtas || kananAtas || kiriBawah;
}

/** Satu finder pattern membulat di posisi (x, y) — cincin 7x7, lubang 5x5, inti 3x3. */
function finderSvg(x: number, y: number, rounded: boolean, dark: string, light: string): string {
  const rOuter = rounded ? 1.8 : 0;
  const rInner = rounded ? 1.1 : 0;
  const rCore = rounded ? 0.7 : 0;
  return (
    `<rect x="${x}" y="${y}" width="7" height="7" rx="${rOuter}" fill="${dark}"/>` +
    `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${rInner}" fill="${light}"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${rCore}" fill="${dark}"/>`
  );
}

/**
 * Bangun SVG kode QR untuk `text`. Kembalian: markup `<svg>` lengkap dengan
 * viewBox dalam satuan modul (bisa diskalakan bebas untuk cetak).
 */
export function qrBrandSvg(text: string, opts: QrBrandOptions = {}): string {
  const variant = opts.variant ?? "branded";
  const dark = opts.dark ?? "#0a0a0a";
  const light = opts.light ?? "#ffffff";
  const rounded = variant === "branded";

  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;

  // Area emblem di tengah (hanya varian bermerek). Sisi dibuat GANJIL agar
  // simetris terhadap modul tengah.
  let logoMulai = -1;
  let logoSisi = 0;
  if (variant === "branded") {
    logoSisi = Math.round(size * LOGO_RATIO);
    if (logoSisi % 2 !== size % 2) logoSisi += 1;
    logoMulai = (size - logoSisi) / 2;
  }
  const dalamLogo = (r: number, c: number): boolean =>
    logoMulai >= 0 &&
    r >= logoMulai &&
    r < logoMulai + logoSisi &&
    c >= logoMulai &&
    c < logoMulai + logoSisi;

  // Modul data sebagai <use> ke satu simbol — jauh lebih ringkas daripada
  // ribuan <rect>/<path> dan tetap dirender identik oleh semua viewer.
  const uses: string[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!qr.modules.get(r, c)) continue;
      if (dalamFinder(r, c, size) || dalamLogo(r, c)) continue;
      uses.push(`<use href="#m" x="${c + QUIET_ZONE}" y="${r + QUIET_ZONE}"/>`);
    }
  }

  const finders =
    finderSvg(QUIET_ZONE, QUIET_ZONE, rounded, dark, light) +
    finderSvg(QUIET_ZONE + size - 7, QUIET_ZONE, rounded, dark, light) +
    finderSvg(QUIET_ZONE, QUIET_ZONE + size - 7, rounded, dark, light);

  // Emblem: kotak putih membulat sedikit lebih kecil dari area kosong, lalu
  // emblem oranye diskalakan ke dalamnya.
  let logo = "";
  if (variant === "branded") {
    const pad = 0.35;
    const x = QUIET_ZONE + logoMulai + pad;
    const y = QUIET_ZONE + logoMulai + pad;
    const sisi = logoSisi - pad * 2;
    const skala = sisi / QR_LOGO_SIZE;
    logo =
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${sisi.toFixed(2)}" height="${sisi.toFixed(2)}" rx="${(sisi * 0.22).toFixed(2)}" fill="${light}"/>` +
      `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${skala.toFixed(5)})">${QR_LOGO_PATHS}</g>`;
  }

  // Keterangan di bawah kode (opsional). Tinggi diukur dalam modul.
  const lebar = size + QUIET_ZONE * 2;
  let tinggi = lebar;
  let captionSvg = "";
  if (opts.caption) {
    const yTeks = size + QUIET_ZONE + 1.9;
    captionSvg += `<text x="${lebar / 2}" y="${yTeks.toFixed(2)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif" font-weight="700" font-size="2.3" fill="${dark}">${escapeXml(opts.caption)}</text>`;
    tinggi += 3.4;
    if (opts.captionSub) {
      captionSvg += `<text x="${lebar / 2}" y="${(yTeks + 2.7).toFixed(2)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif" font-weight="500" font-size="1.7" fill="#6e6e6e">${escapeXml(opts.captionSub)}</text>`;
      tinggi += 2.6;
    }
  }

  const rx = rounded ? MODULE_RADIUS : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tinggi.toFixed(2)}" shape-rendering="geometricPrecision" role="img" aria-label="Kode QR Drive Tech">` +
    `<defs><rect id="m" width="1" height="1" rx="${rx}" fill="${dark}"/>${variant === "branded" ? QR_LOGO_DEFS : ""}</defs>` +
    `<rect width="${lebar}" height="${tinggi.toFixed(2)}" fill="${light}"/>` +
    uses.join("") +
    finders +
    logo +
    captionSvg +
    `</svg>`
  );
}

/**
 * Basis URL yang di-encode ke QR. SENGAJA tidak memakai VERCEL_URL (alamat
 * per-deployment yang berubah tiap build) — QR yang sudah dicetak harus
 * mengarah ke alamat tetap. Urutan: NEXT_PUBLIC_SITE_URL (kecuali localhost)
 * -> alamat produksi tetap.
 */
export function qrBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) return configured;
  return SITE_URL_PRODUKSI;
}
