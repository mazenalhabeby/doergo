import { readFileSync } from 'fs';
import { join } from 'path';
import {
  REMINDER_KINDS,
  REMINDER_KIND_KEYS,
  REMINDER_LEADS,
  REMINDER_REPEATS,
  REMINDER_PRESETS,
  reminderLeadKey,
  reminderRepeatKey,
  reminderPresetKey,
} from '@hbcfield/shared/client';
import { EMPTY_REMINDER, reminderDueAt } from '../reminder-draft';

/**
 * Every reminder option has words, in every language — and the due instant is
 * the one the member picked.
 *
 * A missing key does not crash: i18next renders the key itself, so a German
 * reader choosing when to be reminded is offered `customers.lead.1440`. Nothing
 * in a typecheck or a render catches that.
 *
 * ⚠️ The lists come from SHARED, never retyped here. Adding a lead time or a
 * repeat must fail this test until it has words in all five files — which is
 * the only reason the test is worth having.
 */
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

const load = (lang: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', `${lang}.json`), 'utf8'));

const at = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

const words = (dict: unknown, key: string) => {
  const value = at(dict, key);
  return typeof value === 'string' && value.trim().length > 0;
};

describe('the reminder options are translated everywhere', () => {
  it.each(LOCALES)('%s names every reason', (lang) => {
    const dict = load(lang);
    for (const kind of REMINDER_KINDS) expect(words(dict, REMINDER_KIND_KEYS[kind])).toBe(true);
  });

  it.each(LOCALES)('%s names every lead time', (lang) => {
    const dict = load(lang);
    // `customers.lead.0` is "At time", not "0 minutes before" — a generated
    // label would read wrong for exactly the option most people leave alone.
    for (const min of REMINDER_LEADS) expect(words(dict, reminderLeadKey(min))).toBe(true);
  });

  it.each(LOCALES)('%s names every repeat', (lang) => {
    const dict = load(lang);
    for (const repeat of REMINDER_REPEATS) expect(words(dict, reminderRepeatKey(repeat))).toBe(true);
  });

  it.each(LOCALES)('%s names every quick preset', (lang) => {
    const dict = load(lang);
    // The presets are keyed by the SHARED list, so the catalogue's own older
    // `due.week` no longer decides anything — `nextWeek` does.
    for (const preset of REMINDER_PRESETS) expect(words(dict, reminderPresetKey(preset.key))).toBe(true);
  });

  const FORM = [
    'customers.record.reminderForm.reason',
    'customers.record.reminderForm.when',
    'customers.record.reminderForm.pickDay',
    'customers.record.reminderForm.time',
    'customers.record.reminderForm.lead',
    'customers.record.reminderForm.repeat',
    'customers.record.reminderForm.who',
    'customers.record.reminderForm.allManagers',
    'customers.record.reminderForm.me',
    'customers.record.reminderForm.whoAll',
    'customers.record.reminderForm.whoOne',
    'customers.record.newTask',
    'createTask.forClient',
    'createTask.forClientUnnamed',
    'createTask.clearClient',
  ];

  it.each(LOCALES)('%s carries the form and the client-visit wording', (lang) => {
    const dict = load(lang);
    for (const key of FORM) expect(words(dict, key)).toBe(true);
  });
});

describe('when a reminder is actually due', () => {
  it('is nothing at all until a day is picked', () => {
    // A preset decides the instant instead; the exact form must not invent one
    // from its default hour alone.
    expect(reminderDueAt(EMPTY_REMINDER)).toBeNull();
    expect(reminderDueAt({ ...EMPTY_REMINDER, dayKey: 'not-a-day' })).toBeNull();
  });

  it('means the hour where the member is standing, not UTC', () => {
    /*
      The failure this pins: serialising "2026-09-20T09:00" as if it were UTC.
      Read back in the phone's own zone the local clock must still say 09:00 —
      in Vienna a UTC reading would ring at 11:00, and the member would never
      connect the two.
    */
    const iso = reminderDueAt({ ...EMPTY_REMINDER, dayKey: '2026-09-20', time: '09:00' });
    const back = new Date(iso!);
    expect(back.getHours()).toBe(9);
    expect(back.getMinutes()).toBe(0);
    expect(back.getDate()).toBe(20);
  });

  it('falls back to a working hour, never to midnight', () => {
    // Midnight is the app's stored value for "no hour given" elsewhere; a
    // follow-up call defaulting to it would be a reminder at 00:00.
    const back = new Date(reminderDueAt({ ...EMPTY_REMINDER, dayKey: '2026-09-20', time: '' })!);
    expect(back.getHours()).toBe(9);
  });
});
