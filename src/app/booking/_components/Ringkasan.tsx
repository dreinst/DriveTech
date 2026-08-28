import type { ReactNode } from "react";

import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SlotDetail } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggal, slotDisplayName } from "@/lib/utils";

import { formatTanggalPendek } from "./tanggal";

/** Satu baris "label — nilai" pada kartu ringkasan. Server-safe. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export type TanggalChipsProps = {
  /** Tanggal "YYYY-MM-DD", diasumsikan sudah urut. */
  dates: string[];
  /** Teks pengganti saat daftar kosong. */
  kosong?: string;
  className?: string;
};

/**
 * Deret chip tanggal sewa ("Sab, 29 Agu") — server-safe, dipakai ringkasan
 * pesanan di halaman bayar dan detail di halaman status.
 */
export function TanggalChips({ dates, kosong = "Belum ada tanggal", className }: TanggalChipsProps) {
  if (dates.length === 0) {
    return <p className={cn("text-sm text-muted", className)}>{kosong}</p>;
  }
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {dates.map((tanggal) => (
        <li
          key={tanggal}
          title={formatTanggal(tanggal)}
          className="tabular whitespace-nowrap rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink"
        >
          {formatTanggalPendek(tanggal)}
        </li>
      ))}
    </ul>
  );
}

export type RingkasanSlotProps = {
  slot: SlotDetail;
  /** Tampilkan badge status slot di pojok kiri atas kartu. */
  tampilkanStatus?: boolean;
};

/**
 * Ringkasan slot ala mockup sistem_pemesanan: badge status, nama slot besar,
 * zona, dan biaya admin besar di kanan. Model per tanggal: harga ditampilkan
 * PER TANGGAL — totalnya dihitung form sesuai jumlah tanggal terpilih.
 * Hanya data yang benar-benar ada di skema (slot, zona, biaya admin).
 */
export function RingkasanSlot({ slot, tampilkanStatus = true }: RingkasanSlotProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {tampilkanStatus ? <StatusBadge status={slot.status} kind="slot" /> : null}
        <p className="mt-2.5 text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
          {slotDisplayName(slot)}
        </p>
        <p className="mt-1 text-sm text-muted">Zona: {slot.zone.name}</p>
      </div>

      <div className="text-right">
        <p className="tabular text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
          {formatRupiah(slot.zone.admin_fee)}
        </p>
        <p className="mt-1 text-[0.8125rem] text-subtle">Biaya admin / tanggal</p>
      </div>
    </div>
  );
}
