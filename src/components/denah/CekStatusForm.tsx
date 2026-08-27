"use client";

import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cekStatusAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";

export type CekStatusFormProps = {
  className?: string;
};

/**
 * Form kecil "cek status booking" di landing page.
 * Server action cekStatusAction akan me-redirect ke /booking/[id]/status kalau kode cocok.
 */
export function CekStatusForm({ className }: CekStatusFormProps) {
  const [state, formAction, isPending] = useActionState(cekStatusAction, initialActionState);
  const [code, setCode] = useState("");

  const error = state.fieldErrors?.booking_code ?? state.fieldErrors?.code;

  return (
    <form action={formAction} className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Kode booking"
            htmlFor="booking_code"
            hint="Kode dikirim setelah pemesanan, contoh: BK-A1B2C3."
            error={error}
            required
          >
            <Input
              id="booking_code"
              name="booking_code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="BK-XXXXXX"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={isPending} className="sm:mb-1">
          {isPending ? "Mencari…" : "Cek Status"}
        </Button>
      </div>

      {/* Alias nama field supaya cocok dengan nama yang dibaca server action. */}
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="bookingCode" value={code} />

      {state.status === "error" && state.message ? (
        <div className="mt-3">
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}
    </form>
  );
}
