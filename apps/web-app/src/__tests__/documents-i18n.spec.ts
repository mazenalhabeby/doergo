/**
 * The personnel file, in five languages.
 *
 * Two failures this prevents, both silent:
 *
 *  - A key present in English and missing elsewhere renders the raw key path
 *    ("documents.my.title") to a German reader. Nobody on the team reads the
 *    page in Italian, so it survives a release.
 *
 *  - A `{{count}}` string without its `_one`/`_other` forms falls back to the
 *    English default, so "2 Dokumente benötigen Ihre Unterschrift" arrives as
 *    English on a German phone.
 */
import fs from 'fs';
import path from 'path';
import { unknownTokens, STARTER_TEMPLATES } from '@hbcfield/shared/client';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

const load = (l: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8'));

/** Every leaf path in an object, dotted. */
function leaves(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

function at(obj: any, dotted: string): unknown {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

describe('documents translations', () => {
  const en = load('en');
  const expected = leaves(en.documents, 'documents');

  it('has a non-trivial set of keys to check', () => {
    // Guards the guard: if `documents` vanished from en.json this suite would
    // otherwise pass by having nothing to assert.
    expect(expected.length).toBeGreaterThan(20);
  });

  it.each(LOCALES)('translates every documents key in %s', (locale) => {
    const d = load(locale);
    const missing = expected.filter((k) => {
      const v = at(d, k);
      return typeof v !== 'string' || v.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('names the nav item in %s', (locale) => {
    expect(load(locale).nav?.documents).toBeTruthy();
  });

  it.each(LOCALES)('carries both plural forms for every counted string in %s', (locale) => {
    const d = load(locale);
    // i18next resolves `x_one`/`x_other`; a bare `x` alongside them is dead
    // weight, and either form missing silently falls back to English.
    const counted = expected
      .filter((k) => k.endsWith('_one'))
      .map((k) => k.slice(0, -'_one'.length));

    expect(counted.length).toBeGreaterThan(0);
    for (const base of counted) {
      expect(typeof at(d, `${base}_one`)).toBe('string');
      expect(typeof at(d, `${base}_other`)).toBe('string');
    }
  });

  it.each(LOCALES)('keeps the {{count}} placeholder in every plural in %s', (locale) => {
    const d = load(locale);
    for (const k of expected.filter((x) => x.endsWith('_one') || x.endsWith('_other'))) {
      // A translator dropping the placeholder produces "documents need your
      // signature" with no number — grammatical, and useless.
      expect(String(at(d, k))).toContain('{{count}}');
    }
  });

  it('gives every month a name in every locale', () => {
    // The list groups payslips by month; a missing one renders "documents.
    // months.august" in the middle of an otherwise finished page.
    for (const locale of LOCALES) {
      const months = load(locale).documents?.months ?? {};
      expect(Object.keys(months)).toHaveLength(12);
      for (const [key, value] of Object.entries(months)) {
        expect(typeof value).toBe('string');
        expect(String(value).trim()).not.toBe('');
        expect(String(value)).not.toBe(key);
      }
    }
  });

  it('uses the Austrian name for January in German', () => {
    // "Jänner", not "Januar". The customers this was built for are Austrian,
    // and the payroll portal it replaces says Jänner.
    expect(load('de').documents.months.january).toBe('Jänner');
  });
});

describe('the documents navigation', () => {
  const navbar = fs.readFileSync(
    path.join(process.cwd(), 'src/components/top-navbar.tsx'),
    'utf8',
  );

  it('registers every document route in NAV_HREFS', () => {
    /*
      All four, or the active-link resolver cannot tell which is most specific
      and lights up two items at once — a bug this codebase has already had and
      fixed once, on /settings vs /settings/billing.
    */
    for (const href of [
      '"/my/documents"',
      '"/documents"',
      '"/documents/templates"',
      '"/documents/compliance"',
    ]) {
      expect(navbar).toContain(href);
    }
  });

  it('is gated on the add-on, not on a permission', () => {
    // Reading your own file is never a permission. The entry appears or not
    // purely on whether the organization bought the capability.
    expect(navbar).toContain('hasPlanFeature("documents")');
  });

  it('gates each admin surface on its own permission', () => {
    expect(navbar).toContain('hasPermission("canIssueDocuments")');
    expect(navbar).toContain('hasPermission("canManageDocumentTemplates")');
    // Credentials ride on canAssignTasks: a dispatcher needs to know WHY
    // somebody dropped out of the schedule without being able to open a file.
    expect(navbar).toContain('hasPermission("canAssignTasks")');
  });

  it('marks the dropdown active from exactly the routes it contains', () => {
    /*
      The attendance menu listed a route it did not contain and omitted two it
      did, so the bar lit up twice on one page and nowhere on two others. Three
      of these four share a prefix, which makes the same mistake easier here.
    */
    const block = navbar.slice(
      navbar.indexOf('function DocumentsDropdown'),
      navbar.indexOf('// Time & Attendance Dropdown'),
    );
    expect(block).toContain('isDropdownActive(pathname, items.map((i) => i.href))');
    for (const href of ['/my/documents', '/documents', '/documents/templates', '/documents/compliance']) {
      expect(block).toContain(`"${href}"`);
    }
  });

  it('renders a plain link when only one entry is visible', () => {
    // An ordinary member sees only their own file. A menu that opens to reveal
    // one item is a click for nothing.
    const block = navbar.slice(navbar.indexOf('function DocumentsDropdown'));
    expect(block).toContain('if (items.length === 1)');
  });
});

/**
 * The starter contracts ship translated, and a translator has no reason to
 * treat `{{member.fullName}}` as anything other than text. Two ways that goes
 * wrong, both of which reach a real contract:
 *
 *  - a token dropped in translation leaves a clause with the name missing
 *  - a token misspelled renders literally as "{{member.fullname}}" in the PDF,
 *    because the editor's unknown-token check only guards what an ADMIN types
 *
 * So every language's body must carry exactly the tokens English carries.
 */
describe('starter contract bodies', () => {
  const tokensIn = (s: string) => [...s.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!.trim()).sort();
  const en = load('en').documents.templates.starters;

  it.each(LOCALES)('keeps every merge field intact in %s', (locale) => {
    const other = load(locale).documents.templates.starters;
    for (const key of Object.keys(en)) {
      const source = en[key].body;
      if (typeof source !== 'string') continue;
      expect({ key, tokens: tokensIn(other[key].body) }).toEqual({ key, tokens: tokensIn(source) });
    }
  });

  it.each(LOCALES)('uses only tokens the renderer knows in %s', (locale) => {
    const starters = load(locale).documents.templates.starters;
    const bodies = Object.values(starters)
      .map((s: any) => s.body)
      .filter((b): b is string => typeof b === 'string');
    for (const body of bodies) expect(unknownTokens(body)).toEqual([]);
  });
});

/**
 * The English starter copy exists twice: in the shared module, which carries the
 * structure (signature mode, suggested type) and an English source, and in
 * en.json, which the page actually renders and the other four languages are
 * translated from. Two copies drift, and the drift is invisible — the page
 * renders en.json, so an edit to the shared body would simply never appear.
 */
describe('starter copy matches its shared source', () => {
  const en = load('en').documents.templates.starters;

  it.each(STARTER_TEMPLATES.map((s) => s.key))('is in step for %s', (key) => {
    const shared = STARTER_TEMPLATES.find((s) => s.key === key)!;
    expect(en[key]).toBeTruthy();
    expect(en[key].name).toBe(shared.name);
    expect(en[key].description).toBe(shared.description);
    // The blank starter has no body in either place.
    expect(en[key].body ?? '').toBe(shared.body);
  });
});
