/*
  Every word the Crew widget prints, in all five languages.

  The keys are READ from the widget's own source, not listed here, so a key
  added to the card without a translation fails this file rather than
  rendering its English default on a German phone.
*/
import * as fs from 'fs';
import * as path from 'path';

const HOME = path.join(__dirname, '../../components/home');
const FILES = ['crew-card.tsx', 'crew-state.ts', 'use-crew.ts'];
const SOURCES = FILES.map((f) => fs.readFileSync(path.join(HOME, f), 'utf8'));
const CARD = SOURCES[0]!;
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const catalogue = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(__dirname, `../../i18n/locales/${l}.json`), 'utf8'))]));
const lookup = (obj: any, key: string) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Without comments — a rule must not be satisfied (or tripped) by prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const keys = new Set<string>();
for (const src of SOURCES) for (const m of code(src).matchAll(/['`]((?:crew|pitch|widgets)\.[A-Za-z0-9.]+[A-Za-z0-9])['`]/g)) keys.add(m[1]!);
/** Keys called with `count` — each needs every plural form of each language (or one plain sentence). */
const counted = new Set<string>();
for (const src of SOURCES) for (const m of code(src).matchAll(/\bt\(\s*['`]((?:crew|pitch)\.[A-Za-z0-9.]+)['`]\s*,\s*\{[^}]*\bcount\b/g)) counted.add(m[1]!);

describe('Crew widget — translations', () => {
  it('found the keys it is meant to check', () => {
    expect(keys.size).toBeGreaterThan(30);
    expect([...keys]).toEqual(expect.arrayContaining([
      'widgets.crew', 'crew.onTheClock', 'crew.offline', 'crew.toApprove', 'crew.tag.late', 'crew.tag.breakOver', 'pitch.crew', 'pitch.crewCalm',
    ]));
    expect([...counted]).toEqual(expect.arrayContaining(['crew.toApprove', 'crew.needYou', 'pitch.crew']));
  });

  for (const l of LOCALES) {
    const categories = new Intl.PluralRules(l).resolvedOptions().pluralCategories;
    it(`${l}: every key the widget uses resolves to a sentence`, () => {
      const missing: string[] = [];
      for (const k of keys) {
        const plain = lookup(catalogue[l], k);
        if (typeof plain === 'string') continue;
        if (counted.has(k)) {
          for (const c of categories) {
            const has = typeof lookup(catalogue[l], `${k}_${c}`) === 'string'
              || (c === 'many' && typeof lookup(catalogue[l], `${k}_other`) === 'string');
            if (!has) missing.push(`${k}_${c}`);
          }
        } else if (typeof lookup(catalogue[l], `${k}_other`) !== 'string') missing.push(k);
      }
      expect(missing).toEqual([]);
    });

    it(`${l}: the same placeholders as English — a count or a name is never dropped`, () => {
      const holes = (s: unknown) => (typeof s === 'string' ? [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',') : null);
      const wrong: string[] = [];
      for (const k of keys) for (const suf of ['', '_one', '_other']) {
        const en = holes(lookup(catalogue.en, k + suf));
        const it_ = holes(lookup(catalogue[l], k + suf));
        if (en !== null && it_ !== null && en !== it_) wrong.push(`${k}${suf}: ${en} ≠ ${it_}`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it('every value the card interpolates is actually passed — {{n}}, {{time}}, {{name}}, {{list}}, {{short}}', () => {
    const src = code(CARD);
    for (const [key, v] of [['crew.min', 'n'], ['crew.expectedAt', 'time'], ['crew.inSpace', 'name'], ['crew.say.noneIn', 'list'], ['crew.workspacesShort', 'short']] as const) {
      const call = new RegExp(`t\\('${key.replace(/\./g, '\\.')}',\\s*\\{[^}]*\\b${v}\\b`);
      expect([key, call.test(src)]).toEqual([key, true]);
    }
  });
});

describe('Crew widget — no static phrases', () => {
  const src = code(CARD);

  it('no bare English text between JSX tags', () => {
    // `>Word<` or `>Word {` — text the translator never sees.
    const bare = [...src.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it('accessibility labels are built from translated parts and numbers, never an English sentence', () => {
    const labels = [...src.matchAll(/accessibilityLabel=\{`([^`]*)`\}/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      const outside = l.replace(/\$\{[^}]*\}/g, '');
      expect([l, /[A-Za-z]{2,}/.test(outside)]).toEqual([l, false]);
    }
  });

  it('never says "paid" or "unpaid"', () => {
    for (const src2 of SOURCES) expect(/\b(un)?paid\b/i.test(code(src2).replace(/isPaid/g, ''))).toBe(false);
    for (const l of LOCALES) {
      const crew = JSON.stringify(lookup(catalogue[l], 'crew') ?? {});
      expect(/\b(un)?paid\b/i.test(crew)).toBe(false);
    }
  });
});

describe('the member tile never outgrows itself', () => {
  const card = require('fs').readFileSync(require('path').resolve(__dirname, '../../components/home/crew-card.tsx'), 'utf8') as string;
  const tile = card.slice(card.indexOf('function TileView'), card.indexOf('function RingSvg'));
  it('every text on the tile is one line', () => {
    const texts = tile.match(/<AText[^>]*>/g) ?? [];
    expect(texts.length).toBeGreaterThan(4);
    for (const x of texts) expect(x).toMatch(/numberOfLines=\{1\}/);
  });
  it('the words that grow with the language shrink to fit (tag, unit, times)', () => {
    expect((tile.match(/adjustsFontSizeToFit/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
