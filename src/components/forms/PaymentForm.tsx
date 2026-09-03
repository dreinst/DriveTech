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
import { KOMPRESI_BUKTI, MAX_PROOF_BYTES, QRIS_INFO } from "@/lib/domain/constants";
import { compressImage, formatBytes } from "@/lib/image";
import { formatRupiah } from "@/lib/utils";

const JENIS_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

export type PaymentFormProps = {
  bookingId: string;
  /** Nominal biaya admin yang harus dibayar. */
  amount: number;
  /** URL bukti pembayaran yang sudah pernah diunggah. */
  existingProofUrl?: string | null;
  /** Kode booking — ditampilkan agar penyewa bisa menuliskannya di catatan pembayaran. */
  bookingCode: string;
};

/**
 * Pembayaran biaya admin (langkah "Pembayaran") — QRIS SAJA.
 * Opsi cash dihapus 2026-08-28 dan transfer bank dihapus 2026-09-02 (keputusan
 * pemilik): booking hanya dikunci lewat pembayaran QRIS + unggah tangkapan
 * layar "transaksi berhasil". QRIS panitia bersifat statis (nominal diisi
 * pembayar), jadi panitia mencocokkan NOMINAL + WAKTU pada bukti dengan waktu
 * kirim yang tercatat di sistem (admin_fee_payments.submitted_at).
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
      setGalatLokal("Format bukti pembayaran harus JPG, PNG, atau WEBP.");
      setBerkas(null);
      setUkuranAsli(null);
      input.value = "";
      return;
    }

    setUkuranAsli(dipilih.size);
    setSedangKompres(true);
    try {
      // Bukti pembayaran hanya diperiksa sekilas panitia — pakai preset yang jauh
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
      <input type="hidden" name="method" value="qris" />

      {pesanUmum ? (
        <div className="anim-rise">
          <Alert tone="error" title="Pembayaran belum bisa diproses">
            {pesanUmum}
          </Alert>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* ---------- Kartu QRIS ---------- */}
        <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-4 sm:p-5">
          <p className="text-sm font-semibold text-ink">Bayar lewat QRIS</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Pindai kode QRIS di bawah dengan aplikasi bank atau e-wallet apa pun yang berlogo
            QRIS, bayar tepat sesuai nominal, lalu unggah tangkapan layar transaksi berhasil.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Gambar QRIS dibiarkan besar & tajam supaya bisa dipindai langsung dari layar. */}
            <a
              href={QRIS_INFO.imagePath}
              target="_blank"
              rel="noopener noreferrer"
              title="Buka gambar QRIS ukuran penuh"
              className="shrink-0 self-center sm:self-start"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- gambar statis di public/, harus tetap tajam untuk dipindai */}
              <img
                src={QRIS_INFO.imagePath}
                alt={`Kode QRIS ${QRIS_INFO.merchantName}, NMID ${QRIS_INFO.nmid}, terminal ${QRIS_INFO.terminal}`}
                width={224}
                height={316}
                className="h-auto w-56 rounded-[var(--radius-sm)] border border-line bg-white"
              />
            </a>

            <dl className="min-w-0 flex-1 space-y-3.5">
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  Nama merchant
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{QRIS_INFO.merchantName}</dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  NMID &middot; Terminal
                </dt>
                <dd className="tabular mt-0.5 font-mono text-sm font-semibold text-ink">
                  {QRIS_INFO.nmid} &middot; {QRIS_INFO.terminal}
                </dd>
              </div>

              <div className="border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted">Nominal bayar</dt>
                  <dd className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="tabular text-lg font-bold text-accent">
                      {formatRupiah(amount)}
                    </span>
                    {/* Salin angka polos (tanpa "Rp"/titik) supaya bisa langsung
                        ditempel di kolom nominal aplikasi pembayaran. */}
                    <CopyButton
                      value={String(amount)}
                      label="Salin nominal"
                      className="h-9 px-4 text-xs"
                    />
                  </dd>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Masukkan nominal <strong className="text-ink">tepat sampai angka terakhir</strong>{" "}
                  &mdash; QRIS ini statis, nominalnya Anda isi sendiri di aplikasi.
                </p>
              </div>

              <div className="border-t border-line pt-3">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  Kode booking
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="tabular select-all font-mono text-xl font-bold tracking-widest text-ink">
                    {bookingCode}
                  </span>
                  <CopyButton value={bookingCode} label="Salin" className="h-9 px-4 text-xs" />
                </dd>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Kalau aplikasi Anda menyediakan kolom catatan, tulis kode ini di sana supaya
                  pembayaran lebih cepat dikenali panitia.
                </p>
              </div>
            </dl>
          </div>

          <ol className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            <li>
              <strong className="text-ink">1.</strong> Buka aplikasi bank / e-wallet berlogo QRIS.
            </li>
            <li>
              <strong className="text-ink">2.</strong> Pindai kode QRIS di atas (atau unggah gambarnya
              dari galeri lewat menu &ldquo;scan dari galeri&rdquo;).
            </li>
            <li>
              <strong className="text-ink">3.</strong> Masukkan nominal tepat{" "}
              <span className="tabular font-semibold text-ink">{formatRupiah(amount)}</span> lalu bayar.
            </li>
            <li>
              <strong className="text-ink">4.</strong> Simpan tangkapan layar halaman &ldquo;transaksi
              berhasil&rdquo; — pastikan nominal dan waktu pembayaran terlihat.
            </li>
            <li>
              <strong className="text-ink">5.</strong> Unggah tangkapan layar itu di bawah, lalu tekan
              Konfirmasi Pembayaran.
            </li>
          </ol>

          <p className="mt-3 rounded-[var(--radius-sm)] border-l-2 border-accent bg-accent-soft px-3 py-2 text-xs leading-relaxed text-ink-2">
            Setelah bukti terkirim, kode booking Anda masuk antrean verifikasi. Panitia mencocokkan{" "}
            <strong className="text-ink">nominal</strong> dan{" "}
            <strong className="text-ink">waktu pembayaran</strong> pada bukti dengan waktu pengiriman
            yang tercatat di sistem; booking dikunci setelah diverifikasi.
          </p>
        </div>

        <Field
          label="Bukti pembayaran QRIS (tangkapan layar berhasil)"
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
              alt="Pratinjau bukti pembayaran"
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
            Bukti pembayaran sebelumnya masih tersimpan — pilih gambar baru hanya kalau ingin
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
