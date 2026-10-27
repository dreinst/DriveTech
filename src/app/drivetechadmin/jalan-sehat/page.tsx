import type { Metadata } from "next";

import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { UndiDoorprize } from "@/components/admin/UndiDoorprize";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { kodeKupon, KUOTA_JALAN_SEHAT } from "@/lib/domain/jalan-sehat";
import { requireAdmin } from "@/lib/services/auth";
import { listPesertaJalanSehat } from "@/lib/services/jalan-sehat";
import { formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Jalan Sehat" };

export default async function AdminJalanSehatPage() {
  await requireAdmin();
  const hasil = await listPesertaJalanSehat();

  if (!hasil.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Jalan Sehat</h1>
        <Alert tone="error" title="Peserta belum bisa dimuat">
          {hasil.error}
        </Alert>
      </div>
    );
  }

  const peserta = hasil.data;
  const pemenang = peserta
    .filter((p) => p.menang_at)
    .sort((a, b) => (b.menang_at ?? "").localeCompare(a.menang_at ?? ""));

  const barisCsv = peserta.map((p) => ({
    Kupon: kodeKupon(p.id),
    Nama: p.nama,
    WhatsApp: p.phone,
    Domisili: p.domisili,
    Daftar: formatTanggalWaktu(p.created_at),
    Menang: p.menang_at ? formatTanggalWaktu(p.menang_at) : "",
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Jalan Sehat</h1>
          <p className="text-sm text-muted sm:text-base">
            {peserta.length} peserta terdaftar
            {KUOTA_JALAN_SEHAT !== null ? ` dari kuota ${KUOTA_JALAN_SEHAT}` : ""}, {pemenang.length} sudah
            menang doorprize.
          </p>
        </div>
        <ExportCsvButton filename="peserta-jalan-sehat.csv" rows={barisCsv} />
      </header>

      <UndiDoorprize sisa={peserta.length - pemenang.length} />

      {pemenang.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Pemenang</h2>
          <ol className="divide-y divide-line border border-line bg-card text-sm">
            {pemenang.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-x-4 px-3 py-2">
                <span className="font-mono font-semibold text-accent">{kodeKupon(p.id)}</span>
                <span className="text-ink">{p.nama}</span>
                <span className="text-muted">{p.domisili}</span>
                <span className="ml-auto text-xs text-subtle">{formatTanggalWaktu(p.menang_at)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {peserta.length === 0 ? (
        <EmptyState
          title="Belum ada peserta"
          description="Peserta muncul di sini setelah ada yang mendaftar di halaman /jalan-sehat."
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                <th scope="col" className="px-3 py-2.5">Kupon</th>
                <th scope="col" className="px-3 py-2.5">Nama</th>
                <th scope="col" className="px-3 py-2.5">WhatsApp</th>
                <th scope="col" className="px-3 py-2.5">Domisili</th>
                <th scope="col" className="px-3 py-2.5">Daftar</th>
                <th scope="col" className="px-3 py-2.5">Doorprize</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {peserta.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2">
                  <td className="px-3 py-2.5 font-mono font-semibold text-ink">{kodeKupon(p.id)}</td>
                  <td className="px-3 py-2.5 text-ink">{p.nama}</td>
                  <td className="px-3 py-2.5 text-muted">{p.phone}</td>
                  <td className="px-3 py-2.5 text-muted">{p.domisili}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">
                    {formatTanggalWaktu(p.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.menang_at ? <span className="font-semibold text-accent">Menang</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
