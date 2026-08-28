"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cekStatusAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

export type CekStatusFormProps = {
  className?: string;
};

/**
 * Form inline "cek status booking": satu input kode + tombol.
 * cekStatusAction membaca field "code" (server menormalkan huruf besar)
 * dan me-redirect ke /booking/[id]/status kalau kode cocok.
 */
export function CekStatusForm({ className }: CekStatusFormProps) {
  const [state, formAction, isPending] = useActionState(cekStatusAction, initialActionState);

  const error =
    state.status === "error" ? (state.fieldErrors?.code ?? state.message) : undefined;

  return (
    <form action={formAction} className={className}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="cek-status-kode" className="sr-only">
          Kode booking
        </label>
        <Input
          id="cek-status-kode"
          name="code"
          placeholder="Kode booking, contoh BK-A1B2C3"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          className={cn(
            "flex-1 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal",
            error && "border-danger",
          )}
        />
        <Button type="submit" disabled={isPending} className="shrink-0">
          {isPending ? "Mencari…" : "Cek Status"}
        </Button>
      </div>
      {error ? (
        <p className="anim-rise mt-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
