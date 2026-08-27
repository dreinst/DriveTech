import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import type { SlotDetail } from "@/lib/types/database";
import { cn, formatRupiah, slotDisplayName } from "@/lib/utils";

export type SlotSuggestionsProps = {
  suggestions: SlotDetail[];
  className?: string;
};

/**
 * Daftar SARAN slot pengganti saat slot pilihan tidak tersedia
 * (bagian 4 "Sistem Pameran Arsitektur.md": suggestion list, bukan auto-assign).
 * Komponen ini murni tampilan sehingga aman dipakai server maupun client.
 */
export function SlotSuggestions({ suggestions, className }: SlotSuggestionsProps) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        title="Belum ada slot pengganti"
        description="Semua slot dengan tipe serupa sedang terisi. Silakan cek kembali beberapa saat lagi atau hubungi panitia."
      />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-slate-500">
        Ini hanya <strong className="font-semibold text-slate-700">saran</strong>. Tidak ada slot
        yang dipesan otomatis &mdash; Anda tetap perlu memilih dan mengonfirmasi sendiri.
      </p>

      <ul className="space-y-2">
        {suggestions.map((slot) => (
          <li
            key={slot.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {slot.zone.name} &middot; {slotDisplayName(slot)}
              </p>
              <p className="truncate text-xs text-slate-500">
                {ZONE_TYPE_LABEL[slot.zone.zone_type]} &middot; biaya admin{" "}
                {formatRupiah(slot.zone.admin_fee)}
              </p>
            </div>
            <Link href={`/booking/${slot.id}`} className={buttonClass("secondary", "sm")}>
              Pilih
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
