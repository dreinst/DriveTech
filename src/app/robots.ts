import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const siteUrl = getSiteUrl();

/**
 * Rute publik boleh dirayapi, API tidak. Panel admin sengaja tidak disebut di sini
 * supaya alamatnya tidak terbaca dari robots.txt; halamannya sendiri noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
