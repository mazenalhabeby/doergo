import fs from 'fs';
import path from 'path';

/**
 * Every screen must state what it wants from the navigation header.
 *
 * A route that is not registered in its stack's `_layout.tsx` inherits the
 * default header, and expo-router titles that bar with the ROUTE NAME. There
 * is no warning; the screen simply looks wrong, and only that screen.
 *
 * Three shipped screens were found in this state at once:
 *
 *   scan-card          a black "scan-card" bar over the camera — and because
 *                      the bar shortened the viewfinder, the card frame was
 *                      drawn against a taller box than the camera actually had
 *   overtime/[id]      a bar titled "[id]" above the screen's own header
 *   profile/time-format  a bar titled "time-format" above its own header
 *
 * The rule is deliberately blunt: register it, whatever you want it to do.
 * Choosing `headerShown: false` is a decision; falling through is not.
 */

const APP = path.join(process.cwd(), 'app/(app)');

/** Route names a `_layout.tsx` registers, in expo-router's own notation. */
function registered(layout: string): string[] {
  const src = fs.readFileSync(layout, 'utf8');
  return [...src.matchAll(/<Stack\.Screen\s[^>]*name="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Route files a stack owns: everything below its directory, minus routes owned
 * by a nested stack (a directory with its own `_layout.tsx` — expo-router shows
 * the whole group as one entry in the parent).
 */
function routesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isDirectory()) {
      const nested = fs.existsSync(path.join(dir, name, '_layout.tsx'));
      // A group in parentheses is a path segment; a nested stack is one entry.
      if (nested) out.push(name);
      else out.push(...routesUnder(path.join(dir, name), `${prefix}${name}/`));
      continue;
    }
    if (!name.endsWith('.tsx') || name === '_layout.tsx') continue;
    out.push(`${prefix}${name.replace(/\.tsx$/, '')}`);
  }
  return out;
}

/*
  `(tabs)` is deliberately absent below. It is a Tabs navigator, not a Stack:
  its screens have no navigation header to inherit (the root stack renders the
  whole group with `headerShown: false`), and which tabs appear is decided at
  runtime by the tab bar, not by registration.
*/
const STACKS: [label: string, sub: string][] = [
  ['app/(app)', ''],
  ['app/(app)/manage', 'manage'],
];

describe('every screen is registered with its stack', () => {
  it('finds the stacks it means to check (an empty sweep would pass anything)', () => {
    expect(STACKS.length).toBeGreaterThan(1);
    for (const [, sub] of STACKS) {
      expect(fs.existsSync(path.join(APP, sub, '_layout.tsx'))).toBe(true);
    }
  });

  it.each(STACKS)('%s registers every route it owns', (_label, sub) => {
    const dir = path.join(APP, sub);
    const declared = new Set(registered(path.join(dir, '_layout.tsx')));
    const missing = routesUnder(dir).filter((r) => !declared.has(r));
    expect(missing).toEqual([]);
  });

  it('registers no route that no longer exists', () => {
    const dir = APP;
    const present = new Set(routesUnder(dir));
    const orphans = registered(path.join(dir, '_layout.tsx')).filter((r) => !present.has(r));
    expect(orphans).toEqual([]);
  });
});

describe('a screen drawing its own header hides the native one', () => {
  /**
   * The two-header bug, and its full-bleed twin.
   *
   * These three are all a screen saying "I own my top edge": it renders one of
   * the shared headers, it pads itself by the status-bar inset, or it insets
   * itself with a SafeAreaView. Any of them plus a native header means either
   * two bars stacked, or — on the camera — a bar eating the viewfinder.
   */
  const OWNS_TOP_EDGE = [
    /<(SheetHeader|ScreenHeader)\b/,
    /insets\.top/,
    /edges=\{\[[^\]]*'top'/,
  ];

  it('holds for every screen in the root stack', () => {
    const layout = fs.readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
    const bad: string[] = [];

    for (const route of routesUnder(APP)) {
      const file = path.join(APP, `${route}.tsx`);
      if (!fs.existsSync(file)) continue; // a nested stack, checked above
      const src = fs.readFileSync(file, 'utf8');
      if (!OWNS_TOP_EDGE.some((re) => re.test(src))) continue;

      // The options block for this route, up to the closing `/>`.
      const block = layout.match(
        new RegExp(`<Stack\\.Screen[^>]*name="${route.replace(/[[\]]/g, '\\$&')}"[\\s\\S]*?/>`),
      );
      if (!block || !/headerShown:\s*false/.test(block[0])) {
        bad.push(`${route} draws its own header but does not set headerShown: false`);
      }
    }

    expect(bad).toEqual([]);
  });
});
