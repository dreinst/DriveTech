import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Halaman Tidak Ditemukan",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="tabular text-6xl font-semibold tracking-[-0.02em] text-subtle">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-ink">
        Halaman tidak ditemukan
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Tautannya mungkin salah ketik, atau slot yang kamu cari sudah tidak ada.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
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
