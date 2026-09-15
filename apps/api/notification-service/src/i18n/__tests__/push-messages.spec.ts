import { SUPPORTED_LOCALES } from '@hbcfield/shared';
import { PUSH_MESSAGES, type PushKey } from '../push-messages';

/**
 * The catalogue is complete in every language, and says the same thing with
 * the same facts.
 *
 * The type system already refuses a key missing from one language. What it
 * cannot see is a placeholder: a German sentence that forgot `{{name}}` renders
 * as "hat eine Anfrage gestellt" — grammatical, delivered, and about nobody —
 * and one that spells it `{{Name}}` leaves the braces on a lock screen.
 */
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('push message catalogue', () => {
  const en = PUSH_MESSAGES.en;
  const keys = Object.keys(en) as PushKey[];

  it('has a catalogue for every supported locale and nothing else', () => {
    expect(Object.keys(PUSH_MESSAGES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))('%s has exactly the English keys', (locale) => {
    expect(Object.keys(PUSH_MESSAGES[locale]).sort()).toEqual([...keys].sort());
  });

  it.each(SUPPORTED_LOCALES)('%s uses the same placeholders as English, key by key', (locale) => {
    const mismatched = keys.filter(
      (key) => placeholders(PUSH_MESSAGES[locale][key]).join() !== placeholders(en[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES)('%s leaves no sentence empty', (locale) => {
    expect(keys.filter((key) => !PUSH_MESSAGES[locale][key]?.trim())).toEqual([]);
  });

  it('writes every plural as a complete one/other pair', () => {
    const ones = keys.filter((k) => k.endsWith('.one')).map((k) => k.slice(0, -4));
    const others = keys.filter((k) => k.endsWith('.other')).map((k) => k.slice(0, -6));
    expect(ones.sort()).toEqual(others.sort());
  });

  it('only uses placeholders in the {{name}} form', () => {
    const malformed = SUPPORTED_LOCALES.flatMap((locale) =>
      keys
        .filter((key) => /\{(?!\{)|\{\{[^}]*\W[^}]*\}\}|\{\{\s/.test(PUSH_MESSAGES[locale][key].replace(/\{\{\w+\}\}/g, '')))
        .map((key) => `${locale}:${key}`),
    );
    expect(malformed).toEqual([]);
  });

  /*
    ⚠️ Product rule: time is counted or worked, never "paid". It applies to
    every language, which is exactly where it would slip in unnoticed.
  */
  it('never talks about pay, in any language', () => {
    const pay = /\b(un)?paid\b|bezahlt|vergütet|pagad|remunerad|payé|rémunér|pagat|retribuit/i;
    const offending = SUPPORTED_LOCALES.flatMap((locale) =>
      keys.filter((key) => pay.test(PUSH_MESSAGES[locale][key])).map((key) => `${locale}:${key}`),
    );
    expect(offending).toEqual([]);
  });

  it('addresses a German reader formally', () => {
    const informal = keys.filter((key) => /\b(du|dich|dir|dein\w*)\b/i.test(PUSH_MESSAGES.de[key]));
    expect(informal).toEqual([]);
  });
});
