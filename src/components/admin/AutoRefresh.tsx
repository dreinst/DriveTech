"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type AutoRefreshProps = {
  /** Jarak antar pemuatan ulang data, dalam milidetik. */
  intervalMs?: number;
};

/** "14.05.33" — jam Indonesia dengan detik, untuk stempel pembaruan. */
const waktuFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Pil "Data Langsung" ala mockup dasbor: titik hijau berdenyut + pemantau pasif
 * yang memanggil router.refresh() tiap interval supaya data server component
 * tetap segar tanpa reload halaman.
 * Diam otomatis saat tab tidak terlihat (document.hidden) dan bisa dijeda manual.
 */
export function AutoRefresh({ intervalMs = 12000 }: AutoRefreshProps) {
  const router = useRouter();
  const [jeda, setJeda] = useState(false);
  const [terakhir, setTerakhir] = useState<string | null>(null);

  useEffect(() => {
    if (jeda) return;

    const id = window.setInterval(() => {
      if (document.hidden) return; // tab di belakang: jangan buang request
      router.refresh();
      setTerakhir(waktuFormatter.format(new Date()));
    }, Math.max(3000, intervalMs));

    return () => window.clearInterval(id);
  }, [jeda, intervalMs, router]);

  const judulTombol = jeda ? "Lanjutkan pemantauan otomatis" : "Jeda pemantauan otomatis";

  return (
    <div className="inline-flex h-11 items-center gap-2.5 rounded-full border border-line bg-card pl-4 pr-1.5 shadow-[var(--shadow-sm)]">
      <span aria-hidden="true" className="relative flex h-2 w-2">
        {jeda ? null : (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            jeda ? "bg-line-strong" : "bg-ok",
          )}
        />
      </span>

      {/* Tanpa role="status": pembaruan tiap interval tidak perlu diumumkan pembaca layar. */}
      <span className="whitespace-nowrap text-xs font-medium text-ink sm:text-sm">
        {jeda ? "Pemantauan Dijeda" : "Data Langsung"}
      </span>

      {terakhir && !jeda ? (
        <span className="tabular hidden whitespace-nowrap text-xs text-subtle sm:inline">
          {terakhir}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => setJeda((nilai) => !nilai)}
        title={judulTombol}
        aria-label={judulTombol}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-subtle transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-app hover:text-ink"
      >
        {jeda ? (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M6.5 4.3a1 1 0 0 1 1.52-.85l8 5.2a1 1 0 0 1 0 1.7l-8 5.2a1 1 0 0 1-1.52-.85z" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <rect x="5" y="4" width="3.4" height="12" rx="1" />
            <rect x="11.6" y="4" width="3.4" height="12" rx="1" />
          </svg>
        )}
      </button>
    </div>
  );
}
