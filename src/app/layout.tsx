import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { EVENT_INFO } from "@/lib/domain/constants";
import { getSiteUrl } from "@/lib/site-url";

/* Isi memakai Inter, judul memakai Barlow Condensed (lihat --font-display di globals.css). */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
  display: "swap",
});

const siteUrl = getSiteUrl();

const siteTitle = `${EVENT_INFO.name} Malang, pameran dan pasar otomotif di Singosari`;
const siteDescription = EVENT_INFO.description;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${EVENT_INFO.name}`,
  },
  description: siteDescription,
  applicationName: EVENT_INFO.name,
  openGraph: {
    type: "website",
    url: siteUrl,
    locale: "id_ID",
    siteName: EVENT_INFO.name,
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/gambar/pratinjau.jpg", width: 1200, height: 630, alt: EVENT_INFO.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/gambar/pratinjau.jpg"],
  },
};

/** Data terstruktur situs (nama situs di hasil pencarian) dan penyelenggara. */
const dataTerstrukturSitus = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: EVENT_INFO.name, alternateName: "Drive Tech Malang", url: siteUrl, inLanguage: "id-ID" },
    {
      "@type": "Organization",
      name: "D'Production Event Organizer",
      url: "https://www.dpro.events",
      sameAs: ["https://www.instagram.com/drivetechmalang"],
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${barlow.variable}`}>
      <body className="flex min-h-dvh flex-col bg-app font-sans text-ink antialiased">
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0a0a0a]"
        >
          Lewati ke konten utama
        </a>
        <script
          type="application/ld+json"
          // Isi berasal dari konstanta di berkas ini, bukan masukan pengguna.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dataTerstrukturSitus) }}
        />
        <SiteHeader />
        {/* Tiap halaman mengatur container-nya sendiri (hero beranda full-bleed). */}
        <main id="konten-utama" className="terang w-full flex-1 bg-krem">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
