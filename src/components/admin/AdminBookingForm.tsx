"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { adminCreateBookingAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/state";
import { formatTanggal } from "@/lib/utils";

export type AdminBookingFormSlot = {
  id: string;
  label: string;
  zoneName: string;
};

export type AdminBookingFormProps = {
  /** Slot bookable non-kendaraan yang tidak diblokir (siap dipesankan). */
  slots: AdminBookingFormSlot[];
  /** Tanggal gelaran aktif mendatang (YYYY-MM-DD). */
  dates: string[];
};

/**
 * Form booking manual oleh panitia. tenantType tidak diisi di sini — diturunkan
 * dari zona slot di server. Zona kendaraan sengaja tidak ada di daftar slot
 * (butuh foto unit -> lewat form publik).
 */
export function AdminBookingForm({ slots, dates }: AdminBookingFormProps) {
  const [state, formAction] = useActionState(adminCreateBookingAction, initialActionState);
  const fieldErrors = state.fieldErrors ?? {};

  if (slots.length === 0) {
    return (
      <Alert tone="warning" title="Belum ada slot yang bisa dipesankan">
        Semua slot non-kendaraan sedang terisi atau diblokir. Untuk slot zona kendaraan, gunakan
        form publik karena butuh foto unit.
      </Alert>
    );
  }
  if (dates.length === 0) {
    return (
      <Alert tone="warning" title="Belum ada tanggal gelaran aktif">
        Tambahkan tanggal gelaran di Pengaturan sebelum membuat booking.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" && state.message ? (
        <Alert tone="error" title="Gagal membuat booking">
          {state.message}
        </Alert>
      ) : null}

      <Field label="Slot" htmlFor="slotId" required error={fieldErrors.slotId}>
        <Select id="slotId" name="slotId" required defaultValue="">
          <option value="" disabled>
            Pilih slot…
          </option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.zoneName} — {slot.label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Tanggal sewa <span className="text-danger">*</span>
        </legend>
        {fieldErrors.eventDates ? (
          <p className="text-xs font-medium text-danger">{fieldErrors.eventDates}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dates.map((tanggal) => (
            <label
              key={tanggal}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-card px-3 py-2 text-sm text-content hover:border-line-strong"
            >
              <input type="checkbox" name="eventDates" value={tanggal} className="h-4 w-4" />
              {formatTanggal(tanggal)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama tenant" htmlFor="tenantName" required error={fieldErrors.tenantName}>
          <Input id="tenantName" name="tenantName" required placeholder="Nama penyewa" />
        </Field>
        <Field label="No. telepon" htmlFor="tenantPhone" required error={fieldErrors.tenantPhone}>
          <Input
            id="tenantPhone"
            name="tenantPhone"
            inputMode="tel"
            required
            placeholder="081234567890"
          />
        </Field>
      </div>

      <Field label="Email (opsional)" htmlFor="tenantEmail" error={fieldErrors.tenantEmail}>
        <Input id="tenantEmail" name="tenantEmail" type="email" placeholder="email@contoh.com" />
      </Field>

      <Field label="Catatan (opsional)" htmlFor="notes" error={fieldErrors.notes}>
        <Textarea id="notes" name="notes" rows={2} placeholder="Catatan internal panitia" />
      </Field>

      <label className="flex items-start gap-2.5 rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-sm">
        <input type="checkbox" name="autoConfirm" value="on" className="mt-0.5 h-4 w-4" />
        <span className="text-content">
          <span className="font-medium text-ink">Langsung konfirmasi (sudah lunas)</span>
          <br />
          Tandai pembayaran sudah diterima panitia — booking langsung terkonfirmasi tanpa unggah
          bukti. Kosongkan bila tenant akan membayar sendiri.
        </span>
      </label>

      <SubmitButton pendingText="Menyimpan…">Buat Booking</SubmitButton>
    </form>
  );
}
