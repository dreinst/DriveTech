import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CancelBookingForm } from "@/app/booking/_components/CancelBookingForm";
import { CopyButton } from "@/app/booking/_components/CopyButton";
import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { InfoRow, TanggalChips } from "@/app/booking/_components/Ringkasan";
import { VerifikasiQr } from "@/app/booking/_components/VerifikasiQr";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import {
  EVENT_INFO,
  PAYMENT_DEADLINE_HOURS,
  WA_BANTUAN_TEXT,
  waHref,
} from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { hitungTotalBiaya } from "@/lib/domain/ketersediaan";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/labels";
import { batasPembayaran } from "@/lib/domain/tenggat";
import { getBookingDetail } from "@/lib/services/booking";
import { resolveProofUrl } from "@/lib/storage";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* Segmen [slotId] di sini berisi ID BOOKING — lihat catatan rute di ../page.tsx. */
type PageProps = { params: Promise<{ slotId: string }> };

const INVALID_UUID = "22P02";

/** Container standar halaman alur booking — skala rapat. */
const WRAP = "mx-auto w-full max-w-3xl px-4 py-6 sm:px-6";

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
      <div className={WRAP}>
        <PageHeader title="Status Booking" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data booking belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const booking = result.data;
  const payment = booking.payment;
  // Tenggat bayar (cermin expire_unpaid_bookings di DB) — null bila tidak relevan.
  const tenggat = batasPembayaran(booking, payment);
  // Bucket bukti-transfer private: tukar URL tersimpan jadi signed URL (1 jam).
  const buktiUrl = await resolveProofUrl(payment?.proof_url ?? null);
  const dibatalkan = booking.status === "cancelled";
  // QR verifikasi panitia baru berguna setelah ada bukti yang dikirim
  // (submitted) atau sudah sah (verified); booking batal tidak perlu.
  const tampilkanQr =
    !dibatalkan && (payment?.status === "submitted" || payment?.status === "verified");
  const terkonfirmasi = booking.status === "confirmed";
  const ditolak = payment?.status === "rejected";
  const bisaBayar = (ditolak || payment?.status === "unpaid" || !payment) && !dibatalkan;
  // payment.amount sudah = biaya per tanggal x jumlah tanggal (dihitung createBooking).
  const nominal =
    payment?.amount ??
    hitungTotalBiaya(
      slotAdminFee(booking.slot, booking.slot.zone),
      Math.max(booking.dates.length, 1),
    );

  return (
    <div className={WRAP}>
      <PageHeader title="Konfirmasi Booking" backHref="/" backLabel="Kembali ke denah" />

      <Stepper steps={[...LANGKAH_BOOKING]} current={3} />

      <div className="anim-fade-up space-y-4">
        {/* ---------- Keadaan saat ini ---------- */}
        {dibatalkan ? (
          <Alert tone="error" title="Booking dibatalkan">
            Tanggal sewa <strong>{slotDisplayName(booking.slot)}</strong> sudah dilepas dan bisa
            dipesan orang lain. Booking yang tidak dibayar dalam {PAYMENT_DEADLINE_HOURS} jam
            dibatalkan otomatis oleh sistem — silakan pesan ulang bila masih berminat.
          </Alert>
        ) : terkonfirmasi ? (
          <Alert tone="success" title="Booking terkonfirmasi">
            Slot <strong>{slotDisplayName(booking.slot)}</strong> resmi milik Anda — tunjukkan kode
            booking saat registrasi ulang di lokasi.
          </Alert>
        ) : ditolak ? (
          <Alert tone="error" title="Bukti pembayaran ditolak">
            {payment?.reject_reason
              ? `Alasan panitia: ${payment.reject_reason}.`
              : "Panitia belum mencantumkan alasan penolakan."}{" "}
            Kirim ulang bukti yang benar agar slot tidak hangus
            {tenggat ? (
              <>
                {" "}
                — paling lambat <strong>{formatTanggalWaktu(tenggat)} WIB</strong>
              </>
            ) : null}
            .
          </Alert>
        ) : payment?.status === "submitted" ? (
          <Alert tone="info" title="Menunggu verifikasi panitia">
            Bukti pembayaran Anda sedang diperiksa panitia.
          </Alert>
        ) : (
          <Alert tone="warning" title="Pembayaran belum dikirim">
            Selesaikan pembayaran biaya admin {formatRupiah(nominal)}
            {tenggat ? (
              <>
                {" "}
                sebelum <strong>{formatTanggalWaktu(tenggat)} WIB</strong>
              </>
            ) : null}{" "}
            — lewat dari itu booking dibatalkan otomatis dan tanggalnya dilepas.
          </Alert>
        )}

        {/* ---------- Ringkasan booking (satu kartu padat) ---------- */}
        <Card className="shadow-[var(--shadow-md)]">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
                  Kode booking
                </p>
                <p className="tabular mt-0.5 font-mono text-2xl font-bold tracking-widest text-ink sm:text-3xl">
                  {booking.booking_code}
                </p>
              </div>
              <CopyButton value={booking.booking_code} />
            </div>

            <dl className="grid border-t border-line pt-2 gap-x-8 sm:grid-cols-2">
              <InfoRow label="Status booking">
                <StatusBadge status={booking.status} kind="booking" />
              </InfoRow>
              <InfoRow label="Status pembayaran">
                {payment ? <StatusBadge status={payment.status} kind="payment" /> : "-"}
              </InfoRow>
              <InfoRow label="Slot">{slotDisplayName(booking.slot)}</InfoRow>
              <InfoRow label="Zona">
                {booking.slot.zone.name}
                {booking.slot.peruntukan ? ` · ${booking.slot.peruntukan}` : ""}
              </InfoRow>
              <InfoRow label="Tanggal sewa">
                <TanggalChips dates={booking.dates} className="justify-end" />
              </InfoRow>
              <InfoRow
                label={
                  booking.dates.length > 0
                    ? `Biaya admin (${booking.dates.length} tanggal)`
                    : "Biaya admin"
                }
              >
                <span className="tabular font-semibold">{formatRupiah(nominal)}</span>
              </InfoRow>
              <InfoRow label="Penyewa">{booking.tenant.name}</InfoRow>
              <InfoRow label="Kontak">{booking.tenant.phone ?? "-"}</InfoRow>
              {payment ? (
                <InfoRow label="Metode pembayaran">{PAYMENT_METHOD_LABEL[payment.method]}</InfoRow>
              ) : null}
              {payment?.submitted_at ? (
                <InfoRow label="Bukti dikirim">{formatTanggalWaktu(payment.submitted_at)} WIB</InfoRow>
              ) : null}
              {buktiUrl ? (
                <InfoRow label="Bukti pembayaran">
                  <a
                    href={buktiUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Buka bukti pembayaran di tab baru"
                    className="group inline-flex items-center gap-2"
                  >
                    {/* <img> biasa (bukan next/image): URL Storage bisa berasal dari host
                        Supabase lokal maupun cloud, jadi tidak selalu cocok dengan remotePatterns. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={buktiUrl}
                      alt="Bukti pembayaran biaya admin"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-12 w-12 rounded-[var(--radius-sm)] border border-line bg-surface-2 object-cover"
                    />
                    <span className="text-xs font-medium text-muted underline-offset-2 group-hover:underline">
                      Buka
                    </span>
                  </a>
                </InfoRow>
              ) : null}
              {booking.notes ? (
                <div className="sm:col-span-2">
                  <InfoRow label="Catatan">{booking.notes}</InfoRow>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        {/* ---------- QR verifikasi untuk panitia (setelah bukti dikirim) ---------- */}
        {tampilkanQr ? (
          <VerifikasiQr bookingCode={booking.booking_code} bookingId={booking.id} />
        ) : null}

        {/* ---------- Linimasa ---------- */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold text-ink">Linimasa</h2>
            <ol>
              <BarisLinimasa
                judul="Booking dibuat"
                waktu={booking.created_at}
                selesai
                keterangan={`${slotDisplayName(booking.slot)} dikunci atas nama ${booking.tenant.name}.`}
              />
              <BarisLinimasa
                judul="Konfirmasi pembayaran dikirim"
                waktu={payment?.submitted_at ?? null}
                selesai={Boolean(payment?.submitted_at)}
                keterangan={
                  payment?.submitted_at
                    ? `${PAYMENT_METHOD_LABEL[payment.method]}, ${formatRupiah(payment.amount)}.`
                    : "Belum ada konfirmasi pembayaran."
                }
              />
              <BarisLinimasa
                judul={ditolak ? "Pembayaran ditolak panitia" : "Diverifikasi panitia"}
                waktu={payment?.verified_at ?? null}
                selesai={payment?.status === "verified"}
                gagal={ditolak}
                keterangan={
                  payment?.status === "verified" ? (
                    "Pembayaran sah. Slot resmi terisi."
                  ) : ditolak ? (
                    <span className="inline-block rounded-[var(--radius-sm)] bg-danger-soft px-2.5 py-1 font-medium text-danger">
                      {payment?.reject_reason ?? "Bukti pembayaran tidak sesuai."}
                    </span>
                  ) : (
                    "Menunggu pemeriksaan panitia."
                  )
                }
                terakhir
              />
            </ol>
          </CardContent>
        </Card>

        {/* ---------- Aksi: satu baris tombol ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          {bisaBayar ? (
            <Link
              href={`/booking/${booking.id}/bayar`}
              className={buttonClass(ditolak ? "accent" : "primary", "md")}
            >
              {ditolak ? "Kirim Ulang Bukti Pembayaran" : "Lanjutkan Pembayaran"}
            </Link>
          ) : null}
          {dibatalkan ? (
            <Link href="/#denah" className={buttonClass("primary", "md")}>
              Pesan slot lain
            </Link>
          ) : null}
          <Link href="/#denah" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
          {booking.status === "pending_payment" ? (
            <CancelBookingForm bookingId={booking.id} />
          ) : null}
        </div>

        <p className="text-xs text-subtle">
          {booking.tenant.email
            ? `Kode booking dan setiap perubahan status dikirim ke email ${booking.tenant.email}. `
            : ""}
          Ada kendala atau bingung dengan kode booking? Hubungi {EVENT_INFO.organizer} lewat WhatsApp{" "}
          {EVENT_INFO.contacts.map((kontak, index) => (
            <span key={kontak.phone}>
              {index > 0 ? " / " : ""}
              <a
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
            </span>
          ))}{" "}
          sambil menyebut kode {booking.booking_code}.
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
    ? "border-danger bg-danger text-white"
    : selesai
      ? "border-ok bg-ok text-white"
      : "border-line-strong bg-card text-subtle";

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
            className={`mt-1 w-px flex-1 ${selesai ? "bg-ok/40" : "bg-line"}`}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className={terakhir ? "pb-0" : "pb-3"}>
        <p className="text-sm font-medium text-ink">{judul}</p>
        <p className="text-xs text-subtle">{waktu ? formatTanggalWaktu(waktu) : "Belum ada"}</p>
        {keterangan ? <p className="mt-0.5 text-xs text-muted">{keterangan}</p> : null}
      </div>
    </li>
  );
}
