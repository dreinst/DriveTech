import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Halaman Tidak Ditemukan",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <p className="text-4xl font-semibold tracking-tight text-slate-300">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Tautannya mungkin salah ketik, atau slot yang kamu cari sudah tidak ada. Coba kembali ke denah
        lokasi untuk memilih slot lain.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonClass("primary", "md")}>
          Kembali ke Denah
        </Link>
        <Link href="/#cek-status" className={buttonClass("secondary", "md")}>
          Cek Status Booking
        </Link>
      </div>
    </div>
  );
}
