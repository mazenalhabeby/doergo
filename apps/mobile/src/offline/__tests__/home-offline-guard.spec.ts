/**
 * The home screen must read its task list from the phone, not the network.
 *
 * Every home variant used to fetch `tasksApi.list()` straight from the server
 * with no fallback. It was the ONLY unguarded call on those screens —
 * everything else is `.catch(() => [])` or comes from `useShift` — so with no
 * signal that one call threw and the whole dashboard became "Request timed
 * out" with a retry button that could not succeed. A member in a basement lost
 * their day while the Tasks tab beside it showed the same jobs perfectly.
 *
 * It type-checks and works on the office Wi-Fi, which is why a test has to say
 * it.
 *
 * ⚠️ REWRITTEN FOR THE REGISTRY HOME (v2). The four variants became one
 * composed column, and this test used to assert the router named all four by
 * component. That assertion was about the old SHAPE; the invariant underneath
 * it was never about how many screens there are. So it now walks whatever
 * `registry.tsx` registers and asks the same questions of every widget that
 * shows tasks — which is stricter, because a widget added next year is covered
 * on the day it is written.
 *
 * ⚠️ AND IT MUST SURVIVE AN EMPTY REGISTRY. The set is being rebuilt one
 * widget at a time, so "there is at least one" is not an invariant and asserting
 * it turns a deliberate state into a red suite. What IS invariant is the part
 * that does not depend on the count: the column carries the banner, and the
 * home tab renders the composed screen and nothing else. Those run either way.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** Comments say the forbidden thing all the time — this file included. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(file: string): string {
  return code(fs.readFileSync(file, 'utf8'));
}

/** Every local file `registry.tsx` imports a component from. */
function registeredComponentFiles(): string[] {
  const registry = read(path.join(SRC, 'features/home/registry.tsx'));
  const out: string[] = [];
  for (const m of registry.matchAll(/^import\s+\{[^}]*\}\s+from\s+'(\.\.?\/[^']+)';/gm)) {
    const rel = m[1]!;
    // Only component imports — the entitlement and type modules are not widgets.
    if (rel.includes('entitlement') || rel.includes('/types')) continue;
    for (const ext of ['.tsx', '.ts']) {
      const p = path.join(SRC, 'home', rel + ext);
      if (fs.existsSync(p)) { out.push(p); break; }
    }
  }
  return out;
}

describe('the home screen opens without a network', () => {
  const widgets = registeredComponentFiles();

  /*
    `it.each([])` throws rather than skipping, so an empty registry needs a
    placeholder row. It asserts nothing about a widget — it records that there
    were none to ask, which is a true and visible state of the suite.
  */
  const each = <T,>(xs: T[]) => (xs.length ? it.each(xs) : it.each(['(no widgets registered)'] as unknown as T[]));
  const skipIfNone = (file: unknown) => typeof file === 'string' && file.startsWith('(no widgets');

  each(widgets)('%s never fetches the task list itself', (file) => {
    if (skipIfNone(file)) return;
    expect(read(file as string)).not.toMatch(/tasksApi\s*\.\s*list\s*\(/);
  });

  each(widgets.filter((f) => read(f).includes('useHomeTasks')))(
    '%s says how old its list is',
    (file) => {
      if (skipIfNone(file)) return;
      /*
        The freshness label is how a list read from the phone says how old it
        is. Without it an old list is indistinguishable from a fresh one, and
        somebody plans a day around jobs that were reassigned this morning.
      */
      expect(read(file as string)).toContain('FreshnessLabel');
    },
  );

  it('the home screen says what the network is doing', () => {
    /*
      Once per column rather than once per widget: four copies of the same
      sentence is noise, and the banner is the context every widget's own
      freshness label is read against.
    */
    expect(read(path.join(SRC, 'features/home/home-screen.tsx'))).toContain('OfflineBanner');
  });

  it('the home tab renders the composed screen and nothing else', () => {
    const router = read(path.resolve(SRC, '../app/(app)/(tabs)/index.tsx'));
    expect(router).toContain('HomeScreen');
    /*
      ⚠️ The four hard-coded variants must not come back through this door.
      They still exist as files — `crew`, `needs-you`, `my-route` and `clients`
      are not built yet — and routing to one of them again would restore the
      bug this whole file is about, since only the registry home carries the
      banner.
    */
    for (const gone of ['AdminDashboard', 'HybridHome', 'FreelancerHome', 'FullTimeHome']) {
      expect(router).not.toContain(gone);
    }
  });
});
