import { localeBundle } from "@/i18n/server-bundles";
import { INDUSTRY_SLUGS } from "./industries";

/**
 * Marketing copy accessors — SERVER ONLY.
 *
 * Reads through `@/i18n/server-bundles`, which owns the locale imports. This
 * module exists as a separate file because of how the catalogue got into the
 * browser in the first place.
 *
 * These accessors used to sit in `industries.ts` alongside a handful of pure
 * path helpers. `HomeClient.tsx` is a `'use client'` component and imports
 * three of those helpers — `INDUSTRY_SLUGS`, `industryPath`,
 * `industriesHubPath`, none of which touch a single translation key. But an
 * import is a module, not a symbol: pulling one function across the client
 * boundary dragged the module's whole import graph with it, and every visitor
 * to the English home page downloaded all five languages of the entire
 * application — the dashboard, the documents module, the guided tours — to
 * render a marketing page.
 *
 * Nothing here may be imported from a file marked `'use client'`.
 * `src/__tests__/i18n-client-bundle.spec.ts` walks the client module graph and
 * fails if anything reaches it, because the cost of getting this wrong is
 * invisible in review and enormous on the wire.
 */

type IndustryField = { name: string; who: string; how: string; benefit: string };
export type HomeCopy = {
  nav?: { industries?: string };
  industries?: { heading?: string; lead?: string; whoLabel?: string; howLabel?: string; more?: string; fields?: IndustryField[] };
  field?: { label?: string; features?: { title: string; desc: string }[] };
  cta?: { requestDemo?: string; trialNote?: string };
  why?: { lead?: string };
};

export function homeCopy(lang: string): HomeCopy {
  return ((localeBundle(lang) as { home?: HomeCopy }).home) ?? {};
}

/** One industry's localized field, resolved by its index in the slug list. */
export function industryData(lang: string, slug: string): IndustryField | undefined {
  // The slug list is imported, not redeclared: the index alignment between
  // slugs and copy is the contract, and a second copy of the list is how that
  // contract silently breaks. `industries.ts` does not import this module, so
  // there is no cycle.
  const idx = (INDUSTRY_SLUGS as readonly string[]).indexOf(slug);
  const fields = homeCopy(lang).industries?.fields ?? [];
  return idx >= 0 ? fields[idx] : undefined;
}
