import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../notifications/locale';
import { formatNumberFor, pluralFormFor } from '../notifications/locale-format';
import { EMAIL_MESSAGES, type EmailKey, type EmailPluralKey } from './email-messages';

/**
 * Turning catalogue keys into the words of one email, in one language.
 *
 * The part that matters is the ESCAPING. An email is HTML, and most of what
 * goes into one was typed by somebody else: an organization's name, a task
 * title, a member's name, a document title. The first version of these emails
 * escaped some interpolations and not others (the geofence alert put the
 * member's name in raw), which is how a name becomes markup in a manager's
 * inbox. So here there is no way to put text into HTML without escaping it:
 * `html()` escapes the sentence and every value, and the only way through is a
 * `SafeHtml` built by this file from an escaped value.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Markup this file made from an escaped value. Not constructible elsewhere by accident. */
export class SafeHtml {
  private constructor(
    readonly html: string,
    readonly plain: string,
  ) {}

  /** @internal Only the helpers below call this. */
  static fromEscaped(html: string, plain: string): SafeHtml {
    return new SafeHtml(html, plain);
  }
}

/** A value shown in bold — an organization's name, a role. Escaped first. */
export const bold = (value: string | number | null | undefined): SafeHtml =>
  SafeHtml.fromEscaped(`<strong>${escapeHtml(value)}</strong>`, value == null ? '' : String(value));

export type EmailParam = string | number | null | undefined | SafeHtml;
export type EmailPhrase = EmailKey | { plural: EmailPluralKey; count: number };

/** Every language the catalogue has; anything else (null, "pt", garbage) reads English. */
export function emailLocale(locale: unknown): SupportedLocale {
  return normalizeLocale(locale) ?? DEFAULT_LOCALE;
}

export interface EmailTranslator {
  readonly locale: SupportedLocale;
  /** For a SUBJECT or any plain-text context: nothing escaped, values as typed. */
  text(phrase: EmailPhrase, params?: Record<string, EmailParam>): string;
  /** For the BODY: the sentence and every value escaped; only SafeHtml passes through. */
  html(phrase: EmailPhrase, params?: Record<string, EmailParam>): string;
  /** A number the way this reader writes it ("8,5" in German). */
  number(n: number, maxFractionDigits?: number): string;
  /** A date the way this reader writes it. Empty for a value that is not a date. */
  date(value: Date | string | number, options: Intl.DateTimeFormatOptions): string;
}

function templateFor(locale: SupportedLocale, phrase: EmailPhrase): { template: string; count?: number } {
  const catalogue = EMAIL_MESSAGES[locale] ?? EMAIL_MESSAGES[DEFAULT_LOCALE];
  if (typeof phrase === 'string') return { template: catalogue[phrase] };
  const key = `${phrase.plural}.${pluralFormFor(locale, phrase.count)}` as EmailKey;
  return { template: catalogue[key], count: phrase.count };
}

function valueFor(locale: SupportedLocale, value: EmailParam, escape: boolean): string {
  if (value === null || value === undefined) return '';
  if (value instanceof SafeHtml) return escape ? value.html : value.plain;
  const text = typeof value === 'number' ? formatNumberFor(locale, value) : value;
  return escape ? escapeHtml(text) : text;
}

function fill(
  locale: SupportedLocale,
  phrase: EmailPhrase,
  params: Record<string, EmailParam> | undefined,
  escape: boolean,
): string {
  const { template, count } = templateFor(locale, phrase);
  const all: Record<string, EmailParam> = count === undefined ? { ...params } : { count, ...params };
  // Split on placeholders so the catalogue's own words are escaped too — a
  // French "l’a" is harmless, but nothing here should depend on that.
  return template
    .split(/(\{\{\w+\}\})/g)
    .map((part) => {
      const name = /^\{\{(\w+)\}\}$/.exec(part)?.[1];
      if (name) return valueFor(locale, all[name], escape);
      return escape ? escapeHtml(part) : part;
    })
    .join('');
}

export function emailTranslator(locale: unknown): EmailTranslator {
  const loc = emailLocale(locale);
  return {
    locale: loc,
    text: (phrase, params) => fill(loc, phrase, params, false),
    html: (phrase, params) => fill(loc, phrase, params, true),
    number: (n, maxFractionDigits = 1) => formatNumberFor(loc, n, maxFractionDigits),
    date: (value, options) => {
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(loc, options).format(d);
    },
  };
}

/**
 * One line, whatever was typed. A header is not HTML — escaping it would show
 * "&amp;" in the inbox — but a line break in a task title must not reach it.
 */
export function subjectLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s*—\s*$/, '').trim();
}

/**
 * The document around a body. `lang` is what makes a screen reader pronounce a
 * German email in German and a mail client offer to translate the right way;
 * `dir` is stated rather than assumed, so adding a right-to-left language later
 * is a change to one attribute rather than a hunt.
 */
export function emailDocument(locale: SupportedLocale, body: string): string {
  return `<!DOCTYPE html>
<html lang="${locale}" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>${body}</body>
</html>`;
}
