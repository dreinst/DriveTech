"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Catat ke konsol server/browser agar mudah ditelusuri saat pengembangan.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600"
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
          <path d="M12 9.5v4.2" />
          <path d="M12 16.6h.01" />
        </svg>
      </span>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Terjadi kesalahan</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Maaf, halaman ini gagal dimuat. Coba muat ulang sebentar lagi. Kalau masih bermasalah, hubungi
        panitia pameran.
      </p>
      {error.digest ? (
        <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-400">
          Kode galat: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Coba Lagi</Button>
        <Link href="/" className={buttonClass("secondary")}>
          Kembali ke Denah
        </Link>
      </div>
    </div>
  );
}
