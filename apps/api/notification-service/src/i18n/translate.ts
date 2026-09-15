import { DEFAULT_LOCALE, formatNumberFor, pluralFormFor, type SupportedLocale } from '@hbcfield/shared';
import { PUSH_MESSAGES, type PushKey, type PushPluralKey } from './push-messages';

/**
 * A sentence to be written later, in a language not yet known.
 *
 * A handler knows WHAT happened when the event arrives; it does not know who
 * reads which language, and for a push to thirty people it must not care. So it
 * builds a reference — a catalogue key and the facts to put in it — and the
 * sender renders that once per language among the recipients.
 *
 * A parameter is itself allowed to be a reference, which is what keeps grammar
 * out of the handlers: "about 12 min", a leave kind, a status name are all
 * phrases of their own, rendered in the same language as the sentence around
 * them. A function is the last resort, for what a catalogue cannot hold (a
 * weekday name from Intl, a status label with a fallback).
 */
export type MsgParam =
  | string
  | number
  | null
  | undefined
  | Msg
  | PluralMsg
  | ((locale: SupportedLocale) => string);

export interface Msg {
  key: PushKey;
  params?: Record<string, MsgParam>;
  /** Cut the rendered text to this many characters — a lock screen shows little. */
  max?: number;
}

/** A plural phrase: the catalogue holds `<key>.one` and `<key>.other`. */
export interface PluralMsg {
  plural: PushPluralKey;
  count: number;
  params?: Record<string, MsgParam>;
}

/** A title and a body — what a push and a bell entry both carry. */
export interface LocalizedText {
  title: Msg | PluralMsg;
  body: Msg | PluralMsg;
}

export const msg = (key: PushKey, params?: Record<string, MsgParam>, max?: number): Msg =>
  max === undefined ? { key, params } : { key, params, max };

export const plural = (key: PushPluralKey, count: number, params?: Record<string, MsgParam>): PluralMsg => ({
  plural: key,
  count,
  params,
});

/**
 * Text that arrives already written by a person — a chat line, a refusal
 * reason, a support reply. It is not translated and must not be; it goes
 * through the catalogue anyway so that every title and body a handler sends is
 * a key, and "is this sentence translated?" is a question the guard spec can
 * answer by reading the source.
 */
export const verbatim = (text: string | null | undefined, max?: number): Msg =>
  msg('common.verbatim', { text: text ?? '' }, max);

/** Several phrases on one line, each written in the reader's language. */
export const joined = (parts: Array<Msg | PluralMsg>, separator: string) => (locale: SupportedLocale) =>
  parts.map((part) => render(locale, part)).join(separator);

// Shared with the email templates, so a push and an email to the same member
// write "8,5" and choose "1 Tag" by the same rule.
const formatNumber = (locale: SupportedLocale, n: number) => formatNumberFor(locale, n);
const pluralForm = pluralFormFor;

function renderParam(locale: SupportedLocale, value: MsgParam): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(locale, value);
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return value(locale);
  return render(locale, value);
}

function interpolate(template: string, locale: SupportedLocale, params?: Record<string, MsgParam>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => renderParam(locale, params?.[name]));
}

/** One sentence, in one language. An unknown locale reads the default. */
export function render(locale: SupportedLocale, message: Msg | PluralMsg): string {
  const catalogue = PUSH_MESSAGES[locale] ?? PUSH_MESSAGES[DEFAULT_LOCALE];
  if ('plural' in message) {
    const key = `${message.plural}.${pluralForm(locale, message.count)}` as PushKey;
    return interpolate(catalogue[key], locale, { count: message.count, ...message.params });
  }
  const text = interpolate(catalogue[message.key], locale, message.params);
  return message.max !== undefined && text.length > message.max ? text.slice(0, message.max) : text;
}

export function renderText(locale: SupportedLocale, text: LocalizedText): { title: string; body: string } {
  return { title: render(locale, text.title), body: render(locale, text.body) };
}
