import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { BookingHarianChart } from "@/components/admin/charts/BookingHarianChart";
import { LeasingStatusChart } from "@/components/admin/charts/LeasingStatusChart";
import { MetodePembayaranChart } from "@/components/admin/charts/MetodePembayaranChart";
import { OkupansiZonaChart } from "@/components/admin/charts/OkupansiZonaChart";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EVENT_INFO } from "@/lib/domain/constants";
import { LEASING_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/domain/labels";
import { getAnalyticsData } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import { formatTanggal } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analitik",
  description: "Grafik okupansi, tren booking, leasing, dan metode pembayaran.",
};

/** "27 Agu" — kunci tanggal "YYYY-MM-DD" dibaca sebagai UTC supaya tidak bergeser hari. */
const labelTanggal = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatLabelTanggal(kunci: string): string {
  const date = new Date(`${kunci}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? kunci : labelTanggal.format(date);
}

/** Isi kartu saat serinya belum punya data — data sedikit itu wajar untuk event baru. */
function BelumAdaData({ pesan }: { pesan: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-line-strong bg-app/60 px-6 text-center">
      <p className="max-w-xs text-sm text-muted">{pesan}</p>
    </div>
  );
}

function KartuChart({
  judul,
  deskripsi,
  children,
}: {
  judul: string;
  deskripsi: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{judul}</h2>
      <p className="mt-0.5 text-sm text-muted">{deskripsi}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function AdminAnalitikPage() {
  await requireAdmin();
  const result = await getAnalyticsData();

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Analitik</h1>
        <Alert tone="error" title="Data analitik belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const data = result.data;

  // Model per tanggal: okupansi dihitung untuk tanggal gelaran aktif terdekat.
  const deskripsiOkupansi = data.tanggalOkupansi
    ? `Slot terisi, menunggu, tersedia, dan diblokir di tiap zona yang disewakan — per ${formatTanggal(data.tanggalOkupansi)}.`
    : "Belum ada tanggal gelaran mendatang; semua slot yang tidak diblokir dihitung tersedia.";

  const bookingHarian = data.bookingPerHari.map((titik) => ({
    label: formatLabelTanggal(titik.tanggal),
    jumlah: titik.jumlah,
  }));

  const leasingPerStatus = data.leasingPerStatus.map((titik) => ({
    status: titik.status,
    label: LEASING_STATUS_LABEL[titik.status],
    jumlah: titik.jumlah,
  }));

  const metodePembayaran = data.metodePembayaran.map((titik) => ({
    metode: titik.metode,
    label: PAYMENT_METHOD_LABEL[titik.metode],
    jumlah: titik.jumlah,
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Analitik</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Grafik okupansi, tren pemesanan, leasing, dan metode pembayaran {EVENT_INFO.name}.
          </p>
        </div>
        <AutoRefresh />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <KartuChart judul="Okupansi per Zona" deskripsi={deskripsiOkupansi}>
          {data.okupansiPerZona.length === 0 ? (
            <BelumAdaData pesan="Belum ada zona dengan slot terdaftar. Jalankan supabase/seed.sql lebih dulu." />
          ) : (
            <OkupansiZonaChart data={data.okupansiPerZona} />
          )}
        </KartuChart>

        <KartuChart
          judul="Booking per Hari"
          deskripsi="Jumlah booking masuk per tanggal, dihitung dari waktu pembuatannya."
        >
          {bookingHarian.length === 0 ? (
            <BelumAdaData pesan="Belum ada booking masuk. Tren harian muncul begitu pemesanan pertama dibuat." />
          ) : (
            <BookingHarianChart data={bookingHarian} />
          )}
        </KartuChart>

        <KartuChart
          judul="Leasing per Status"
          deskripsi="Sebaran pengajuan pembiayaan pengunjung menurut statusnya."
        >
          {leasingPerStatus.length === 0 ? (
            <BelumAdaData pesan="Belum ada pengajuan leasing. Grafik terisi saat pengunjung memilih metode kredit." />
          ) : (
            <LeasingStatusChart data={leasingPerStatus} />
          )}
        </KartuChart>

        <KartuChart
          judul="Metode Pembayaran"
          deskripsi="Perbandingan metode pembayaran biaya admin (QRIS, dan data lama transfer/tunai)."
        >
          {metodePembayaran.length === 0 ? (
            <BelumAdaData pesan="Belum ada pembayaran biaya admin yang tercatat." />
          ) : (
            <MetodePembayaranChart data={metodePembayaran} />
          )}
        </KartuChart>
      </div>
    </div>
  );
}
