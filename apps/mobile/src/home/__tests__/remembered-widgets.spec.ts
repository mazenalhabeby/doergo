import fs from 'fs';
import path from 'path';

/**
 * EVERY WIDGET REMEMBERS, AND NONE OF THEM GUESSES.
 *
 * ⚠️ THE MISTAKE IS NOT A BUG IN ONE CARD, IT IS A SHAPE. A widget asks the
 * server, waits, and chooses a state — and `null` means both "nothing to
 * report" and "we have not been told yet". Choose on that and the card states
 * something false and corrects itself in front of the member: the shift card
 * announced `Ready to start` to somebody who had already finished, and did it
 * twice over, because TWO requests decide that card.
 *
 * So it is a rule, not a fix: a widget that reads from the network goes
 * through `useRemembered`, and draws no decided state until `ready`.
 */
const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every widget source, excluding the remember machinery and the tests. */
function widgetFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'remember') walk(next);
        continue;
      }
      if (/\.tsx?$/.test(e.name)) out.push(next);
    }
  };
  walk('components/home');
  walk('home');
  return out;
}

describe('remembering is a rule, not a fix', () => {
  it('has one store and one hook', () => {
    const store = code('home/remember/store.ts');
    const hook = code('home/remember/use-remembered.ts');

    /*
      ⚠️ A STORE THAT EXISTS ON EVERY BUILD. The first attempt remembered
      through the offline records store, which is null wherever the offline
      runtime did not start — the simulator's app container held no offline
      database at all, so every read and write was a silent no-op and the
      "fix" changed nothing at all on screen.
    */
    expect(store).toMatch(/@react-native-async-storage\/async-storage/);
    expect(hook).not.toMatch(/records/);

    // ⚠️ Memory before disk: a promise resolves after the first frame is drawn.
    const seed = hook.slice(hook.indexOf('useState<'), hook.indexOf('useEffect('));
    expect(seed).toMatch(/keptNow</);
    expect(seed).not.toMatch(/await |\.then\(/);

    // ⚠️ Bounded, day-scoped where the answer means "today", keyed by user.
    expect(store).toMatch(/GOOD_FOR_MS/);
    expect(store).toMatch(/rules\.sameDay/);
    expect(store).toMatch(/\$\{name\}\/\$\{userId\}/);

    // ⚠️ One call clears the lot, so a widget added later needs no sign-out edit.
    expect(store).toMatch(/export function forgetEverythingKept/);
    expect(code('contexts/auth-context.tsx')).toMatch(/forgetEverythingKept\(\)/);
  });

  it('no widget rebuilds the remembering by hand', () => {
    /*
      ⚠️ A SECOND COPY IS HOW THE TWO DRIFT. The shift and its totals each had
      their own, the second was missed entirely, and the flash survived a
      commit that claimed to have fixed it.
    */
    const offenders = widgetFiles().filter(
      (f) => /AsyncStorage/.test(code(f)) && !/layout-store\.ts$/.test(f),
    );
    // `layout-store.ts` is the named exception: an arrangement, not an answer.
    expect(offenders).toEqual([]);
  });

  it('the shift card draws nothing rather than stating what it does not know', () => {
    const card = code('components/home/shift-clock-card.tsx');
    expect(card).toMatch(/if \(shift\.source === 'pending'\) return null;/);
    expect(card).toMatch(/if \(!status\?\.isClockedIn && !totals\.ready\) return null;/);
  });
});
