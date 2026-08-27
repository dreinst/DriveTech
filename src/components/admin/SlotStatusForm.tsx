"use client";

import { useState } from "react";

import { Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { overrideSlotStatusAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { SLOT_STATUS_LABEL } from "@/lib/domain/labels";
import type { SlotStatus } from "@/lib/types/database";

const PILIHAN_STATUS: readonly SlotStatus[] = ["available", "pending", "confirmed"];

export type SlotStatusFormProps = {
  slotId: string;
  /** Status slot saat ini (jadi nilai awal pilihan). */
  status: SlotStatus;
  /** True kalau slot masih terikat booking pending_payment / confirmed. */
  hasActiveBooking: boolean;
  slotName?: string;
  bookingCode?: string | null;
};

/**
 * Override manual status slot oleh admin (lihat .md bagian 5 "override status slot manual").
 *
 * Server action dipanggil lewat pembungkus klien supaya konfirmasi window.confirm
 * benar-benar bisa membatalkan pengiriman: mengandalkan preventDefault pada
 * onSubmit tidak dijamin menghentikan Server Action.
 */
export function SlotStatusForm({
  slotId,
  status,
  hasActiveBooking,
  slotName,
  bookingCode,
}: SlotStatusFormProps) {
  const [state, setState] = useState<ActionState>(initialActionState);

  async function jalankan(formData: FormData): Promise<void> {
    const dipilih = formData.get("status");
    const target = typeof dipilih === "string" ? dipilih : "";

    if (target === "available" && hasActiveBooking) {
      const nama = slotName && slotName.length > 0 ? slotName : "Slot ini";
      const kode = bookingCode ? ` (${bookingCode})` : "";
      const setuju = window.confirm(
        `${nama} masih punya booking aktif${kode}. Mengubah status menjadi "Tersedia" ` +
          "membuat slot bisa dipesan orang lain, sedangkan data bookingnya tetap ada. Lanjutkan?",
      );
      if (!setuju) {
        setState(initialActionState);
        return;
      }
    }

    setState(await overrideSlotStatusAction(initialActionState, formData));
  }

  return (
    <form action={jalankan} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="slotId" value={slotId} />
      <Select
        name="status"
        defaultValue={status}
        aria-label={`Ubah status ${slotName ?? "slot"}`}
        className="h-8 w-auto min-w-[9.5rem] py-0 text-xs"
      >
        {PILIHAN_STATUS.map((pilihan) => (
          <option key={pilihan} value={pilihan}>
            {SLOT_STATUS_LABEL[pilihan]}
          </option>
        ))}
      </Select>

      <SubmitButton variant="secondary" size="sm" pendingText="Menyimpan…">
        Simpan
      </SubmitButton>

      {state.status === "error" && state.message ? (
        <p className="w-full text-xs font-medium text-red-600" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <p className="w-full text-xs font-medium text-green-700" role="status">
          {state.message ?? "Status slot tersimpan."}
        </p>
      ) : null}
    </form>
  );
}
