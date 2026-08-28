import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import {
  BOOKING_STATUS_LABEL,
  LEASING_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PURCHASE_STATUS_LABEL,
  SLOT_STATUS_LABEL,
} from "@/lib/domain/labels";
import type {
  BookingStatus,
  LeasingStatus,
  PaymentStatus,
  PurchaseStatus,
  SlotStatus,
} from "@/lib/types/database";

export type StatusValue = SlotStatus | BookingStatus | PaymentStatus | LeasingStatus | PurchaseStatus;
export type StatusKind = "slot" | "booking" | "payment" | "leasing" | "purchase";

/** Nada warna per nilai status. Nilai yang sama antar enum selalu bernada sama. */
const TONE_BY_STATUS: Record<StatusValue, BadgeTone> = {
  // hijau — beres / tersedia
  available: "green",
  confirmed: "green",
  verified: "green",
  approved: "green",
  completed: "green",
  deal: "green",
  // kuning — sedang berjalan / menunggu
  pending: "amber",
  pending_payment: "amber",
  submitted: "amber",
  unpaid: "amber",
  verifying: "amber",
  new: "amber",
  contacted: "amber",
  // merah — gagal / batal
  rejected: "red",
  cancelled: "red",
};

/**
 * Urutan tebakan kamus saat prop `kind` tidak diisi — sama dengan urutan tipe
 * pada kontrak (slot -> booking -> payment -> leasing -> purchase).
 * Nilai yang bertabrakan antar enum ("confirmed", "submitted", "cancelled")
 * sebaiknya disertai `kind` agar labelnya persis.
 */
const KIND_ORDER: readonly StatusKind[] = ["slot", "booking", "payment", "leasing", "purchase"];

function labelFromKind(status: string, kind: StatusKind): string | undefined {
  switch (kind) {
    case "slot":
      return status in SLOT_STATUS_LABEL ? SLOT_STATUS_LABEL[status as SlotStatus] : undefined;
    case "booking":
      return status in BOOKING_STATUS_LABEL ? BOOKING_STATUS_LABEL[status as BookingStatus] : undefined;
    case "payment":
      return status in PAYMENT_STATUS_LABEL ? PAYMENT_STATUS_LABEL[status as PaymentStatus] : undefined;
    case "leasing":
      return status in LEASING_STATUS_LABEL ? LEASING_STATUS_LABEL[status as LeasingStatus] : undefined;
    case "purchase":
      return status in PURCHASE_STATUS_LABEL ? PURCHASE_STATUS_LABEL[status as PurchaseStatus] : undefined;
  }
}

function resolveLabel(status: StatusValue, kind?: StatusKind): string {
  if (kind) {
    const label = labelFromKind(status, kind);
    if (label) return label;
  }
  for (const candidate of KIND_ORDER) {
    const label = labelFromKind(status, candidate);
    if (label) return label;
  }
  return status;
}

function resolveTone(status: StatusValue, kind?: StatusKind): BadgeTone {
  // Slot "confirmed" berarti TERISI (tidak bisa dipesan) -> merah,
  // beda dengan booking "confirmed" (Terkonfirmasi) -> hijau.
  if (kind === "slot" && status === "confirmed") return "red";
  return TONE_BY_STATUS[status] ?? "slate";
}

export type StatusBadgeProps = {
  status: StatusValue;
  /** Kamus label yang dipakai. Kosongkan untuk menebak dari nilai statusnya. */
  kind?: StatusKind;
};

/** Badge status berbahasa Indonesia untuk slot, booking, pembayaran, leasing, dan pembelian. */
export function StatusBadge({ status, kind }: StatusBadgeProps) {
  return (
    <Badge tone={resolveTone(status, kind)} dot>
      {resolveLabel(status, kind)}
    </Badge>
  );
}
