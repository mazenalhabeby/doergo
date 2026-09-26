/*
  Every word the Clients widget prints, in all five languages.

  The keys are READ from the widget's own source, not listed here, so a key
  added to the card without a translation fails this file rather than
  rendering its own name on a German phone.
*/
import * as fs from 'fs';
import * as path from 'path';

const HOME = path.join(__dirname, '../../components/home');
const SOURCES = ['clients-card.tsx', 'clients-state.ts', 'reminder-row.tsx'].map((f) => fs.readFileSync(path.join(HOME, f), 'utf8'));
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const catalogue = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(__dirname, `../../i18n/locales/${l}.json`), 'utf8'))]));

const lookup = (obj: any, key: string) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* Static keys straight from the source, plus the row keys built from a verb. */
const staticKeys = new Set<string>();
for (const src of SOURCES) for (const m of src.matchAll(/['`]((?:clientsCard|pitch|widgets)\.[A-Za-z.]+[A-Za-z])['`]/g)) staticKeys.add(m[1]);
const dynamicRowKeys = ['ring', 'email'].flatMap((v) => ['', 'Why', 'Reason', 'Shared'].map((s) => `clientsCard.row.${v}${s}`));
const keys = [...new Set([...staticKeys, ...dynamicRowKeys, 'customers.record.reminderFailed'])].sort();

/** Keys the widget passes `count` to — each needs every plural form of each language. */
const counted = new Set<string>();
for (const src of SOURCES) for (const m of src.matchAll(/['`]((?:clientsCard|pitch)\.[A-Za-z.]+)['`][^)\n]*?\{[^}]*\bcount\b/g)) counted.add(m[1]);
// headline(): the title and split phrases carry `count` through a Phrase.
['clientsCard.owedCallLabel', 'clientsCard.owedEmailLabel', 'clientsCard.needYouLabel', 'clientsCard.split.overdue',
  'clientsCard.split.todayCount', 'clientsCard.split.calls', 'clientsCard.split.emails', 'clientsCard.split.other',
  'clientsCard.split.notYoursAlone'].forEach((k) => counted.add(k));

describe('Clients widget — translations', () => {
  it('found the keys it is meant to check', () => {
    expect(keys.length).toBeGreaterThan(30);
    expect(keys).toEqual(expect.arrayContaining(['clientsCard.cold', 'clientsCard.coldNever', 'pitch.clients', 'widgets.clients']));
  });

  for (const l of LOCALES) {
    const categories = new Intl.PluralRules(l).resolvedOptions().pluralCategories;
    it(`${l}: every key the widget uses resolves to a sentence`, () => {
      const missing: string[] = [];
      for (const k of keys) {
        const plain = lookup(catalogue[l], k);
        if (counted.has(k)) {
          // i18next: `key_one` / `key_other` (…`_many`); a plain string also answers every count.
          if (typeof plain === 'string') continue;
          for (const c of categories) if (typeof lookup(catalogue[l], `${k}_${c}`) !== 'string' && !(c === 'many' && typeof lookup(catalogue[l], `${k}_other`) === 'string')) missing.push(`${k}_${c}`);
        } else if (typeof plain !== 'string' && typeof lookup(catalogue[l], `${k}_other`) !== 'string') {
          missing.push(k);
        }
      }
      expect(missing).toEqual([]);
    });

    it(`${l}: the same placeholders as English — a count or a name is never dropped`, () => {
      const holes = (s: unknown) => (typeof s === 'string' ? [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort() : []);
      const walk = (en: any, other: any, at: string, out: string[]) => {
        for (const [k, v] of Object.entries(en)) {
          if (v && typeof v === 'object') walk(v, other?.[k] ?? {}, `${at}.${k}`, out);
          else {
            const o = other?.[k];
            if (typeof o !== 'string') out.push(`${at}.${k} missing`);
            else if (!/_(one|two|few|zero)$/.test(k) && holes(v).join() !== holes(o).join()) out.push(`${at}.${k} ${holes(v)} vs ${holes(o)}`);
          }
        }
      };
      const out: string[] = [];
      walk(catalogue.en.clientsCard, catalogue[l].clientsCard, 'clientsCard', out);
      expect(out).toEqual([]);
    });
  }

  it('no static phrase: every number the card prints comes from the answer', () => {
    const card = SOURCES[0];
    // Nothing but a translation between two JSX tags.
    expect(card.match(/>\s*[A-Za-z][A-Za-z ,.'’]{3,}\s*</g) ?? []).toEqual([]);
    // No hard-coded day rule: "30 days" is the SERVER's `cold.days`.
    expect(card).not.toMatch(/\b30\b/);
    expect(card).toMatch(/cold\.days/);
  });

  it('never the word paid/unpaid in any of the widget’s sentences', () => {
    for (const l of LOCALES) {
      const text = JSON.stringify(catalogue[l].clientsCard) + JSON.stringify(lookup(catalogue[l], 'pitch.clients_other') ?? '');
      expect(text).not.toMatch(/\b(un)?paid\b/i);
    }
  });
});
