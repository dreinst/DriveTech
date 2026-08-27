import type { ReactNode } from "react";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import type { SlotDetail } from "@/lib/types/database";
import { formatRupiah, slotDisplayName } from "@/lib/utils";

/** Satu baris "label — nilai" pada kartu ringkasan. Server-safe. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export type RingkasanSlotProps = {
  slot: SlotDetail;
  /** Tampilkan badge status slot di baris terakhir. */
  tampilkanStatus?: boolean;
};

/** Ringkasan zona, nomor slot, tipe, dan biaya admin. */
export function RingkasanSlot({ slot, tampilkanStatus = false }: RingkasanSlotProps) {
  return (
    <dl className="divide-y divide-slate-100">
      <InfoRow label="Zona">{slot.zone.name}</InfoRow>
      <InfoRow label="Slot">{slotDisplayName(slot)}</InfoRow>
      <InfoRow label="Tipe zona">{ZONE_TYPE_LABEL[slot.zone.zone_type]}</InfoRow>
      <InfoRow label="Biaya admin">
        <span className="text-base font-semibold text-slate-900">
          {formatRupiah(slot.zone.admin_fee)}
        </span>
      </InfoRow>
      {tampilkanStatus ? (
        <InfoRow label="Status slot">
          <StatusBadge status={slot.status} kind="slot" />
        </InfoRow>
      ) : null}
    </dl>
  );
}
