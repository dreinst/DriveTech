import type { Json } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/**
 * Penampil isi kolom jsonb `tenants.detail` sebagai daftar key-value yang rapi.
 * Server-safe (tanpa "use client") karena hanya merender teks.
 */

/** Kata yang harus tetap huruf besar saat nama kunci dirapikan. */
const AKRONIM: Record<string, string> = {
  hp: "HP",
  wa: "WA",
  no: "No.",
  ktp: "KTP",
  nik: "NIK",
  npwp: "NPWP",
  pt: "PT",
  cv: "CV",
  ud: "UD",
  umkm: "UMKM",
  url: "URL",
  id: "ID",
  sim: "SIM",
  stnk: "STNK",
  bpkb: "BPKB",
  pic: "PIC",
};

/** "nama_usaha" / "namaUsaha" -> "Nama Usaha". */
export function labelKunci(key: string): string {
  const kata = key
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter((bagian) => bagian.length > 0);

  if (kata.length === 0) return key;

  return kata
    .map((bagian) => {
      const kecil = bagian.toLowerCase();
      const akronim = AKRONIM[kecil];
      if (akronim) return akronim;
      return kecil.charAt(0).toUpperCase() + kecil.slice(1);
    })
    .join(" ");
}

function isObjek(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ubah satu nilai jsonb jadi teks Indonesia yang enak dibaca. */
export function nilaiTeks(value: Json | undefined, kedalaman = 0): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "string") {
    const bersih = value.trim();
    return bersih.length > 0 ? bersih : "-";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((item) => nilaiTeks(item, kedalaman + 1)).join(", ");
  }
  if (isObjek(value)) {
    const isi = Object.entries(value);
    if (isi.length === 0) return "-";
    if (kedalaman >= 2) return "…";
    return isi
      .map(([kunci, isiNilai]) => `${labelKunci(kunci)}: ${nilaiTeks(isiNilai, kedalaman + 1)}`)
      .join("; ");
  }
  return "-";
}

export type DetailEntry = { key: string; label: string; value: string };

/** Daftar pasangan label-nilai siap render (dipakai juga untuk ekspor CSV). */
export function detailEntries(data: Json | null | undefined): DetailEntry[] {
  if (data === null || data === undefined || !isObjek(data)) return [];

  return Object.entries(data)
    .filter(([kunci]) => kunci.trim().length > 0)
    .map(([kunci, nilai]) => ({
      key: kunci,
      label: labelKunci(kunci),
      value: nilaiTeks(nilai),
    }))
    .filter((entri) => entri.value !== "-");
}

/** Rangkum detail jadi satu baris teks — dipakai kolom CSV. */
export function detailKeTeks(data: Json | null | undefined): string {
  return detailEntries(data)
    .map((entri) => `${entri.label}: ${entri.value}`)
    .join(" | ");
}

export type DetailListProps = {
  data: Json | null | undefined;
  className?: string;
  emptyText?: string;
};

/** Daftar detail tambahan tenant (kategori produk, data unit, dll). */
export function DetailList({ data, className, emptyText = "Tidak ada detail tambahan." }: DetailListProps) {
  const entries = detailEntries(data);

  if (entries.length === 0) {
    return <p className={cn("text-xs text-slate-400", className)}>{emptyText}</p>;
  }

  return (
    <dl className={cn("space-y-1", className)}>
      {entries.map((entri) => (
        <div key={entri.key} className="flex flex-wrap gap-x-1.5 text-xs leading-5">
          <dt className="font-medium text-slate-500">{entri.label}:</dt>
          <dd className="min-w-0 text-slate-800">{entri.value}</dd>
        </div>
      ))}
    </dl>
  );
}
