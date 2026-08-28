"use client";

import { useActionState, useId, useState } from "react";

import { FadeUp } from "@/components/motion/motion";
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
          <FadeUp>
            <Alert tone="error" title="Pengajuan belum bisa dikirim">
              {state.message}
            </Alert>
          </FadeUp>
        ) : null}

        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium text-ink">
            Pilih mitra leasing
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          </legend>
          {/* Kartu mitra pilih — pola "payment-card" mockup: terpilih = bingkai & latar aksen. */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {partners.map((partner) => {
              const dipilih = partnerId === partner.id;
              return (
                <label
                  key={partner.id}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] ${
                    dipilih
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface-2 hover:border-accent"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {partner.name}
                    </span>
                    {partner.contact ? (
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {partner.contact}
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="radio"
                    name="leasingPartnerId"
                    value={partner.id}
                    checked={dipilih}
                    onChange={() => setPartnerId(partner.id)}
                    className="sr-only"
                    required
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                      dipilih ? "border-accent bg-accent" : "border-line-strong bg-card"
                    }`}
                    aria-hidden="true"
                  >
                    {dipilih ? <span className="h-1.5 w-1.5 rounded-full bg-app" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.leasingPartnerId ? (
            <p className="text-xs font-medium text-danger" role="alert">
              {errors.leasingPartnerId}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Uang muka (DP)"
            htmlFor={`${idPrefix}-dp`}
            hint="Anjuran 20% dari harga unit; sesuaikan dengan kemampuan Anda."
            error={errors.dpAmount}
            required
          >
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted"
                aria-hidden="true"
              >
                Rp
              </span>
              <Input
                id={`${idPrefix}-dp`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="tabular pl-9"
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

        <section className="space-y-3 rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            Ringkasan Angsuran
          </h3>

          {simulasi.valid ? (
            <div className="rounded-[var(--radius-sm)] border border-line bg-card p-4">
              <p className="text-xs text-muted">Estimasi angsuran per bulan</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-accent sm:text-3xl">
                {formatRupiah(simulasi.angsuranPerBulan)}
              </p>
              <dl className="tabular mt-4 grid gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted">Harga unit</dt>
                  <dd className="font-medium text-ink">{formatRupiah(simulasi.harga)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted">Uang muka</dt>
                  <dd className="font-medium text-ink">{formatRupiah(simulasi.dp)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted">Pokok pembiayaan</dt>
                  <dd className="font-medium text-ink">{formatRupiah(simulasi.pokok)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted">Total bunga ({bungaPersen}% flat/tahun)</dt>
                  <dd className="font-medium text-ink">{formatRupiah(simulasi.totalBunga)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <Alert tone="info">
              {simulasi.harga <= 0
                ? "Harga unit belum tercatat, jadi estimasi belum bisa dihitung. Pengajuan tetap bisa dikirim; mitra menghitungnya bersama Anda."
                : "DP sudah menutupi seluruh harga unit — tidak ada sisa yang perlu dicicil."}
            </Alert>
          )}

          <p className="text-xs leading-relaxed text-muted">
            Estimasi tidak mengikat — DP, tenor, bunga, dan biaya final ditentukan mitra leasing
            setelah verifikasi.
          </p>
        </section>

        <Field
          label="Catatan tambahan"
          htmlFor={`${idPrefix}-catatan`}
          hint="Opsional; misalnya pekerjaan atau jam yang enak dihubungi."
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

        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-4 py-3">
          <input
            type="checkbox"
            name="persetujuan"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            required
          />
          <span className="text-xs leading-relaxed text-muted">
            Saya setuju data pada formulir ini (nama, nomor HP, unit yang diminati, DP, dan tenor)
            diteruskan kepada mitra leasing yang saya pilih untuk proses pengajuan pembiayaan.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <SubmitButton variant="accent" pendingText="Mengirim…">
            Ajukan ke Leasing
          </SubmitButton>
          <p className="text-xs text-muted">Pantau prosesnya di halaman status transaksi.</p>
        </div>
      </fieldset>
    </form>
  );
}
