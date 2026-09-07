import { ALL_LOCALES, DEFAULT_LOCALE, localePath } from "./marketing-seo";

/**
 * Industry slugs and URL helpers — safe to import from a client component.
 *
 * This module deliberately contains NO translation imports. `HomeClient.tsx`
 * (`'use client'`) needs `INDUSTRY_SLUGS`, `industryPath` and
 * `industriesHubPath`; when the localized copy lived here too, that one import
 * pulled all five language files — the whole application's translations, not
 * just the marketing ones — into the browser bundle of every visitor to the
 * English home page.
 *
 * The copy accessors are in `./industry-copy`, which is server-only. Keep it
 * that way: adding a translation import here re-creates the bug in a form that
 * looks completely reasonable in a diff.
 */

// SEO-friendly slugs, index-aligned with home.industries.fields (order is stable).
export const INDUSTRY_SLUGS = [
  "property-facility-management",
  "hvac-plumbing-electrical",
  "industrial-maintenance",
  "cleaning-janitorial",
  "security-guarding",
  "landscaping-grounds",
] as const;
export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];

export function isIndustrySlug(slug: string): slug is IndustrySlug {
  return (INDUSTRY_SLUGS as readonly string[]).includes(slug);
}

/** `/industries/<slug>` for English, `/<lang>/industries/<slug>` otherwise. */
export function industryPath(lang: string, slug: string): string {
  return lang === DEFAULT_LOCALE ? `/industries/${slug}` : `/${lang}/industries/${slug}`;
}
export function industriesHubPath(lang: string): string {
  return lang === DEFAULT_LOCALE ? "/industries" : `/${lang}/industries`;
}

/** hreflang alternates for one industry across all locales (+ x-default → en). */
export function industryHreflang(slug: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of ALL_LOCALES) map[l] = industryPath(l, slug);
  map["x-default"] = industryPath(DEFAULT_LOCALE, slug);
  return map;
}
export function hubHreflang(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of ALL_LOCALES) map[l] = industriesHubPath(l);
  map["x-default"] = industriesHubPath(DEFAULT_LOCALE);
  return map;
}

export { localePath };

/*
  There is deliberately NO re-export of `homeCopy` / `industryData` here.

  Re-exporting them would have made the split invisible to callers, which is
  tempting and wrong: `export { homeCopy } from "./industry-copy"` is an import
  of that module, so this file would once again reach the five locale JSONs and
  every client component importing a path helper would pull them along. Whether
  a bundler tree-shakes that away is a property of the bundler's side-effect
  analysis, not a guarantee — and the failure is silent and costs half a
  megabyte. Server components import copy from "@/lib/industry-copy" directly.
*/
