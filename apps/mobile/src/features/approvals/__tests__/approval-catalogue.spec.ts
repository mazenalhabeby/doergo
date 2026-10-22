import fs from 'fs';
import path from 'path';
import { APPROVAL_GROUPS, APPROVAL_KINDS, APPROVAL_KIND_SPECS } from '@hbcfield/shared/client';

/*
  The approvals wording is ONE module in shared (approval-text.ts), read by the
  web and the phone through their own catalogues. A key it asks for that one
  app lacks prints the raw key on that app only — so both are checked here,
  in every language.
*/

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const TEXT = fs.readFileSync(path.join(ROOT, 'packages/shared/src/approvals/approval-text.ts'), 'utf8');
const CATALOGUES = ['apps/mobile/src/i18n/locales', 'apps/web-app/src/i18n/locales'].flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json')).map((f) => ({ name: `${dir}/${f}`, json: JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8')) })));

const at = (o: unknown, key: string) => key.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown> | undefined)?.[p], o);

/** Every fixed key: kinds, groups, action labels, and each `add('x', …)` fact label. */
const KEYS = [
  ...APPROVAL_KINDS.map((k) => `approvals.kinds.${k}`),
  ...APPROVAL_GROUPS.map((g) => `approvals.groups.${g}`),
  ...Object.values(APPROVAL_KIND_SPECS).flatMap((s) => s.actions.map((a) => `approvals.actions.${a.labelKey}`)),
  ...[...TEXT.matchAll(/add\('(\w+)'/g)].map((m) => `approvals.fact.${m[1]}`),
  ...[...TEXT.matchAll(/t\('(approvals\.[\w.]+)'/g)].map((m) => m[1]!),
  'approvals.fact.workspace', 'approvals.fact.raised',
];

describe('every approvals key exists in both apps, in every language', () => {
  it('finds the keys (sanity)', () => {
    expect(KEYS.length).toBeGreaterThan(50);
    expect(CATALOGUES.length).toBe(10);
  });
  for (const { name, json } of CATALOGUES) {
    it(name, () => {
      expect([...new Set(KEYS)].filter((k) => typeof at(json, k) !== 'string')).toEqual([]);
    });
  }
});
