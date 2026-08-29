import { PAYMENT_DEADLINE_HOURS } from "./constants";
import type { AdminFeePaymentRow, BookingRow } from "@/lib/types/database";

/**
 * Tenggat pembayaran sebuah booking — cermin logika expire_unpaid_bookings()
 * di database (pg_cron), supaya tenant tahu kapan bookingnya hangus:
 *  - belum ada pembayaran / masih unpaid -> created_at + 24 jam;
 *  - bukti ditolak -> saat penolakan (payment.updated_at) + 24 jam;
 *  - submitted/verified atau booking bukan pending_payment -> tidak ada tenggat.
 */
/** Timestamp (nullable di tipe baris) + jendela; null kalau tak bisa dihitung. */
function tambahJendela(timestamp: string | null, jendelaMs: number): Date | null {
  if (!timestamp) return null;
  const dasar = new Date(timestamp);
  if (Number.isNaN(dasar.getTime())) return null;
  return new Date(dasar.getTime() + jendelaMs);
}

export function batasPembayaran(
  booking: Pick<BookingRow, "status" | "created_at">,
  payment: Pick<AdminFeePaymentRow, "status" | "updated_at"> | null,
): Date | null {
  if (booking.status !== "pending_payment") return null;

  const jendelaMs = PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000;
  if (!payment || payment.status === "unpaid") {
    return tambahJendela(booking.created_at, jendelaMs);
  }
  if (payment.status === "rejected") {
    return tambahJendela(payment.updated_at ?? booking.created_at, jendelaMs);
  }
  return null;
}
