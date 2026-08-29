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
  const nada = state.status === "success" ? "text-ok" : "text-danger";
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
    return <span className="text-xs text-subtle">Belum ada data pembayaran</span>;
  }

  if (bookingStatus === "cancelled") {
    return <span className="text-xs text-subtle">Booking dibatalkan</span>;
  }

  // Sudah diverifikasi: aksi disembunyikan supaya tidak ada perubahan tak sengaja.
  if (paymentStatus === "verified") {
    return <span className="text-xs font-medium text-ok">Sudah diverifikasi</span>;
  }

  // Belum ada bukti sama sekali: tidak ada yang bisa diverifikasi/ditolak
  // (server juga menolak lewat guard NOT_SUBMITTED di verifyPayment).
  if (paymentStatus === "unpaid") {
    return <span className="text-xs text-subtle">Menunggu bukti dari tenant</span>;
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
          <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-sm)] px-3 text-xs font-medium text-danger transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-danger-soft [&::-webkit-details-marker]:hidden">
            Tolak
          </summary>
          <form action={rejectAction} className="anim-rise mt-2 w-60 space-y-2 rounded-[var(--radius-sm)] border border-line bg-card p-2.5 shadow-[var(--shadow-md)]">
            <input type="hidden" name="paymentId" value={paymentId} />
            <label htmlFor={alasanId} className="block text-xs font-medium text-ink">
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
