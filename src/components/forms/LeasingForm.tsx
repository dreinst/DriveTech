"use client";

import { useActionState, useId, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitLeasingAction } from "@/lib/actions/leasing";
import { initialActionState } from "@/lib/actions/state";
import { TENOR_OPTIONS } from "@/lib/domain/constants";
import {
  digitsOnly,
  dpDefault,
  formatRibuan,
  hitungAngsuran,
  parseRupiahInput,
  SIMULASI_BUNGA_FLAT_TAHUNAN,
  SIMULASI_DISCLAIMER,
} from "@/lib/domain/simulasi";
import type { LeasingPartnerRow } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const TENOR_DEFAULT = 36;

export type LeasingFormProps = {
  /** uuid purchase_transactions yang metodenya "credit". */
  purchaseId: string;
  /** Mitra leasing aktif. Catatan: commission_rate SENGAJA tidak ditampilkan ke pembeli. */
  partners: LeasingPartnerRow[];
  /** Perkiraan harga unit dari transaksi, dipakai untuk estimasi angsuran. */
  unitPrice: number | null;
};

/** Form pengajuan pembiayaan di /beli/[transactionId]/leasing. */
export function LeasingForm({ purchaseId, partners, unitPrice }: LeasingFormProps) {
  const [state, formAction, isPending] = useActionState(submitLeasingAction, initialActionState);
  const idPrefix = useId();

  const [partnerId, setPartnerId] = useState<string>(partners[0]?.id ?? "");
  const [dpText, setDpText] = useState<string>(() => {
    const anjuran = dpDefault(unitPrice);
    return anjuran > 0 ? String(anjuran) : "";
  });
  const [tenor, setTenor] = useState<number>(TENOR_DEFAULT);

  const dp = parseRupiahInput(dpText);
  const simulasi = hitungAngsuran({ harga: unitPrice, dp, tenorBulan: tenor });
  const bungaPersen = Math.round(SIMULASI_BUNGA_FLAT_TAHUNAN * 1000) / 10;

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="purchaseTransactionId" value={purchaseId} />
      {/* DP dikirim sebagai angka polos; kolom yang terlihat hanya versi berformat. */}
      <input type="hidden" name="dpAmount" value={String(dp)} />

      <fieldset disabled={isPending} className="space-y-5">
        {state.status === "error" && state.message ? (
          <Alert tone="error" title="Pengajuan belum bisa dikirim">
            {state.message}
          </Alert>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            Pilih mitra leasing
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {partners.map((partner) => {
              const dipilih = partnerId === partner.id;
              return (
                <label
                  key={partner.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                    dipilih
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="leasingPartnerId"
                    value={partner.id}
                    checked={dipilih}
                    onChange={() => setPartnerId(partner.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
                    required
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {partner.name}
                    </span>
                    {partner.contact ? (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Kontak: {partner.contact}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.leasingPartnerId ? (
            <p className="text-xs font-medium text-red-600" role="alert">
              {errors.leasingPartnerId}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Uang muka (DP)"
            htmlFor={`${idPrefix}-dp`}
            hint="Anjuran awal 20% dari harga unit. Silakan sesuaikan dengan kemampuan Anda."
            error={errors.dpAmount}
            required
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
                onChange={(event) => setDpText(digitsOnly(event.target.value))}
                aria-invalid={errors.dpAmount ? true : undefined}
                required
              />
            </div>
          </Field>
          <Field
            label="Tenor cicilan"
            htmlFor={`${idPrefix}-tenor`}
            hint="Lama cicilan dalam bulan."
            error={errors.tenorBulan}
            required
          >
            <Select
              id={`${idPrefix}-tenor`}
              name="tenorBulan"
              value={String(tenor)}
              onChange={(event) => setTenor(Number(event.target.value))}
              aria-invalid={errors.tenorBulan ? true : undefined}
              required
            >
              {TENOR_OPTIONS.map((bulan) => (
                <option key={bulan} value={bulan}>
                  {bulan} bulan
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Ringkasan simulasi (estimasi)</h3>

          {simulasi.valid ? (
            <div className="rounded-lg border border-blue-200 bg-white p-3.5">
              <p className="text-xs text-slate-500">Estimasi angsuran per bulan</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {formatRupiah(simulasi.angsuranPerBulan)}
              </p>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-slate-500">Harga unit</dt>
                  <dd className="font-medium text-slate-900">{formatRupiah(simulasi.harga)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-slate-500">Uang muka</dt>
                  <dd className="font-medium text-slate-900">{formatRupiah(simulasi.dp)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-slate-500">Pokok pembiayaan</dt>
                  <dd className="font-medium text-slate-900">{formatRupiah(simulasi.pokok)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-slate-500">Total bunga ({bungaPersen}% flat/tahun)</dt>
                  <dd className="font-medium text-slate-900">{formatRupiah(simulasi.totalBunga)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <Alert tone="info">
              {simulasi.harga <= 0
                ? "Perkiraan harga unit belum tercatat pada transaksi ini, jadi estimasi angsuran belum bisa dihitung. Pengajuan tetap bisa dikirim dan mitra leasing akan menghitungnya bersama Anda."
                : "DP yang Anda isi sudah menutupi seluruh harga unit, jadi tidak ada sisa yang perlu dicicil."}
            </Alert>
          )}

          <p className="text-xs leading-relaxed text-slate-500">{SIMULASI_DISCLAIMER}</p>
        </section>

        <Field
          label="Catatan tambahan"
          htmlFor={`${idPrefix}-catatan`}
          hint="Opsional. Misalnya pekerjaan, penghasilan bulanan, atau jam yang enak dihubungi."
          error={errors.notes}
        >
          <Textarea
            id={`${idPrefix}-catatan`}
            name="notes"
            rows={3}
            placeholder="Karyawan swasta, enak dihubungi setelah jam 17.00."
            aria-invalid={errors.notes ? true : undefined}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            name="persetujuan"
            className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
            required
          />
          <span className="text-xs leading-relaxed text-slate-600">
            Saya setuju data pada formulir ini (nama, nomor HP, unit yang diminati, DP, dan tenor)
            diteruskan kepada mitra leasing yang saya pilih untuk keperluan proses pengajuan
            pembiayaan.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <SubmitButton pendingText="Mengirim…">Ajukan ke Leasing</SubmitButton>
          <p className="text-xs text-slate-500">
            Setelah dikirim, Anda bisa memantau prosesnya di halaman status transaksi.
          </p>
        </div>
      </fieldset>
    </form>
  );
}
