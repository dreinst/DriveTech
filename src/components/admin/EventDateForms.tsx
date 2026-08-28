"use client";

import { useActionState, useId } from "react";

import { Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { addEventDateAction, setEventDateActiveAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";

/**
 * Form kelola tanggal gelaran (event_dates) di /admin/pengaturan —
 * model per tanggal: pemesan hanya bisa memilih tanggal yang aktif di sini.
 */

/** Form tambah satu tanggal gelaran baru. */
export function EventDateAddForm() {
  const [state, formAction] = useActionState(addEventDateAction, initialActionState);
  const inputId = useId();
  const errorDate = state.fieldErrors?.date;

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Tanggal gelaran baru
        </label>
        <Input
          id={inputId}
          name="date"
          type="date"
          required
          aria-invalid={errorDate ? true : undefined}
          className="w-auto min-w-44"
        />
        <SubmitButton variant="secondary" size="sm" pendingText="Menambahkan…">
          Tambah Tanggal
        </SubmitButton>
      </div>

      <p className="text-xs text-subtle">
        Jadwal reguler jatuh pada Sabtu &amp; Minggu, tetapi tanggal di hari lain juga boleh
        ditambahkan (misalnya gelaran khusus hari libur).
      </p>

      {state.status === "error" ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {errorDate ?? state.message ?? "Tanggal gagal ditambahkan."}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-xs font-medium text-ok" role="status">
          {state.message ?? "Tanggal gelaran ditambahkan."}
        </p>
      ) : null}
    </form>
  );
}

export type EventDateToggleProps = {
  /** id baris event_dates. */
  id: string;
  /** Status aktif saat ini — tombol mengirim kebalikannya. */
  active: boolean;
  /** Label tanggal untuk aria (mis. "Sabtu, 30 Agustus 2026"). */
  dateLabel: string;
};

/** Tombol aktif/nonaktif satu tanggal gelaran. */
export function EventDateToggle({ id, active, dateLabel }: EventDateToggleProps) {
  const [state, formAction] = useActionState(setEventDateActiveAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton variant={active ? "ghost" : "secondary"} size="sm" pendingText="Menyimpan…">
        {active ? "Nonaktifkan" : "Aktifkan"}
        <span className="sr-only"> tanggal {dateLabel}</span>
      </SubmitButton>

      {state.status === "error" && state.message ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
