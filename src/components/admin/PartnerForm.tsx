"use client";

import { useActionState, useId } from "react";
import type { ReactNode } from "react";

import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { upsertPartnerAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";
import type { LeasingPartnerRow } from "@/lib/types/database";

export type PartnerFormProps = {
  /** Isi untuk mode ubah. Kosongkan untuk menambah mitra baru. */
  partner?: LeasingPartnerRow | null;
  /** "card" = form tambah yang selalu terbuka, "inline" = dibungkus <details> di dalam tabel. */
  variant?: "card" | "inline";
  /** Teks pada <summary> saat variant "inline". */
  summaryLabel?: string;
};

/** Form tambah / ubah mitra leasing. Satu komponen dipakai untuk kedua mode. */
export function PartnerForm({
  partner = null,
  variant = "card",
  summaryLabel = "Ubah",
}: PartnerFormProps) {
  const [state, formAction] = useActionState(upsertPartnerAction, initialActionState);

  const namaId = useId();
  const kontakId = useId();
  const rateId = useId();
  const aktifId = useId();

  const errors = state.fieldErrors ?? {};
  const modeUbah = partner !== null;

  const isi: ReactNode = (
    <form action={formAction} className="space-y-3">
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}

      <Field label="Nama mitra" htmlFor={namaId} required error={errors.name}>
        <Input
          id={namaId}
          name="name"
          defaultValue={partner?.name ?? ""}
          required
          minLength={2}
          placeholder="Contoh: Adira Finance"
          aria-invalid={errors.name ? true : undefined}
        />
      </Field>

      <Field label="Kontak" htmlFor={kontakId} hint="Nomor telepon atau narahubung." error={errors.contact}>
        <Input
          id={kontakId}
          name="contact"
          defaultValue={partner?.contact ?? ""}
          placeholder="0800-1-500-989"
          aria-invalid={errors.contact ? true : undefined}
        />
      </Field>

      <Field
        label="Rate komisi (%)"
        htmlFor={rateId}
        hint="Persentase komisi platform dari harga unit, misal 2.5."
        error={errors.commissionRate}
      >
        <Input
          id={rateId}
          name="commissionRate"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.05}
          defaultValue={partner?.commission_rate ?? ""}
          placeholder="2.5"
          aria-invalid={errors.commissionRate ? true : undefined}
        />
      </Field>

      <label htmlFor={aktifId} className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          id={aktifId}
          name="isActive"
          type="checkbox"
          defaultChecked={partner?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        Mitra aktif (tampil pada pilihan pengajuan leasing)
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" pendingText="Menyimpan…">
          {modeUbah ? "Simpan Perubahan" : "Tambah Mitra"}
        </SubmitButton>
        {state.status !== "idle" && state.message ? (
          <p
            role="status"
            className={`text-xs font-medium ${
              state.status === "success" ? "text-green-700" : "text-red-600"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );

  if (variant === "inline") {
    return (
      <details className="min-w-[15rem]">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          {summaryLabel}
        </summary>
        <div className="mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">{isi}</div>
      </details>
    );
  }

  return isi;
}
