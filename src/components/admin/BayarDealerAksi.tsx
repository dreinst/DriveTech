"use client";

import { useActionState, useId } from "react";
import type { FormEvent } from "react";

import { Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { lunaskanDealerAction, tolakBayarDealerAction } from "@/lib/actions/formulir-dealer";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { StatusBayarDealer } from "@/lib/services/formulir-dealer";

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
 * Aksi admin pada tagihan lapak dealer:
 * - "Lunas" (dengan konfirmasi) -> nomor kwitansi dibuat, kwitansi dikirim bot ke WhatsApp dealer.
 * - "Tolak" (hanya bila ada bukti) -> dealer diminta mengunggah bukti ulang.
 * Lunas boleh tanpa bukti (misalnya uang sudah terlihat di mutasi QRIS).
 */
export function BayarDealerAksi({
  id,
  kode,
  status,
  lewat = "admin",
}: {
  id: number;
  kode: string;
  status: StatusBayarDealer;
  lewat?: "admin" | "cocok";
}) {
  const [lunasState, lunasAction] = useActionState(lunaskanDealerAction, initialActionState);
  const [tolakState, tolakAction] = useActionState(tolakBayarDealerAction, initialActionState);
  const alasanId = useId();

  if (status === "lunas") return null;

  function konfirmasi(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Tandai tagihan dealer ${kode} lunas? Kwitansi dibuat dan dikirim ke dealer.`)) event.preventDefault();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={lunasAction} onSubmit={konfirmasi}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="lewat" value={lewat} />
          <SubmitButton size="sm" pendingText="Menyimpan…">
            Lunas
          </SubmitButton>
        </form>
        {status === "dicek" ? (
          <details>
            <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-sm)] px-3 text-xs font-medium text-danger hover:bg-danger-soft [&::-webkit-details-marker]:hidden">
              Tolak
            </summary>
            <form action={tolakAction} className="anim-rise mt-2 w-60 space-y-2 rounded-[var(--radius-sm)] border border-line bg-card p-2.5 shadow-[var(--shadow-md)]">
              <input type="hidden" name="id" value={id} />
              <label htmlFor={alasanId} className="block text-xs font-medium text-ink">
                Alasan penolakan
              </label>
              <Textarea
                id={alasanId}
                name="alasan"
                rows={2}
                required
                minLength={3}
                placeholder="Contoh: nominal belum masuk di GoPay Merchant."
                className="text-xs"
              />
              <SubmitButton size="sm" variant="danger" pendingText="Menolak…">
                Kirim Penolakan
              </SubmitButton>
            </form>
          </details>
        ) : null}
      </div>
      <Pesan state={lunasState} />
      <Pesan state={tolakState} />
    </div>
  );
}
