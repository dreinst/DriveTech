/**
 * Inisialisasi Sentry untuk runtime Edge (middleware). Aktif hanya bila DSN
 * diisi; lihat catatan di sentry.server.config.ts.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
