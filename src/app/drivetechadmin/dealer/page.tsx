import type { Metadata } from "next";

import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { TerimaDealerButton } from "@/components/admin/TerimaDealerButton";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { hitungBiaya, kodeDealer, LAPAK_DEALER, rupiah, TANGGAL_DEALER } from "@/lib/domain/formulir-dealer";
import { requireAdmin } from "@/lib/services/auth";
import { listPendaftaranDealer } from "@/lib/services/formulir-dealer";
import { formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dealer Baru" };

const TAUTAN = "font-semibold text-accent underline underline-offset-4";

export default async function AdminDealerPage() {
  await requireAdmin();
  const hasil = await listPendaftaranDealer();

  if (!hasil.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Dealer Baru</h1>
        <Alert tone="error" title="Formulir belum bisa dimuat">
          {hasil.error}
        </Alert>
      </div>
    );
  }

  const dealer = hasil.data;
  const lapak = (d: Record<string, string>) =>
    LAPAK_DEALER.filter((l) => Number(d[`jumlah_${l.kode}`]) > 0)
      .map((l) => `${d[`jumlah_${l.kode}`]} ${l.kode.toUpperCase()}${d[`nomor_${l.kode}`] ? ` (${d[`nomor_${l.kode}`]})` : ""}`)
      .join(", ");
  const tanggal = (d: Record<string, string>) =>
    TANGGAL_DEALER.filter((_, i) => d[`tgl_${i + 1}`] === "ya").join("; ");

  const barisCsv = dealer.map((p) => ({
    Kode: kodeDealer(p.id),
    Dealer: p.data.nama_dealer ?? "",
    "Badan usaha": p.data.badan_usaha ?? "",
    Merek: p.data.merek ?? "",
    Pimpinan: `${p.data.pimpinan ?? ""}, ${p.data.jabatan ?? ""}`,
    PIC: p.data.pic ?? "",
    "WA PIC": p.data.wa_pic ?? "",
    Lapak: lapak(p.data),
    Tanggal: tanggal(p.data),
    Total: hitungBiaya(p.data).total,
    Ditandatangani: p.ditandatangani_at ? formatTanggalWaktu(p.ditandatangani_at) : "",
    Diterima: p.diterima_at ? formatTanggalWaktu(p.diterima_at) : "",
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Dealer Baru</h1>
          <p className="text-sm text-muted sm:text-base">
            {dealer.length} formulir masuk, {dealer.filter((p) => p.ditandatangani_at).length} sudah ditandatangani,{" "}
            {dealer.filter((p) => p.diterima_at).length} diterima.
          </p>
        </div>
        <ExportCsvButton filename="formulir-dealer.csv" rows={barisCsv} />
      </header>

      <Alert tone="info" title="Tautan untuk dealer">
        Formulir online:{" "}
        <a href="/dealer" target="_blank" className={TAUTAN}>
          /dealer
        </a>
        . PDF isian kosong:{" "}
        <a href="/dealer/formulir.pdf" target="_blank" className={TAUTAN}>
          /dealer/formulir.pdf
        </a>
        . Untuk tanda tangan di lokasi, buka &quot;Tanda tangan&quot; di iPad lalu serahkan ke dealer. Tanda tangan panitia
        masuk ke PDF setelah tombol &quot;Terima&quot; ditekan.
      </Alert>

      {dealer.length === 0 ? (
        <EmptyState
          title="Belum ada formulir"
          description="Formulir muncul di sini setelah dealer mengisi halaman /dealer."
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-card">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                <th scope="col" className="px-3 py-2.5">Kode</th>
                <th scope="col" className="px-3 py-2.5">Dealer</th>
                <th scope="col" className="px-3 py-2.5">PIC</th>
                <th scope="col" className="px-3 py-2.5">Lapak</th>
                <th scope="col" className="px-3 py-2.5">Total</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dealer.map((p) => (
                <tr key={p.id} className="align-top hover:bg-surface-2">
                  <td className="px-3 py-2.5 font-mono font-semibold text-ink">{kodeDealer(p.id)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink">{p.data.nama_dealer}</p>
                    <p className="text-xs text-muted">{p.data.merek}</p>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {p.data.pic}
                    <br />
                    {p.data.wa_pic}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {lapak(p.data)}
                    <br />
                    <span className="text-xs">{hitungBiaya(p.data).tanggal} tanggal</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink">{rupiah(hitungBiaya(p.data).total)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.diterima_at ? (
                      <span className="font-semibold text-accent">Diterima</span>
                    ) : p.ditandatangani_at ? (
                      <span className="text-ink">Ditandatangani</span>
                    ) : (
                      <span className="text-muted">Belum tanda tangan</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <a href={`/dealer/${p.token}/pdf`} target="_blank" className={TAUTAN}>
                        PDF
                      </a>
                      {p.ditandatangani_at ? null : (
                        <a href={`/dealer/${p.token}`} target="_blank" className={TAUTAN}>
                          Tanda tangan
                        </a>
                      )}
                      {p.ditandatangani_at && !p.diterima_at ? <TerimaDealerButton id={p.id} /> : null}
                    </div>
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
