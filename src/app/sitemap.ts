import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

/**
 * Hanya rute publik yang statis: beranda (peta booking + cek status lewat
 * anchor), katalog kendaraan, dan denah lengkap (hanya melihat). Rute
 * /booking/* dan /beli/* bergantung slotId — tidak untuk diindeks massal;
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
    {
      url: `${siteUrl}/katalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/denah`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
  ];
}
