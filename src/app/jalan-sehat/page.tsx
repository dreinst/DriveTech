import type { Metadata } from "next";

import { Alert } from "@/components/ui/Alert";
import { WA_BOT_PHONE, WA_KANTOR_TAMPIL, waHref } from "@/lib/domain/constants";
import {
  BATAS_BAYAR_JAM,
  HARGA_TIKET_JS,
  JALAN_SEHAT,
  KATA_KUNCI_WA,
  PESAN_DAFTAR_DITUTUP,
  pendaftaranOnlineDibuka,
} from "@/lib/domain/jalan-sehat";
import { formatRupiah } from "@/lib/utils";
import { JalanSehatForm } from "./JalanSehatForm";

export const metadata: Metadata = {
  title: "Daftar Jalan Sehat",
  description: `${JALAN_SEHAT.judul}, ${JALAN_SEHAT.tanggal} mulai ${JALAN_SEHAT.mulai} di ${JALAN_SEHAT.lokasi}. Tiket Rp10.000 per orang, setiap peserta mendapat nomor undian doorprize.`,
  alternates: { canonical: "/jalan-sehat" },
};

// Dirender tiap permintaan supaya form hilang tepat saat pendaftaran online ditutup.
export const dynamic = "force-dynamic";

export default function JalanSehatPage() {
  return (
    <section className="gelap bg-[#0a0a0a]">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-2 md:py-20">
        <div>
          <p className="label text-sm text-accent">{formatRupiah(HARGA_TIKET_JS)} per orang</p>
          <h1 className="judul mt-2 text-[clamp(3.5rem,10vw,6rem)] text-ink">Jalan sehat</h1>
          <p className="mt-4 text-base leading-relaxed text-ink/80">
            Yuk, olahraga pagi bareng keluarga di DriveTech Vol. 1. {JALAN_SEHAT.bersama}. Tiket{" "}
            {formatRupiah(HARGA_TIKET_JS)} per orang, dan setiap peserta mendapat nomor undian doorprize sendiri.
          </p>
          <dl className="mt-8 space-y-3 border-t border-ink/25 pt-6 text-base">
            <div>
              <dt className="label text-xs text-ink/60">Waktu</dt>
              <dd className="text-ink">
                {JALAN_SEHAT.tanggal}, mulai {JALAN_SEHAT.mulai}
              </dd>
            </div>
            <div>
              <dt className="label text-xs text-ink/60">Lokasi</dt>
              <dd className="text-ink">{JALAN_SEHAT.lokasi}</dd>
            </div>
          </dl>
          <ol className="mt-6 space-y-2">
            {JALAN_SEHAT.rundown.map((butir) => (
              <li key={butir.acara} className="flex gap-4 border-t border-ink/15 pt-2">
                <span className="judul w-16 shrink-0 text-xl text-accent">{butir.jam || "Lalu"}</span>
                <span className="text-ink/85">{butir.acara}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="border border-line bg-card p-5 sm:p-7">
          <h2 className="judul text-3xl text-ink">Daftar online</h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            Satu pendaftaran bisa untuk banyak peserta, misalnya satu keluarga. Bayar lewat QRIS dalam{" "}
            {BATAS_BAYAR_JAM} jam, kirim bukti bayarnya di WhatsApp, lalu tiket undian (PDF) dikirim
            setelah pembayaran dicek panitia.
          </p>
          {pendaftaranOnlineDibuka() ? (
            <>
              <JalanSehatForm />
              <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
                Lebih mudah lewat chat? Kirim pesan{" "}
                <a
                  href={waHref(WA_BOT_PHONE, KATA_KUNCI_WA)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent underline underline-offset-4"
                >
                  {KATA_KUNCI_WA}
                </a>{" "}
                ke WhatsApp {WA_KANTOR_TAMPIL}. QRIS dan tiketnya dikirim di chat. Tanpa HP? Tiket bisa dibeli tunai di lokasi.
              </p>
            </>
          ) : (
            <Alert tone="info">{PESAN_DAFTAR_DITUTUP}</Alert>
          )}
        </div>
      </div>
    </section>
  );
}
