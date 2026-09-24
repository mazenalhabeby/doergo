/**
 * No two files may claim the same URL.
 *
 * ⚠️ A GROUP FOLDER ADDS NO PATH SEGMENT. `app/(app)/chat.tsx` and
 * `app/(app)/(tabs)/chat.tsx` are not two routes — they are two files both
 * claiming `/chat`, and Expo Router picks one. It picked the first, which was a
 * `<Redirect>` to the second, which normalised back to the first: `/chat`
 * rendered a permanently blank white screen and every chat push notification
 * landed on it.
 *
 * Nothing announces this. There is no warning, no red box, no failing build —
 * the app simply has a dead screen on a route nobody opens by hand. Hence a
 * test.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP = path.resolve(__dirname, '../../../app');

/** Every route file, as the URL it claims. */
function routes(): Map<string, string[]> {
  const out = new Map<string, string[]>();

  const walk = (dir: string, url: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // A (group) contributes nothing to the URL — that is the whole point.
        const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
        walk(full, isGroup ? url : [...url, entry.name]);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      const base = entry.name.replace(/\.tsx$/, '');
      // Layouts are not routes; +not-found and +html are Expo's own.
      if (base === '_layout' || base.startsWith('+')) continue;
      const claimed = base === 'index' ? url : [...url, base];
      const key = '/' + claimed.join('/');
      out.set(key, [...(out.get(key) ?? []), path.relative(APP, full)]);
    }
  };

  walk(APP, []);
  return out;
}

describe('every route resolves to exactly one file', () => {
  const all = routes();

  it('finds the route tree', () => {
    expect(all.size).toBeGreaterThan(20);
  });

  it('has no two files claiming one URL', () => {
    /*
      ⚠️ The allowed collisions are not accidents:
      `(app)/(tabs)/profile.tsx` and `(customer)/(tabs)/profile.tsx` are the
      staff app and the client portal. A member is in exactly one of those
      trees for the whole session — the root layout mounts one group or the
      other — so the two are never resolvable at the same time.

      Anything else here is the blank-screen bug. Do not add to this list
      without being able to say which layout makes the two mutually exclusive.
      */
    const ALLOWED = new Set([
      '/profile',
      /*
        `/` is claimed by three, and all three are reachable only one at a
        time: `index.tsx` is the boot placeholder the root layout shows while
        it works out where the member belongs, and it then mounts EITHER the
        `(app)` tree or the `(customer)` one, never both.
      */
      '/',
    ]);

    const clashes = [...all.entries()]
      .filter(([url, files]) => files.length > 1 && !ALLOWED.has(url))
      .map(([url, files]) => `${url} <- ${files.join(' AND ')}`);

    expect(clashes).toEqual([]);
  });

  it('the chat route is a real screen, not a redirect onto itself', () => {
    // The exact shape of the bug, pinned so it cannot come back.
    expect(all.get('/chat')).toEqual(['(app)/(tabs)/chat.tsx']);
  });

  it('every notification target names a route that exists', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../notification-route.ts'), 'utf8');
    const targets = [...src.matchAll(/to\('(\/[^']+)'/g)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(5);

    /** Strip the (groups) an href may name, and blank out [params]. */
    const normalise = (p: string) =>
      '/' +
      p
        .split('/')
        .filter((seg) => seg && !(seg.startsWith('(') && seg.endsWith(')')))
        .map((seg) => (seg.startsWith('[') ? '[]' : seg))
        .join('/');

    const known = new Set([...all.keys()].map(normalise));
    const missing = targets.filter((t) => !known.has(normalise(t)));
    expect(missing).toEqual([]);
  });
});
