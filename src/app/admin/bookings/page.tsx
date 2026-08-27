import type { Metadata } from "next";
import Link from "next/link";

import { PaymentVerifyForm } from "@/components/admin/PaymentVerifyForm";
import { ProofThumb } from "@/components/admin/ProofThumb";
import { Alert } from "@/components/ui/Alert";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  BOOKING_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  ZONE_TYPE_LABEL,
} from "@/lib/domain/labels";
import { requireAdmin } from "@/lib/services/auth";
import { listBookings } from "@/lib/services/admin";
import type { BookingStatus, PaymentStatus } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

// Data booking dibaca langsung dari database, jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verifikasi Pembayaran",
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
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">{judul}</span>
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
              "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
              dipilih
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
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
  "Tenant",
  "Metode",
  "Nominal",
  "Status Bayar",
  "Status Booking",
  "Bukti",
  "Aksi",
];

export default async function AdminBookingsPage({ searchParams }: PageProps) {
  await requireAdmin();

  const sp = await searchParams;
  const bayarParam = satuNilai(sp, "bayar");
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

  const bookings = result.ok ? result.data : [];
  const menungguVerifikasi = bookings.filter((row) => row.payment?.status === "submitted").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Verifikasi Pembayaran"
        description="Periksa bukti pembayaran biaya admin, lalu verifikasi atau tolak dengan alasan."
        backHref="/admin"
        backLabel="Kembali ke dasbor"
      />

      {!result.ok ? (
        <Alert tone="error" title="Data booking belum bisa dimuat">
          {result.error}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="space-y-3">
          <TabFilter judul="Status bayar" paramKey="bayar" opsi={opsiBayar} aktif={aktif} />
          <TabFilter judul="Status booking" paramKey="status" opsi={opsiBooking} aktif={aktif} />

          <form action="/admin/bookings" method="get" className="flex flex-wrap items-center gap-2">
            {aktif.bayar ? <input type="hidden" name="bayar" value={aktif.bayar} /> : null}
            {aktif.status ? <input type="hidden" name="status" value={aktif.status} /> : null}
            <Input
              type="search"
              name="q"
              defaultValue={aktif.q}
              placeholder="Cari kode booking, nama tenant, atau nomor HP…"
              aria-label="Kata kunci pencarian booking"
              className="h-9 max-w-xs"
            />
            <SubmitButton size="sm" variant="secondary" pendingText="Mencari…">
              Cari
            </SubmitButton>
            {aktif.q ? (
              <Link
                href={hrefFilter(aktif, { q: "" })}
                className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
              >
                Bersihkan pencarian
              </Link>
            ) : null}
          </form>

          <p className="text-xs text-slate-500">
            Menampilkan <strong className="font-semibold text-slate-900">{bookings.length}</strong> booking
            {menungguVerifikasi > 0 ? (
              <>
                {" · "}
                <strong className="font-semibold text-amber-700">{menungguVerifikasi}</strong> menunggu
                verifikasi
              </>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {result.ok && bookings.length === 0 ? (
        <EmptyState
          title="Belum ada booking"
          description="Belum ada booking yang cocok dengan filter ini. Coba pilih filter lain atau bersihkan pencarian."
        />
      ) : null}

      {bookings.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {KOLOM.map((kolom) => (
                    <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      {kolom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((booking) => {
                  const payment = booking.payment;
                  const nominal = payment?.amount ?? booking.slot.zone.admin_fee;

                  return (
                    <tr key={booking.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {booking.booking_code}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatTanggalWaktu(booking.created_at)}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{slotDisplayName(booking.slot)}</p>
                        <p className="text-xs text-slate-500">{booking.slot.zone.name}</p>
                        <p className="text-xs text-slate-400">
                          {ZONE_TYPE_LABEL[booking.slot.zone.zone_type]}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{booking.tenant.name}</p>
                        <p className="text-xs text-slate-500">{booking.tenant.phone ?? "—"}</p>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                        {payment ? PAYMENT_METHOD_LABEL[payment.method] : "—"}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                        {formatRupiah(nominal)}
                      </td>

                      <td className="px-3 py-3">
                        {payment ? (
                          <StatusBadge status={payment.status} kind="payment" />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {payment?.status === "rejected" && payment.reject_reason ? (
                          <p className="mt-1 max-w-[14rem] text-xs text-red-600">
                            {payment.reject_reason}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-3 py-3">
                        <StatusBadge status={booking.status} kind="booking" />
                      </td>

                      <td className="px-3 py-3">
                        <ProofThumb
                          url={payment?.proof_url ?? null}
                          alt={`Bukti transfer ${booking.booking_code}`}
                        />
                      </td>

                      <td className="px-3 py-3">
                        <PaymentVerifyForm
                          paymentId={payment?.id ?? null}
                          paymentStatus={payment?.status ?? null}
                          bookingStatus={booking.status}
                          bookingCode={booking.booking_code}
                        />
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
