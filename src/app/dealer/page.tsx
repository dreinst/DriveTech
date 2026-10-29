import type { Metadata } from "next";

import { FormulirDealerForm } from "./FormulirDealerForm";

export const metadata: Metadata = {
  title: "Formulir Dealer Mobil dan Motor Baru",
  description:
    "Pendaftaran dan komitmen dealer mobil dan motor baru DriveTech Vol. 1, Rest Area Singosari (Kampung Tentara), Kabupaten Malang.",
  alternates: { canonical: "/dealer" },
};

export default function DealerPage() {
  return (
    <section className="gelap bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-8 md:py-16">
        <p className="label text-sm text-accent">DriveTech Vol. 1</p>
        <h1 className="judul mt-2 text-[clamp(2.5rem,8vw,4.5rem)] leading-none text-ink">
          Formulir dealer mobil dan motor baru
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink/80">
          Sabtu dan Minggu, 7 dan 8 November 2026 (pembukaan), selanjutnya setiap hari Minggu sampai 27 Desember 2026
          di Rest Area Singosari (Kampung Tentara). Sabtu pukul 12.00 sampai 22.00 WIB, Minggu pukul 06.00 sampai 12.00
          WIB.
        </p>
        <p className="mt-3 text-sm text-muted">
          Isi formulir di bawah lalu tanda tangan di layar. Hasilnya langsung jadi PDF formulir dan surat komitmen yang
          sudah bertanda tangan. Lebih suka mengisi PDF?{" "}
          <a href="/dealer/formulir.pdf" className="font-semibold text-accent underline underline-offset-4">
            Unduh PDF isian
          </a>
          .
        </p>
        <div className="mt-10 border border-line bg-card p-5 sm:p-8">
          <FormulirDealerForm />
        </div>
      </div>
    </section>
  );
}
