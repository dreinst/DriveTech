import type { Metadata } from "next";

import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { requireSuperadmin } from "@/lib/services/auth";
import { BATAS_LOG, listLog } from "@/lib/services/log";
import { formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log Aktivitas",
  description: "Catatan aksi admin yang mengubah data.",
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function AdminLogPage({ searchParams }: Props) {
  await requireSuperadmin();
  const { q: qMentah } = await searchParams;
  const q = (Array.isArray(qMentah) ? qMentah[0] : qMentah)?.trim() ?? "";
  const hasil = await listLog(q);
  const baris = hasil.ok ? hasil.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Log Aktivitas</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            {BATAS_LOG} aksi admin terbaru yang mengubah data, dari login sampai verifikasi
            pembayaran. Waktu dalam WIB.
          </p>
        </div>
        <ExportCsvButton
          filename="drive-tech-log-admin.csv"
          label="Ekspor CSV"
          rows={baris.map((row) => ({
            waktu: row.waktu,
            username: row.username,
            aksi: row.aksi,
            rincian: row.rincian,
          }))}
        />
      </header>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="saring-log" className="sr-only">
          Saring log
        </label>
        <Input
          id="saring-log"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Saring username, aksi, atau rincian"
          className="max-w-sm"
        />
        <button type="submit" className={buttonClass("secondary", "md")}>
          Saring
        </button>
      </form>

      {!hasil.ok ? (
        <Alert tone="error" title="Log belum bisa dimuat">
          {hasil.error}
        </Alert>
      ) : baris.length === 0 ? (
        <EmptyState
          title={q ? "Tidak ada entri yang cocok" : "Belum ada aktivitas tercatat"}
          description={q ? "Coba kata lain atau kosongkan saringan." : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto rounded-[var(--radius)]">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Waktu</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Admin</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Aksi</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {baris.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-surface-2">
                    <td className="tabular whitespace-nowrap px-4 py-3 text-muted">
                      {formatTanggalWaktu(row.waktu)}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{row.username}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{row.aksi}</td>
                    <td className="break-words px-4 py-3 text-muted">{row.rincian}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
