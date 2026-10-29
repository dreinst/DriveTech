import { readFile } from "node:fs/promises";
import path from "node:path";

import { BlendMode, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import {
  hitungBiaya,
  LAPAK_DEALER,
  PENANDATANGAN_PANITIA,
  rupiah,
  TANGGAL_DEALER,
  type DataDealer,
} from "@/lib/domain/formulir-dealer";
import KOLOM from "@/assets/formulir-dealer/formulir-dealer-kolom.json";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/pdf-formulir-dealer.ts hanya boleh dipakai di server.");
}

/** Posisi kolom dalam pt, diukur dari kiri atas halaman (lihat formulir-dealer-baru.py). */
type Kotak = { hal: number; x: number; y: number; w: number; h: number };
type NamaKolom = keyof typeof KOLOM;
const kolom = KOLOM as Record<NamaKolom, Kotak>;

// Ikut dibundel ke output standalone lewat outputFileTracingIncludes di next.config.ts.
const ASET = path.join(process.cwd(), "src/assets/formulir-dealer");

/** Kolom bertitik "(......)" dan "...... 2026" yang ditutup putih sebelum ditulisi. */
const KOLOM_BERTITIK = new Set<string>([
  "tanggal_form",
  "tanggal_komitmen",
  "nama_ttd_dealer_form",
  "nama_ttd_dealer_komitmen",
  "nama_ttd_panitia_form",
  "nama_ttd_panitia_komitmen",
]);

const KOLOM_CENTANG = new Set<string>([
  ...LAPAK_DEALER.map((l) => `lapak_${l.kode}`),
  ...TANGGAL_DEALER.map((_, i) => `tgl_${i + 1}`),
]);

const UKURAN_HURUF = 9;
const HURUF_TERKECIL = 5.5;
const WARNA_TINTA = rgb(0.06, 0.13, 0.35);

/** Helvetica bawaan PDF hanya kenal WinAnsi; huruf lain (emoji, aksara non-Latin) diganti "?". */
function aman(teks: string): string {
  return teks
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function kotakPdf(page: PDFPage, k: Kotak) {
  return { x: k.x, y: page.getHeight() - k.y - k.h, width: k.w, height: k.h };
}

/** Tulis satu baris teks di dalam kotak; huruf mengecil sampai muat, sisanya dipotong "...". */
function tulis(page: PDFPage, font: PDFFont, k: Kotak, isi: string, tengah = false) {
  let teks = aman(isi.trim());
  if (!teks) return;
  const ruang = k.w - 6;
  let ukuran = UKURAN_HURUF;
  while (ukuran > HURUF_TERKECIL && font.widthOfTextAtSize(teks, ukuran) > ruang) ukuran -= 0.5;
  while (teks.length > 1 && font.widthOfTextAtSize(teks, ukuran) > ruang) teks = teks.slice(0, -2) + "…";
  const lebar = font.widthOfTextAtSize(teks, ukuran);
  const { x, y, height } = kotakPdf(page, k);
  page.drawText(teks, {
    x: tengah ? x + (k.w - lebar) / 2 : x + 3,
    y: y + height / 2 - ukuran * 0.35,
    size: ukuran,
    font,
    color: WARNA_TINTA,
  });
}

function centang(page: PDFPage, k: Kotak) {
  const { x, y, width, height } = kotakPdf(page, k);
  const opsi = { thickness: 1.3, color: WARNA_TINTA };
  page.drawLine({ start: { x: x + 1.5, y: y + 1.5 }, end: { x: x + width - 1.5, y: y + height - 1.5 }, ...opsi });
  page.drawLine({ start: { x: x + 1.5, y: y + height - 1.5 }, end: { x: x + width - 1.5, y: y + 1.5 }, ...opsi });
}

/** Kotak titik-titik sedikit dilebarkan: tanda kurung di tepinya menjorok keluar dari kotak hasil ukur. */
function lebarkan(k: Kotak): Kotak {
  return { ...k, x: k.x - 2, w: k.w + 4 };
}

function tutupPutih(page: PDFPage, k: Kotak) {
  page.drawRectangle({ ...kotakPdf(page, lebarkan(k)), color: rgb(1, 1, 1) });
}

/** Gambar di tengah kotak, rasio dijaga. */
function gambarDiKotak(page: PDFPage, img: PDFImage, k: Kotak, skala = 1, opsi: { blendMode?: BlendMode } = {}) {
  const { x, y, width, height } = kotakPdf(page, k);
  const s = Math.min(width / img.width, height / img.height) * skala;
  const w = img.width * s;
  const h = img.height * s;
  page.drawImage(img, { x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h, ...opsi });
}

async function template() {
  return PDFDocument.load(await readFile(path.join(ASET, "formulir-dealer.pdf")));
}

/** "29 Oktober 2026" dalam WIB. */
function tanggalPanjang(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(d);
}

async function simpan(doc: PDFDocument, judul: string): Promise<Uint8Array> {
  doc.setTitle(judul);
  doc.setProducer("drivetech.dpro.events");
  return doc.save();
}

/**
 * PDF kosong yang kolomnya bisa diketik (AcroForm), untuk dealer yang mengisi di
 * aplikasi PDF (Files atau Markup di iPad, Acrobat). Kotak tanda tangan dibiarkan
 * kosong: tanda tangan memakai fitur tanda tangan aplikasinya, atau cetak lalu basah.
 */
export async function buatPdfIsian(): Promise<Uint8Array> {
  const doc = await template();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const pages = doc.getPages();

  for (const [nama, k] of Object.entries(kolom) as [string, Kotak][]) {
    if (nama.startsWith("ttd_")) continue;
    const page = pages[k.hal];
    // pdf-lib memberi latar putih dan bingkai hitam bila kuncinya tidak ada; undefined = transparan,
    // supaya garis dan titik-titik formulir tetap terlihat saat PDF dicetak kosong.
    const tampilan = {
      ...kotakPdf(page, k),
      borderWidth: 0,
      borderColor: undefined,
      backgroundColor: undefined,
      textColor: WARNA_TINTA,
    };
    if (KOLOM_CENTANG.has(nama)) {
      form.createCheckBox(nama).addToPage(page, tampilan);
      continue;
    }
    const field = form.createTextField(nama);
    field.addToPage(page, { ...tampilan, font });
    field.setFontSize(UKURAN_HURUF);
    if (nama.startsWith("nama_ttd_")) field.setAlignment(1);
  }
  form.updateFieldAppearances(font);
  return simpan(doc, "Formulir Pendaftaran dan Komitmen Dealer DriveTech");
}

export type PdfTerisi = {
  kode: string;
  data: DataDealer;
  ttd: Uint8Array | null;
  stempel: Uint8Array | null;
  ditandatanganiAt: Date | null;
  diterimaAt: Date | null;
};

/**
 * PDF formulir terisi dari data web. Tanda tangan dealer (dan foto stempel, kalau ada)
 * ditempel di halaman formulir dan surat komitmen. Tanda tangan panitia baru muncul
 * setelah panitia menerima pendaftaran di panel admin.
 */
export async function buatPdfTerisi(p: PdfTerisi): Promise<Uint8Array> {
  const doc = await template();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const di = (nama: NamaKolom) => [pages[kolom[nama].hal], kolom[nama]] as const;

  const { data } = p;
  const biaya = hitungBiaya(data);
  const isi: DataDealer = {
    ...data,
    hitungan_biaya:
      LAPAK_DEALER.filter((l) => Number(data[`jumlah_${l.kode}`]) > 0)
        .map((l) => `${data[`jumlah_${l.kode}`]} ${l.kode.toUpperCase()}`)
        .join(" + ") + ` x ${biaya.tanggal} tanggal`,
    total_biaya: rupiah(biaya.total),
  };
  for (const l of LAPAK_DEALER) if (Number(data[`jumlah_${l.kode}`]) > 0) isi[`lapak_${l.kode}`] = "ya";

  for (const [nama, k] of Object.entries(kolom) as [string, Kotak][]) {
    const nilai = isi[nama];
    if (!nilai || KOLOM_BERTITIK.has(nama) || nama.startsWith("ttd_")) continue;
    if (KOLOM_CENTANG.has(nama)) centang(pages[k.hal], k);
    else tulis(pages[k.hal], font, k, nilai, /^(unit_\d_(tahun|jumlah|test_drive)|jumlah_)/.test(nama));
  }

  if (p.ditandatanganiAt) {
    const ttd = p.ttd ? await doc.embedPng(p.ttd) : null;
    const stempel = p.stempel ? await embedGambar(doc, p.stempel) : null;
    const namaDealer = `${data.pimpinan ?? ""}, ${data.jabatan ?? ""}`;
    for (const akhiran of ["form", "komitmen"] as const) {
      const [halTgl, kTgl] = di(`tanggal_${akhiran}`);
      tutupPutih(halTgl, kTgl);
      tulis(halTgl, font, kTgl, tanggalPanjang(p.ditandatanganiAt));

      const [halNama, kNama] = di(`nama_ttd_dealer_${akhiran}`);
      tutupPutih(halNama, kNama);
      tulis(halNama, font, kNama, `(${namaDealer})`, true);

      const [halTtd, kTtd] = di(`ttd_dealer_${akhiran}`);
      // Stempel di belakang tanda tangan, digeser ke kiri seperti cap basah. Multiply membuat latar putih foto hilang.
      if (stempel) {
        gambarDiKotak(halTtd, stempel, { ...kTtd, x: kTtd.x - kTtd.w * 0.18, y: kTtd.y - 6, h: kTtd.h + 12 }, 1, {
          blendMode: BlendMode.Multiply,
        });
      }
      if (ttd) gambarDiKotak(halTtd, ttd, kTtd, 0.95);
    }
  }

  if (p.diterimaAt) {
    const ttdPanitia = await doc.embedPng(await readFile(path.join(ASET, "ttd-panitia.png")));
    for (const akhiran of ["form", "komitmen"] as const) {
      const [hal, k] = di(`ttd_panitia_${akhiran}`);
      gambarDiKotak(hal, ttdPanitia, k, 1.1);
      const [halNama, kNama] = di(`nama_ttd_panitia_${akhiran}`);
      tutupPutih(halNama, kNama);
      tulis(halNama, font, kNama, `(${PENANDATANGAN_PANITIA})`, true);
    }
    const [hal, k] = di("diterima");
    tulis(hal, font, k, tanggalPanjang(p.diterimaAt));
  }

  return simpan(doc, `Formulir Dealer ${p.kode} ${data.nama_dealer ?? ""}`.trim());
}

/** Foto stempel dikirim sebagai JPEG atau PNG; tipe dibaca dari isi berkas. */
function embedGambar(doc: PDFDocument, isi: Uint8Array) {
  return isi[0] === 0x89 && isi[1] === 0x50 ? doc.embedPng(isi) : doc.embedJpg(isi);
}
