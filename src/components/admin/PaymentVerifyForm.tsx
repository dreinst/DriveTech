"use client";

import { useActionState, useId } from "react";
import type { FormEvent } from "react";

import { Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { rejectPaymentAction, verifyPaymentAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { BookingStatus, PaymentStatus } from "@/lib/types/database";

export type PaymentVerifyFormProps = {
  /** ID baris admin_fee_payments. null kalau booking belum punya data pembayaran. */
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  bookingStatus: BookingStatus;
  /** Kode booking, dipakai pada teks konfirmasi. */
  bookingCode: string;
};

/** Pesan hasil action, ringkas supaya muat di dalam sel tabel. */
function Pesan({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const nada = state.status === "success" ? "text-green-700" : "text-red-600";
  return (
    <p role="status" className={`text-xs font-medium ${nada}`}>
      {state.message}
    </p>
  );
}

/**
 * Aksi verifikator pada satu baris pembayaran biaya admin:
 * - "Verifikasi" (dengan konfirmasi) -> pembayaran verified, booking confirmed, slot terisi.
 * - "Tolak" (buka <details>, wajib isi alasan) -> pembayaran rejected, booking & slot tetap pending.
 */
export function PaymentVerifyForm({
  paymentId,
  paymentStatus,
  bookingStatus,
  bookingCode,
}: PaymentVerifyFormProps) {
  const [verifyState, verifyAction] = useActionState(verifyPaymentAction, initialActionState);
  const [rejectState, rejectAction] = useActionState(rejectPaymentAction, initialActionState);
  const alasanId = useId();

  if (!paymentId) {
    return <span className="text-xs text-slate-400">Belum ada data pembayaran</span>;
  }

  if (bookingStatus === "cancelled") {
    return <span className="text-xs text-slate-400">Booking dibatalkan</span>;
  }

  // Sudah diverifikasi: aksi disembunyikan supaya tidak ada perubahan tak sengaja.
  if (paymentStatus === "verified") {
    return <span className="text-xs font-medium text-green-700">Sudah diverifikasi</span>;
  }

  function konfirmasiVerifikasi(event: FormEvent<HTMLFormElement>) {
    const setuju = window.confirm(
      `Verifikasi pembayaran booking ${bookingCode}? Slot akan dikunci sebagai terisi.`,
    );
    if (!setuju) event.preventDefault();
  }

  return (
    <div className="flex min-w-[13rem] flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={verifyAction} onSubmit={konfirmasiVerifikasi}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <SubmitButton size="sm" pendingText="Memverifikasi…">
            Verifikasi
          </SubmitButton>
        </form>

        <details>
          <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 [&::-webkit-details-marker]:hidden">
            Tolak
          </summary>
          <form action={rejectAction} className="mt-2 w-60 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <input type="hidden" name="paymentId" value={paymentId} />
            <label htmlFor={alasanId} className="block text-xs font-medium text-slate-700">
              Alasan penolakan
            </label>
            <Textarea
              id={alasanId}
              name="reason"
              rows={2}
              required
              minLength={3}
              placeholder="Contoh: nominal transfer tidak sesuai."
              className="text-xs"
            />
            <SubmitButton size="sm" variant="danger" pendingText="Menolak…">
              Kirim Penolakan
            </SubmitButton>
          </form>
        </details>
      </div>

      <Pesan state={verifyState} />
      <Pesan state={rejectState} />
    </div>
  );
}
