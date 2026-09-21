/**
 * The home screens must read their task list from the phone, not the network.
 *
 * Every home variant fetched `tasksApi.list()` straight from the server with
 * no fallback. It was the ONLY unguarded call on those screens — everything
 * else is `.catch(() => [])` or comes from `useShift` — so with no signal that
 * one call threw and the whole dashboard became "Request timed out" with a
 * retry button that could not succeed. A member in a basement lost their day
 * while the Tasks tab beside it showed the same jobs perfectly.
 *
 * It type-checks and works on the office Wi-Fi, which is why a test has to say
 * it. Read through `useHomeTasks`, which is the Tasks tab's own reader, so the
 * two screens cannot disagree about the same work either.
 */
import * as fs from 'fs';
import * as path from 'path';

const HOME = path.resolve(__dirname, '../../components/home');

/** The home variants `app/(app)/(tabs)/index.tsx` routes to, and what each shows. */
const VARIANTS: Record<string, { showsTasks: boolean }> = {
  'admin-dashboard.tsx': { showsTasks: true },
  'hybrid-home.tsx': { showsTasks: true },
  'freelancer-home.tsx': { showsTasks: true },
  // Attendance only: its shift comes from `useShift`, which already falls back
  // to the phone, and its history is a nicety behind a `.catch`.
  'full-time-home.tsx': { showsTasks: false },
};

/** Comments say the forbidden thing all the time — this file included. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(file: string): string {
  return code(fs.readFileSync(path.join(HOME, file), 'utf8'));
}

describe('the dashboard opens without a network', () => {
  it('routes to exactly the variants this test knows about', () => {
    const router = code(
      fs.readFileSync(path.resolve(__dirname, '../../../app/(app)/(tabs)/index.tsx'), 'utf8'),
    );
    for (const name of Object.keys(VARIANTS)) {
      // admin-dashboard.tsx -> AdminDashboard, hybrid-home.tsx -> HybridHome
      const component = name
        .replace(/\.tsx$/, '')
        .split('-')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join('');
      expect(router).toContain(component);
    }
  });

  it.each(Object.entries(VARIANTS))('%s never fetches the task list itself', (file) => {
    expect(read(file)).not.toMatch(/tasksApi\s*\.\s*list\s*\(/);
  });

  it.each(Object.entries(VARIANTS).filter(([, v]) => v.showsTasks))(
    '%s reads its tasks through useHomeTasks',
    (file) => {
      const source = read(file);
      expect(source).toContain('useHomeTasks');
      // The freshness label is how a list read from the phone says how old it
      // is. Without it an old list is indistinguishable from a fresh one.
      expect(source).toContain('FreshnessLabel');
      // And the one line that says what the network means right now.
      expect(source).toContain('OfflineBanner');
    },
  );
});
