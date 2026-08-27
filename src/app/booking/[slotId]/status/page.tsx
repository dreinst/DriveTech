import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CancelBookingForm } from "@/app/booking/_components/CancelBookingForm";
import { CopyButton } from "@/app/booking/_components/CopyButton";
import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { InfoRow } from "@/app/booking/_components/Ringkasan";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import { EVENT_INFO } from "@/lib/domain/constants";
import { PAYMENT_METHOD_LABEL, TENANT_TYPE_LABEL, ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getBookingDetail } from "@/lib/services/booking";
import type { Json } from "@/lib/types/database";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* Segmen [slotId] di sini berisi ID BOOKING — lihat catatan rute di ../page.tsx. */
type PageProps = { params: Promise<{ slotId: string }> };

const INVALID_UUID = "22P02";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slotId: bookingId } = await params;
  const result = await getBookingDetail(bookingId);
  if (!result.ok) return { title: "Status Booking" };
  return {
    title: `Status Booking ${result.data.booking_code}`,
    description: `Pantau status pembayaran dan slot ${slotDisplayName(result.data.slot)}.`,
  };
}

export default async function StatusBookingPage({ params }: PageProps) {
  const { slotId: bookingId } = await params;
  const result = await getBookingDetail(bookingId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader title="Status Booking" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data booking belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const booking = result.data;
  const payment = booking.payment;
  const dibatalkan = booking.status === "cancelled";
  const terkonfirmasi = booking.status === "confirmed";
  const ditolak = payment?.status === "rejected";

  const detailTenant = daftarDetail(booking.tenant.detail);
  const nominal = payment?.amount ?? booking.slot.zone.admin_fee;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Status Booking"
        description="Langkah 3 dari 3. Pantau proses verifikasi pembayaran Anda di sini."
        backHref="/"
        backLabel="Kembali ke denah"
      />

      <Stepper steps={[...LANGKAH_BOOKING]} current={2} />

      {/* ---------- Kode booking ---------- */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Kode booking
            </p>
            <p className="font-mono text-2xl font-bold tracking-widest text-slate-900 tabular">
              {booking.booking_code}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={booking.status} kind="booking" />
            <CopyButton value={booking.booking_code} />
          </div>
        </CardContent>
      </Card>

      {/* ---------- Ringkasan keadaan ---------- */}
      <div className="mt-4 space-y-3">
        {dibatalkan ? (
          <Alert tone="error" title="Booking dibatalkan">
            Slot <strong>{slotDisplayName(booking.slot)}</strong> sudah dilepas dan bisa dipesan
            orang lain. Silakan pesan slot baru dari denah bila masih ingin ikut pameran.
          </Alert>
        ) : terkonfirmasi ? (
          <Alert tone="success" title="Booking terkonfirmasi">
            Pembayaran biaya admin sudah diverifikasi panitia. Slot{" "}
            <strong>{slotDisplayName(booking.slot)}</strong> di {booking.slot.zone.name} resmi
            menjadi milik Anda. Tunjukkan kode booking saat registrasi ulang di lokasi.
          </Alert>
        ) : ditolak ? (
          <Alert tone="error" title="Bukti pembayaran ditolak">
            {payment?.reject_reason
              ? `Alasan panitia: ${payment.reject_reason}`
              : "Panitia belum mencantumkan alasan penolakan."}{" "}
            Slot Anda masih ditahan &mdash; kirim ulang bukti yang benar agar tidak hangus.
          </Alert>
        ) : payment?.status === "submitted" ? (
          <Alert tone="info" title="Menunggu verifikasi panitia">
            Pembayaran Anda sudah masuk antrean. Panitia memverifikasi maksimal 1x24 jam. Halaman
            ini otomatis menampilkan status terbaru setiap kali dibuka.
          </Alert>
        ) : (
          <Alert tone="warning" title="Pembayaran belum dikirim">
            Slot ditahan atas nama Anda, tetapi belum ada konfirmasi pembayaran biaya admin
            sebesar {formatRupiah(nominal)}. Selesaikan pembayaran agar slot tidak dilepas panitia.
          </Alert>
        )}

        {(ditolak || payment?.status === "unpaid" || !payment) && !dibatalkan ? (
          <Link href={`/booking/${booking.id}/bayar`} className={buttonClass("primary", "md")}>
            {ditolak ? "Kirim Ulang Bukti Pembayaran" : "Lanjutkan Pembayaran"}
          </Link>
        ) : null}
      </div>

      {/* ---------- Linimasa ---------- */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Linimasa</CardTitle>
          <CardDescription>Riwayat perjalanan booking Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-0">
            <BarisLinimasa
              judul="Booking dibuat"
              waktu={booking.created_at}
              selesai
              keterangan={`Slot ${slotDisplayName(booking.slot)} dikunci atas nama ${booking.tenant.name}.`}
            />
            <BarisLinimasa
              judul="Konfirmasi pembayaran dikirim"
              waktu={payment?.submitted_at ?? null}
              selesai={Boolean(payment?.submitted_at)}
              keterangan={
                payment?.submitted_at
                  ? `Metode ${PAYMENT_METHOD_LABEL[payment.method]}, nominal ${formatRupiah(
                      payment.amount,
                    )}.`
                  : "Belum ada konfirmasi pembayaran dari penyewa."
              }
            />
            <BarisLinimasa
              judul={ditolak ? "Pembayaran ditolak panitia" : "Diverifikasi panitia"}
              waktu={payment?.verified_at ?? null}
              selesai={payment?.status === "verified"}
              gagal={ditolak}
              keterangan={
                payment?.status === "verified"
                  ? "Pembayaran sah. Slot resmi terisi."
                  : ditolak
                    ? (payment?.reject_reason ?? "Bukti pembayaran tidak sesuai.")
                    : "Menunggu pemeriksaan panitia."
              }
              terakhir
            />
          </ol>
        </CardContent>
      </Card>

      {/* ---------- Detail slot & pembayaran ---------- */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Detail Slot &amp; Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Zona">{booking.slot.zone.name}</InfoRow>
            <InfoRow label="Slot">{slotDisplayName(booking.slot)}</InfoRow>
            <InfoRow label="Tipe zona">{ZONE_TYPE_LABEL[booking.slot.zone.zone_type]}</InfoRow>
            <InfoRow label="Status slot">
              <StatusBadge status={booking.slot.status} kind="slot" />
            </InfoRow>
            <InfoRow label="Biaya admin">{formatRupiah(nominal)}</InfoRow>
            <InfoRow label="Metode pembayaran">
              {payment ? PAYMENT_METHOD_LABEL[payment.method] : "-"}
            </InfoRow>
            <InfoRow label="Status pembayaran">
              {payment ? <StatusBadge status={payment.status} kind="payment" /> : "-"}
            </InfoRow>
            {booking.notes ? <InfoRow label="Catatan penyewa">{booking.notes}</InfoRow> : null}
          </dl>
        </CardContent>
      </Card>

      {/* ---------- Detail penyewa ---------- */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Data Penyewa</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Nama">{booking.tenant.name}</InfoRow>
            <InfoRow label="Jenis tenant">{TENANT_TYPE_LABEL[booking.tenant.tenant_type]}</InfoRow>
            <InfoRow label="Nomor HP">{booking.tenant.phone ?? "-"}</InfoRow>
            <InfoRow label="Email">{booking.tenant.email ?? "-"}</InfoRow>
            {detailTenant.map(([label, nilai]) => (
              <InfoRow key={label} label={label}>
                {nilai}
              </InfoRow>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* ---------- Bukti transfer ---------- */}
      {payment?.proof_url ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Bukti Transfer</CardTitle>
            <CardDescription>Gambar yang Anda unggah untuk diverifikasi panitia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* <img> biasa (bukan next/image): URL Storage bisa berasal dari host Supabase
                lokal maupun cloud, jadi tidak selalu cocok dengan remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={payment.proof_url}
              alt="Bukti transfer biaya admin"
              referrerPolicy="no-referrer"
              className="max-h-96 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
            />
            <a
              href={payment.proof_url}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonClass("secondary", "sm")}
            >
              Buka gambar di tab baru
            </a>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Aksi ---------- */}
      <div className="mt-6 space-y-3">
        {booking.status === "pending_payment" ? (
          <CancelBookingForm bookingId={booking.id} />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href="/#denah" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
          {dibatalkan ? (
            <Link href="/#denah" className={buttonClass("primary", "md")}>
              Pesan slot lain
            </Link>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          Ada kendala? Hubungi {EVENT_INFO.organizer} di {EVENT_INFO.contact} dan sebutkan kode
          booking {booking.booking_code}.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bagian kecil                                                        */
/* ------------------------------------------------------------------ */

type BarisLinimasaProps = {
  judul: string;
  waktu: string | null;
  selesai: boolean;
  gagal?: boolean;
  keterangan?: ReactNode;
  terakhir?: boolean;
};

function BarisLinimasa({
  judul,
  waktu,
  selesai,
  gagal = false,
  keterangan,
  terakhir = false,
}: BarisLinimasaProps) {
  const warnaTitik = gagal
    ? "border-red-600 bg-red-600 text-white"
    : selesai
      ? "border-green-600 bg-green-600 text-white"
      : "border-slate-300 bg-white text-slate-400";

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${warnaTitik}`}
          aria-hidden="true"
        >
          {gagal ? "!" : selesai ? "✓" : ""}
        </span>
        {!terakhir ? (
          <span
            className={`mt-1 w-px flex-1 ${selesai ? "bg-green-300" : "bg-slate-200"}`}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className={terakhir ? "pb-0" : "pb-4"}>
        <p className="text-sm font-medium text-slate-900">{judul}</p>
        <p className="text-xs text-slate-500">{waktu ? formatTanggalWaktu(waktu) : "Belum ada"}</p>
        {keterangan ? <p className="mt-0.5 text-xs text-slate-600">{keterangan}</p> : null}
      </div>
    </li>
  );
}

/** Ubah tenants.detail (jsonb) jadi daftar baris "Label — nilai" yang siap ditampilkan. */
function daftarDetail(detail: Json): Array<[string, string]> {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return [];

  const hasil: Array<[string, string]> = [];
  for (const [kunci, nilai] of Object.entries(detail)) {
    if (nilai === null || nilai === undefined) continue;
    if (typeof nilai === "object") continue;
    const teks = String(nilai).trim();
    if (teks.length === 0) continue;
    hasil.push([labelKunci(kunci), teks]);
  }
  return hasil;
}

/** "kategori_produk" -> "Kategori produk" */
function labelKunci(kunci: string): string {
  const teks = kunci.replace(/[_-]+/g, " ").trim();
  if (teks.length === 0) return kunci;
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}
