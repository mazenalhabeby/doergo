/**
 * /pricing promises "every price we charge, on one page". These assertions are
 * what make that sentence true a year from now.
 *
 * The failure they prevent is silent: add a module to `AVAILABLE_MODULES` and
 * forget the capability grouping, and it disappears from the one page a customer
 * reads before paying — no error, no blank space, just a price nobody was shown.
 * The same goes for a module that reaches the page but has no translation, which
 * would render its English source to a German reader.
 */
import fs from 'fs';
import path from 'path';
import {
  AVAILABLE_MODULES,
  AVAILABLE_ADD_ONS,
  MODULE_USAGE_PRICING,
  MODULE_MONTHLY_CENTS,
} from '@hbcfield/shared/client';
import { CAPABILITY_GROUPS, ungroupedModuleKeys } from '@/lib/capability-groups';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const load = (l: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8'));

const moduleKeys = AVAILABLE_MODULES.map((m) => m.key as string);

describe('pricing page completeness', () => {
  it('puts every module in exactly one capability group', () => {
    expect(ungroupedModuleKeys(moduleKeys)).toEqual([]);

    const grouped = CAPABILITY_GROUPS.flatMap((g) => g.modules);
    expect(new Set(grouped).size).toBe(grouped.length); // no module in two groups
    expect(grouped.every((k) => moduleKeys.includes(k))).toBe(true); // no stale key
  });

  it('prices every module it lists', () => {
    for (const k of moduleKeys) {
      expect(typeof MODULE_MONTHLY_CENTS[k]).toBe('number');
      expect(MODULE_MONTHLY_CENTS[k]).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('translates every module and add-on in %s', (locale) => {
    const d = load(locale);
    for (const k of moduleKeys) {
      expect(d.modules?.[k]?.label).toBeTruthy();
      expect(d.modules?.[k]?.description).toBeTruthy();
    }
    for (const a of AVAILABLE_ADD_ONS) {
      expect(d.addOns?.[a.key]?.label).toBeTruthy();
      expect(d.addOns?.[a.key]?.description).toBeTruthy();
    }
  });

  it.each(LOCALES)('names every capability group and counted unit in %s', (locale) => {
    const d = load(locale);
    for (const g of CAPABILITY_GROUPS) {
      expect(d.home?.groups?.[g.key]?.title).toBeTruthy();
      expect(d.home?.groups?.[g.key]?.body).toBeTruthy();
      if (g.hasNote) expect(d.home?.groups?.[g.key]?.note).toBeTruthy();
    }
    // Counted modules ask "how many …?" — a missing plural form falls back to
    // the English default and only in the language nobody on the team reads.
    for (const k of Object.keys(MODULE_USAGE_PRICING)) {
      const unit = MODULE_USAGE_PRICING[k].unit;
      expect(d.pricing?.units?.[`${unit}_one`]).toBeTruthy();
      expect(d.pricing?.units?.[`${unit}_other`]).toBeTruthy();
    }
  });

  it.each(LOCALES)('leaves no unfillable placeholder in the rules or FAQ in %s', (locale) => {
    // `returnObjects` returns raw strings — i18next does not interpolate into a
    // returned object, so any placeholder here reaches the screen verbatim
    // unless the component fills it in itself. Exactly one does: {{months}}.
    const d = load(locale);
    const strings = [
      ...d.pricing.rules.flatMap((r: { title: string; body: string }) => [r.title, r.body]),
      ...d.pricing.faq.flatMap((f: { q: string; a: string }) => [f.q, f.a]),
    ];
    for (const s of strings) {
      for (const m of s.matchAll(/\{\{(\w+)\}\}/g)) {
        expect(m[1]).toBe('months');
      }
    }
  });

  it.each(LOCALES)('carries the same number of rules and FAQs in %s', (locale) => {
    const en = load('en');
    const d = load(locale);
    expect(d.pricing.rules).toHaveLength(en.pricing.rules.length);
    expect(d.pricing.faq).toHaveLength(en.pricing.faq.length);
    for (const r of d.pricing.rules) expect(r.title && r.body).toBeTruthy();
    for (const f of d.pricing.faq) expect(f.q && f.a).toBeTruthy();
  });
});
