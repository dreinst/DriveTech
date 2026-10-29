import type { Metadata } from "next";

import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PENANDATANGAN_KWITANSI } from "@/lib/pdf-kwitansi-dealer";
import { requireSuperadmin } from "@/lib/services/auth";
import { getTtdKwitansi } from "@/lib/services/formulir-dealer";
import { TtdKwitansiForm } from "./TtdKwitansiForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kwitansi Dealer",
  description: "Tanda tangan dan contoh kwitansi DPRO untuk pembayaran lapak dealer.",
};

export default async function AdminKwitansiPage() {
  await requireSuperadmin();
  const ttd = await getTtdKwitansi();

  return (
    <div className="space-y-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Kwitansi Dealer</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Kwitansi DPRO terbit otomatis saat tagihan lapak dealer ditandai lunas, bernomor seri NNN/DPRO-DT-KW/bulan/tahun.
          Penanda tangan {PENANDATANGAN_KWITANSI}, goresannya ditempel di atas stempel DPRO.
        </p>
      </header>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">Tanda tangan saat ini</h2>
        {ttd ? (
          // eslint-disable-next-line @next/next/no-img-element -- PNG kecil dari database
          <img
            src={`data:image/png;base64,${ttd.toString("base64")}`}
            alt={`Tanda tangan ${PENANDATANGAN_KWITANSI}`}
            className="h-28 w-auto border border-line bg-white p-2"
          />
        ) : (
          <Alert tone="warning" title="Belum ada tanda tangan">
            Kwitansi tetap terbit dengan stempel DPRO saja sampai tanda tangan disimpan.
          </Alert>
        )}
        <a href="/drivetechadmin/kwitansi/contoh" target="_blank" className={buttonClass("secondary", "md")}>
          Lihat contoh kwitansi
        </a>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">Ganti tanda tangan</h2>
        <p className="text-sm text-muted">
          Tanda tangan baru dipakai untuk semua kwitansi yang dibuka setelah disimpan, termasuk kwitansi lama.
        </p>
        <TtdKwitansiForm />
      </Card>
    </div>
  );
}
