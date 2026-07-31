import type { MetadataRoute } from "next";
import { SITE_URL as SITE, MARKETING_LOCALES, hreflangAlternates } from "@/lib/marketing-seo";

// Public, indexable pages only. Add blog/resource URLs here as you publish them.
const ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/help", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/account-deletion", priority: 0.2, changeFrequency: "yearly" },
];

// hreflang map as absolute URLs for the sitemap alternates.
const LANG_ALTERNATES = Object.fromEntries(
  Object.entries(hreflangAlternates()).map(([k, p]) => [k, `${SITE}${p === "/" ? "" : p}` || SITE]),
);

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: `${SITE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    // The homepage declares its language alternates; other pages are English-only.
    ...(r.path === "/" ? { alternates: { languages: LANG_ALTERNATES } } : {}),
  }));
  // Localized homepages (/de, /es, /fr, /it), each cross-referencing the set.
  const localized: MetadataRoute.Sitemap = MARKETING_LOCALES.map((lang) => ({
    url: `${SITE}/${lang}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
    alternates: { languages: LANG_ALTERNATES },
  }));
  return [...pages, ...localized];
}
