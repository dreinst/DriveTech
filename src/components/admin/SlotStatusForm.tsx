"use client";

import { useState } from "react";

import { Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { overrideSlotStatusAction } from "@/lib/actions/admin";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { SlotStatus } from "@/lib/types/database";

/**
 * Model per tanggal: slots.status bukan lagi status booking.
 * 'available' = slot normal (ketersediaan mengikuti okupansi per tanggal);
 * nilai lain = DIBLOKIR PANITIA untuk semua tanggal. Form ini hanya menawarkan
 * dua pilihan itu — "Diblokir" dikirim sebagai nilai enum 'confirmed'.
 */
const NILAI_BLOKIR: SlotStatus = "confirmed";

const PILIHAN: ReadonlyArray<{ value: SlotStatus; label: string }> = [
  { value: "available", label: "Tersedia" },
  { value: NILAI_BLOKIR, label: "Diblokir" },
];

export type SlotStatusFormProps = {
  slotId: string;
  /** Status slot saat ini (jadi nilai awal pilihan). */
  status: SlotStatus;
  /** True kalau slot masih punya booking aktif (pending_payment / confirmed) di tanggal mana pun. */
  hasActiveBooking: boolean;
  slotName?: string;
  bookingCode?: string | null;
};

/**
 * Blokir / buka slot untuk SEMUA tanggal gelaran (override manual admin).
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
  const diblokir = status !== "available";

  async function jalankan(formData: FormData): Promise<void> {
    const dipilih = formData.get("status");
    const target = typeof dipilih === "string" ? dipilih : "";

    if (target !== "available" && hasActiveBooking) {
      const nama = slotName && slotName.length > 0 ? slotName : "Slot ini";
      const kode = bookingCode ? ` (${bookingCode})` : "";
      const setuju = window.confirm(
        `${nama} masih punya booking aktif${kode}. Memblokir menutup slot dari pemesanan baru ` +
          "untuk semua tanggal, tetapi TIDAK membatalkan booking yang sudah ada. Lanjutkan?",
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
        defaultValue={diblokir ? NILAI_BLOKIR : "available"}
        aria-label={`Blokir atau buka ${slotName ?? "slot"}`}
        className="h-8 w-auto min-w-[9.5rem] py-0 text-xs"
      >
        {PILIHAN.map((pilihan) => (
          <option key={pilihan.value} value={pilihan.value}>
            {pilihan.label}
          </option>
        ))}
      </Select>

      <SubmitButton variant="secondary" size="sm" pendingText="Menyimpan…">
        Simpan
      </SubmitButton>

      {state.status === "error" && state.message ? (
        <p className="w-full text-xs font-medium text-danger" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <p className="w-full text-xs font-medium text-ok" role="status">
          {state.message ?? "Status slot tersimpan."}
        </p>
      ) : null}
    </form>
  );
}
