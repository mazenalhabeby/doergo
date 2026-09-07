import fs from 'fs';
import path from 'path';
import { MARKETING_NAMESPACES } from '@/i18n/server-bundles';

/**
 * The localized home routes inline only part of the catalogue. This proves the
 * part is the right part.
 *
 * `/de`, `/es`, `/fr` and `/it` are prerendered with their language embedded in
 * the HTML so crawlers receive a localized body. Embedding the whole file to do
 * that quadrupled those pages, so only the namespaces the page renders are sent.
 *
 * That makes a hand-maintained list load-bearing, and two of its four entries
 * are reached only through template-literal keys — `t(`modules.${k}.label`)` —
 * which are invisible to anything that reads imports or literal strings. A
 * namespace dropped off the list does not throw: i18next falls back to the
 * key's default or renders the raw dotted key, so the failure is a marketing
 * page quietly showing `home.hero.title` to the public.
 *
 * So the list is derived from the source and compared, rather than trusted.
 */

const HOME_DIR = path.join(process.cwd(), 'src/app/_home');
// Rendered inside LocalizedHome's provider, so it reads the same bundle.
const EXTRA_FILES = [path.join(process.cwd(), 'src/components/language-switcher.tsx')];

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Top-level namespace of every `t()` key, from all three spellings the codebase
 * uses: 't("home.x")', "t('common.x')" and t(`modules.${k}.label`).
 */
function namespacesIn(file: string): Set<string> {
  const src = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const found = new Set<string>();
  const re = /\bt\(\s*[`'"]([a-zA-Z0-9_]+)[.`'"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) found.add(m[1]);
  return found;
}

describe('marketing namespaces cover everything the localized home renders', () => {
  const files = [...filesUnder(HOME_DIR), ...EXTRA_FILES];

  it('scans a plausible number of files (a silent empty scan would pass anything)', () => {
    expect(files.length).toBeGreaterThan(5);
    const total = files.reduce((n, f) => n + namespacesIn(f).size, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('every namespace the home tree translates is inlined', () => {
    const allowed = new Set<string>(MARKETING_NAMESPACES);
    const missing: string[] = [];

    for (const f of files) {
      for (const ns of namespacesIn(f)) {
        if (!allowed.has(ns)) {
          missing.push(`${path.relative(process.cwd(), f)} uses "${ns}."`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('every inlined namespace actually exists in the locale files', () => {
    // A typo in the list is silent in the other direction: the namespace is
    // simply never copied, and the page falls back to raw keys.
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), `src/i18n/locales/${lang}.json`), 'utf8'),
      );
      for (const ns of MARKETING_NAMESPACES) {
        expect(Object.keys(bundle)).toContain(ns);
      }
    }
  });
});
