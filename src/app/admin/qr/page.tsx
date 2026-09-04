import type { Metadata } from "next";

import { QrGenerator } from "@/components/admin/QrGenerator";
import { StatCard } from "@/components/admin/StatCard";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { qrBaseUrl } from "@/lib/qr-brand";
import { QR_MEDIA_PRESETS, QR_MEDIA_TANPA_PARAM, QR_MEDIA_UJI } from "@/lib/qr-media";
import { requireAdmin } from "@/lib/services/auth";
import { ringkasanScanQr } from "@/lib/services/qr";
import { formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "QR Code",
  description: "Buat kode QR promosi per media dan lihat media mana yang paling banyak di-scan.",
};

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

function IconScan() {
  return (
    <svg {...ICON}>
      <path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13" />
      <path d="M5 10h10" />
    </svg>
  );
}

/** Label media untuk tabel: pakai nama preset kalau ada, selain itu slug apa adanya. */
function labelMedia(slug: string): string {
  if (slug === QR_MEDIA_TANPA_PARAM) return "Tanpa parameter (diketik manual)";
  if (slug === QR_MEDIA_UJI) return "Uji dari panel admin";
  return QR_MEDIA_PRESETS.find((item) => item.slug === slug)?.label ?? slug;
}

export default async function AdminQrPage() {
  await requireAdmin();
  const stat = await ringkasanScanQr();
  const baseUrl = qrBaseUrl();

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">QR Code</h1>
        <p className="max-w-2xl text-sm text-muted">
          Kode QR untuk spanduk, flyer, LED, dan media sosial. Pengunjung yang scan masuk lewat
          halaman sambutan beranimasi, dan setiap scan dihitung per media.
        </p>
      </header>

      <QrGenerator baseUrl={baseUrl} />

      {/* ---------- Statistik scan ---------- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Statistik scan</h2>
          <p className="mt-0.5 text-sm text-muted">
            Dihitung dari kunjungan halaman sambutan. Pratinjau tautan WhatsApp/Telegram dan bot
            tidak ikut dihitung; hari mengikuti WIB.
          </p>
        </div>

        {stat.ok ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Total scan" value={stat.data.total} icon={<IconScan />} />
              <StatCard label="7 hari terakhir" value={stat.data.tujuhHari} tone="blue" icon={<IconScan />} />
              <StatCard label="Hari ini" value={stat.data.hariIni} tone="green" icon={<IconScan />} />
            </div>

            {stat.data.perMedia.length === 0 ? (
              <Card className="p-6">
                <p className="text-sm text-muted">
                  Belum ada scan tercatat. Setelah QR dipasang, angkanya muncul di sini per media.
                </p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto rounded-[var(--radius)]">
                  <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Media</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">7 hari</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Hari ini</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Android / iPhone</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Scan terakhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {stat.data.perMedia.map((row) => (
                        <tr key={row.media} className="hover:bg-surface-2">
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink">{labelMedia(row.media)}</p>
                            <p className="font-mono text-xs text-subtle">{row.media}</p>
                          </td>
                          <td className="tabular px-4 py-3 text-right font-semibold text-ink">{row.total}</td>
                          <td className="tabular px-4 py-3 text-right text-ink">{row.tujuhHari}</td>
                          <td className="tabular px-4 py-3 text-right text-ink">{row.hariIni}</td>
                          <td className="tabular px-4 py-3 text-right text-muted">
                            {row.android} / {row.ios}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted">
                            {row.terakhir ? formatTanggalWaktu(row.terakhir) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : (
          <Alert tone={stat.code === "NO_CONFIG" ? "info" : "warning"} title="Statistik belum bisa dimuat">
            {stat.error}
          </Alert>
        )}
      </section>

      {/* ---------- Panduan cetak ---------- */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Panduan cetak &amp; pasang</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <strong className="text-ink">Ukuran:</strong> sisi QR minimal <em>jarak scan ÷ 10</em>.
            Spanduk yang dilihat dari 3 m butuh QR ±30 cm; flyer di tangan cukup 2,5 cm.
          </li>
          <li>
            <strong className="text-ink">Tepi putih:</strong> jangan potong area putih di sekeliling
            kode dan jangan tempelkan gambar/teks lain menempel ke kode.
          </li>
          <li>
            <strong className="text-ink">Warna:</strong> biarkan modul hitam di atas putih. Jangan
            dibalik (putih di atas gelap) atau diberi gradasi — banyak kamera HP gagal membacanya.
          </li>
          <li>
            <strong className="text-ink">Sebelum cetak massal:</strong> cetak satu contoh, scan dengan
            Android dan iPhone dari jarak pemasangan sebenarnya.
          </li>
          <li>
            <strong className="text-ink">Alamat tetap:</strong> semua QR mengarah ke{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink">{baseUrl}</code>.
            Kalau nanti pindah domain, alamat ini harus tetap dialihkan agar QR yang sudah dicetak
            tidak mati.
          </li>
        </ul>
      </Card>
    </div>
  );
}
