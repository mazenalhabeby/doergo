/**
 * Which languages exist, and how to switch — WITHOUT the catalogue.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE AN IMPORT IS A MODULE, NOT A SYMBOL.
 *
 * `language-switcher.tsx` needed exactly two things — the list of languages and
 * a way to change one — and imported them from `@/i18n`, which statically
 * imports `en.json`. The switcher sits in the marketing header, so every
 * visitor to the public home page downloaded the ENTIRE English catalogue:
 * 293 KB raw, ~95 KB over the wire, 25% of the page's JavaScript, to render a
 * dropdown of five flags. They needed 8% of it.
 *
 * This is the second time this exact shape has cost us a page: `HomeClient`
 * once imported a URL helper from a module that also held the copy accessors,
 * and dragged all five languages across the client boundary. Fixing the i18n
 * entry point alone changed nothing then, and would change nothing now — what
 * matters is which MODULE a client file reaches, never which symbol it uses.
 *
 * So everything here is free-standing data, and the one function that genuinely
 * needs the instance reaches it through `import()` — deferring the catalogue to
 * the moment somebody actually picks a language, which on a marketing page is
 * approximately never.
 */

export const LANGUAGE_KEY = 'hbcfield_language';

export const SUPPORTED = ['en', 'de', 'es', 'fr', 'it'] as const;
export type Supported = (typeof SUPPORTED)[number];

export function isSupported(lang: string): lang is Supported {
  return (SUPPORTED as readonly string[]).includes(lang);
}

export const supportedLanguages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
] as const;

/**
 * Switch language, loading the machinery only when asked.
 *
 * ⚠️ The `import()` is the point, not a style choice. A static import here would
 * put `en.json` back on the marketing page and undo the whole file, with a diff
 * that looks like a tidy-up.
 *
 * The real work stays in `./index`, which owns the instance and the per-language
 * bundles; this is a door to it that costs nothing until it is opened.
 */
export async function changeLanguage(lang: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isSupported(lang)) return;
  const mod = await import('./index');
  await mod.changeLanguage(lang);
}
