import type { MetadataRoute } from "next";
import { SITE_URL as SITE, ALL_LOCALES, hreflangAlternates } from "@/lib/marketing-seo";
import {
  INDUSTRY_SLUGS,
  industryPath,
  industriesHubPath,
  industryHreflang,
  hubHreflang,
} from "@/lib/industries";
import { getAllPosts } from "@/lib/blog";

// Static, English-only pages (add blog/resource URLs here as you publish them).
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/help", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/account-deletion", priority: 0.2, changeFrequency: "yearly" },
];

// Relative hreflang map ({ de: "/de/…" }) → absolute URLs for the sitemap.
const abs = (rel: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(rel).map(([k, p]) => [k, `${SITE}${p === "/" ? "" : p}`]));

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const items: MetadataRoute.Sitemap = [];

  // Homepage in every language (localized alternates).
  const homeLangs = abs(hreflangAlternates());
  for (const l of ALL_LOCALES) {
    items.push({
      url: `${SITE}${l === "en" ? "" : `/${l}`}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: l === "en" ? 1.0 : 0.9,
      alternates: { languages: homeLangs },
    });
  }

  // Industries hub in every language.
  const hubLangs = abs(hubHreflang());
  for (const l of ALL_LOCALES) {
    items.push({
      url: `${SITE}${industriesHubPath(l)}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: { languages: hubLangs },
    });
  }

  // Each industry page in every language.
  for (const slug of INDUSTRY_SLUGS) {
    const langs = abs(industryHreflang(slug));
    for (const l of ALL_LOCALES) {
      items.push({
        url: `${SITE}${industryPath(l, slug)}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages: langs },
      });
    }
  }

  // English-only static pages.
  for (const r of STATIC_ROUTES) {
    items.push({ url: `${SITE}${r.path}`, lastModified: now, changeFrequency: r.changeFrequency, priority: r.priority });
  }

  // Blog hub + posts (English-only).
  const posts = getAllPosts();
  if (posts.length > 0) {
    items.push({ url: `${SITE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
    for (const p of posts) {
      items.push({
        url: `${SITE}/blog/${p.slug}`,
        lastModified: new Date(`${p.date}T00:00:00Z`),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return items;
}
