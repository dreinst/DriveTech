/**
 * Titik masuk instrumentation Next.js. Memuat konfigurasi Sentry sesuai runtime
 * dan meneruskan error request (Server Components, Route Handlers, Server Actions)
 * ke Sentry. Semua no-op bila DSN belum diisi.
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
