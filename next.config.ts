import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Header keamanan dasar (temuan audit 2026-08-29). CSP penuh sengaja belum
 * dipasang — butuh pengujian tersendiri agar tidak mematahkan style/script
 * inline Next; empat header ini aman dan langsung menutup clickjacking +
 * MIME-sniffing.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Berkas di public/ tidak ber-hash, jadi cukup sehari (jangan immutable). */
const CACHE_SEHARI = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig = {
  poweredByHeader: false,
  // Kompresi (br, zstd, gzip) dikerjakan Traefik lewat middleware kompresi@file.
  compress: false,
  output: "standalone",
  // Template PDF formulir dealer dibaca lewat fs saat runtime, jadi perlu ikut ke output standalone.
  outputFileTracingIncludes: {
    "/dealer/**": ["./src/assets/formulir-dealer/**", "./src/assets/kwitansi-dealer/**"],
    "/drivetechadmin/kwitansi/**": ["./src/assets/kwitansi-dealer/**"],
  },
  images: {
    // Hasil optimasi gambar disimpan 31 hari supaya sharp tidak mengolah ulang tiap jam.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      { source: "/gambar/:path*", headers: [{ key: "Cache-Control", value: CACHE_SEHARI }] },
      { source: "/:berkas(logo-dpro.svg|logo-drivetech.svg)", headers: [{ key: "Cache-Control", value: CACHE_SEHARI }] },
      { source: "/denah.svg", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
} satisfies NextConfig;

/**
 * Bungkus Sentry: menambahkan instrumentasi error otomatis. Tanpa DSN/auth token
 * ia hanya melewati build (upload sourcemap dilewati). `silent` meredam log build.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  // Upload sourcemap butuh SENTRY_AUTH_TOKEN + org/project; dilewati bila kosong.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
