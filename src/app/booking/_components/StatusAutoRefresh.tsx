"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export type StatusAutoRefreshProps = {
  /**
   * true selama booking masih menunggu tindakan panitia (bukti dikirim, belum
   * diverifikasi) atau menunggu pembayaran. Setelah final (terkonfirmasi /
   * dibatalkan) pemantauan berhenti supaya tidak membebani server.
   */
  aktif: boolean;
  intervalMs?: number;
};

/**
 * Pemantau pasif halaman status penyewa: memanggil router.refresh() tiap
 * interval saat tab terlihat, dan segera saat tab kembali aktif, sehingga
 * verifikasi panitia tampil tanpa reload manual (laporan pemilik 2026-09-03:
 * "saat administrator verifikasi, di website client masih belum live").
 */
export function StatusAutoRefresh({ aktif, intervalMs = 15000 }: StatusAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!aktif) return;

    const segarkan = () => {
      if (!document.hidden) router.refresh();
    };
    const id = window.setInterval(segarkan, Math.max(5000, intervalMs));
    const saatTampil = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", saatTampil);
    window.addEventListener("focus", saatTampil);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", saatTampil);
      window.removeEventListener("focus", saatTampil);
    };
  }, [aktif, intervalMs, router]);

  if (!aktif) return null;
  return (
    <p className="text-xs text-muted" aria-live="polite">
      Halaman ini diperbarui otomatis setiap 15 detik — tidak perlu reload saat panitia memverifikasi.
    </p>
  );
}
