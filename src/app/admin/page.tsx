import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ringkasTanggal } from "@/components/admin/BookingDateChips";
import { StatCard } from "@/components/admin/StatCard";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EVENT_INFO } from "@/lib/domain/constants";
import { getDashboardStats, listBookings, type ZoneSlotStat } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { BookingDetail } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggal, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Ringkasan ketersediaan slot, pembayaran, dan pengajuan leasing.",
};

/* ---------- Ikon kartu statistik (inline, tanpa dependency) ---------- */

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function IconUang() {
  return (
    <svg {...ICON}>
      <rect x="2" y="5" width="16" height="10" rx="2" />
      <circle cx="10" cy="10" r="2.2" />
      <path d="M5 7.5h.01M15 12.5h.01" />
    </svg>
  );
}

function IconOkupansi() {
  return (
    <svg {...ICON}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 2.5V10l5.3 5.3" />
    </svg>
  );
}

function IconTertunda() {
  return (
    <svg {...ICON}>
      <rect x="4" y="3" width="12" height="14" rx="2" />
      <path d="M8 3.5V2.5h4v1" />
      <circle cx="12.5" cy="12.5" r="3.4" />
      <path d="M12.5 10.8v1.7l1.2 1.2" />
    </svg>
  );
}

function IconTerkonfirmasi() {
  return (
    <svg {...ICON}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14" />
      <path d="M7.3 12.4 9 14.1l3.7-3.9" />
    </svg>
  );
}

/** Persentase keterisian satu zona (menunggu + terisi dibanding total slotnya). */
function persenKeterisian(zone: ZoneSlotStat): number {
  if (zone.total <= 0) return 0;
  return Math.round(((zone.pending + zone.confirmed) / zone.total) * 100);
}

/** Booking dengan bukti menunggu verifikasi harus menang visual (paling atas). */
function submittedDulu(a: BookingDetail, b: BookingDetail): number {
  const bobot = (row: BookingDetail): number => (row.payment?.status === "submitted" ? 0 : 1);
  return bobot(a) - bobot(b); // sort stabil: urutan terbaru terjaga di tiap kelompok
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const statsResult = await getDashboardStats();

  if (!statsResult.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Dashboard</h1>
        <Alert tone="error" title="Data ringkasan belum bisa dimuat">
          {statsResult.error}
        </Alert>
      </div>
    );
  }

  const stats = statsResult.data;
  const zonaDisewakan = stats.totalPerStatus.filter((zone) => zone.zoneType !== "facility");
  const slotDisewakan = zonaDisewakan.reduce((total, zone) => total + zone.total, 0);
  const slotTerisi = zonaDisewakan.reduce((total, zone) => total + zone.confirmed, 0);
  const slotMenunggu = zonaDisewakan.reduce((total, zone) => total + zone.pending, 0);
  const persenTerisi = slotDisewakan > 0 ? Math.round((slotTerisi / slotDisewakan) * 100) : 0;
  const adaAntrean = stats.pembayaranMenungguVerifikasi > 0;
  // Model per tanggal: okupansi bermakna untuk SATU tanggal gelaran (yang terdekat).
  const labelTanggalOkupansi = stats.tanggalOkupansi
    ? `per ${formatTanggal(stats.tanggalOkupansi)}`
    : "belum ada tanggal gelaran mendatang";

  // Transaksi terbaru: semua booking, submitted menang visual, maksimal 6 baris.
  const bookingResult = await listBookings();
  const transaksi = bookingResult.ok ? [...bookingResult.data].sort(submittedDulu).slice(0, 6) : [];
  const bookingTerkonfirmasi = bookingResult.ok
    ? bookingResult.data.filter((row) => row.status === "confirmed").length
    : slotTerisi;

  return (
    <div className="space-y-8">
      {/* ---------- Judul + pil Data Langsung ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Dashboard</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Metrik kinerja real-time untuk {EVENT_INFO.name}.
          </p>
        </div>
        <AutoRefresh />
      </header>

      {/* ---------- 4 kartu statistik ---------- */}
      <section aria-label="Ringkasan angka" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Admin Fee Terverifikasi"
          value={formatRupiah(stats.totalAdminFeeTerverifikasi)}
          tone="green"
          icon={<IconUang />}
          hint="Pembayaran yang sudah lolos verifikasi"
        />
        <StatCard
          label="Tingkat Okupansi"
          value={`${persenTerisi}%`}
          tone="slate"
          icon={<IconOkupansi />}
          progressPct={persenTerisi}
          hint={`${slotTerisi} dari ${slotDisewakan} slot terisi · ${slotMenunggu} menunggu — ${labelTanggalOkupansi}`}
        />
        <StatCard
          label="Pembayaran Tertunda"
          value={stats.pembayaranMenungguVerifikasi}
          tone={adaAntrean ? "amber" : "slate"}
          icon={<IconTertunda />}
          hint={adaAntrean ? "Memerlukan verifikasi" : "Tidak ada antrean"}
        />
        <StatCard
          label="Booking Terkonfirmasi"
          value={bookingTerkonfirmasi}
          tone="slate"
          icon={<IconTerkonfirmasi />}
          hint="Seluruh booking terkonfirmasi, semua tanggal digabung"
        />
      </section>

      {/* ---------- Status zona + transaksi terbaru ---------- */}
      <section aria-label="Status zona dan transaksi terbaru" className="grid gap-4 lg:grid-cols-3">
        {/* Status Zona */}
        <Card className="p-6 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Status Zona</h2>
              <p className="mt-0.5 text-xs text-muted">Okupansi {labelTanggalOkupansi}</p>
            </div>
            <Link
              href="/admin/slots"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              Kelola slot
            </Link>
          </div>

          {zonaDisewakan.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Belum ada zona yang terdaftar. Jalankan supabase/seed.sql lebih dulu.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {zonaDisewakan.map((zone) => {
                const persen = persenKeterisian(zone);
                const persenTerkonfirmasi =
                  zone.total > 0 ? Math.round((zone.confirmed / zone.total) * 100) : 0;
                return (
                  <li key={zone.zoneId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">
                        {zone.name}
                      </span>
                      <span className="tabular shrink-0 text-sm font-medium text-ink">
                        {persen}%
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3"
                      role="img"
                      aria-label={`${zone.name}: ${zone.confirmed} terisi dan ${zone.pending} menunggu dari ${zone.total} slot`}
                    >
                      <div className="flex h-full">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${persenTerkonfirmasi}%` }}
                        />
                        <div
                          className="h-full bg-warn"
                          style={{ width: `${Math.max(0, persen - persenTerkonfirmasi)}%` }}
                        />
                      </div>
                    </div>
                    <p className="tabular mt-1 text-xs text-subtle">
                      {zone.confirmed + zone.pending}/{zone.total} slot
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-5 text-xs text-subtle">
            Oranye = terisi, kuning = menunggu pembayaran — dihitung {labelTanggalOkupansi}.
            Fasilitas umum tidak dihitung.
          </p>
        </Card>

        {/* Transaksi Terbaru */}
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-6 py-5">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Transaksi Terbaru</h2>
            <Link
              href="/admin/bookings"
              className="text-sm font-medium text-accent underline-offset-2 hover:underline"
            >
              Lihat Semua
            </Link>
          </div>

          {!bookingResult.ok ? (
            <p className="px-6 py-5 text-sm text-danger">
              Daftar booking gagal dimuat: {bookingResult.error}
            </p>
          ) : transaksi.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted">
              Belum ada booking masuk. Transaksi akan tampil di sini begitu pengunjung memesan slot
              dari denah publik.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-b-[var(--radius)]">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-subtle">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-6 py-3 font-medium">Kode</th>
                    <th scope="col" className="px-3 py-3 font-medium">Tenant</th>
                    <th scope="col" className="px-3 py-3 font-medium">Zona/Slot</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Nominal</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {transaksi.map((booking) => {
                    const payment = booking.payment;
                    const submitted = payment?.status === "submitted";
                    const nominal =
                      payment?.amount ??
                      booking.slot.zone.admin_fee * Math.max(1, booking.dates.length);
                    const hrefDetail = submitted
                      ? `/admin/bookings?payment=submitted&q=${encodeURIComponent(booking.booking_code)}`
                      : `/admin/bookings?q=${encodeURIComponent(booking.booking_code)}`;

                    return (
                      <tr
                        key={booking.id}
                        className={cn(
                          "align-middle transition-colors duration-150",
                          submitted
                            ? "bg-warn-soft shadow-[inset_3px_0_0_var(--warn)]"
                            : "hover:bg-surface-2",
                        )}
                      >
                        <td className="px-6 py-3.5">
                          <Link
                            href={hrefDetail}
                            className="font-mono text-xs font-semibold text-ink underline-offset-2 hover:underline"
                          >
                            {booking.booking_code}
                          </Link>
                          <p className="mt-0.5 whitespace-nowrap text-xs text-subtle">
                            {formatTanggalWaktu(booking.created_at)}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 font-medium text-ink">{booking.tenant.name}</td>
                        <td className="px-3 py-3.5 text-muted">
                          {booking.slot.zone.name} / {slotDisplayName(booking.slot)}
                          <p className="mt-0.5 whitespace-nowrap text-xs text-subtle">
                            {ringkasTanggal(booking.dates, 2)}
                          </p>
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-right font-medium text-ink">
                          {formatRupiah(nominal)}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {payment ? (
                            <StatusBadge status={payment.status} kind="payment" />
                          ) : (
                            <StatusBadge status={booking.status} kind="booking" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
