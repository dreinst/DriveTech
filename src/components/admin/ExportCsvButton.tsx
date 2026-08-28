"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/** Satu baris CSV: nama kolom -> nilai. */
export type ExportCsvRow = Record<string, string | number | null>;

export type ExportCsvButtonProps = {
  filename: string;
  rows: ExportCsvRow[];
  label?: string;
  className?: string;
};

/**
 * Pemisah titik koma dipilih supaya file langsung terbaca rapi di Excel
 * berlokal Indonesia (koma di sana dipakai sebagai pemisah desimal).
 */
const PEMISAH = ";";

/** Kumpulkan nama kolom sesuai urutan kemunculannya. */
function ambilKolom(rows: ExportCsvRow[]): string[] {
  const kolom: string[] = [];
  for (const row of rows) {
    for (const kunci of Object.keys(row)) {
      if (!kolom.includes(kunci)) kolom.push(kunci);
    }
  }
  return kolom;
}

function bungkus(nilai: string | number | null | undefined): string {
  if (nilai === null || nilai === undefined) return "";
  let teks = String(nilai).replace(/\r?\n/g, " ").trim();
  if (teks.length === 0) return "";
  // Anti injeksi formula spreadsheet: Excel/Sheets tetap mengevaluasi sel yang
  // diawali = + - @ atau tab MESKI sudah dikutip CSV, dan nilai seperti nama
  // tenant berasal dari input publik. Apostrof di depan memaksa sel jadi teks
  // (tidak ikut ditampilkan oleh Excel/Sheets).
  if (/^[=+\-@\t]/.test(teks)) teks = `'${teks}`;
  if (teks.includes(PEMISAH) || teks.includes('"') || teks.includes(",")) {
    return `"${teks.replace(/"/g, '""')}"`;
  }
  return teks;
}

function susunCsv(rows: ExportCsvRow[]): string {
  const kolom = ambilKolom(rows);
  const baris = [kolom.map(bungkus).join(PEMISAH)];
  for (const row of rows) {
    baris.push(kolom.map((kunci) => bungkus(row[kunci])).join(PEMISAH));
  }
  // BOM UTF-8 supaya huruf beraksen tidak rusak saat dibuka di Excel.
  return `\uFEFF${baris.join("\r\n")}\r\n`;
}

function namaBerkas(filename: string): string {
  const bersih = filename.trim().length > 0 ? filename.trim() : "data.csv";
  return bersih.toLowerCase().endsWith(".csv") ? bersih : `${bersih}.csv`;
}

/**
 * Tombol unduh CSV dari data yang sudah dirender di halaman (dibuat di browser).
 * Gayanya "pil terang lembut" tema gelap: bg-surface-3 + teks putih.
 */
export function ExportCsvButton({
  filename,
  rows,
  label = "Unduh CSV",
  className,
}: ExportCsvButtonProps) {
  const [pesan, setPesan] = useState<string | null>(null);
  const kosong = rows.length === 0;

  function unduh(): void {
    if (kosong) return;
    try {
      const blob = new Blob([susunCsv(rows)], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = namaBerkas(filename);
      document.body.appendChild(tautan);
      tautan.click();
      document.body.removeChild(tautan);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPesan(null);
    } catch {
      setPesan("Berkas gagal dibuat di peramban ini.");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={unduh}
        disabled={kosong}
        title={kosong ? "Tidak ada data untuk diunduh" : undefined}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-surface-3 px-4 text-xs font-medium leading-none text-ink",
          "transition-[background-color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-line-strong active:scale-[0.98]",
          "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 3v9" />
          <path d="m6.2 8.4 3.8 3.8 3.8-3.8" />
          <path d="M4 15.5h12" />
        </svg>
        {label}
      </button>
      {pesan ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {pesan}
        </p>
      ) : null}
    </div>
  );
}
