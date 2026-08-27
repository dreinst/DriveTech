"use client";

import { useActionState, useId, useState } from "react";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createBookingAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import { TENANT_TYPE_BY_ZONE_TYPE, TENANT_TYPE_LABEL } from "@/lib/domain/labels";
import type { SlotDetail, TenantType } from "@/lib/types/database";

const TENANT_TYPES: readonly TenantType[] = [
  "dealer_mobil_baru",
  "individu_bekas",
  "umkm",
  "warung",
];

export type BookingFormProps = {
  slot: SlotDetail;
};

/**
 * Form data penyewa (langkah 1 dari 3).
 *
 * Field tambahan per jenis tenant dikirim dengan awalan "detail.<key>" dan
 * dikumpulkan server action jadi kolom jsonb tenants.detail — sesuai
 * createBookingSchema yang menerima `detail: Record<string, unknown>`.
 */
export function BookingForm({ slot }: BookingFormProps) {
  const [state, formAction] = useActionState(createBookingAction, initialActionState);
  const id = useId();

  // Jenis tenant mengikuti tipe zona slot. Zona fasilitas tidak bisa dibooking,
  // jadi selectnya dikunci (dan nilainya dikirim lewat input tersembunyi).
  const otomatis = TENANT_TYPE_BY_ZONE_TYPE[slot.zone.zone_type];
  const terkunci = otomatis === null;
  const [tenantType, setTenantType] = useState<TenantType>(otomatis ?? "umkm");

  const errors = state.fieldErrors ?? {};
  const pesanUmum = state.status === "error" ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="slotId" value={slot.id} />

      {pesanUmum ? (
        <Alert tone="error" title="Booking belum bisa diproses">
          {pesanUmum}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama penyewa"
          htmlFor={`${id}-nama`}
          hint="Nama perorangan atau badan usaha yang menyewa slot."
          error={errors.tenantName}
          required
        >
          <Input
            id={`${id}-nama`}
            name="tenantName"
            autoComplete="name"
            placeholder="Contoh: Budi Santoso"
            aria-invalid={errors.tenantName ? true : undefined}
            required
          />
        </Field>

        <Field
          label="Nomor HP / WhatsApp"
          htmlFor={`${id}-hp`}
          hint="Dipakai panitia untuk konfirmasi pembayaran."
          error={errors.tenantPhone}
          required
        >
          <Input
            id={`${id}-hp`}
            name="tenantPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="081234567890"
            aria-invalid={errors.tenantPhone ? true : undefined}
            required
          />
        </Field>
      </div>

      <Field
        label="Email (opsional)"
        htmlFor={`${id}-email`}
        hint="Kosongkan kalau tidak ada."
        error={errors.tenantEmail}
      >
        <Input
          id={`${id}-email`}
          name="tenantEmail"
          type="email"
          autoComplete="email"
          placeholder="nama@email.com"
          aria-invalid={errors.tenantEmail ? true : undefined}
        />
      </Field>

      <Field
        label="Jenis tenant"
        htmlFor={`${id}-jenis`}
        hint={
          terkunci
            ? "Zona ini adalah fasilitas umum dan tidak disewakan."
            : "Terisi otomatis mengikuti tipe zona slot yang Anda pilih."
        }
        error={errors.tenantType}
        required
      >
        <Select
          id={`${id}-jenis`}
          name={terkunci ? undefined : "tenantType"}
          value={tenantType}
          onChange={(event) => setTenantType(event.target.value as TenantType)}
          disabled={terkunci}
          aria-invalid={errors.tenantType ? true : undefined}
          required
        >
          {TENANT_TYPES.map((tipe) => (
            <option key={tipe} value={tipe}>
              {TENANT_TYPE_LABEL[tipe]}
            </option>
          ))}
        </Select>
      </Field>
      {/* Select yang disabled tidak ikut terkirim — kirim nilainya lewat hidden input. */}
      {terkunci ? <input type="hidden" name="tenantType" value={tenantType} /> : null}

      <DetailFields tenantType={tenantType} idPrefix={id} errors={errors} />

      <Field
        label="Catatan untuk panitia (opsional)"
        htmlFor={`${id}-catatan`}
        hint="Misalnya kebutuhan khusus, jam kedatangan, atau permintaan posisi."
        error={errors.notes}
      >
        <Textarea id={`${id}-catatan`} name="notes" rows={3} placeholder="Tulis di sini…" />
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingText="Mengunci slot…">Lanjut ke Pembayaran</SubmitButton>
        <p className="text-xs text-slate-500">
          Slot langsung dikunci sementara begitu formulir dikirim.
        </p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Field tambahan per jenis tenant (disimpan ke tenants.detail jsonb)   */
/* ------------------------------------------------------------------ */

type DetailFieldsProps = {
  tenantType: TenantType;
  idPrefix: string;
  errors: Record<string, string>;
};

function DetailFields({ tenantType, idPrefix, errors }: DetailFieldsProps) {
  if (tenantType === "umkm") {
    return (
      <DetailGroup judul="Data UMKM">
        <Field
          label="Kategori produk"
          htmlFor={`${idPrefix}-kategori`}
          error={errors["detail.kategori_produk"]}
        >
          <Input
            id={`${idPrefix}-kategori`}
            name="detail.kategori_produk"
            placeholder="Contoh: Fashion, kerajinan, aksesori"
          />
        </Field>
        <Field
          label="Nama brand"
          htmlFor={`${idPrefix}-brand`}
          error={errors["detail.nama_brand"]}
        >
          <Input
            id={`${idPrefix}-brand`}
            name="detail.nama_brand"
            placeholder="Contoh: Batik Nusantara"
          />
        </Field>
      </DetailGroup>
    );
  }

  if (tenantType === "dealer_mobil_baru") {
    return (
      <DetailGroup judul="Data Dealer">
        <Field
          label="Nama dealer"
          htmlFor={`${idPrefix}-dealer`}
          error={errors["detail.nama_dealer"]}
        >
          <Input
            id={`${idPrefix}-dealer`}
            name="detail.nama_dealer"
            placeholder="Contoh: Auto Prima Motor"
          />
        </Field>
        <Field
          label="Merek yang dibawa"
          htmlFor={`${idPrefix}-merek`}
          hint="Pisahkan dengan koma kalau lebih dari satu."
          error={errors["detail.merek_dibawa"]}
        >
          <Input
            id={`${idPrefix}-merek`}
            name="detail.merek_dibawa"
            placeholder="Contoh: Toyota, Daihatsu"
          />
        </Field>
      </DetailGroup>
    );
  }

  if (tenantType === "individu_bekas") {
    return (
      <DetailGroup judul="Data Unit Bekas">
        <Field
          label="Jumlah unit"
          htmlFor={`${idPrefix}-jumlah`}
          hint="Perkiraan jumlah kendaraan yang dipajang."
          error={errors["detail.jumlah_unit"]}
        >
          <Input
            id={`${idPrefix}-jumlah`}
            name="detail.jumlah_unit"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Contoh: 3"
          />
        </Field>
        <Field
          label="Merek / tipe unit"
          htmlFor={`${idPrefix}-tipe`}
          error={errors["detail.merek_tipe_unit"]}
        >
          <Input
            id={`${idPrefix}-tipe`}
            name="detail.merek_tipe_unit"
            placeholder="Contoh: Honda Beat 2019, Avanza 2016"
          />
        </Field>
      </DetailGroup>
    );
  }

  return (
    <DetailGroup judul="Data Warung">
      <Field
        label="Jenis makanan / minuman"
        htmlFor={`${idPrefix}-dagangan`}
        error={errors["detail.jenis_dagangan"]}
      >
        <Input
          id={`${idPrefix}-dagangan`}
          name="detail.jenis_dagangan"
          placeholder="Contoh: Mie rebus, kopi, es teh"
        />
      </Field>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">Kebutuhan listrik</span>
        {/*
          Checkbox HTML tidak mengirim apa pun saat tidak dicentang. Hidden input
          bernama sama diletakkan LEBIH DULU sebagai nilai bawaan "Tidak";
          saat dicentang, nilai checkbox ("Ya") yang datang belakangan menimpanya
          di server action (ambilDetail memakai penugasan terakhir).
        */}
        <input type="hidden" name="detail.butuh_listrik" value="Tidak" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="detail.butuh_listrik"
            value="Ya"
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          Butuh sambungan listrik di lokasi warung
        </label>
      </div>
    </DetailGroup>
  );
}

function DetailGroup({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <legend className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {judul}
      </legend>
      {children}
    </fieldset>
  );
}
