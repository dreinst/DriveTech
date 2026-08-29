"use client";

import { useActionState, useId } from "react";

import { Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminCancelBookingAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { BookingStatus } from "@/lib/types/database";

export type AdminCancelBookingFormProps = {
  bookingId: string;
  bookingStatus: BookingStatus;
  bookingCode: string;
};

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
 * Pembatalan booking oleh panitia — tersembunyi di balik <details> dan WAJIB
 * alasan (dikirim ke tenant). Berbeda dari pembatalan mandiri tenant: admin
 * boleh membatalkan booking yang sudah confirmed sekalipun (mis. refund
 * disepakati di luar sistem). Booking yang sudah dibatalkan tidak menampilkan
 * kontrol ini.
 */
export function AdminCancelBookingForm({
  bookingId,
  bookingStatus,
  bookingCode,
}: AdminCancelBookingFormProps) {
  const [state, formAction] = useActionState(adminCancelBookingAction, initialActionState);
  const alasanId = useId();

  if (bookingStatus === "cancelled") {
    return <span className="text-xs text-subtle">Sudah dibatalkan</span>;
  }

  return (
    <details className="group">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-sm)] px-3 text-xs font-medium text-danger transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-danger-soft [&::-webkit-details-marker]:hidden">
        Batalkan booking
      </summary>
      <form
        action={formAction}
        className="anim-rise mt-2 w-full space-y-2 rounded-[var(--radius)] border border-danger/30 bg-danger-soft p-3"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <p className="text-xs text-content">
          Membatalkan <span className="font-mono font-semibold">{bookingCode}</span> melepas semua
          tanggal sewanya dan mengirim pemberitahuan ke tenant.
          {bookingStatus === "confirmed" ? (
            <span className="font-medium text-danger">
              {" "}
              Booking ini sudah terkonfirmasi — pastikan refund/persetujuan sudah beres.
            </span>
          ) : null}
        </p>
        <Textarea
          id={alasanId}
          name="reason"
          rows={2}
          required
          minLength={3}
          placeholder="Alasan pembatalan (mis. permintaan tenant, jadwal berubah)"
          aria-label="Alasan pembatalan"
        />
        <div className="flex items-center gap-2">
          <SubmitButton variant="danger" size="sm" pendingText="Membatalkan…">
            Ya, batalkan
          </SubmitButton>
          <Pesan state={state} />
        </div>
      </form>
    </details>
  );
}
