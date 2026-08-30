"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { CopyButton } from "@/app/booking/_components/CopyButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitPaymentAction } from "@/lib/actions/booking";
import { initialActionState } from "@/lib/actions/state";
import { BANK_ACCOUNT, KOMPRESI_BUKTI, MAX_PROOF_BYTES } from "@/lib/domain/constants";
import { compressImage, formatBytes } from "@/lib/image";
import { formatRupiah } from "@/lib/utils";

const JENIS_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

export type PaymentFormProps = {
  bookingId: string;
  /** Nominal biaya admin yang harus dibayar. */
  amount: number;
  /** URL bukti transfer yang sudah pernah diunggah. */
  existingProofUrl?: string | null;
  /** Kode booking — dipakai sebagai BERITA TRANSFER agar mutasi bank bisa dicocokkan. */
  bookingCode: string;
};

/**
 * Pembayaran biaya admin (langkah "Pembayaran") — TRANSFER SAJA.
 * Opsi cash dihapus (keputusan pemilik, 2026-08-28): booking hanya dikunci
 * lewat pembayaran, jadi setiap booking wajib transfer + unggah bukti.
 * Booking yang tidak kunjung membayar dibatalkan otomatis oleh
 * expire_unpaid_bookings() (pg_cron) agar slotnya lepas kembali.
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
  existingProofUrl = null,
  bookingCode,
}: PaymentFormProps) {
  const [state, formAction] = useActionState(submitPaymentAction, initialActionState);
  const id = useId();

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
      // Bukti transfer hanya diperiksa sekilas panitia — pakai preset yang jauh
      // lebih ringan daripada foto katalog (lihat KOMPRESI_BUKTI).
      const hasil = await compressImage(dipilih, KOMPRESI_BUKTI);

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

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
      {/* Satu-satunya metode yang diterima server (submitPaymentSchema). */}
      <input type="hidden" name="method" value="transfer" />

      {pesanUmum ? (
        <div className="anim-rise">
          <Alert tone="error" title="Pembayaran belum bisa diproses">
            {pesanUmum}
          </Alert>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* ---------- Kartu "Instruksi Transfer Bank" ---------- */}
        <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5">
          <p className="text-sm font-semibold text-ink">Instruksi Transfer Bank</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Transfer tepat sesuai nominal ke rekening di bawah ini, lalu unggah bukti
            transfernya. Booking dikunci setelah pembayaran diverifikasi.
          </p>

          <dl className="mt-4 space-y-3.5">
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Bank
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink">{BANK_ACCOUNT.bankName}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Nomor rekening
              </dt>
              <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="tabular select-all font-mono text-2xl font-bold tracking-wider text-accent">
                  {BANK_ACCOUNT.accountNumber}
                </span>
                <CopyButton
                  value={BANK_ACCOUNT.accountNumber}
                  label="Salin"
                  className="h-9 px-4 text-xs"
                />
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Atas nama
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink">
                {BANK_ACCOUNT.accountName}
              </dd>
            </div>

            {/* BERITA TRANSFER: ditulis penyewa di kolom berita/catatan saat transfer.
                Inilah yang membuat panitia bisa mencocokkan baris mutasi bank dengan
                booking yang mana — tanpa ini, dua transfer bernominal sama tidak bisa
                dibedakan. */}
            <div className="border-t border-line pt-3">
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                Berita / catatan transfer
              </dt>
              <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="tabular select-all font-mono text-xl font-bold tracking-widest text-ink">
                  {bookingCode}
                </span>
                <CopyButton value={bookingCode} label="Salin" className="h-9 px-4 text-xs" />
              </dd>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Tulis kode ini di kolom <strong className="text-ink">berita/catatan</strong> saat
                transfer supaya pembayaran Anda cepat dikenali panitia.
              </p>
            </div>

            <div className="border-t border-line pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-sm text-muted">Nominal transfer</dt>
                <dd className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="tabular text-lg font-bold text-accent">
                    {formatRupiah(amount)}
                  </span>
                  {/* Salin angka polos (tanpa "Rp"/titik) supaya bisa langsung
                      ditempel di aplikasi m-banking. */}
                  <CopyButton
                    value={String(amount)}
                    label="Salin nominal"
                    className="h-9 px-4 text-xs"
                  />
                </dd>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Transfer <strong className="text-ink">tepat sampai angka terakhir</strong> — nominal
                yang berbeda membuat pembayaran sulit dicocokkan.
              </p>
            </div>
          </dl>
        </div>

        <Field
          label="Bukti transfer"
          htmlFor={`${id}-bukti`}
          hint={`JPG, PNG, atau WEBP — otomatis dikompresi maksimal ${formatBytes(MAX_PROOF_BYTES)}.`}
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
              alt="Pratinjau bukti transfer"
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
        ) : existingProofUrl ? (
          <Alert tone="info">
            Bukti transfer sebelumnya masih tersimpan — pilih gambar baru hanya kalau ingin
            menggantinya.
          </Alert>
        ) : null}
      </div>

      {/* ---------- Aksi: pil biru khusus konfirmasi pembayaran ---------- */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {sedangKompres ? (
          <Button variant="accent" disabled>
            Menyiapkan gambar…
          </Button>
        ) : (
          <SubmitButton variant="accent" pendingText="Mengirim…">
            Konfirmasi Pembayaran
          </SubmitButton>
        )}
        <p className="text-xs text-muted">Diverifikasi manual oleh panitia.</p>
      </div>
    </form>
  );
}
