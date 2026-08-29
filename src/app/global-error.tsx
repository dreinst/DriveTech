"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Penangkap error tingkat-root (React render errors di root layout) — melapor
 * ke Sentry lalu menampilkan halaman gagal minimal. global-error menggantikan
 * seluruh dokumen, jadi ia merender <html>/<body> sendiri dan tidak bisa
 * memakai style aplikasi (layout-nya yang gagal).
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Terjadi kesalahan</h1>
          <p style={{ color: "#a3a3a3", lineHeight: 1.6, marginBottom: 20 }}>
            Maaf, halaman gagal dimuat. Tim kami sudah otomatis diberi tahu. Coba muat ulang
            halaman ini.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 999,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: "#ff8c00",
              color: "#0a0a0a",
            }}
          >
            Muat ulang
          </button>
        </div>
      </body>
    </html>
  );
}
