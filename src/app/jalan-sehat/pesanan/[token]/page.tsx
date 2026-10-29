import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { totalBayar } from "@/lib/domain/harga";
import { WA_BOT_PHONE, waHref } from "@/lib/domain/constants";
import { HARGA_TIKET_JS, JALAN_SEHAT, nomorTiket, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";
import { pesananByToken, tiketPesanan } from "@/lib/services/jalan-sehat";
import { formatRupiah, formatTanggalWaktu } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pesanan Jalan Sehat",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

const TOMBOL =
  "inline-flex min-h-11 items-center justify-center bg-accent px-5 text-sm font-semibold text-[#0a0a0a] hover:bg-[var(--accent-hover)]";

export default async function PesananJalanSehatPage({ params }: PageProps) {
  const { token } = await params;
  const p = await pesananByToken(token);
  if (!p) notFound();

  const total = totalBayar(p);
  const tiket = p.status === "lunas" ? await tiketPesanan(p.id) : null;
  const waBukti = waHref(WA_BOT_PHONE, `Bukti bayar jalan sehat ${p.kode}`);

  return (
    <section className="gelap bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-10 sm:py-14">
        <div>
          <p className="label text-sm text-accent">{JALAN_SEHAT.judul}</p>
          <h1 className="judul mt-1 text-4xl text-ink">Pesanan {p.kode}</h1>
          <p className="mt-2 text-ink/80">
            {p.nama}, {p.jumlah} peserta x {formatRupiah(HARGA_TIKET_JS)}
          </p>
        </div>

        {p.status === "menunggu" ? (
          <>
            {p.alasan_tolak ? (
              <Alert tone="error" title="Bukti bayar sebelumnya ditolak">
                {p.alasan_tolak}. Mohon kirim bukti yang benar.
              </Alert>
            ) : null}
            <p className="text-ink/85">
              Bayar <strong className="text-accent">{formatRupiah(total)}</strong> lewat QRIS di bawah sebelum{" "}
              {formatTanggalWaktu(p.batas_bayar)} WIB. Nominal sudah terisi otomatis dan mohon dibayar persis
              sesuai angka itu.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- kartu PNG dinamis dari route API */}
            <img
              src={`/api/jalan-sehat/qris/${p.kode}`}
              alt={`QRIS pembayaran ${p.kode} sebesar ${formatRupiah(total)}`}
              className="w-full border border-line"
            />
            <div className="flex flex-wrap gap-3">
              <a href={waBukti} target="_blank" rel="noopener noreferrer" className={TOMBOL}>
                Kirim bukti bayar lewat WhatsApp
              </a>
              <a
                href={`/api/jalan-sehat/qris/${p.kode}`}
                download={`QRIS-${p.kode}.png`}
                className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4"
              >
                Unduh gambar QRIS
              </a>
            </div>
            <p className="text-sm text-ink/70">
              Setelah membayar, tekan tombol WhatsApp di atas lalu lampirkan screenshot bukti bayarnya di chat
              itu. Tiket undian dikirim ke chat yang sama setelah pembayaran dicek panitia.
            </p>
          </>
        ) : null}

        {p.status === "dicek" ? (
          <Alert tone="info" title="Bukti bayar sedang dicek">
            Bukti bayar sudah kami terima. Tiket undian dikirim lewat WhatsApp setelah pembayaran dicek panitia,
            dan juga bisa diunduh di halaman ini.
          </Alert>
        ) : null}

        {p.status === "batal" ? (
          <Alert tone="error" title="Pesanan dibatalkan">
            Pembayaran tidak kami terima sampai batas waktunya. Kalau sudah terlanjur membayar, kirim bukti
            bayarnya lewat{" "}
            <a href={waBukti} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              WhatsApp
            </a>
            . Kalau belum, silakan{" "}
            <Link href="/jalan-sehat" className="font-semibold underline">
              daftar lagi
            </Link>
            .
          </Alert>
        ) : null}

        {tiket?.ok ? (
          <>
            <Alert tone="success" title="Pembayaran lunas">
              Tiket undian sudah jadi. Simpan PDF-nya dan tunjukkan tiket (di HP atau cetak) saat nomor Anda
              keluar di undian.
            </Alert>
            <ul className="flex flex-wrap gap-2">
              {tiket.data.map((t) => (
                <li key={t.id} className="judul border border-line bg-card px-3 py-1 text-3xl tabular-nums text-accent">
                  {nomorTiket(t.id)}
                </li>
              ))}
            </ul>
            <a href={`/api/jalan-sehat/tiket/${p.token}`} download={`Tiket-Jalan-Sehat-${p.kode}.pdf`} className={TOMBOL}>
              Unduh tiket PDF
            </a>
            <p className="text-sm text-ink/70">{SYARAT_AMBIL_HADIAH}</p>
          </>
        ) : null}

        <p className="text-sm text-ink/70">
          {JALAN_SEHAT.tanggal}, mulai {JALAN_SEHAT.mulai}, {JALAN_SEHAT.lokasi}. Simpan alamat halaman ini
          untuk melihat status pesanan.
        </p>
      </div>
    </section>
  );
}
