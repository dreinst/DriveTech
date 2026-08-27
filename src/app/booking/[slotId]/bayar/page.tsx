import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyButton } from "@/app/booking/_components/CopyButton";
import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { InfoRow } from "@/app/booking/_components/Ringkasan";
import { PaymentForm } from "@/components/forms/PaymentForm";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import { BANK_ACCOUNT, EVENT_INFO } from "@/lib/domain/constants";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getBookingDetail } from "@/lib/services/booking";
import { formatRupiah, slotDisplayName } from "@/lib/utils";

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
      <div className="mx-auto w-full max-w-2xl">
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
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader
          title="Booking Dibatalkan"
          description={`Kode booking ${booking.booking_code}`}
          backHref="/"
          backLabel="Kembali ke denah"
        />
        <Alert tone="error" title="Booking ini sudah dibatalkan">
          Slot <strong>{slotDisplayName(booking.slot)}</strong> di {booking.slot.zone.name} sudah
          dilepas dan bisa dipesan orang lain. Pembayaran tidak lagi diperlukan.
        </Alert>
        <div className="mt-4 flex flex-wrap gap-2">
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

  const nominal = payment?.amount ?? booking.slot.zone.admin_fee;
  // Tagihan baru selalu tersimpan sebagai "cash/unpaid"; biarkan penyewa memilih
  // sendiri (default transfer) sampai ada pengiriman pertama.
  const metodeAwal = payment && payment.status !== "unpaid" ? payment.method : "transfer";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Pembayaran Biaya Admin"
        description="Langkah 2 dari 3. Pilih metode pembayaran lalu kirim konfirmasi."
        backHref="/"
        backLabel="Kembali ke denah"
      />

      <Stepper steps={[...LANGKAH_BOOKING]} current={1} />

      {payment?.status === "rejected" ? (
        <div className="mb-4">
          <Alert tone="error" title="Bukti pembayaran sebelumnya ditolak">
            {payment.reject_reason
              ? `Alasan panitia: ${payment.reject_reason}`
              : "Panitia belum mencantumkan alasan penolakan."}{" "}
            Silakan kirim ulang bukti yang benar di bawah ini.
          </Alert>
        </div>
      ) : payment?.status === "submitted" ? (
        <div className="mb-4">
          <Alert tone="info" title="Pembayaran sedang menunggu verifikasi">
            Panitia sedang memeriksa pembayaran Anda. Anda masih bisa memperbarui metode atau
            mengganti bukti transfer dari halaman ini.
          </Alert>
        </div>
      ) : null}

      {/* ---------- Ringkasan booking ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Booking</CardTitle>
          <CardDescription>Simpan kode booking untuk mengecek status kapan saja.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Kode booking
              </p>
              <p className="font-mono text-2xl font-bold tracking-widest text-slate-900 tabular">
                {booking.booking_code}
              </p>
            </div>
            <CopyButton value={booking.booking_code} />
          </div>

          <dl className="divide-y divide-slate-100">
            <InfoRow label="Zona">{booking.slot.zone.name}</InfoRow>
            <InfoRow label="Slot">{slotDisplayName(booking.slot)}</InfoRow>
            <InfoRow label="Tipe zona">{ZONE_TYPE_LABEL[booking.slot.zone.zone_type]}</InfoRow>
            <InfoRow label="Penyewa">{booking.tenant.name}</InfoRow>
            <InfoRow label="Kontak">{booking.tenant.phone ?? "-"}</InfoRow>
            <InfoRow label="Status booking">
              <StatusBadge status={booking.status} kind="booking" />
            </InfoRow>
            <InfoRow label="Total biaya admin">
              <span className="text-base font-bold text-slate-900">{formatRupiah(nominal)}</span>
            </InfoRow>
          </dl>
        </CardContent>
      </Card>

      {/* ---------- Form pembayaran ---------- */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Metode Pembayaran</CardTitle>
          <CardDescription>Pilih tunai di lokasi atau transfer bank.</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentForm
            bookingId={booking.id}
            amount={nominal}
            defaultMethod={metodeAwal}
            existingProofUrl={payment?.proof_url ?? null}
          />
        </CardContent>
      </Card>

      {/* ---------- Panel instruksi transfer ---------- */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Instruksi Transfer</CardTitle>
          <CardDescription>Ikuti langkah berikut agar verifikasi cepat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-slate-500">Bank</dt>
                <dd className="font-semibold text-slate-900">{BANK_ACCOUNT.bankName}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-slate-500">Nomor rekening</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold tracking-wider text-slate-900">
                    {BANK_ACCOUNT.accountNumber}
                  </span>
                  <CopyButton value={BANK_ACCOUNT.accountNumber} label="Salin" />
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-slate-500">Atas nama</dt>
                <dd className="font-semibold text-slate-900">{BANK_ACCOUNT.accountName}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-slate-500">Nominal</dt>
                <dd className="font-semibold text-slate-900">{formatRupiah(nominal)}</dd>
              </div>
            </dl>
          </div>

          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              Transfer <strong className="text-slate-900">{formatRupiah(nominal)}</strong> ke
              rekening di atas. Nominal harus sama persis.
            </li>
            <li>
              Cantumkan kode booking{" "}
              <strong className="text-slate-900">{booking.booking_code}</strong> pada berita acara
              atau catatan transfer kalau tersedia.
            </li>
            <li>Foto atau tangkap layar bukti transfer.</li>
            <li>Unggah bukti pada formulir di atas, lalu tekan Kirim Bukti Transfer.</li>
            <li>Panitia memverifikasi maksimal 1x24 jam. Status slot berubah jadi Terisi.</li>
          </ol>

          <Alert tone="warning" title="Hati-hati penipuan">
            Panitia hanya menerima transfer ke rekening di atas. Jangan mengirim dana ke rekening
            pribadi siapa pun. Konfirmasi ke {EVENT_INFO.organizer} di {EVENT_INFO.contact} bila
            ragu.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
