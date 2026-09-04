import type { Metadata } from "next";
import { headers } from "next/headers";

import { SplashMobil } from "./SplashMobil";
import { EVENT_INFO } from "@/lib/domain/constants";
import { QR_MEDIA_TANPA_PARAM, QR_SLUG_RE } from "@/lib/qr-media";
import { clientIpFromHeaders, rateLimitShared } from "@/lib/rate-limit";
import { adalahBot, catatScanQr, platformDariUa } from "@/lib/services/qr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Selamat datang",
  description: `Membuka situs ${EVENT_INFO.name}.`,
  // Halaman pintu masuk QR — jangan diindeks; beranda yang jadi halaman utama.
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Pintu masuk dari kode QR: `/go?dari=<media>`. Mencatat satu scan per
 * kunjungan (tanpa data pribadi) lalu memutar splash mobil sebelum ke beranda.
 * Tujuan sengaja SATU (beranda) — keputusan pemilik 2026-09-04: satu QR untuk
 * landing page sebagai kesatuan.
 */
export default async function GoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dariRaw = params.dari;
  const dari = Array.isArray(dariRaw) ? dariRaw[0] : dariRaw;
  const media = dari && QR_SLUG_RE.test(dari) ? dari : QR_MEDIA_TANPA_PARAM;

  const h = await headers();
  const ua = h.get("user-agent");
  if (!adalahBot(ua)) {
    // Maks 20 catatan/menit per IP: cukup untuk satu keluarga scan bergantian
    // di satu Wi-Fi, tapi menahan skrip yang me-refresh halaman.
    const ip = await clientIpFromHeaders();
    if (await rateLimitShared(`qr:scan:${ip}`, 20, 60)) {
      await catatScanQr({ media, platform: platformDariUa(ua) });
    }
  }

  return <SplashMobil tujuan="/" />;
}
