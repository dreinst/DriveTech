"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { ButtonSize, ButtonVariant } from "@/components/ui/Button";

/** Satu baris CSV: nama kolom -> nilai. */
export type ExportCsvRow = Record<string, string | number | null>;

export type ExportCsvButtonProps = {
  filename: string;
  rows: ExportCsvRow[];
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
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
  const teks = String(nilai).replace(/\r?\n/g, " ").trim();
  if (teks.length === 0) return "";
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

/** Tombol unduh CSV dari data yang sudah dirender di halaman (dibuat di browser). */
export function ExportCsvButton({
  filename,
  rows,
  label = "Unduh CSV",
  variant = "secondary",
  size = "sm",
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
      <Button variant={variant} size={size} onClick={unduh} disabled={kosong} title={kosong ? "Tidak ada data untuk diunduh" : undefined}>
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
      </Button>
      {pesan ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {pesan}
        </p>
      ) : null}
    </div>
  );
}
