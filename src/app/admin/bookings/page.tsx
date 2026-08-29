import type { Metadata } from "next";
import Link from "next/link";

import { AdminCancelBookingForm } from "@/components/admin/AdminCancelBookingForm";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { BookingDateChips } from "@/components/admin/BookingDateChips";
import { ExportCsvButton, type ExportCsvRow } from "@/components/admin/ExportCsvButton";
import { KatalogToggle } from "@/components/admin/KatalogToggle";
import { PaymentVerifyForm } from "@/components/admin/PaymentVerifyForm";
import { ProofThumb } from "@/components/admin/ProofThumb";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { slotAdminFee } from "@/lib/domain/harga";
import {
  BOOKING_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/domain/labels";
import { requireAdmin } from "@/lib/services/auth";
import { listBookings } from "@/lib/services/admin";
import { resolveProofUrl } from "@/lib/storage";
import type { BookingDetail, BookingStatus, PaymentStatus } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

// Data booking dibaca langsung dari database, jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pemesanan & Pembayaran",
  description: "Daftar booking slot dan verifikasi bukti pembayaran biaya admin.",
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParamsRecord> };

const PAYMENT_STATUSES: readonly PaymentStatus[] = ["unpaid", "submitted", "verified", "rejected"];
const BOOKING_STATUSES: readonly BookingStatus[] = ["pending_payment", "confirmed", "cancelled"];

/** Ambil satu nilai teks dari searchParams (abaikan bentuk array). */
function satuNilai(sp: SearchParamsRecord, key: string): string {
  const value = sp[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function asPaymentStatus(value: string): PaymentStatus | undefined {
  return PAYMENT_STATUSES.find((status) => status === value);
}

function asBookingStatus(value: string): BookingStatus | undefined {
  return BOOKING_STATUSES.find((status) => status === value);
}

type FilterAktif = { bayar: string; status: string; q: string };

/** Bangun tautan filter sambil mempertahankan filter lain yang sedang aktif. */
function hrefFilter(aktif: FilterAktif, perubahan: Partial<FilterAktif>): string {
  const gabungan: FilterAktif = { ...aktif, ...perubahan };
  const params = new URLSearchParams();
  if (gabungan.bayar) params.set("bayar", gabungan.bayar);
  if (gabungan.status) params.set("status", gabungan.status);
  if (gabungan.q) params.set("q", gabungan.q);
  const query = params.toString();
  return query.length > 0 ? `/admin/bookings?${query}` : "/admin/bookings";
}

/** Satu baris tab filter berbentuk <Link>. */
function TabFilter({
  judul,
  paramKey,
  opsi,
  aktif,
}: {
  judul: string;
  paramKey: "bayar" | "status";
  opsi: Array<{ value: string; label: string }>;
  aktif: FilterAktif;
}) {
  const nilaiAktif = paramKey === "bayar" ? aktif.bayar : aktif.status;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-subtle">{judul}</span>
      {opsi.map((item) => {
        const dipilih = item.value === nilaiAktif;
        const perubahan: Partial<FilterAktif> =
          paramKey === "bayar" ? { bayar: item.value } : { status: item.value };
        return (
          <Link
            key={`${paramKey}-${item.value || "semua"}`}
            href={hrefFilter(aktif, perubahan)}
            aria-current={dipilih ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-3.5 text-xs transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] md:h-8",
              dipilih
                ? "border-accent bg-accent font-semibold text-[#0a0a0a]"
                : "border-line bg-card font-medium text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

const KOLOM = [
  "Kode Booking",
  "Slot & Zona",
  "Tanggal Sewa",
  "Tenant",
  "Metode",
  "Nominal",
  "Status Bayar",
  "Status Booking",
  "Bukti",
  "Aksi",
];

/** Booking yang buktinya menunggu verifikasi harus tampil paling atas. */
function menungguVerifikasiDulu(a: BookingDetail, b: BookingDetail): number {
  const bobot = (row: BookingDetail): number => (row.payment?.status === "submitted" ? 0 : 1);
  return bobot(a) - bobot(b); // sort stabil: urutan terbaru terjaga di tiap kelompok
}

/**
 * Tagihan booking (model per tanggal): pakai amount tagihan yang sudah terbit;
 * kalau belum ada, taksir dari tarif zona × jumlah tanggal sewa.
 */
function nominalBooking(booking: BookingDetail): number {
  return (
    booking.payment?.amount ??
    slotAdminFee(booking.slot, booking.slot.zone) * Math.max(1, booking.dates.length)
  );
}

/** Baris CSV ekspor: satu baris per booking, tanggal digabung ";". */
function susunBarisCsv(bookings: BookingDetail[]): ExportCsvRow[] {
  return bookings.map((booking) => ({
    kode: booking.booking_code,
    tenant: booking.tenant.name,
    phone: booking.tenant.phone ?? "",
    zona: booking.slot.zone.name,
    slot: slotDisplayName(booking.slot),
    tanggal: booking.dates.join(";"),
    metode: booking.payment ? PAYMENT_METHOD_LABEL[booking.payment.method] : "",
    nominal: nominalBooking(booking),
    status_bayar: booking.payment ? PAYMENT_STATUS_LABEL[booking.payment.status] : "",
    status_booking: BOOKING_STATUS_LABEL[booking.status],
    created_at: booking.created_at,
  }));
}

export default async function AdminBookingsPage({ searchParams }: PageProps) {
  await requireAdmin();

  const sp = await searchParams;
  // "payment" = alias dari nav admin (pintasan Pembayaran); "bayar" = filter lama.
  const bayarParam = satuNilai(sp, "payment") || satuNilai(sp, "bayar");
  const statusParam = satuNilai(sp, "status");
  const qParam = satuNilai(sp, "q").trim();

  const paymentStatus = asPaymentStatus(bayarParam);
  const bookingStatus = asBookingStatus(statusParam);

  // Nilai tak dikenal dianggap "semua" supaya tab tetap konsisten dengan hasilnya.
  const aktif: FilterAktif = {
    bayar: paymentStatus ?? "",
    status: bookingStatus ?? "",
    q: qParam,
  };

  const result = await listBookings({
    status: bookingStatus,
    paymentStatus,
    q: qParam.length > 0 ? qParam : undefined,
  });

  const opsiBayar = [
    { value: "", label: "Semua" },
    ...PAYMENT_STATUSES.map((status) => ({ value: status, label: PAYMENT_STATUS_LABEL[status] })),
  ];
  const opsiBooking = [
    { value: "", label: "Semua" },
    ...BOOKING_STATUSES.map((status) => ({ value: status, label: BOOKING_STATUS_LABEL[status] })),
  ];

  const bookings = result.ok ? [...result.data].sort(menungguVerifikasiDulu) : [];
  const menungguVerifikasi = bookings.filter((row) => row.payment?.status === "submitted").length;

  // Bucket bukti-transfer kini PRIVATE: URL tersimpan ditukar signed URL
  // (berumur 1 jam) sebelum dirender — lihat lib/storage.ts.
  const buktiUrl = new Map<string, string | null>(
    await Promise.all(
      bookings.map(async (row): Promise<[string, string | null]> => [
        row.id,
        await resolveProofUrl(row.payment?.proof_url ?? null),
      ]),
    ),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Pemesanan</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Kelola booking slot per tanggal dan verifikasi bukti pembayaran — bukti yang menunggu
            selalu tampil paling atas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton
            filename="drive-tech-bookings.csv"
            rows={susunBarisCsv(bookings)}
            label="Ekspor CSV"
          />
          <AutoRefresh />
        </div>
      </header>

      {!result.ok ? (
        <Alert tone="error" title="Data booking belum bisa dimuat">
          {result.error}
        </Alert>
      ) : null}

      {/* Filter — tanpa kartu berbingkai, cukup spacing */}
      <div className="space-y-2.5">
        <TabFilter judul="Status bayar" paramKey="bayar" opsi={opsiBayar} aktif={aktif} />
        <TabFilter judul="Status booking" paramKey="status" opsi={opsiBooking} aktif={aktif} />

        <form action="/admin/bookings" method="get" className="flex flex-wrap items-center gap-2">
          {aktif.bayar ? <input type="hidden" name="bayar" value={aktif.bayar} /> : null}
          {aktif.status ? <input type="hidden" name="status" value={aktif.status} /> : null}
          <Input
            type="search"
            name="q"
            defaultValue={aktif.q}
            placeholder="Cari kode, tenant, atau nomor HP…"
            aria-label="Kata kunci pencarian booking"
            className="max-w-xs"
          />
          <SubmitButton size="sm" variant="secondary" pendingText="Mencari…">
            Cari
          </SubmitButton>
          {aktif.q ? (
            <Link
              href={hrefFilter(aktif, { q: "" })}
              className="text-xs font-medium text-muted underline underline-offset-2 hover:text-ink"
            >
              Bersihkan
            </Link>
          ) : null}
        </form>

        <p className="text-xs text-muted">
          {bookings.length} booking
          {menungguVerifikasi > 0 ? (
            <>
              {" · "}
              <strong className="font-semibold text-warn">{menungguVerifikasi} menunggu verifikasi</strong>
            </>
          ) : null}
        </p>
      </div>

      {result.ok && bookings.length === 0 ? (
        <EmptyState
          title="Belum ada booking"
          description="Tidak ada booking yang cocok dengan filter ini."
        />
      ) : null}

      {/* ---------- Layar < md: kartu ringkas per booking ---------- */}
      {bookings.length > 0 ? (
        <ul className="space-y-3 md:hidden">
          {bookings.map((booking) => {
            const payment = booking.payment;
            const submitted = payment?.status === "submitted";
            const nominal = nominalBooking(booking);

            return (
              <li
                key={booking.id}
                className={cn(
                  "rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-sm)]",
                  submitted ? "border-l-[3px] border-warn/60 border-l-warn bg-warn-soft" : "border-line",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold text-ink">{booking.booking_code}</p>
                  {payment ? (
                    <StatusBadge status={payment.status} kind="payment" />
                  ) : (
                    <span className="text-xs text-subtle">Belum ada pembayaran</span>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium text-ink">{booking.tenant.name}</p>
                <p className="text-xs text-muted">
                  {slotDisplayName(booking.slot)} · {booking.slot.zone.name}
                </p>
                <div className="mt-1.5">
                  <BookingDateChips dates={booking.dates} />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="tabular text-sm font-semibold text-ink">{formatRupiah(nominal)}</p>
                  <StatusBadge status={booking.status} kind="booking" />
                </div>

                {payment?.status === "rejected" && payment.reject_reason ? (
                  <p className="mt-1.5 text-xs text-danger">{payment.reject_reason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-start justify-between gap-2 border-t border-line/70 pt-3">
                  <ProofThumb
                    url={buktiUrl.get(booking.id) ?? null}
                    alt={`Bukti transfer ${booking.booking_code}`}
                  />
                  <PaymentVerifyForm
                    paymentId={payment?.id ?? null}
                    paymentStatus={payment?.status ?? null}
                    bookingStatus={booking.status}
                    bookingCode={booking.booking_code}
                  />
                </div>
                <div className="mt-2">
                  <AdminCancelBookingForm
                    bookingId={booking.id}
                    bookingStatus={booking.status}
                    bookingCode={booking.booking_code}
                  />
                </div>
                <KatalogToggle listing={booking.listing} className="mt-2" />
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* ---------- Layar >= md: tabel lengkap ---------- */}
      {bookings.length > 0 ? (
        <Card className="hidden md:block">
          <div className="overflow-x-auto rounded-[var(--radius)]">
            <table className="w-full min-w-[76rem] border-collapse text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                <tr>
                  {KOLOM.map((kolom) => (
                    <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      {kolom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bookings.map((booking) => {
                  const payment = booking.payment;
                  const submitted = payment?.status === "submitted";
                  const nominal = nominalBooking(booking);

                  return (
                    <tr
                      key={booking.id}
                      className={cn(
                        "align-top",
                        submitted
                          ? "bg-warn-soft shadow-[inset_3px_0_0_var(--warn)]"
                          : "hover:bg-surface-2",
                      )}
                    >
                      <td className="px-3 py-3">
                        <p className="font-mono text-xs font-semibold text-ink">
                          {booking.booking_code}
                        </p>
                        <p className="mt-0.5 text-xs text-subtle">
                          {formatTanggalWaktu(booking.created_at)}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-medium text-ink">{slotDisplayName(booking.slot)}</p>
                        <p className="text-xs text-muted">{booking.slot.zone.name}</p>
                        <KatalogToggle listing={booking.listing} className="mt-2" />
                      </td>

                      <td className="max-w-[13rem] px-3 py-3">
                        <BookingDateChips dates={booking.dates} />
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-medium text-ink">{booking.tenant.name}</p>
                        <p className="text-xs text-muted">{booking.tenant.phone ?? "—"}</p>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-muted">
                        {payment ? PAYMENT_METHOD_LABEL[payment.method] : "—"}
                      </td>

                      <td className="tabular whitespace-nowrap px-3 py-3 font-medium text-ink">
                        {formatRupiah(nominal)}
                      </td>

                      <td className="px-3 py-3">
                        {payment ? (
                          <StatusBadge status={payment.status} kind="payment" />
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                        {payment?.status === "rejected" && payment.reject_reason ? (
                          <p className="mt-1 max-w-[14rem] text-xs text-danger">
                            {payment.reject_reason}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-3 py-3">
                        <StatusBadge status={booking.status} kind="booking" />
                      </td>

                      <td className="px-3 py-3">
                        <ProofThumb
                          url={buktiUrl.get(booking.id) ?? null}
                          alt={`Bukti transfer ${booking.booking_code}`}
                        />
                      </td>

                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <PaymentVerifyForm
                            paymentId={payment?.id ?? null}
                            paymentStatus={payment?.status ?? null}
                            bookingStatus={booking.status}
                            bookingCode={booking.booking_code}
                          />
                          <AdminCancelBookingForm
                            bookingId={booking.id}
                            bookingStatus={booking.status}
                            bookingCode={booking.booking_code}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
