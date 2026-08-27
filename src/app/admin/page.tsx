import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/admin/StatCard";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
// Biaya admin bersifat tetap per tipe zona (nilainya sama dengan supabase/seed.sql),
// sementara DashboardStats hanya membawa rekap jumlah slot per zona.
import { ADMIN_FEE_BY_ZONE_TYPE } from "@/lib/domain/fallback";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getDashboardStats, type ZoneSlotStat } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import { formatRupiah } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Ringkasan ketersediaan slot, pembayaran, dan pengajuan leasing.",
};

/** Persentase keterisian satu zona (menunggu + terisi dibanding total slotnya). */
function persenKeterisian(zone: ZoneSlotStat): number {
  if (zone.total <= 0) return 0;
  return Math.round(((zone.pending + zone.confirmed) / zone.total) * 100);
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const statsResult = await getDashboardStats();

  const nama = admin.full_name?.trim() || admin.email;

  if (!statsResult.ok) {
    return (
      <div>
        <PageHeader title="Dashboard" description={`Halo, ${nama}.`} />
        <Alert tone="error" title="Data ringkasan belum bisa dimuat">
          {statsResult.error}
        </Alert>
      </div>
    );
  }

  const stats = statsResult.data;
  const zones = stats.totalPerStatus;

  const zonaDisewakan = zones.filter((zone) => zone.zoneType !== "facility");
  const slotDisewakan = zonaDisewakan.reduce((total, zone) => total + zone.total, 0);
  const slotTerisi = zones.reduce((total, zone) => total + zone.confirmed, 0);
  const slotMenunggu = zones.reduce((total, zone) => total + zone.pending, 0);
  const persenTerisi = slotDisewakan > 0 ? Math.round((slotTerisi / slotDisewakan) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Halo, ${nama}. Saat ini ada ${stats.bookingAktif} booking aktif di pameran ini.`}
      />

      {/* Ringkasan angka */}
      <section aria-labelledby="ringkasan-angka" className="space-y-3">
        <h2 id="ringkasan-angka" className="sr-only">
          Ringkasan angka
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Total Slot"
            value={stats.totalSlot}
            hint={`${slotDisewakan} slot bisa disewa, sisanya fasilitas umum`}
          />
          <StatCard
            label="Slot Terisi"
            value={slotTerisi}
            tone="green"
            hint={`${persenTerisi}% dari slot yang disewakan · ${slotMenunggu} menunggu pembayaran`}
          />
          <StatCard
            label="Menunggu Verifikasi Pembayaran"
            value={stats.pembayaranMenungguVerifikasi}
            tone={stats.pembayaranMenungguVerifikasi > 0 ? "amber" : "slate"}
            hint="Bukti transfer yang perlu dicek panitia"
          />
          <StatCard
            label="Pengajuan Leasing Masuk"
            value={stats.pengajuanLeasingMasuk}
            tone={stats.pengajuanLeasingMasuk > 0 ? "blue" : "slate"}
            hint="Status diajukan atau sedang diverifikasi"
          />
          <StatCard
            label="Estimasi Komisi"
            value={formatRupiah(stats.totalKomisiPotensial)}
            hint="Komisi leasing yang belum dibayarkan partner"
          />
          <StatCard
            label="Admin Fee Terverifikasi"
            value={formatRupiah(stats.totalAdminFeeTerverifikasi)}
            tone="green"
            hint="Total pembayaran biaya admin yang sudah lolos verifikasi"
          />
        </div>
      </section>

      {/* Rekap per zona */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan per Zona</CardTitle>
          <CardDescription>
            Jumlah slot menurut status, biaya admin per slot, dan tingkat keterisiannya.
          </CardDescription>
        </CardHeader>
        {/* Tabel dipasang langsung di dalam Card (tanpa CardContent) supaya
            lebarnya penuh dan cn() tidak perlu menimpa padding bawaan. */}
        <div className="overflow-x-auto rounded-b-xl">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Zona
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Tipe
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Tersedia
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Menunggu
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Terisi
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Biaya Admin
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Keterisian
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                    Belum ada zona yang terdaftar. Jalankan supabase/seed.sql lebih dulu.
                  </td>
                </tr>
              ) : (
                zones.map((zone) => {
                  const fasilitas = zone.zoneType === "facility";
                  const persen = persenKeterisian(zone);
                  return (
                    <tr key={zone.zoneId} className="align-middle">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-900">
                        {zone.name}
                      </th>
                      <td className="px-3 py-2.5 text-slate-600">
                        {ZONE_TYPE_LABEL[zone.zoneType]}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-700">
                        {zone.available}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                        {zone.pending}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                        {zone.confirmed}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {fasilitas ? "—" : formatRupiah(ADMIN_FEE_BY_ZONE_TYPE[zone.zoneType])}
                      </td>
                      <td className="px-4 py-2.5">
                        {fasilitas ? (
                          <span className="text-xs text-slate-400">Tidak disewakan</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"
                              role="img"
                              aria-label={`Keterisian ${zone.name}: ${persen} persen dari ${zone.total} slot`}
                            >
                              <div
                                className="h-full rounded-full bg-slate-900"
                                style={{ width: `${persen}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-slate-500">
                              {persen}% · {zone.total} slot
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Perlu tindakan */}
      <section aria-labelledby="perlu-tindakan" className="space-y-3">
        <h2 id="perlu-tindakan" className="text-base font-semibold text-slate-900">
          Perlu Tindakan
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pembayaran Menunggu Verifikasi</CardTitle>
              <CardDescription>
                Tenant sudah mengunggah bukti transfer dan menunggu dicek panitia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-amber-700">
                {stats.pembayaranMenungguVerifikasi}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {stats.pembayaranMenungguVerifikasi > 0
                  ? "Verifikasi agar slot langsung terkunci sebagai terisi."
                  : "Tidak ada antrean verifikasi saat ini."}
              </p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/bookings" className={buttonClass("secondary", "sm")}>
                Buka Booking &amp; Pembayaran
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pengajuan Leasing Baru</CardTitle>
              <CardDescription>
                Pengajuan kredit pembeli unit yang belum selesai diproses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-blue-700">
                {stats.pengajuanLeasingMasuk}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {stats.pengajuanLeasingMasuk > 0
                  ? `Estimasi komisi berjalan ${formatRupiah(stats.totalKomisiPotensial)}.`
                  : "Belum ada pengajuan yang perlu ditindaklanjuti."}
              </p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/leasing" className={buttonClass("secondary", "sm")}>
                Buka Leasing
              </Link>
            </CardFooter>
          </Card>
        </div>
      </section>
    </div>
  );
}
