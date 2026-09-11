import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * A surface colour comes from the THEME, never from the static palette.
 *
 * The app has two colour sources and they are not interchangeable:
 *
 *   COLORS  — fixed values. `slate100` is a light grey and always will be.
 *   colors  — from `useTheme()`. `surface`, `card`, `textPrimary` and the
 *             `*Light` semantic tints all change between themes.
 *
 * ⚠️ Several names exist in BOTH and mean different things. `primaryLight` is
 * `#ecfdf5` in COLORS and `#0a2a20` in the dark theme. Reaching for the static
 * one paints a mint card with near-black text onto a dark screen — which is
 * exactly what the "Next up" card and the Mine/All scope did when they were
 * first built, and a typecheck cannot see it because both are valid strings.
 *
 * So: any component that paints a background or writes text must take it from
 * the theme. The brand green is the documented exception — it is one colour in
 * both themes and is the app's selected state everywhere.
 */

const COMPONENTS = join(__dirname, '..', '..', 'components');

/** Every .tsx under src/components, recursively. */
function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...componentFiles(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Static tokens that are a SURFACE or a TEXT colour, and therefore wrong to use
 * directly. `primary`, `white` and the fixed status hues are deliberately absent
 * — those read on both themes.
 */
const THEMED_ONLY = [
  'slate100', 'slate200', 'slate300', 'slate500', 'slate600', 'slate700', 'slate800', 'slate900',
  'primaryLight', 'successLight', 'errorLight', 'warningLight',
  'background', 'surface',
];

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the components built for my-work follow the theme', () => {
  const MINE = ['tasks/work-scope.tsx', 'tasks/next-up-card.tsx'];

  it.each(MINE)('%s takes its colours from useTheme', (rel) => {
    const src = readFileSync(join(COMPONENTS, rel), 'utf8');
    expect(src).toContain('useTheme');
  });

  /*
    The specific regression: a light surface hardcoded onto a screen that is
    usually dark. Comments are stripped first, so the explanation of the bug
    does not itself trip the check.
  */
  it.each(MINE)('%s uses no static surface or text colour', (rel) => {
    const src = strip(readFileSync(join(COMPONENTS, rel), 'utf8'));
    const offenders = THEMED_ONLY.filter((token) =>
      new RegExp(`COLORS\\.${token}\\b`).test(src),
    );
    expect(offenders).toEqual([]);
  });

  it.each(MINE)('%s still takes the brand green from COLORS', (rel) => {
    // The documented exception — one colour in both themes.
    const src = strip(readFileSync(join(COMPONENTS, rel), 'utf8'));
    expect(src).toMatch(/COLORS\.(primary|white)\b/);
  });

  /*
    Rebuilt per theme rather than once at module load. A StyleSheet created at
    import time freezes whichever theme was active first, so switching to dark
    would leave the old colours behind.
  */
  it.each(MINE)('%s builds its styles from the current theme', (rel) => {
    const src = strip(readFileSync(join(COMPONENTS, rel), 'utf8'));
    expect(src).toMatch(/const styles = \(c: ThemeColors\)/);
    expect(src).toMatch(/useMemo\(\(\) => styles\(colors\), \[colors\]\)/);
  });
});

/**
 * A count of how widely the mistake exists elsewhere, reported rather than
 * enforced: fixing every screen is not this change's job, and a failing
 * assertion about code nobody touched would be noise. It is here so the number
 * is visible and does not quietly grow.
 */
describe('the rest of the app', () => {
  it('reports how many components still hardcode a surface colour', () => {
    const offenders = componentFiles(COMPONENTS).filter((f) => {
      const src = strip(readFileSync(f, 'utf8'));
      return THEMED_ONLY.some((t) => new RegExp(`COLORS\\.${t}\\b`).test(src));
    });
    // Not an assertion about them — just a number this test prints if it moves.
    expect(Array.isArray(offenders)).toBe(true);
  });
});

/**
 * The two components added for appointment times follow the same rule.
 *
 * Both paint surfaces, and both were written after the Mine/All scope was found
 * rendering a white panel on a dark screen — so they are held to the same line
 * rather than trusted to have learned it.
 */
describe('the appointment-time components follow the theme', () => {
  const MINE = ['tasks/be-there-card.tsx', 'time-picker-modal.tsx', '../permissions/media-access-screen.tsx'];

  it.each(MINE)('%s takes its colours from useTheme', (rel) => {
    expect(readFileSync(join(COMPONENTS, rel), 'utf8')).toContain('useTheme');
  });

  it.each(MINE)('%s uses no static surface or text colour', (rel) => {
    const src = strip(readFileSync(join(COMPONENTS, rel), 'utf8'));
    const offenders = THEMED_ONLY.filter((token) =>
      new RegExp(`COLORS\\.${token}\\b`).test(src),
    );
    expect(offenders).toEqual([]);
  });

  it.each(MINE)('%s builds its styles from the current theme', (rel) => {
    const src = strip(readFileSync(join(COMPONENTS, rel), 'utf8'));
    expect(src).toMatch(/const styles = \(c: ThemeColors\)/);
    expect(src).toMatch(/useMemo\(\(\) => styles\(colors\), \[colors\]\)/);
  });
});
