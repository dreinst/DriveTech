"use client";

import { useEffect } from "react";

/**
 * Halaman DIAGNOSTIK SEMENTARA untuk memverifikasi Sentry sisi browser.
 * Dengan ?boom=dt-klien-7c2f, melempar error tak-tertangani (via setTimeout)
 * yang akan ditangkap window.onerror -> Sentry client. Dihapus setelah verifikasi.
 */
export default function UjiKlienPage() {
  useEffect(() => {
    if (window.location.search.includes("boom=dt-klien-7c2f")) {
      setTimeout(() => {
        throw new Error("Drive Tech — uji error klien Sentry (disengaja)");
      }, 60);
    }
  }, []);

  return <p style={{ padding: 24 }}>Halaman uji klien.</p>;
}
