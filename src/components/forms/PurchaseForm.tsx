"use client";

import { useActionState, useId, useState } from "react";

import { FadeUp } from "@/components/motion/motion";
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
} from "@/lib/domain/simulasi";
import type { PurchasePaymentMethod } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const METODE: Array<{ value: PurchasePaymentMethod; deskripsi: string; badge?: string }> = [
  { value: "cash", deskripsi: "Bayar lunas ke tenant saat serah terima di lokasi." },
  { value: "transfer", deskripsi: "Transfer ke rekening tenant penjual, simpan buktinya." },
  {
    value: "credit",
    deskripsi: "Pengajuan cicilan Anda diproses mitra leasing rekanan pameran.",
    badge: "Didukung mitra leasing resmi",
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
          <FadeUp>
            <Alert tone="error" title="Pengajuan belum bisa diproses">
              {state.message}
            </Alert>
          </FadeUp>
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
            hint="Dipakai tenant untuk menghubungi Anda."
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
              ? `Merek, tipe, dan tahun unit yang Anda lihat di ${namaLapak}.`
              : "Merek, tipe, dan tahun unit yang Anda minati."
          }
          error={errors.unitDescription}
        >
          <Textarea
            id={`${idPrefix}-unit`}
            name="unitDescription"
            rows={3}
            placeholder="Contoh: Toyota Avanza G 2018, warna silver, plat N"
            aria-invalid={errors.unitDescription ? true : undefined}
          />
        </Field>

        <Field
          label="Perkiraan harga unit"
          htmlFor={`${idPrefix}-harga`}
          hint="Opsional; dipakai untuk menghitung estimasi cicilan."
          error={errors.unitPrice}
        >
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted"
              aria-hidden="true"
            >
              Rp
            </span>
            <Input
              id={`${idPrefix}-harga`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="tabular pl-9"
              placeholder="150.000.000"
              value={hargaText === "" ? "" : formatRibuan(harga)}
              onChange={(event) => ubahHarga(event.target.value)}
              aria-invalid={errors.unitPrice ? true : undefined}
            />
          </div>
        </Field>

        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium text-ink">
            Metode pembayaran
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          </legend>
          {/* Tiga kartu radio metode — pola "payment-card" mockup: terpilih = bingkai & latar aksen. */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            {METODE.map((item) => {
              const dipilih = metode === item.value;
              return (
                <label
                  key={item.value}
                  className={`flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-[var(--radius)] border px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] ${
                    dipilih
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface-2 hover:border-accent"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {PURCHASE_PAYMENT_METHOD_LABEL[item.value]}
                    </span>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                        dipilih ? "border-accent bg-accent" : "border-line-strong bg-card"
                      }`}
                      aria-hidden="true"
                    >
                      {dipilih ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-app" />
                      ) : null}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={item.value}
                    checked={dipilih}
                    onChange={() => setMetode(item.value)}
                    className="sr-only"
                    required
                  />
                  {item.badge ? (
                    /* Badge kecil penonjol opsi Kredit — pil aksen solid teks gelap agar tetap
                       terbaca baik pada kartu terpilih (latar accent-soft) maupun tidak. */
                    <span className="inline-flex w-fit items-center rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-medium leading-4 text-app">
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="text-xs leading-relaxed text-muted">{item.deskripsi}</span>
                </label>
              );
            })}
          </div>
          {errors.paymentMethod ? (
            <p className="text-xs font-medium text-danger" role="alert">
              {errors.paymentMethod}
            </p>
          ) : null}
        </fieldset>

        {metode === "credit" ? (
          <FadeUp>
            <section className="space-y-4 rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                Simulasi Cicilan (Estimasi)
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Uang muka (DP)"
                  htmlFor={`${idPrefix}-dp`}
                  hint="Otomatis 20% dari harga unit; boleh diubah."
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
                <div className="rounded-[var(--radius-sm)] border border-line bg-card p-4">
                  <p className="text-xs text-muted">Estimasi angsuran per bulan</p>
                  <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-accent">
                    {formatRupiah(simulasi.angsuranPerBulan)}
                  </p>
                  <dl className="tabular mt-4 grid gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs sm:grid-cols-2">
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted">Pokok pembiayaan</dt>
                      <dd className="font-medium text-ink">{formatRupiah(simulasi.pokok)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted">Total bunga ({bungaPersen}% flat/tahun)</dt>
                      <dd className="font-medium text-ink">{formatRupiah(simulasi.totalBunga)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted">Tenor</dt>
                      <dd className="font-medium text-ink">{simulasi.tenorBulan} bulan</dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted">Total bayar setelah DP</dt>
                      <dd className="font-medium text-ink">
                        {formatRupiah(simulasi.totalPembayaran)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <Alert tone="info">
                  {harga <= 0
                    ? "Isi perkiraan harga unit di atas untuk melihat estimasi angsuran."
                    : "DP sudah menutupi seluruh harga unit — tidak ada sisa yang perlu dicicil."}
                </Alert>
              )}

              <p className="text-xs leading-relaxed text-muted">
                Estimasi tidak mengikat — DP, tenor, bunga, dan biaya final ditentukan mitra
                leasing setelah verifikasi.
              </p>
            </section>
          </FadeUp>
        ) : null}

        <Field
          label="Catatan untuk tenant"
          htmlFor={`${idPrefix}-catatan`}
          hint="Opsional; misalnya jadwal datang atau permintaan test drive."
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

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <SubmitButton pendingText="Menyimpan…">
            {metode === "credit" ? "Lanjut ke Pengajuan Leasing" : "Kirim Data Pembelian"}
          </SubmitButton>
          <p className="text-xs text-muted">
            {metode === "credit"
              ? "Berikutnya: pilih mitra leasing, DP, dan tenor."
              : "Anda akan mendapat kode transaksi untuk ditunjukkan ke tenant."}
          </p>
        </div>
      </fieldset>
    </form>
  );
}
