import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyButton } from "@/app/booking/_components/CopyButton";
import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { InfoRow, TanggalChips } from "@/app/booking/_components/Ringkasan";
import { PaymentForm } from "@/components/forms/PaymentForm";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import {
  EVENT_INFO,
  WA_BANTUAN_TEXT,
  waHref,
} from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { hitungTotalBiaya } from "@/lib/domain/ketersediaan";
import { batasPembayaran } from "@/lib/domain/tenggat";
import { getBookingDetail } from "@/lib/services/booking";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

/*
 * Segmen dinamis bernama [slotId] karena Next.js hanya mengizinkan SATU nama slug
 * per posisi segmen (lihat catatan di src/app/booking/[slotId]/page.tsx).
 * Di halaman ini nilainya adalah ID BOOKING, sesuai rute /booking/[bookingId]/bayar.
 */
type PageProps = { params: Promise<{ slotId: string }> };

const INVALID_UUID = "22P02";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slotId: bookingId } = await params;
  const result = await getBookingDetail(bookingId);
  if (!result.ok) return { title: "Pembayaran Biaya Admin" };
  return {
    title: `Pembayaran ${result.data.booking_code}`,
    description: `Bayar biaya admin untuk ${slotDisplayName(result.data.slot)} di ${
      result.data.slot.zone.name
    }.`,
  };
}

export default async function BayarPage({ params }: PageProps) {
  const { slotId: bookingId } = await params;
  const result = await getBookingDetail(bookingId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader title="Pembayaran Biaya Admin" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data booking belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const booking = result.data;
  const payment = booking.payment;

  /* ---------- Booking sudah dibatalkan ---------- */
  if (booking.status === "cancelled") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Booking Dibatalkan"
          description={`Kode booking ${booking.booking_code}`}
          backHref="/"
          backLabel="Kembali ke denah"
        />
        <Alert tone="error" title="Booking ini sudah dibatalkan">
          Slot <strong>{slotDisplayName(booking.slot)}</strong> sudah dilepas — pembayaran tidak
          lagi diperlukan.
        </Alert>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/#denah" className={buttonClass("primary", "md")}>
            Pesan slot lain
          </Link>
          <Link href={`/booking/${booking.id}/status`} className={buttonClass("secondary", "md")}>
            Lihat status booking
          </Link>
        </div>
      </div>
    );
  }

  /* ---------- Sudah lunas & terverifikasi -> langsung ke halaman status ---------- */
  if (payment?.status === "verified") {
    redirect(`/booking/${booking.id}/status`);
  }

  // Total = biaya admin per tanggal x jumlah tanggal; payment.amount sudah
  // menyimpan hasil kalinya — fallback hanya kalau tagihan belum tercatat.
  // Harga per tanggal WAJIB lewat slotAdminFee (override per slot ?? harga zona),
  // sama dengan yang dipakai server saat menagih.
  const biayaPerTanggal = slotAdminFee(booking.slot, booking.slot.zone);
  const jumlahTanggal = Math.max(booking.dates.length, 1);
  const nominal = payment?.amount ?? hitungTotalBiaya(biayaPerTanggal, jumlahTanggal);
  // Tenggat bayar (cermin expire_unpaid_bookings di DB): tampil selama
  // pembayaran belum submitted supaya auto-cancel tidak mengejutkan tenant.
  const tenggat = batasPembayaran(booking, payment);
  // Pembayaran kini QRIS-only (keputusan pemilik 2026-09-02; cash dihapus
  // 2026-08-28, transfer bank dihapus 2026-09-02): booking dikunci lewat
  // pembayaran QRIS + bukti tangkapan layar.

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {/* ---------- Kepala halaman ala mockup pembayaran ---------- */}
      <div className="anim-fade-up mx-auto max-w-2xl text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-app ring-8 ring-accent-soft"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m8.4 12.4 2.5 2.5 4.7-5.2" />
          </svg>
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
          Slot Berhasil Dipesan
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Selesaikan pembayaran biaya admin lalu tunggu verifikasi panitia — kode booking
          Anda juga sudah dikirim ke email{booking.tenant.email ? ` ${booking.tenant.email}` : ""}.
        </p>
        <p className="mt-2 text-xs text-subtle">
          Bingung dengan kode booking? Hubungi WhatsApp{" "}
          {EVENT_INFO.contacts.map((kontak) => (
            <a
              key={kontak.phone}
              href={waHref(
                kontak.phone,
                `${WA_BANTUAN_TEXT} (kode booking ${booking.booking_code})`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              {kontak.phone}
            </a>
          ))}
          .
        </p>
      </div>

      <div className="mt-8">
        <Stepper steps={[...LANGKAH_BOOKING]} current={2} />
      </div>

      {payment?.status === "rejected" ? (
        <div className="anim-rise mb-6">
          <Alert tone="error" title="Bukti pembayaran sebelumnya ditolak">
            {payment.reject_reason
              ? `Alasan panitia: ${payment.reject_reason}.`
              : "Panitia belum mencantumkan alasan penolakan."}{" "}
            Kirim ulang bukti yang benar di bawah.
          </Alert>
        </div>
      ) : payment?.status === "submitted" ? (
        <div className="mb-6">
          <Alert tone="info" title="Menunggu verifikasi panitia">
            Anda masih bisa mengganti bukti pembayaran dari halaman ini.
          </Alert>
        </div>
      ) : null}

      {tenggat ? (
        <div className="mb-6">
          <Alert tone="warning" title="Batas waktu pembayaran">
            Selesaikan sebelum <strong>{formatTanggalWaktu(tenggat)} WIB</strong> — lewat dari
            itu booking dibatalkan otomatis dan tanggal sewanya dilepas untuk orang lain.
          </Alert>
        </div>
      ) : null}

      {/* ---------- Dua kartu: ringkasan pesanan & pembayaran ---------- */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="anim-fade-up">
          <CardHeader>
            <CardTitle>Ringkasan Pesanan</CardTitle>
          </CardHeader>

          <CardContent className="border-b border-line">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
              Kode booking
            </p>
            <p className="tabular mt-1 font-mono text-3xl font-bold tracking-widest text-ink">
              {booking.booking_code}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} kind="booking" />
              <CopyButton value={booking.booking_code} />
            </div>
          </CardContent>

          <CardContent className="border-b border-line">
            <dl className="divide-y divide-line">
              <InfoRow label="Slot">{slotDisplayName(booking.slot)}</InfoRow>
              <InfoRow label="Zona">{booking.slot.zone.name}</InfoRow>
              <InfoRow label="Tenant">{booking.tenant.name}</InfoRow>
            </dl>
          </CardContent>

          <CardContent className="border-b border-line">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
              Tanggal sewa
            </p>
            <div className="mt-2">
              <TanggalChips dates={booking.dates} />
            </div>
          </CardContent>

          <CardContent>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-muted">Total Tagihan</p>
              <p className="tabular text-2xl font-bold tracking-[-0.01em] text-accent sm:text-3xl">
                {formatRupiah(nominal)}
              </p>
            </div>
            <p className="mt-1 text-right text-[0.8125rem] text-subtle">
              {booking.dates.length > 0
                ? `${booking.dates.length} tanggal × ${formatRupiah(biayaPerTanggal)}`
                : "Biaya admin"}
            </p>
          </CardContent>
        </Card>

        <Card className="anim-fade-up">
          <CardHeader>
            <CardTitle>Pembayaran</CardTitle>
            <CardDescription>
              Bayar lewat QRIS lalu unggah bukti — diverifikasi manual oleh panitia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentForm
              bookingId={booking.id}
              amount={nominal}
              existingProofUrl={payment?.proof_url ?? null}
              bookingCode={booking.booking_code}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
