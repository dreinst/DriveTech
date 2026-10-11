import type { Metadata } from "next";
import Link from "next/link";

import { FormAksi } from "@/components/admin/FormAksi";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setHadirAction } from "@/lib/actions/alat";
import { requireAdmin } from "@/lib/services/auth";
import { cariRegUlang, hitungHadirHariIni, MAKS_HASIL_REGULANG } from "@/lib/services/regulang";
import { formatTanggal, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registrasi Ulang",
  description: "Tandai penyewa yang hadir di lokasi pada hari gelaran.",
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function AdminRegUlangPage({ searchParams }: Props) {
  await requireAdmin();
  const { q: qMentah } = await searchParams;
  const q = (Array.isArray(qMentah) ? qMentah[0] : qMentah)?.trim() ?? "";
  const [hitungan, hasil] = await Promise.all([hitungHadirHariIni(), cariRegUlang(q)]);
  const hariIni = hitungan.ok ? hitungan.data.tanggal : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Registrasi Ulang</h1>
        {hitungan.ok ? (
          <p className="text-sm leading-relaxed text-muted sm:text-base">
            <span className="tabular text-2xl font-bold text-accent">{hitungan.data.hadir}</span> dari{" "}
            <span className="tabular font-semibold text-ink">{hitungan.data.total}</span> lapak
            terkonfirmasi sudah hadir hari ini, {formatTanggal(hitungan.data.tanggal)}.
          </p>
        ) : (
          <p className="text-sm text-danger">{hitungan.error}</p>
        )}
      </header>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="cari-regulang" className="sr-only">
          Cari booking
        </label>
        <Input
          id="cari-regulang"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Kode booking, nama, atau nomor HP"
          autoComplete="off"
          className="min-w-0 flex-1"
          required
        />
        <button type="submit" className={buttonClass("primary", "md")}>
          Cari
        </button>
      </form>

      {!hasil.ok ? (
        <Alert tone="error" title="Booking belum bisa dicari">
          {hasil.error}
        </Alert>
      ) : q.length === 0 ? (
        <p className="text-sm text-muted">
          Ketik kode booking, nama, atau nomor HP penyewa. Memindai QR di halaman status penyewa
          juga membuka halaman ini dengan kode yang sudah terisi.
        </p>
      ) : hasil.data.bookings.length === 0 ? (
        <EmptyState title="Booking tidak ditemukan" description="Periksa lagi kode, nama, atau nomor HP yang diketik." />
      ) : (
        <>
          {hasil.data.jumlahCocok > MAKS_HASIL_REGULANG ? (
            <Alert tone="info" title={`${hasil.data.jumlahCocok} booking cocok`}>
              Yang tampil hanya {MAKS_HASIL_REGULANG} teratas. Ketik kode booking lengkap supaya
              langsung ketemu.
            </Alert>
          ) : null}
          <ul className="space-y-4">
            {hasil.data.bookings.map((booking) => (
              <li key={booking.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-ink">{booking.booking_code}</p>
                      <p className="mt-1 text-base font-semibold text-ink">{booking.tenant.name}</p>
                      <p className="text-sm text-muted">
                        {booking.tenant.phone ?? "tanpa nomor"} · {booking.slot.zone.name},{" "}
                        {slotDisplayName(booking.slot)}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} kind="booking" />
                  </div>

                  {booking.status !== "confirmed" ? (
                    <p className="px-5 py-4 text-sm text-muted">
                      {booking.status === "cancelled"
                        ? "Booking ini sudah dibatalkan, jadi tidak bisa ditandai hadir."
                        : "Pembayaran booking ini belum diverifikasi, jadi belum bisa ditandai hadir. "}
                      {booking.status === "pending_payment" ? (
                        <Link
                          href={`/drivetechadmin/bookings?q=${booking.booking_code}`}
                          className="font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Periksa pembayarannya
                        </Link>
                      ) : null}
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {booking.dates.map((tanggal) => {
                        const sudah = hasil.data.hadir.has(`${booking.id}|${tanggal}`);
                        return (
                          <li
                            key={tanggal}
                            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">{formatTanggal(tanggal)}</span>
                              {tanggal === hariIni ? <Badge tone="blue">Hari ini</Badge> : null}
                              {sudah ? (
                                <Badge tone="green" dot>
                                  Hadir
                                </Badge>
                              ) : null}
                            </div>
                            <FormAksi
                              action={setHadirAction}
                              className="flex flex-col items-end gap-1"
                              konfirmasi={
                                sudah
                                  ? `Batalkan tanda hadir ${booking.booking_code} untuk ${formatTanggal(tanggal)}?`
                                  : undefined
                              }
                            >
                              <input type="hidden" name="bookingId" value={booking.id} />
                              <input type="hidden" name="tanggal" value={tanggal} />
                              <input type="hidden" name="hadir" value={sudah ? "0" : "1"} />
                              <SubmitButton
                                variant={sudah ? "ghost" : "primary"}
                                size={sudah ? "sm" : "md"}
                                pendingText="Menyimpan…"
                              >
                                {sudah ? "Batalkan" : "Tandai hadir"}
                              </SubmitButton>
                            </FormAksi>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
