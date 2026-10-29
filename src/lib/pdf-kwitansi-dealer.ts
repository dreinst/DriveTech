import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

import { EVENT_INFO } from "@/lib/domain/constants";
import { kodeDealer, LAPAK_DEALER, TANGGAL_DEALER } from "@/lib/domain/formulir-dealer";
import { totalBayar } from "@/lib/domain/harga";
import type { PendaftaranDealer } from "@/lib/services/formulir-dealer";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/pdf-kwitansi-dealer.ts hanya boleh dipakai di server.");
}

/**
 * Kwitansi DPRO A5 landscape. Tata letak disalin dari kwitansi.py docs generator (Figma "Template Kwitansi
 * Entitas", section 891:318, entitas dpro): koordinat dalam piksel frame Figma selebar 2480.
 */
const ASET = path.join(process.cwd(), "src/assets/kwitansi-dealer");
const W = 2480;
const H = 1748;
const HAL_W = 595.28;
const HAL_H = (HAL_W * H) / W;
const K = HAL_W / W;

const NAVY = rgb(0x0b / 255, 0x21 / 255, 0x44 / 255);
const INK = rgb(0x1a / 255, 0x1a / 255, 0x1f / 255);
const ABU = rgb(0x55 / 255, 0x55 / 255, 0x55 / 255);
const PUTIH = rgb(1, 1, 1);

export type IsiKwitansi = {
  nomor: string;
  terimaDari: string;
  jumlah: number;
  /** Sampai tiga baris "Digunakan untuk". */
  untuk: string[];
  /** "Malang, 29 Oktober 2026" */
  kotaTanggal: string;
  /** Dua baris catatan di kiri bawah (cara bayar). */
  catatan: [string, string];
  penandatangan: string;
  /** PNG goresan tanda tangan (latar transparan). Kosong = hanya stempel. */
  ttd?: Uint8Array | null;
};

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

/** 44340000 -> "empat puluh empat juta tiga ratus empat puluh ribu" (sama dengan dpro_docs.terbilang). */
export function terbilang(n: number): string {
  n = Math.floor(n);
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
  for (const [bagi, kata] of [[1e12, "triliun"], [1e9, "miliar"], [1e6, "juta"], [1e3, "ribu"]] as const) {
    if (n >= bagi) return `${terbilang(Math.floor(n / bagi))} ${kata} ${terbilang(n % bagi)}`.trim();
  }
  return "";
}

const judulKata = (s: string) => s.replace(/(^|\s)\S/g, (h) => h.toUpperCase());

/** Piksel Figma (ukuran huruf) -> pt, dibulatkan ke 0,5 seperti pt() di kwitansi.py. */
const ukuran = (px: number) => Math.round(px * K * 2) / 2;

type Alat = { page: PDFPage; tebal: PDFFont };

/** Teks satu baris; y = sisi bawah kotak baris dalam piksel Figma. Huruf mengecil sampai muat lebar. */
function teks(a: Alat, s: string, x: number, yBawah: number, px: number, warna: RGB, opsi: { lebar?: number; tengah?: boolean; garis?: boolean } = {}) {
  let size = ukuran(px);
  if (opsi.lebar) while (size > 5 && a.tebal.widthOfTextAtSize(s, size) > opsi.lebar * K) size -= 0.25;
  const lebarTeks = a.tebal.widthOfTextAtSize(s, size);
  const x0 = x * K + (opsi.tengah && opsi.lebar ? (opsi.lebar * K - lebarTeks) / 2 : 0);
  const y0 = HAL_H - yBawah * K + size * 0.28;
  a.page.drawText(s, { x: x0, y: y0, size, font: a.tebal, color: warna });
  if (opsi.garis) {
    a.page.drawLine({ start: { x: x0, y: y0 - 1.2 }, end: { x: x0 + lebarTeks, y: y0 - 1.2 }, thickness: 0.6, color: warna });
  }
}

function gambar(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number, opacity = 1) {
  page.drawImage(img, { x: x * K, y: HAL_H - (y + h) * K, width: w * K, height: h * K, opacity });
}

/** Gambar dimuatkan ke kotak (rasio dijaga), di tengah. */
function gambarMuat(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number, opacity = 1) {
  const s = Math.min(w / img.width, h / img.height);
  const gw = img.width * s;
  const gh = img.height * s;
  gambar(page, img, x + (w - gw) / 2, y + (h - gh) / 2, gw, gh, opacity);
}

const aset = (nama: string) => readFile(path.join(ASET, nama));

export async function buatPdfKwitansi(d: IsiKwitansi): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([HAL_W, HAL_H]);
  const tebal = await doc.embedFont(await aset("Carlito-Bold.ttf"));
  const [kop, footer, watermark, stempel] = await Promise.all(
    ["kop.png", "footer.png", "watermark.png", "stempel-dpro.png"].map(async (n) => doc.embedPng(await aset(n))),
  );
  const a: Alat = { page, tebal };

  gambar(page, watermark, 731, 538, 1017, 860);
  gambar(page, kop, 0, 0, 2480, 415);
  gambar(page, footer, 0, H - 242, 2480, 242);

  // kotak nomor
  page.drawRectangle({ x: 216 * K, y: HAL_H - (440 + 82) * K, width: 560 * K, height: 82 * K, borderColor: NAVY, borderWidth: 0.75 });
  teks(a, d.nomor, 216, 440 + 82 / 2 + 16, 32, NAVY, { lebar: 560, tengah: true });

  // baris isian bergaris titik
  const bilang = `# ${judulKata(terbilang(d.jumlah))} Rupiah #`;
  const baris: [number, string, string][] = [
    [646, "Telah Terima Dari", d.terimaDari],
    [722, "Uang sejumlah", bilang],
    [798, "", ""],
    [874, "Digunakan untuk", d.untuk[0] ?? ""],
    [950, "", d.untuk[1] ?? ""],
    [1026, "", d.untuk[2] ?? ""],
  ];
  for (const [y, label, isi] of baris) {
    if (label) {
      teks(a, label, 216, y - 12, 34, NAVY);
      teks(a, ":", 690, y - 12, 34, NAVY);
    }
    if (isi) teks(a, isi, 744, y - 12, 34, INK, { lebar: 2264 - 744 });
    page.drawLine({
      start: { x: 744 * K, y: HAL_H - y * K },
      end: { x: 2264 * K, y: HAL_H - y * K },
      thickness: 0.5,
      color: ABU,
      dashArray: [0.6, 1.4],
    });
  }

  // kotak nominal
  const tinggiNominal = 38 * 1.6;
  page.drawRectangle({ x: 216 * K, y: HAL_H - (1075 + tinggiNominal) * K, width: 460 * K, height: tinggiNominal * K, color: NAVY });
  teks(a, `Rp ${d.jumlah.toLocaleString("id-ID")}`, 216, 1075 + tinggiNominal / 2 + 18, 38, PUTIH, { lebar: 460, tengah: true });

  // catatan kiri bawah
  teks(a, d.catatan[0], 216, 1210 + 40, 32, NAVY, { lebar: 1400 });
  teks(a, d.catatan[1], 290, 1260 + 40, 32, NAVY, { lebar: 1330 });

  // tanda tangan: stempel DPRO, goresan di atasnya
  const sx = 1700;
  const sw = 600;
  teks(a, d.kotaTanggal, sx, 1075 + 40, 32, INK, { lebar: sw, tengah: true });
  gambarMuat(page, stempel, sx + 40, 1150, sw - 80, 240, 0.95);
  // Goresan lebih kecil dari kotak ttd supaya tulisan D'PRO di stempel tetap terbaca.
  if (d.ttd) gambarMuat(page, await doc.embedPng(d.ttd), sx + 110, 1200, sw - 220, 200);
  teks(a, d.penandatangan, sx, 1420 + 42, 34, NAVY, { lebar: sw, tengah: true, garis: true });

  doc.setTitle(`Kwitansi ${d.nomor}`);
  doc.setProducer("drivetech.dpro.events");
  return doc.save();
}

/** Penanda tangan kwitansi dealer DriveTech (stempel DPRO, goresan dari /drivetechadmin/kwitansi). */
export const PENANDATANGAN_KWITANSI = "Andrew Steine";

/** Isi kwitansi dari formulir dealer yang sudah lunas. */
export function isiKwitansiDealer(d: PendaftaranDealer, ttd: Uint8Array | null): IsiKwitansi {
  const lapak = LAPAK_DEALER.filter((l) => Number(d.data[`jumlah_${l.kode}`]) > 0)
    .map((l) => `${d.data[`jumlah_${l.kode}`]} lapak ${l.label.replace(/,/, "")}`)
    .join(" dan ");
  const tanggal = TANGGAL_DEALER.filter((_, i) => d.data[`tgl_${i + 1}`] === "ya");
  const jumlah = totalBayar({ amount: d.amount ?? 0, unique_code: d.unique_code });
  const tgl = (s: string | null) =>
    new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(
      s ? new Date(s) : new Date(),
    );
  return {
    nomor: d.kwitansi_no ?? "",
    terimaDari: `${d.data.pimpinan ?? d.data.pic ?? ""}, ${d.data.nama_dealer ?? ""} (${kodeDealer(d.id)})`,
    jumlah,
    untuk: [
      `Sewa lapak dealer ${EVENT_INFO.name} 2026 di Rest Area Singosari Malang`,
      lapak,
      `${tanggal.length} tanggal: ${tanggal.join("; ")}`,
    ],
    kotaTanggal: `Malang, ${tgl(d.lunas_at)}`,
    catatan: [
      `NB : LUNAS via QRIS ${EVENT_INFO.name}, ${tgl(d.lunas_at)}`,
      "termasuk kode unik dan biaya layanan QRIS",
    ],
    penandatangan: PENANDATANGAN_KWITANSI,
    ttd,
  };
}
