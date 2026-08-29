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
