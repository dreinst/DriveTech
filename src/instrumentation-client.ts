/**
 * Inisialisasi Sentry sisi BROWSER. Menangkap error JS/React yang tidak
 * tertangani di sisi pengunjung. Aktif hanya bila DSN publik diisi
 * (NEXT_PUBLIC_SENTRY_DSN) — tanpa itu, tidak ada apa pun yang dimuat/dikirim.
 *
 * WAJIB di src/ (proyek pakai struktur src/) agar Next.js menjalankannya.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Session Replay dimatikan default (hemat kuota gratis); nyalakan bila perlu.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Instrumentasi navigasi App Router (dipakai Sentry untuk performance).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
