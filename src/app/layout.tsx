import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { EVENT_INFO } from "@/lib/domain/constants";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${EVENT_INFO.name} — Booking Slot`,
    template: `%s | ${EVENT_INFO.name}`,
  },
  description:
    "Pilih slot pameran langsung dari denah lokasi, isi data penyewa, lalu bayar biaya admin. Tersedia untuk dealer mobil baru, mobil & motor bekas, UMKM, dan warung.",
  applicationName: EVENT_INFO.name,
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: EVENT_INFO.name,
    title: `${EVENT_INFO.name} — Booking Slot`,
    description: "Denah interaktif, booking slot mandiri, dan pembayaran biaya admin.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="flex min-h-dvh flex-col bg-[#f8fafc] font-sans text-slate-900 antialiased">
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Lewati ke konten utama
        </a>
        <SiteHeader />
        <main id="konten-utama" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
