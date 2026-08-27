"use client";

import { useActionState, useId, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createPurchaseAction } from "@/lib/actions/purchase";
import { initialActionState } from "@/lib/actions/state";
import { TENOR_OPTIONS } from "@/lib/domain/constants";
import { PURCHASE_PAYMENT_METHOD_LABEL } from "@/lib/domain/labels";
import {
  digitsOnly,
  dpDefault,
  formatRibuan,
  hitungAngsuran,
  parseRupiahInput,
  SIMULASI_BUNGA_FLAT_TAHUNAN,
  SIMULASI_DISCLAIMER,
} from "@/lib/domain/simulasi";
import type { PurchasePaymentMethod } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const METODE: Array<{ value: PurchasePaymentMethod; deskripsi: string }> = [
  {
    value: "cash",
    deskripsi: "Bayar lunas tunai langsung ke tenant di lokasi pameran saat serah terima unit.",
  },
  {
    value: "transfer",
    deskripsi: "Bayar lunas lewat transfer ke rekening tenant. Simpan buktinya untuk serah terima.",
  },
  {
    value: "credit",
    deskripsi:
      "Beli dengan cicilan. Data Anda akan diteruskan ke mitra leasing rekanan pameran pada langkah berikutnya.",
  },
];

const TENOR_DEFAULT = 36;

export type PurchaseFormProps = {
  /** uuid slot penjual (tenant pemilik lapak). */
  slotId: string;
  /** Nama lapak untuk kalimat bantuan, mis. "Slot 07 — Area Pameran Mobil". */
  namaLapak?: string;
};

/**
 * Form minat/transaksi pembelian unit di /beli/[slotId].
 * Simulasi cicilan di bawah murni hitungan client-side (estimasi, tidak dikirim ke server).
 */
export function PurchaseForm({ slotId, namaLapak }: PurchaseFormProps) {
  const [state, formAction, isPending] = useActionState(createPurchaseAction, initialActionState);
  const idPrefix = useId();

  const [metode, setMetode] = useState<PurchasePaymentMethod>("cash");
  const [hargaText, setHargaText] = useState("");
  const [dpText, setDpText] = useState("");
  const [dpDiubahManual, setDpDiubahManual] = useState(false);
  const [tenor, setTenor] = useState<number>(TENOR_DEFAULT);

  const harga = parseRupiahInput(hargaText);
  const dp = parseRupiahInput(dpText);
  const simulasi = hitungAngsuran({ harga, dp, tenorBulan: tenor });
  const bungaPersen = Math.round(SIMULASI_BUNGA_FLAT_TAHUNAN * 1000) / 10;

  const errors = state.fieldErrors ?? {};

  function ubahHarga(nilai: string) {
    const bersih = digitsOnly(nilai);
    setHargaText(bersih);
    if (!dpDiubahManual) {
      const hargaBaru = bersih === "" ? 0 : Number(bersih);
      setDpText(hargaBaru > 0 ? String(dpDefault(hargaBaru)) : "");
    }
  }

  function ubahDp(nilai: string) {
    setDpDiubahManual(true);
    setDpText(digitsOnly(nilai));
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="slotId" value={slotId} />
      {/* Harga dikirim sebagai angka polos; kolom yang terlihat hanya versi berformat. */}
      <input type="hidden" name="unitPrice" value={harga > 0 ? String(harga) : ""} />

      <fieldset disabled={isPending} className="space-y-5">
        {state.status === "error" && state.message ? (
          <Alert tone="error" title="Pengajuan belum bisa diproses">
            {state.message}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nama pembeli"
            htmlFor={`${idPrefix}-nama`}
            error={errors.buyerName}
            required
          >
            <Input
              id={`${idPrefix}-nama`}
              name="buyerName"
              placeholder="Nama lengkap sesuai KTP"
              autoComplete="name"
              aria-invalid={errors.buyerName ? true : undefined}
              required
            />
          </Field>

          <Field
            label="Nomor HP / WhatsApp"
            htmlFor={`${idPrefix}-hp`}
            hint="Contoh: 081234567890. Dipakai tenant dan panitia untuk menghubungi Anda."
            error={errors.buyerPhone}
            required
          >
            <Input
              id={`${idPrefix}-hp`}
              name="buyerPhone"
              type="tel"
              inputMode="tel"
              placeholder="081234567890"
              autoComplete="tel"
              aria-invalid={errors.buyerPhone ? true : undefined}
              required
            />
          </Field>
        </div>

        <Field
          label="Unit yang diminati"
          htmlFor={`${idPrefix}-unit`}
          hint={
            namaLapak
              ? `Sebutkan merek, tipe, dan tahun unit yang Anda lihat di ${namaLapak}.`
              : "Sebutkan merek, tipe, dan tahun unit yang Anda minati."
          }
          error={errors.unitDescription}
        >
          <Textarea
            id={`${idPrefix}-unit`}
            name="unitDescription"
            rows={3}
            placeholder="Contoh: Toyota Avanza G 2018, warna silver, plat D"
            aria-invalid={errors.unitDescription ? true : undefined}
          />
        </Field>

        <Field
          label="Perkiraan harga unit"
          htmlFor={`${idPrefix}-harga`}
          hint="Boleh dikosongkan. Diisi supaya estimasi cicilan bisa dihitung."
          error={errors.unitPrice}
        >
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
              aria-hidden="true"
            >
              Rp
            </span>
            <Input
              id={`${idPrefix}-harga`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="pl-9"
              placeholder="150.000.000"
              value={hargaText === "" ? "" : formatRibuan(harga)}
              onChange={(event) => ubahHarga(event.target.value)}
              aria-invalid={errors.unitPrice ? true : undefined}
            />
          </div>
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            Metode pembayaran
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="grid gap-2">
            {METODE.map((item) => {
              const dipilih = metode === item.value;
              return (
                <label
                  key={item.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                    dipilih
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={item.value}
                    checked={dipilih}
                    onChange={() => setMetode(item.value)}
                    className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
                    required
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {PURCHASE_PAYMENT_METHOD_LABEL[item.value]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      {item.deskripsi}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.paymentMethod ? (
            <p className="text-xs font-medium text-red-600" role="alert">
              {errors.paymentMethod}
            </p>
          ) : null}
        </fieldset>

        {metode === "credit" ? (
          <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">Simulasi cicilan (estimasi)</h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Coba-coba angka DP dan tenor di sini dulu. Pengajuan resmi ke mitra leasing
                dilakukan pada langkah berikutnya setelah data pembeli tersimpan.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Uang muka (DP)"
                htmlFor={`${idPrefix}-dp`}
                hint={`Terisi otomatis 20% dari harga unit${
                  dpDiubahManual ? " sebelum Anda ubah" : ""
                }.`}
              >
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
                    aria-hidden="true"
                  >
                    Rp
                  </span>
                  <Input
                    id={`${idPrefix}-dp`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="pl-9"
                    placeholder="30.000.000"
                    value={dpText === "" ? "" : formatRibuan(dp)}
                    onChange={(event) => ubahDp(event.target.value)}
                  />
                </div>
              </Field>

              <Field label="Tenor" htmlFor={`${idPrefix}-tenor`} hint="Lama cicilan dalam bulan.">
                <Select
                  id={`${idPrefix}-tenor`}
                  value={String(tenor)}
                  onChange={(event) => setTenor(Number(event.target.value))}
                >
                  {TENOR_OPTIONS.map((bulan) => (
                    <option key={bulan} value={bulan}>
                      {bulan} bulan
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {simulasi.valid ? (
              <div className="rounded-lg border border-blue-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">Estimasi angsuran per bulan</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                  {formatRupiah(simulasi.angsuranPerBulan)}
                </p>
                <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-slate-500">Pokok pembiayaan</dt>
                    <dd className="font-medium text-slate-900">{formatRupiah(simulasi.pokok)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-slate-500">Total bunga ({bungaPersen}% flat/tahun)</dt>
                    <dd className="font-medium text-slate-900">
                      {formatRupiah(simulasi.totalBunga)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-slate-500">Tenor</dt>
                    <dd className="font-medium text-slate-900">{simulasi.tenorBulan} bulan</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-slate-500">Total bayar setelah DP</dt>
                    <dd className="font-medium text-slate-900">
                      {formatRupiah(simulasi.totalPembayaran)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <Alert tone="info">
                {harga <= 0
                  ? "Isi perkiraan harga unit di atas untuk melihat estimasi angsuran."
                  : "DP sudah menutupi seluruh harga unit, jadi tidak ada sisa yang perlu dicicil."}
              </Alert>
            )}

            <p className="text-xs leading-relaxed text-slate-500">{SIMULASI_DISCLAIMER}</p>
          </section>
        ) : null}

        <Field
          label="Catatan untuk tenant"
          htmlFor={`${idPrefix}-catatan`}
          hint="Opsional. Misalnya jadwal Anda datang ke lokasi atau permintaan test drive."
          error={errors.notes}
        >
          <Textarea
            id={`${idPrefix}-catatan`}
            name="notes"
            rows={2}
            placeholder="Saya datang Sabtu sore, ingin lihat unitnya dulu."
            aria-invalid={errors.notes ? true : undefined}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <SubmitButton pendingText="Menyimpan…">
            {metode === "credit" ? "Lanjut ke Pengajuan Leasing" : "Kirim Data Pembelian"}
          </SubmitButton>
          <p className="text-xs text-slate-500">
            {metode === "credit"
              ? "Setelah ini Anda memilih mitra leasing dan mengisi DP serta tenor."
              : "Setelah ini Anda mendapat kode transaksi untuk ditunjukkan ke tenant."}
          </p>
        </div>
      </fieldset>
    </form>
  );
}
