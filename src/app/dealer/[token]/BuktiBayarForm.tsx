"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { kirimBuktiDealerAction } from "@/lib/actions/formulir-dealer";
import { initialActionState } from "@/lib/actions/state";

export function BuktiBayarForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(kirimBuktiDealerAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium text-ink" htmlFor="bukti-dealer">
        Screenshot bukti bayar (JPG, PNG, atau WEBP, maksimal 2 MB)
      </label>
      <input
        id="bukti-dealer"
        name="proof"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        className="block w-full text-sm text-ink file:mr-3 file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-[#0a0a0a]"
      />
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Mengunggah…" : "Kirim bukti bayar"}
      </Button>
    </form>
  );
}
