"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MAX_PROOF_BYTES } from "@/lib/domain/constants";
import { compressImage, formatBytes } from "@/lib/image";

const JENIS_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

export type FotoInputProps = {
  /** Nama field FormData yang dibaca server action. */
  name: string;
  id: string;
  label: string;
  hint?: string;
  /** Error dari server action (fieldErrors) untuk field ini. */
  error?: string;
  required?: boolean;
};

/**
 * Input foto tunggal dengan kompresi di browser — pola yang sama dengan bukti
 * transfer di PaymentForm: setelah kompresi, isi input file DIGANTI di tempat
 * memakai DataTransfer supaya FormData mengirim berkas kecil; kalau penggantian
 * gagal (browser lama), berkas asli terkirim dan batas 2 MB di server tetap
 * menjadi jaring pengaman.
 */
export function FotoInput({ name, id, label, hint, error, required }: FotoInputProps) {
  const [ukuranAsli, setUkuranAsli] = useState<number | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [sedangKompres, setSedangKompres] = useState(false);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!berkas) {
      setPratinjau(null);
      return;
    }
    const url = URL.createObjectURL(berkas);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [berkas]);

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
      setGalatLokal("Format foto harus JPG, PNG, atau WEBP.");
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
          `Ukuran foto masih ${formatBytes(hasil.size)} setelah dikompresi (maksimal ${formatBytes(
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

  const galat = galatLokal ?? error;

  return (
    <div className="space-y-3">
      <Field
        label={label}
        htmlFor={id}
        hint={hint ?? `JPG, PNG, atau WEBP — otomatis dikompresi maksimal ${formatBytes(MAX_PROOF_BYTES)}.`}
        error={galat}
        required={required}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={pilihBerkas}
          aria-invalid={galat ? true : undefined}
          className="block min-h-11 w-full cursor-pointer rounded-xl border border-line bg-surface-2 text-sm text-muted shadow-[var(--shadow-sm)] file:mr-3 file:h-11 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-surface-3 file:px-3 file:text-sm file:font-medium file:text-ink hover:border-line-strong"
        />
      </Field>

      {sedangKompres ? (
        <p className="text-xs text-muted" role="status">
          Mengompresi gambar…
        </p>
      ) : null}

      {berkas && pratinjau ? (
        <div className="anim-rise flex items-start gap-3 rounded-[var(--radius)] border border-line bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pratinjau}
            alt={`Pratinjau ${label.toLowerCase()}`}
            className="h-24 w-24 shrink-0 rounded-[var(--radius-sm)] border border-line object-cover"
          />
          <div className="min-w-0 flex-1 text-xs text-muted">
            <p className="truncate font-medium text-ink">{berkas.name}</p>
            <p className="tabular mt-1">
              {formatBytes(ukuranAsli ?? berkas.size)} →{" "}
              <span className="font-semibold text-ink">{formatBytes(berkas.size)}</span>
              {ukuranAsli !== null && ukuranAsli > berkas.size ? (
                <span className="text-ok">
                  {" "}
                  (hemat {Math.round((1 - berkas.size / ukuranAsli) * 100)}%)
                </span>
              ) : null}
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={hapusBerkas}>
              Ganti gambar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
