import fs from 'fs';
import path from 'path';

/**
 * The translation catalogue must not reach the browser bundle.
 *
 * All five locale files — ~1.8 MB of JSON covering the whole application, not
 * just the marketing pages — were once statically imported on the client path.
 * Every visitor to the English home page downloaded German, Spanish, French and
 * Italian, plus the dashboard's, documents' and guided tours' translations, to
 * render a page that used about 5% of it. It was 57% of the page's JavaScript.
 *
 * It arrived there innocently. `HomeClient.tsx` (`'use client'`) imported three
 * pure URL helpers from `lib/industries.ts`, which also happened to hold the
 * localized copy accessors. An import is a module, not a symbol, so one helper
 * dragged the entire catalogue across the client boundary. Nothing in the diff
 * looked wrong, no type failed, and the cost was invisible without reading a
 * build manifest.
 *
 * A comment cannot enforce this, so this test walks the actual static import
 * graph from every `'use client'` file and fails if it reaches a locale JSON
 * other than English, or a module declared server-only.
 *
 * Dynamic `import()` is deliberately NOT followed: it is the mechanism that
 * makes on-demand language loading legal, because webpack gives it its own
 * chunk instead of the entry bundle.
 */

const SRC = path.join(process.cwd(), 'src');

/** Modules that must never be reachable from client code. */
const SERVER_ONLY = ['src/i18n/server-bundles.ts', 'src/lib/industry-copy.ts'];

/** English is bundled on purpose: it is the SSR language and the fallback. */
const ALLOWED_LOCALE = 'src/i18n/locales/en.json';

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.json'];

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walkFiles(p, out);
    } else if (EXT.includes(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

function resolve(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package, not our source

  const candidates = [
    base,
    ...EXT.map((e) => base + e),
    ...EXT.map((e) => path.join(base, 'index' + e)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/**
 * Static `import ... from '…'` and `export ... from '…'` only.
 *
 * Two things this has to get right, both learned by getting them wrong:
 *
 * • COMMENTS ARE STRIPPED FIRST. The modules this test polices carry comments
 *   explaining the rule, and those comments quote the very import statements
 *   they forbid. A scanner that reads them reports the documentation as a
 *   violation — the guard fails on files that are correct, which trains
 *   everyone to ignore it.
 *
 * • THE SPECIFIER MAY NOT CROSS A SEMICOLON. With a lazy gap between `import`
 *   and the quoted path, `export { localePath };` happily reached forward past
 *   the end of its own statement and bound to a path quoted six lines later.
 *   Multi-line import lists mean newlines have to stay legal, so the statement
 *   terminator is what bounds the match.
 *
 * `import('…')` is excluded by requiring that `import` is not followed by an
 * opening parenthesis — that form is a code-split point, which is the whole
 * reason the four non-English languages are allowed to exist as imports at all.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function staticImports(file: string): string[] {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const specs: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(?!\()(?:[^'"();]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) specs.push(m[1]);
  return specs;
}

function isClientFile(file: string): boolean {
  if (!/\.(tsx|ts|jsx|js)$/.test(file)) return false;
  // The directive must be the first statement, so reading the head is enough.
  const head = fs.readFileSync(file, 'utf8').slice(0, 400);
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*['"]use client['"]/.test(head);
}

const rel = (f: string) => path.relative(process.cwd(), f);

/** BFS from a client entry; returns the import chain to `target`, or null. */
function chainTo(entry: string, hit: (f: string) => boolean): string[] | null {
  const seen = new Set<string>([entry]);
  const queue: { file: string; chain: string[] }[] = [{ file: entry, chain: [rel(entry)] }];
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    for (const spec of staticImports(file)) {
      const next = resolve(spec, file);
      if (!next || seen.has(next)) continue;
      const nextChain = [...chain, rel(next)];
      if (hit(next)) return nextChain;
      seen.add(next);
      queue.push({ file: next, chain: nextChain });
    }
  }
  return null;
}

describe('client bundle must not contain the translation catalogue', () => {
  const clientFiles = walkFiles(SRC).filter(isClientFile);

  it('finds client components to check (the walk itself must not silently pass)', () => {
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it('no client component statically reaches a non-English locale file', () => {
    const isForbiddenLocale = (f: string) => {
      const r = rel(f).replace(/\\/g, '/');
      return r.startsWith('src/i18n/locales/') && r.endsWith('.json') && r !== ALLOWED_LOCALE;
    };

    const offenders = clientFiles
      .map((f) => chainTo(f, isForbiddenLocale))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join('\n      -> '));

    expect(offenders).toEqual([]);
  });

  it('no client component statically reaches a server-only module', () => {
    const isServerOnly = (f: string) => {
      const r = rel(f).replace(/\\/g, '/');
      return SERVER_ONLY.includes(r);
    };

    const offenders = clientFiles
      .map((f) => chainTo(f, isServerOnly))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join('\n      -> '));

    expect(offenders).toEqual([]);
  });

  it('the four non-English locales are loaded through dynamic import, not statically', () => {
    const entry = fs.readFileSync(path.join(SRC, 'i18n/index.ts'), 'utf8');
    for (const lang of ['de', 'es', 'fr', 'it']) {
      expect(entry).toContain(`import('./locales/${lang}.json')`);
      // A static import of the same file would put it straight back in the entry
      // chunk while the dynamic one above still reads as correct.
      expect(entry).not.toMatch(
        new RegExp(`import\\s+\\w+\\s+from\\s+['"]\\./locales/${lang}\\.json['"]`),
      );
    }
  });
});

describe('the marketing pages do not carry the application catalogue', () => {
  /*
    ⚠️ 25% OF THE PUBLIC HOME PAGE'S JAVASCRIPT WAS `en.json`.

    English is bundled on purpose — it is the SSR language and the fallback —
    but "bundled" must not mean "on every page". The marketing tree reached it
    through `language-switcher.tsx`, which imported `changeLanguage` and
    `supportedLanguages` from `@/i18n`, a module that statically imports the
    catalogue. Two symbols, neither needing a single translated string, and the
    whole of documents, attendance, tasks and the guided tours came with them:
    293 KB raw, ~95 KB over the wire, to draw a dropdown of five flags.

    Exactly the shape of the `lib/industries.ts` incident this file already
    documents. AN IMPORT IS A MODULE, NOT A SYMBOL — and the second occurrence
    is what turns a lesson into a test.

    The catalogue-free half lives in `src/i18n/languages.ts`.
  */
  const CATALOGUE = 'src/i18n/locales/en.json';
  const MARKETING_ENTRIES = [
    'src/app/_home/HomeClient.tsx',
    'src/components/language-switcher.tsx',
  ];

  it.each(MARKETING_ENTRIES)('%s does not statically reach the catalogue', (entry) => {
    const file = path.join(process.cwd(), entry);
    expect(fs.existsSync(file)).toBe(true);

    const chain = chainTo(file, (f) => rel(f).replace(/\\/g, '/') === CATALOGUE);
    // The chain is printed on failure: the point is to name the ONE import that
    // did it, because the offending file is never the one that looks wrong.
    expect(chain ? chain.join('\n  → ') : null).toBeNull();
  });

  it('the language list and the catalogue live in different modules', () => {
    // A re-export would put it straight back: `export * from './index'` in
    // languages.ts reads like tidying and undoes the whole thing.
    const src = stripComments(
      fs.readFileSync(path.join(process.cwd(), 'src/i18n/languages.ts'), 'utf8'),
    );
    expect(src).not.toMatch(/(?:^|\n)\s*(?:import|export)[^\n]*['"][^'"]*locales\//);
    expect(src).not.toMatch(/(?:^|\n)\s*(?:import|export)\s+(?!\()[^\n;]*from\s*['"]\.\/index['"]/);
    // …and it still reaches the real implementation, lazily.
    expect(src).toMatch(/await import\(['"]\.\/index['"]\)/);
  });
});
