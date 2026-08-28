import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

/**
 * Hanya rute publik yang statis: beranda (denah + cek status lewat anchor).
 * Rute /booking/* dan /beli/* bergantung slotId — tidak untuk diindeks massal;
 * /admin/* privat (diblok di robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
