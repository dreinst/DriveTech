import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buttonClass } from "@/components/ui/Button";
import { hitungBiaya, kodeDealer, rupiah } from "@/lib/domain/formulir-dealer";
import { getDealerByToken } from "@/lib/services/formulir-dealer";
import { formatTanggalWaktu } from "@/lib/utils";
import { TandaTanganForm } from "./TandaTanganForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Formulir Dealer",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function FormulirDealerTokenPage({ params }: PageProps) {
  const { token } = await params;
  const dealer = await getDealerByToken(token);
  if (!dealer) notFound();

  const kode = kodeDealer(dealer.id);
  const biaya = hitungBiaya(dealer.data);
  const status = dealer.diterima_at
    ? `Diterima panitia ${formatTanggalWaktu(dealer.diterima_at)}`
    : dealer.ditandatangani_at
      ? `Ditandatangani ${formatTanggalWaktu(dealer.ditandatangani_at)}, menunggu panitia`
      : "Belum ditandatangani";

  return (
    <section className="gelap bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="label text-sm text-accent">Formulir dealer {kode}</p>
        <h1 className="judul mt-2 text-[clamp(2.25rem,7vw,3.5rem)] leading-none text-ink">{dealer.data.nama_dealer}</h1>
        <dl className="mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="label text-xs text-ink/60">Penanda tangan</dt>
            <dd className="text-ink">
              {dealer.data.pimpinan}, {dealer.data.jabatan}
            </dd>
          </div>
          <div>
            <dt className="label text-xs text-ink/60">Biaya lapak</dt>
            <dd className="text-ink">
              {rupiah(biaya.total)} ({biaya.lapak} lapak x {biaya.tanggal} tanggal)
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="label text-xs text-ink/60">Status</dt>
            <dd className="text-ink">{status}</dd>
          </div>
        </dl>

        <a href={`/dealer/${token}/pdf`} target="_blank" className={`${buttonClass("primary")} mt-6 w-full`}>
          Buka PDF formulir
        </a>
        <p className="mt-3 text-sm text-muted">
          Simpan tautan halaman ini. PDF selalu mengikuti status terbaru, termasuk tanda tangan panitia setelah
          diterima.
        </p>

        {dealer.ditandatangani_at ? null : (
          <div className="mt-10 border border-line bg-card p-5 sm:p-7">
            <h2 className="judul text-3xl text-ink">Tanda tangan</h2>
            <p className="mt-1 mb-5 text-sm text-muted">
              Ditandatangani oleh {dealer.data.pimpinan} ({dealer.data.jabatan}). Tanda tangan ini masuk ke halaman
              formulir dan surat komitmen sekaligus.
            </p>
            <TandaTanganForm token={token} adaStempel={dealer.ada_stempel} />
          </div>
        )}
      </div>
    </section>
  );
}
