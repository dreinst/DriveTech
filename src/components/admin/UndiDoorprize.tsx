"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { undiPemenangAction } from "@/lib/actions/jalan-sehat";
import { initialActionState } from "@/lib/actions/state";

export function UndiDoorprize({ sisa }: { sisa: number }) {
  const [state, formAction, isPending] = useActionState(undiPemenangAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4 border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{sisa} peserta belum pernah menang dan ikut diundi.</p>
        <Button type="submit" disabled={isPending || sisa === 0}>
          {isPending ? "Mengundi…" : "Undi satu pemenang"}
        </Button>
      </div>
      {state.status === "success" ? (
        <p className="judul text-4xl text-accent sm:text-5xl" role="status">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
