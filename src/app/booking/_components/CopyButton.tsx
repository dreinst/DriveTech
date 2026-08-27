"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

export type CopyButtonProps = {
  /** Teks yang disalin ke papan klip. */
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

/** Tombol salin teks (kode booking) dengan cadangan untuk browser tanpa Clipboard API. */
export function CopyButton({
  value,
  label = "Salin kode",
  copiedLabel = "Tersalin!",
  className,
}: CopyButtonProps) {
  const [tersalin, setTersalin] = useState(false);

  useEffect(() => {
    if (!tersalin) return;
    const timer = window.setTimeout(() => setTersalin(false), 2000);
    return () => window.clearTimeout(timer);
  }, [tersalin]);

  async function salin() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Cadangan: textarea sementara + execCommand (browser lama / konteks non-HTTPS).
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setTersalin(true);
    } catch {
      setTersalin(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={salin} className={className}>
      {tersalin ? (
        <>
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
          {copiedLabel}
        </>
      ) : (
        <>
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
          {label}
        </>
      )}
    </Button>
  );
}
