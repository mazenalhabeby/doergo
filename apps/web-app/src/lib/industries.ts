import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it from "@/i18n/locales/it.json";
import { ALL_LOCALES, DEFAULT_LOCALE, localePath } from "./marketing-seo";

// Server-side copy accessor — industry pages are static server components, so they
// read the localized strings straight from the JSON (no client i18next needed).
const COPY: Record<string, unknown> = { en, de, es, fr, it };

type IndustryField = { name: string; who: string; how: string; benefit: string };
type HomeCopy = {
  nav?: { industries?: string };
  industries?: { heading?: string; lead?: string; whoLabel?: string; howLabel?: string; more?: string; fields?: IndustryField[] };
  field?: { label?: string; features?: { title: string; desc: string }[] };
  cta?: { requestDemo?: string; trialNote?: string };
  why?: { lead?: string };
};

export function homeCopy(lang: string): HomeCopy {
  return ((COPY[lang] ?? COPY.en) as { home?: HomeCopy }).home ?? {};
}

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

export function industryData(lang: string, slug: string): IndustryField | undefined {
  const idx = INDUSTRY_SLUGS.indexOf(slug as IndustrySlug);
  const fields = homeCopy(lang).industries?.fields ?? [];
  return idx >= 0 ? fields[idx] : undefined;
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
