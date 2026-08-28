import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

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
