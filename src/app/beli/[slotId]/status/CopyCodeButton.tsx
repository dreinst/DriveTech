"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

/*
 * Catatan: alur booking punya komponen serupa di src/app/booking/_components/CopyButton.tsx.
 * Keduanya sengaja berdiri sendiri karena peta file memisahkan kepemilikan folder;
 * kalau nanti dirapikan, dua komponen ini layak diangkat jadi satu src/components/ui/CopyButton.tsx.
 */

export type CopyCodeButtonProps = {
  /** Teks yang disalin, mis. "TX-A1B2C3". */
  code: string;
  className?: string;
};

type Salin = "idle" | "berhasil" | "gagal";

/** Tombol salin kode transaksi, dengan cadangan untuk browser tanpa Clipboard API. */
export function CopyCodeButton({ code, className }: CopyCodeButtonProps) {
  const [status, setStatus] = useState<Salin>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function salin() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Cadangan: textarea sementara + execCommand (browser lama / konteks non-HTTPS).
        const area = document.createElement("textarea");
        area.value = code;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setStatus("berhasil");
    } catch {
      setStatus("gagal");
    }
  }

  const tersalin = status === "berhasil";

  return (
    <span className={className}>
      <Button variant="secondary" size="sm" onClick={salin}>
        {tersalin ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 10.5 8 14l7.5-8" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="7" y="7" width="9" height="9" rx="1.8" />
            <path d="M13 4.8A1.8 1.8 0 0 0 11.2 3H5.8A1.8 1.8 0 0 0 4 4.8v5.4A1.8 1.8 0 0 0 5.8 12" />
          </svg>
        )}
        {tersalin ? "Tersalin!" : status === "gagal" ? "Gagal menyalin" : "Salin kode"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {tersalin
          ? `Kode transaksi ${code} tersalin.`
          : status === "gagal"
            ? "Kode transaksi gagal disalin. Silakan salin manual."
            : ""}
      </span>
    </span>
  );
}
