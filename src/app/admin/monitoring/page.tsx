import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { RunMonitoringButton } from "@/components/admin/RunMonitoringButton";
import { StatCard } from "@/components/admin/StatCard";
import type { StatCardTone } from "@/components/admin/StatCard";
import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EVENT_INFO } from "@/lib/domain/constants";
import {
  getMonitoringDashboard,
  type CheckStatus,
  type MonitoringSummaryRow,
} from "@/lib/services/monitoring";
import { requireAdmin } from "@/lib/services/auth";
import { cn, formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monitoring",
  description: "Health, availability, performance, security, dan SLA/usage sistem.",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "Normal",
  degraded: "Melambat",
  down: "Bermasalah",
};

const STATUS_TONE: Record<CheckStatus, StatCardTone> = {
  ok: "green",
  degraded: "amber",
  down: "red",
};

const STATUS_DOT: Record<CheckStatus, string> = {
  ok: "bg-ok",
  degraded: "bg-warn",
  down: "bg-danger",
};

const TARGET_LABEL: Record<string, string> = {
  supabase: "Database (Supabase)",
  beranda: "Halaman Beranda",
  denah: "Halaman Denah",
  katalog: "Halaman Katalog",
};

function Seksi({
  judul,
  deskripsi,
  children,
}: {
  judul: string;
  deskripsi: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{judul}</h2>
        <p className="mt-0.5 text-sm text-muted">{deskripsi}</p>
      </div>
      {children}
    </section>
  );
}

function LatencyStat({ value }: { value: number | null }) {
  return <span className="tabular">{value === null ? "—" : `${value} ms`}</span>;
}

export default async function AdminMonitoringPage() {
  await requireAdmin();
  const result = await getMonitoringDashboard();

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Monitoring</h1>
        <Alert tone="error" title="Data monitoring belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const data = result.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Monitoring</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Health, availability, performance, security, dan SLA/usage {EVENT_INFO.name} — dipantau
            langsung dari aplikasi ini, tanpa layanan pihak ketiga.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RunMonitoringButton />
          <AutoRefresh intervalMs={30000} />
        </div>
      </header>

      {data.sampleCount24h === 0 ? (
        <Alert tone="warning" title="Belum ada sampel monitoring">
          Klik &quot;Jalankan sekarang&quot; untuk sondir pertama, atau tunggu Vercel Cron berjalan
          (lihat vercel.json — dijadwalkan tiap 5 menit setelah branch ini di-deploy).
        </Alert>
      ) : null}

      <Seksi
        judul="Health & Availability"
        deskripsi={`Status komponen terkini, dari ${data.sampleCount24h} sampel 24 jam terakhir.`}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Status Keseluruhan"
            value={STATUS_LABEL[data.overallStatus]}
            tone={STATUS_TONE[data.overallStatus]}
            hint={data.lastRunAt ? `Sondir terakhir ${formatTanggalWaktu(data.lastRunAt)}` : "Belum pernah disondir"}
          />
          {data.checks.map((c) => (
            <StatCard
              key={c.target}
              label={TARGET_LABEL[c.target] ?? c.target}
              value={
                <span className="inline-flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[c.latestStatus])} />
                  {STATUS_LABEL[c.latestStatus]}
                </span>
              }
              tone={STATUS_TONE[c.latestStatus]}
              hint={c.latestDetail ?? `Uptime 24 jam: ${c.uptimePct24h}%`}
            />
          ))}
        </div>
      </Seksi>

      <Seksi
        judul="Performance"
        deskripsi="Latensi respons tiap komponen — rata-rata dan p95 dari sampel 24 jam terakhir."
      >
        <Card>
          <CardHeader>
            <CardTitle>Latensi per Komponen</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 font-medium sm:px-6">Komponen</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Terkini</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Rata-rata</th>
                  <th className="px-5 py-3 font-medium sm:px-6">p95</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Uptime 24 jam</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map((c: MonitoringSummaryRow) => (
                  <tr key={c.target} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 sm:px-6">{TARGET_LABEL[c.target] ?? c.target}</td>
                    <td className="px-5 py-3 sm:px-6">
                      <LatencyStat value={c.latestLatencyMs} />
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <LatencyStat value={c.avgLatencyMs24h} />
                    </td>
                    <td className="px-5 py-3 sm:px-6">
                      <LatencyStat value={c.p95LatencyMs24h} />
                    </td>
                    <td className="px-5 py-3 sm:px-6 tabular">{c.uptimePct24h}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Seksi>

      <Seksi
        judul="Security"
        deskripsi="Sinyal keamanan dasar — belum menggantikan audit menyeluruh, cukup untuk pemantauan harian."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Percobaan Login Gagal (24 jam)"
            value={data.security.failedLoginAttempts24h}
            tone={data.security.failedLoginAttempts24h > 20 ? "red" : "slate"}
            hint="Dihitung dari rate_limit_events kunci login:*"
          />
          <StatCard
            label="Service Role"
            value={data.security.serviceRoleConfigured ? "Terkonfigurasi" : "Belum diisi"}
            tone={data.security.serviceRoleConfigured ? "green" : "red"}
          />
          <StatCard
            label="Sentry (error tracking)"
            value={data.security.sentryConfigured ? "Aktif" : "Nonaktif"}
            tone={data.security.sentryConfigured ? "green" : "amber"}
            hint="Opsional — lihat .env.example"
          />
          <StatCard
            label="Cron Secret"
            value={data.security.cronSecretConfigured ? "Terkonfigurasi" : "Belum diisi"}
            tone={data.security.cronSecretConfigured ? "green" : "amber"}
            hint="Melindungi endpoint /api/cron/*"
          />
        </div>
      </Seksi>

      <Seksi
        judul="SLA & Usage"
        deskripsi="Volume transaksi hari ini sebagai proksi trafik, plus antrean yang butuh perhatian admin."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Booking Hari Ini" value={data.usage.bookingsToday} tone="blue" />
          <StatCard label="Booking Kemarin" value={data.usage.bookingsYesterday} tone="slate" />
          <StatCard label="Pembelian Hari Ini" value={data.usage.purchasesToday} tone="blue" />
          <StatCard
            label="Menunggu Verifikasi Pembayaran"
            value={data.usage.pendingVerification}
            tone={data.usage.pendingVerification > 0 ? "amber" : "green"}
          />
        </div>
      </Seksi>
    </div>
  );
}
