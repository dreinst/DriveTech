"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { terimaDealerAction } from "@/lib/actions/formulir-dealer";
import { initialActionState } from "@/lib/actions/state";

export function TerimaDealerButton({ id }: { id: number }) {
  const [state, formAction, isPending] = useActionState(terimaDealerAction, initialActionState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Menyimpan…" : "Terima"}
      </Button>
      {state.status === "error" ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
