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
    <div className="anim-fade-up mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger"
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
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-ink">
        Terjadi kesalahan
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Halaman gagal dimuat. Coba lagi — kalau berulang, hubungi panitia.
      </p>
      {error.digest ? (
        <p className="mt-4 rounded-full border border-line bg-card px-3 py-1 text-xs text-subtle">
          Kode galat: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Coba Lagi</Button>
        <Link href="/" className={buttonClass("secondary")}>
          Kembali ke Denah
        </Link>
      </div>
    </div>
  );
}
