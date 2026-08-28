"use client";

import { useActionState, useId } from "react";

import { Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateZoneFeeAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";

export type ZoneFeeFormProps = {
  zoneId: string;
  zoneName: string;
  /** Biaya admin zona saat ini (rupiah). */
  defaultFee: number;
};

/**
 * Form satu baris di /admin/pengaturan: ubah biaya admin sebuah zona lalu
 * simpan per baris. Nilai tersimpan langsung dipakai denah publik & booking.
 */
export function ZoneFeeForm({ zoneId, zoneName, defaultFee }: ZoneFeeFormProps) {
  const [state, formAction] = useActionState(updateZoneFeeAction, initialActionState);
  const inputId = useId();
  const errorAdminFee = state.fieldErrors?.adminFee;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="zoneId" value={zoneId} />

      <label htmlFor={inputId} className="sr-only">
        Biaya admin zona {zoneName} (rupiah)
      </label>
      <div className="relative min-w-0 flex-1 sm:max-w-52">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-subtle"
        >
          Rp
        </span>
        <Input
          id={inputId}
          name="adminFee"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          required
          defaultValue={defaultFee}
          aria-invalid={errorAdminFee ? true : undefined}
          className="tabular pl-10"
        />
      </div>

      <SubmitButton variant="secondary" size="sm" pendingText="Menyimpan…">
        Simpan
      </SubmitButton>

      {state.status === "error" ? (
        <p className="w-full text-xs font-medium text-danger" role="alert">
          {errorAdminFee ?? state.message ?? "Biaya admin gagal disimpan."}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="w-full text-xs font-medium text-ok" role="status">
          {state.message ?? "Biaya admin tersimpan."}
        </p>
      ) : null}
    </form>
  );
}
