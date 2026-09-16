/**
 * Everything on a card that is real, recognised, and has no column to live in.
 *
 * ⚠️ THE RULE THIS FILE EXISTS FOR: a line the reader understood is never
 * discarded. Before this, anything outside the handful of known fields was
 * dropped in silence — a Facebook page, a LinkedIn profile, an IBAN, a second
 * office, opening hours. The member had photographed it, the phone had read it,
 * and the app threw it away without saying so. `Customer.details` is a JSON
 * `[{label, value}]` list that exists precisely for this, so the cost of
 * keeping something is a row, not a migration.
 *
 * ⚠️ A SOCIAL LINK IS NOT THE WEBSITE. `facebook.com/stadt.gmunden` matches
 * every "looks like a URL" test ever written, and putting it in `website` means
 * the client record points at a Facebook page instead of the company — on a
 * card that also printed `gmunden.at` two characters earlier. The network is
 * recognised by NAME and filed under its own label.
 *
 * ⚠️ Labels are TRANSLATION KEYS where the thing is known, and the raw label
 * only where the card supplied one ("Skype: …"). A label invented in English
 * here would appear in English on a German record.
 */

/** A network we can name. The order is the order they are tried. */
export const SOCIAL_NETWORKS = [
  { key: 'facebook', host: /(?:^|\.)facebook\.com$|(?:^|\.)fb\.com$/i, labelKey: 'customers.social.facebook' },
  { key: 'instagram', host: /(?:^|\.)instagram\.com$/i, labelKey: 'customers.social.instagram' },
  { key: 'linkedin', host: /(?:^|\.)linkedin\.com$/i, labelKey: 'customers.social.linkedin' },
  { key: 'xing', host: /(?:^|\.)xing\.com$/i, labelKey: 'customers.social.xing' },
  { key: 'x', host: /(?:^|\.)twitter\.com$|(?:^|\.)x\.com$/i, labelKey: 'customers.social.x' },
  { key: 'youtube', host: /(?:^|\.)youtube\.com$|(?:^|\.)youtu\.be$/i, labelKey: 'customers.social.youtube' },
  { key: 'tiktok', host: /(?:^|\.)tiktok\.com$/i, labelKey: 'customers.social.tiktok' },
  { key: 'whatsapp', host: /(?:^|\.)wa\.me$|(?:^|\.)whatsapp\.com$/i, labelKey: 'customers.social.whatsapp' },
] as const;

export type SocialKey = (typeof SOCIAL_NETWORKS)[number]['key'];

/** The host of a URL-ish string, without protocol, `www.`, path or port. */
export function hostOf(value: string): string | null {
  const trimmed = value.trim().replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '');
  const host = trimmed.split(/[/?#]/)[0]?.split(':')[0];
  if (!host || !host.includes('.')) return null;
  // A host is letters, digits, hyphens and dots — nothing else, and no spaces.
  return /^[A-Za-z0-9.-]+$/.test(host) ? host.toLowerCase() : null;
}

/**
 * Which network a link belongs to, or `null` for an ordinary website.
 *
 * ⚠️ Matched on the HOST, never on the whole string. `mycompany.com/facebook`
 * is a company's own page about their Facebook presence, not a Facebook link,
 * and a substring test files it under the wrong label.
 */
export function socialOf(value: string): (typeof SOCIAL_NETWORKS)[number] | null {
  const host = hostOf(value);
  if (!host) return null;
  return SOCIAL_NETWORKS.find((n) => n.host.test(host)) ?? null;
}

export const isSocialLink = (value: string): boolean => socialOf(value) !== null;

/* ------------------------------------------------------------------ */

/**
 * Things worth keeping that have no column of their own.
 *
 * ⚠️ A CAPTURING GROUP MEANS "THIS PART IS THE VALUE"; everything else must be
 * non-capturing. `readExtra` returns `m[1] ?? m[0]`, so an alternation written
 * as `(mo|di|mi)` — a group used only to choose between words — makes the whole
 * opening-hours line come back as the single word "Mo". It did.
 */
export const EXTRA_PATTERNS = [
  { key: 'iban', re: /\b[A-Z]{2}\d{2}[\sA-Z0-9]{10,32}\b/, labelKey: 'customers.extra.iban' },
  { key: 'bic', re: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/, labelKey: 'customers.extra.bic' },
  { key: 'hours', re: /\b(?:mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun)\b[^\n]{0,20}\d{1,2}[:.]\d{2}/i, labelKey: 'customers.extra.hours' },
  // Here the capture IS deliberate: the handle, not the word "Skype".
  { key: 'skype', re: /\bskype\b[\s:]+([\w.@-]+)/i, labelKey: 'customers.extra.skype' },
] as const;

/**
 * A label the CARD supplied, as in `Skype: live.someone` or `Mobil: …`.
 *
 * ⚠️ Bounded hard. An unbounded "anything before a colon" turns a sentence into
 * a field name, and a card that prints a strapline with a colon in it would
 * create a custom field called "Unser Versprechen".
 */
const OWN_LABEL = /^\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .-]{1,24})\s*[:：]\s*(\S.{0,120})$/;

export interface CardExtra {
  /** Translation key when we recognise the thing. */
  labelKey?: string;
  /** The card's own word for it, when it supplied one and we did not know it. */
  label?: string;
  value: string;
}

/**
 * Turn a line nothing claimed into something worth keeping — or `null`.
 *
 * ⚠️ Returning `null` is not "drop it". The caller offers every leftover line as
 * an unlabelled custom field the member can name; this only decides whether we
 * can do better than "we found this on the card". What IS dropped here is noise
 * that would clutter a record: a bare number, a single word, punctuation.
 */
export function readExtra(line: string): CardExtra | null {
  const text = line.trim();
  if (text.length < 3) return null;

  const social = socialOf(text);
  if (social) return { labelKey: social.labelKey, value: text };

  for (const p of EXTRA_PATTERNS) {
    const m = text.match(p.re);
    if (m) return { labelKey: p.labelKey, value: (m[1] ?? m[0]).trim() };
  }

  const own = text.match(OWN_LABEL);
  if (own) return { label: own[1]!.trim(), value: own[2]!.trim() };

  return null;
}

/**
 * Every leftover line as a details row, ready for `Customer.details`.
 *
 * ⚠️ Deduped by VALUE, because a card often prints the same handle twice (once
 * as a URL and once as `@name`), and a record with two Facebook rows reads as a
 * bug in the reader rather than a faithful copy of the card.
 */
export function cardExtras(leftoverLines: readonly string[]): CardExtra[] {
  const out: CardExtra[] = [];
  const seen = new Set<string>();
  for (const line of leftoverLines) {
    const extra = readExtra(line);
    if (!extra) continue;
    const key = extra.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(extra);
  }
  return out;
}
