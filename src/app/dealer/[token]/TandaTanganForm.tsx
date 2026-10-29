"use client";

import { useActionState, useState } from "react";

import { StempelInput, TandaTanganPad } from "@/components/forms/TandaTanganPad";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { tandatanganiDealerAction } from "@/lib/actions/formulir-dealer";
import { initialActionState } from "@/lib/actions/state";

export function TandaTanganForm({ token, adaStempel }: { token: string; adaStempel: boolean }) {
  const [state, formAction, isPending] = useActionState(tandatanganiDealerAction, initialActionState);
  const [adaTtd, setAdaTtd] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <TandaTanganPad name="ttd" onChange={setAdaTtd} />
      {adaStempel ? null : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Foto stempel (opsional)</p>
          <StempelInput name="stempel" />
        </div>
      )}
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Button type="submit" disabled={isPending || !adaTtd} className="w-full">
        {isPending ? "Menyimpan…" : "Simpan tanda tangan"}
      </Button>
    </form>
  );
}
