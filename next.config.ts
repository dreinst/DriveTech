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

const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
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
