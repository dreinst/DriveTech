"use client";

import { useActionState } from "react";

import { Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminMoveBookingSlotAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { BookingStatus } from "@/lib/types/database";

export type MoveSlotCandidate = { id: string; label: string };

export type MoveSlotFormProps = {
  bookingId: string;
  bookingStatus: BookingStatus;
  /** Slot tujuan yang mungkin: tersedia, tipe zona sama, bukan slot sekarang. */
  candidates: MoveSlotCandidate[];
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
 * Pindahkan booking ke slot lain (di dalam zona bertipe sama). Tersembunyi di
 * balik <details>. Server memvalidasi ketersediaan tanggal slot tujuan.
 */
export function MoveSlotForm({ bookingId, bookingStatus, candidates }: MoveSlotFormProps) {
  const [state, formAction] = useActionState(adminMoveBookingSlotAction, initialActionState);

  if (bookingStatus === "cancelled" || candidates.length === 0) return null;

  return (
    <details className="group">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-surface-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        Pindahkan slot
      </summary>
      <form
        action={formAction}
        className="anim-rise mt-2 w-60 space-y-2 rounded-[var(--radius)] border border-line bg-card p-3 shadow-[var(--shadow-md)]"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <label className="block text-xs font-medium text-ink">Slot tujuan (zona sama)</label>
        <Select name="targetSlotId" required defaultValue="" className="text-xs">
          <option value="" disabled>
            Pilih slot…
          </option>
          {candidates.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </Select>
        <p className="text-[0.7rem] leading-snug text-subtle">
          Slot tujuan harus kosong di semua tanggal booking ini.
        </p>
        <SubmitButton size="sm" pendingText="Memindahkan…">
          Pindahkan
        </SubmitButton>
        <Pesan state={state} />
      </form>
    </details>
  );
}
