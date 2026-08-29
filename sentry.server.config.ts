/**
 * Inisialisasi Sentry untuk runtime server (Node). AKTIF HANYA bila DSN diisi
 * lewat env — tanpa DSN, blok ini dilewati dan Sentry tidak melakukan apa pun
 * (aplikasi berjalan normal). Daftar akun gratis di https://sentry.io, buat
 * project "Next.js", salin DSN-nya ke env SENTRY_DSN (atau NEXT_PUBLIC_SENTRY_DSN).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // 10% transaksi untuk performance monitoring — cukup untuk skala event ini.
    tracesSampleRate: 0.1,
    // Jangan kirim data pengguna default (PII) tanpa disengaja.
    sendDefaultPii: false,
  });
}
