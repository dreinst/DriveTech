"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setCommissionPaidAction, updateLeasingApplicationAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { LEASING_STATUS_LABEL } from "@/lib/domain/labels";
import type { LeasingStatus } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const STATUS_OPTIONS: readonly LeasingStatus[] = [
  "submitted",
  "verifying",
  "approved",
  "rejected",
  "completed",
];

export type LeasingUpdateFormProps = {
  /** ID baris leasing_applications. */
  id: string;
  status: LeasingStatus;
  commissionAmount: number | null;
  commissionPaid: boolean;
  notes: string | null;
  /** Harga unit dari transaksi pembelian — dasar tombol "Hitung dari rate". */
  unitPrice: number | null;
  /** Persentase komisi mitra leasing. */
  commissionRate: number | null;
};

function Pesan({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const nada = state.status === "success" ? "text-green-700" : "text-red-600";
  return (
    <p role="status" className={`text-xs font-medium ${nada}`}>
      {state.message}
    </p>
  );
}

/**
 * Panel kelola satu pengajuan leasing: status, nominal komisi, penanda komisi
 * lunas, dan catatan. Tombol cepat "Tandai lunas" memakai action terpisah
 * (form saudara, bukan form bersarang — HTML melarang <form> di dalam <form>).
 */
export function LeasingUpdateForm({
  id,
  status,
  commissionAmount,
  commissionPaid,
  notes,
  unitPrice,
  commissionRate,
}: LeasingUpdateFormProps) {
  const [simpanState, simpanAction] = useActionState(
    updateLeasingApplicationAction,
    initialActionState,
  );
  const [komisiState, komisiAction] = useActionState(setCommissionPaidAction, initialActionState);

  const statusId = useId();
  const komisiId = useId();
  const lunasId = useId();
  const catatanId = useId();

  const [komisi, setKomisi] = useState<string>(
    typeof commissionAmount === "number" ? String(commissionAmount) : "",
  );

  // Perkiraan komisi = harga unit × rate mitra (persen), dibulatkan ke rupiah.
  const hasilHitung =
    typeof unitPrice === "number" &&
    unitPrice > 0 &&
    typeof commissionRate === "number" &&
    commissionRate > 0
      ? Math.round((unitPrice * commissionRate) / 100)
      : null;

  return (
    <div className="min-w-[17rem] space-y-2">
      <form action={simpanAction} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        {/* Penanda agar checkbox yang TIDAK dicentang tetap ikut dipatch jadi false. */}
        <input type="hidden" name="commissionPaidPresent" value="1" />

        <div className="space-y-1">
          <label htmlFor={statusId} className="block text-xs font-medium text-slate-600">
            Status pengajuan
          </label>
          <Select id={statusId} name="status" defaultValue={status} className="h-9 py-1 text-xs">
            {STATUS_OPTIONS.map((opsi) => (
              <option key={opsi} value={opsi}>
                {LEASING_STATUS_LABEL[opsi]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor={komisiId} className="block text-xs font-medium text-slate-600">
            Komisi platform (Rp)
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              id={komisiId}
              name="commissionAmount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={komisi}
              onChange={(event) => setKomisi(event.currentTarget.value)}
              placeholder="0"
              className="h-9 py-1 text-xs"
            />
            {hasilHitung !== null ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setKomisi(String(hasilHitung))}
                title={`Harga unit × ${commissionRate}% = ${formatRupiah(hasilHitung)}`}
              >
                Hitung dari rate
              </Button>
            ) : null}
          </div>
          {hasilHitung !== null ? (
            <p className="text-xs text-slate-400">
              Perkiraan {commissionRate}% dari harga unit: {formatRupiah(hasilHitung)}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Harga unit atau rate mitra belum terisi, komisi diisi manual.
            </p>
          )}
        </div>

        <label htmlFor={lunasId} className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            id={lunasId}
            name="commissionPaid"
            type="checkbox"
            defaultChecked={commissionPaid}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          Komisi sudah dibayar mitra
        </label>

        <div className="space-y-1">
          <label htmlFor={catatanId} className="block text-xs font-medium text-slate-600">
            Catatan
          </label>
          <Textarea
            id={catatanId}
            name="notes"
            rows={2}
            defaultValue={notes ?? ""}
            placeholder="Catatan internal untuk pengajuan ini…"
            className="text-xs"
          />
        </div>

        <SubmitButton size="sm" pendingText="Menyimpan…">
          Simpan
        </SubmitButton>
      </form>

      <form action={komisiAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="paid" value={commissionPaid ? "false" : "true"} />
        <SubmitButton size="sm" variant="ghost" pendingText="Memperbarui…">
          {commissionPaid ? "Tandai komisi belum dibayar" : "Tandai komisi lunas"}
        </SubmitButton>
      </form>

      <Pesan state={simpanState} />
      <Pesan state={komisiState} />
    </div>
  );
}
