"use client";

import { useActionState, useState } from "react";

import { TandaTanganPad } from "@/components/forms/TandaTanganPad";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { simpanTtdKwitansiAction } from "@/lib/actions/formulir-dealer";
import { initialActionState } from "@/lib/actions/state";

export function TtdKwitansiForm() {
  const [state, formAction, isPending] = useActionState(simpanTtdKwitansiAction, initialActionState);
  const [adaTtd, setAdaTtd] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <TandaTanganPad name="ttd" onChange={setAdaTtd} />
      {state.status !== "idle" && state.message ? (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      ) : null}
      <Button type="submit" disabled={isPending || !adaTtd}>
        {isPending ? "Menyimpan…" : "Simpan tanda tangan"}
      </Button>
    </form>
  );
}
