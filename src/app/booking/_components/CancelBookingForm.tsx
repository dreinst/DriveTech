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
        <Button variant="ghost" onClick={() => setKonfirmasi(true)}>
          Batalkan booking
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="anim-rise w-full basis-full space-y-3 rounded-[var(--radius)] border border-danger/30 bg-danger-soft p-4"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-sm font-semibold text-danger">Batalkan booking ini?</p>
      <p className="text-sm text-content">
        Slot langsung dilepas dan bisa dipesan orang lain — tindakan ini tidak bisa dibatalkan.
      </p>
      {state.status === "error" && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText="Membatalkan…">
          Ya, batalkan booking
        </SubmitButton>
        <Button variant="secondary" onClick={() => setKonfirmasi(false)}>
          Tidak jadi
        </Button>
      </div>
    </form>
  );
}
