"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitPaymentAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import { BANK_ACCOUNT, MAX_PROOF_BYTES } from "@/lib/domain/constants";
import { compressImage, formatBytes } from "@/lib/image";
import type { PaymentMethod } from "@/lib/types/database";
import { formatRupiah } from "@/lib/utils";

const JENIS_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

export type PaymentFormProps = {
  bookingId: string;
  /** Nominal biaya admin yang harus dibayar. */
  amount: number;
  /** Metode yang sudah tersimpan sebelumnya (kalau ada). */
  defaultMethod?: PaymentMethod;
  /** URL bukti transfer yang sudah pernah diunggah. */
  existingProofUrl?: string | null;
};

/**
 * Pilihan metode pembayaran biaya admin (langkah 2 dari 3).
 *
 * CATATAN TEKNIS — cara berkas terkompresi ikut terkirim ke Server Action:
 * form ini memakai <form action={formAction}>, jadi React yang merakit FormData
 * dari elemen form. Berkas hasil kompresi TIDAK bisa "dititipkan" lewat state,
 * dan dataURL di hidden input akan menabrak batas ukuran field teks.
 * Solusinya: setelah kompresi selesai, isi input file DIGANTI di tempat memakai
 * DataTransfer (`input.files = dt.files`) — satu-satunya cara sah menulis
 * HTMLInputElement.files. Karena input yang diganti adalah input bernama "proof"
 * itu sendiri, kalau penggantian gagal (browser lama) berkas ASLI yang terkirim
 * dan pemeriksaan 2 MB di server tetap jadi jaring pengaman.
 */
export function PaymentForm({
  bookingId,
  amount,
  defaultMethod = "transfer",
  existingProofUrl = null,
}: PaymentFormProps) {
  const [state, formAction] = useActionState(submitPaymentAction, initialActionState);
  const id = useId();

  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [ukuranAsli, setUkuranAsli] = useState<number | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [sedangKompres, setSedangKompres] = useState(false);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Pratinjau dari berkas terkompresi; URL objek dilepas saat berganti/unmount.
  useEffect(() => {
    if (!berkas) {
      setPratinjau(null);
      return;
    }
    const url = URL.createObjectURL(berkas);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [berkas]);

  const errors = state.fieldErrors ?? {};
  const pesanUmum = state.status === "error" ? state.message : undefined;
  const galatBukti = galatLokal ?? errors.proof ?? errors.proofUrl;

  async function pilihBerkas(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const dipilih = input.files?.[0] ?? null;
    setGalatLokal(null);

    if (!dipilih) {
      setBerkas(null);
      setUkuranAsli(null);
      return;
    }

    if (!JENIS_DIIZINKAN.includes(dipilih.type)) {
      setGalatLokal("Format bukti transfer harus JPG, PNG, atau WEBP.");
      setBerkas(null);
      setUkuranAsli(null);
      input.value = "";
      return;
    }

    setUkuranAsli(dipilih.size);
    setSedangKompres(true);
    try {
      const hasil = await compressImage(dipilih, {
        maxDimension: 1600,
        quality: 0.8,
        maxBytes: MAX_PROOF_BYTES,
      });

      // Ganti isi input dengan berkas terkompresi supaya FormData mengirim yang kecil.
      try {
        const dt = new DataTransfer();
        dt.items.add(hasil);
        input.files = dt.files;
      } catch {
        // Browser tidak mendukung penulisan input.files — berkas asli tetap terkirim.
      }

      setBerkas(hasil);
      if (hasil.size > MAX_PROOF_BYTES) {
        setGalatLokal(
          `Ukuran bukti masih ${formatBytes(hasil.size)} setelah dikompresi (maksimal ${formatBytes(
            MAX_PROOF_BYTES,
          )}). Coba potong gambar atau foto ulang dengan resolusi lebih kecil.`,
        );
      }
    } finally {
      setSedangKompres(false);
    }
  }

  function hapusBerkas() {
    setBerkas(null);
    setUkuranAsli(null);
    setGalatLokal(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const labelTombol =
    method === "cash" ? "Konfirmasi Bayar Cash di Lokasi" : "Kirim Bukti Transfer";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />

      {pesanUmum ? (
        <Alert tone="error" title="Pembayaran belum bisa diproses">
          {pesanUmum}
        </Alert>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-slate-700">
          Metode pembayaran biaya admin
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        </legend>

        <OpsiMetode
          id={`${id}-cash`}
          value="cash"
          judul="Tunai (Cash)"
          keterangan="Bayar langsung ke panitia di sekretariat pameran."
          checked={method === "cash"}
          onChange={() => setMethod("cash")}
        />
        <OpsiMetode
          id={`${id}-transfer`}
          value="transfer"
          judul="Transfer Bank"
          keterangan="Transfer ke rekening panitia, lalu unggah buktinya di bawah."
          checked={method === "transfer"}
          onChange={() => setMethod("transfer")}
        />
        {errors.method ? (
          <p className="text-xs font-medium text-red-600" role="alert">
            {errors.method}
          </p>
        ) : null}
      </fieldset>

      {method === "cash" ? (
        <Alert tone="info" title="Cara bayar tunai">
          <p>
            Datang ke <strong>Kantor Sekretariat</strong> di area pameran, sebutkan kode booking
            Anda, lalu bayar <strong>{formatRupiah(amount)}</strong> kepada panitia. Setelah
            panitia memverifikasi, status slot otomatis berubah jadi Terisi.
          </p>
          <p className="mt-1">
            Tekan tombol di bawah untuk memberi tahu panitia bahwa Anda memilih pembayaran tunai.
          </p>
        </Alert>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Rekening tujuan
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <BarisRekening label="Bank" value={BANK_ACCOUNT.bankName} />
              <BarisRekening label="No. Rekening" value={BANK_ACCOUNT.accountNumber} mono />
              <BarisRekening label="Atas Nama" value={BANK_ACCOUNT.accountName} />
              <BarisRekening label="Nominal" value={formatRupiah(amount)} />
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Transfer tepat sesuai nominal agar verifikasi lebih cepat.
            </p>
          </div>

          <Field
            label="Bukti transfer"
            htmlFor={`${id}-bukti`}
            hint={`Foto atau tangkapan layar bukti transfer. JPG, PNG, atau WEBP. Gambar otomatis dikecilkan menjadi maksimal ${formatBytes(
              MAX_PROOF_BYTES,
            )} sebelum dikirim.`}
            error={galatBukti}
            required={!existingProofUrl}
          >
            <input
              ref={inputRef}
              id={`${id}-bukti`}
              name="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={pilihBerkas}
              aria-invalid={galatBukti ? true : undefined}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600 shadow-sm file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </Field>

          {sedangKompres ? (
            <p className="text-xs text-slate-500" role="status">
              Mengompresi gambar…
            </p>
          ) : null}

          {berkas && pratinjau ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pratinjau}
                alt="Pratinjau bukti transfer"
                className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
              <div className="min-w-0 flex-1 text-xs text-slate-600">
                <p className="truncate font-medium text-slate-900">{berkas.name}</p>
                <p className="mt-1">
                  Sebelum: {formatBytes(ukuranAsli ?? berkas.size)} &rarr; Sesudah:{" "}
                  <span className="font-semibold text-slate-900">{formatBytes(berkas.size)}</span>
                </p>
                {ukuranAsli !== null && ukuranAsli > berkas.size ? (
                  <p className="mt-0.5 text-green-700">
                    Hemat {Math.round((1 - berkas.size / ukuranAsli) * 100)}% dari ukuran asli.
                  </p>
                ) : null}
                <Button variant="ghost" size="sm" className="mt-2" onClick={hapusBerkas}>
                  Ganti gambar
                </Button>
              </div>
            </div>
          ) : existingProofUrl ? (
            <Alert tone="info">
              Sudah ada bukti transfer yang tersimpan. Biarkan kosong kalau tidak ingin
              menggantinya, atau pilih gambar baru untuk menimpanya.
            </Alert>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {sedangKompres ? (
          <Button disabled>Menyiapkan gambar…</Button>
        ) : (
          <SubmitButton pendingText="Mengirim…">{labelTombol}</SubmitButton>
        )}
        <p className="text-xs text-slate-500">Pembayaran diverifikasi manual oleh panitia.</p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Bagian kecil                                                        */
/* ------------------------------------------------------------------ */

type OpsiMetodeProps = {
  id: string;
  value: PaymentMethod;
  judul: string;
  keterangan: string;
  checked: boolean;
  onChange: () => void;
};

function OpsiMetode({ id, value, judul, keterangan, checked, onChange }: OpsiMetodeProps) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <input
        id={id}
        type="radio"
        name="method"
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-slate-900 focus:ring-slate-900"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{judul}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{keterangan}</span>
      </span>
    </label>
  );
}

function BarisRekening({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold text-slate-900 ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
