"use client";

import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cancelBookingAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";

export type CancelBookingFormProps = {
  bookingId: string;
};

/**
 * Pembatalan booking dengan konfirmasi dua langkah.
 *
 * Dialog konfirmasi dibuat inline (bukan window.confirm) karena <form action={...}>
 * milik Server Action tidak bisa dibatalkan lewat preventDefault.
 */
export function CancelBookingForm({ bookingId }: CancelBookingFormProps) {
  const [state, formAction] = useActionState(cancelBookingAction, initialActionState);
  const [konfirmasi, setKonfirmasi] = useState(false);

  if (!konfirmasi) {
    return (
      <div className="space-y-2">
        {state.status === "error" && state.message ? (
          <Alert tone="error">{state.message}</Alert>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setKonfirmasi(true)}>
          Batalkan booking
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-sm font-semibold text-red-900">Batalkan booking ini?</p>
      <p className="text-sm text-red-800">
        Slot akan dilepas dan bisa langsung dipesan orang lain. Tindakan ini tidak bisa
        dibatalkan &mdash; Anda perlu memesan ulang dari denah.
      </p>
      {state.status === "error" && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" size="sm" pendingText="Membatalkan…">
          Ya, batalkan booking
        </SubmitButton>
        <Button variant="secondary" size="sm" onClick={() => setKonfirmasi(false)}>
          Tidak jadi
        </Button>
      </div>
    </form>
  );
}
