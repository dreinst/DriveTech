import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JALAN_SEHAT, kodeKupon, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";
import { qrSvg } from "@/lib/qr";
import { getPesertaByToken } from "@/lib/services/jalan-sehat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kupon Jalan Sehat",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function KuponJalanSehatPage({ params }: PageProps) {
  const { token } = await params;
  const peserta = await getPesertaByToken(token);
  if (!peserta) notFound();

  const kode = kodeKupon(peserta.id);
  const svg = await qrSvg(kode, { margin: 0 });

  return (
    <section className="gelap bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
        <p className="label mb-5 text-sm text-accent">Pendaftaran berhasil, terima kasih!</p>

        {/* Kartu terang supaya mudah dibaca saat di-screenshot dan dipindai di meja registrasi. */}
        <article className="bg-krem p-6 text-[#0a0a0a] sm:p-8">
          <p className="label text-sm text-[#0a0a0a]/70">Kupon penukaran tiket undian</p>
          <h1 className="judul mt-1 text-3xl">{JALAN_SEHAT.judul}</h1>
          <p className="judul mt-5 text-[clamp(4rem,22vw,6.5rem)] leading-none text-[#c25e00]">{kode}</p>
          <p className="mt-3 text-xl font-semibold">{peserta.nama}</p>
          <p className="text-sm text-[#0a0a0a]/75">{peserta.domisili}</p>

          <div className="mt-6 flex items-end justify-between gap-4 border-t border-[#0a0a0a]/25 pt-5">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="label text-xs text-[#0a0a0a]/65">Waktu</dt>
                <dd>
                  {JALAN_SEHAT.tanggal}
                  <br />
                  mulai {JALAN_SEHAT.mulai}
                </dd>
              </div>
              <div>
                <dt className="label text-xs text-[#0a0a0a]/65">Lokasi</dt>
                <dd>{JALAN_SEHAT.lokasi}</dd>
              </div>
            </dl>
            <div
              role="img"
              aria-label={`QR berisi nomor kupon ${kode}`}
              className="h-28 w-28 shrink-0 bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </article>

        <div className="mt-5 space-y-3 text-sm leading-relaxed text-ink/80">
          <p>
            Simpan tangkapan layar kupon ini ya. Tunjukkan kupon ini di meja registrasi untuk
            ditukar tiket undian bernomor.
          </p>
          <p>{SYARAT_AMBIL_HADIAH}</p>
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-accent underline underline-offset-4">
          Kembali ke beranda DriveTech
        </Link>
      </div>
    </section>
  );
}
