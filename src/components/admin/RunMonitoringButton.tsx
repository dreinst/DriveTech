"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Tombol "Jalankan sekarang" di /admin/monitoring: memanggil
 * POST /api/admin/monitoring (sondir manual, di luar jadwal Vercel Cron)
 * lalu me-refresh halaman agar ringkasan terbaru langsung tampil.
 */
export function RunMonitoringButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);

  function jalankan() {
    setGalat(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/monitoring", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setGalat(body?.error ?? `Gagal (HTTP ${res.status}).`);
          return;
        }
        router.refresh();
      } catch {
        setGalat("Gagal menghubungi server.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={jalankan}
        disabled={isPending}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-[#0a0a0a] transition-opacity duration-150",
          isPending ? "opacity-60" : "hover:opacity-90",
        )}
      >
        {isPending ? "Menyondir…" : "Jalankan sekarang"}
      </button>
      {galat ? <p className="text-xs text-danger">{galat}</p> : null}
    </div>
  );
}
