/**
 * The registry and the tab bar must answer the same question about the same
 * member.
 *
 * ⚠️ THE BUG THIS PINS: `meets()` asked `hasModule()`, the raw storage reader —
 * "is this string in the stored array". `(tabs)/_layout.tsx` asked
 * `hasAccessModule()`, the access question. So an admin, and every member whose
 * Access Profile was never configured, was shown the **Clock tab** and refused
 * the **shift clock widget**, for the same `clock` module, on the same screen.
 *
 * §2.4 rule 1: "entitlement is asked ONCE … asked separately they drift."
 */
import * as fs from 'fs';
import * as path from 'path';
import { meets } from '../../features/home/entitlement';

const SRC = path.resolve(__dirname, '../..');
const clock = { module: 'clock' as const, self: true as const };

describe('a module a member holds', () => {
  it('shows the widget to an ADMIN whatever is stored', () => {
    // Admin = full access by definition; there are no admin access choices.
    expect(meets({ role: 'ADMIN', enabledModules: null } as never, clock)).toBe(true);
    expect(meets({ role: 'ADMIN', enabledModules: { modules: [] } } as never, clock)).toBe(true);
  });

  it('shows it to a member with NO Access Profile', () => {
    /*
      ⚠️ Null is the DEFAULT, and `modules.ts` says so in as many words:
      "Users WITHOUT a profile object … implicitly get ALL feature tabs, so a
      member's selection never clobbers another user's surfaces."
      This is the case that hid the shift clock on the test account.
    */
    expect(meets({ role: 'EMPLOYEE', enabledModules: null } as never, clock)).toBe(true);
    expect(meets({ role: 'EMPLOYEE' } as never, clock)).toBe(true);
  });

  it('shows it to a member whose profile names it', () => {
    expect(meets({ role: 'EMPLOYEE', enabledModules: { modules: ['tasks', 'clock'] } } as never, clock)).toBe(true);
  });

  it('still refuses a member whose profile leaves it out', () => {
    // The whole point of a profile — it must keep working.
    expect(meets({ role: 'EMPLOYEE', enabledModules: { modules: ['tasks'] } } as never, clock)).toBe(false);
  });

  it('refuses nobody at all', () => {
    expect(meets(null, clock)).toBe(false);
  });
});

describe('one question, asked once', () => {
  it('the registry and the tab bar call the same function', () => {
    const entitlement = fs.readFileSync(path.join(SRC, 'features/home/entitlement.ts'), 'utf8');
    // The tab bar's rule lives in tab-layout.ts now, read by the bar and the More page alike.
    const tabs = fs.readFileSync(path.resolve(SRC, 'lib/tab-layout.ts'), 'utf8');
    expect(entitlement).toContain('hasAccessModule(user as never, r.module)');
    expect(tabs).toContain("hasAccessModule(u, 'clock')");
  });

  it('nothing on the home screen asks the raw storage reader', () => {
    /*
      `hasModule` answers a question about STORAGE. Every surface decision is a
      question about ACCESS, and the two differ for an admin, for a member with
      no profile, and for the two permission-derived modules.
    */
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    /*
      ⚠️ THE WHOLE TREE, NOT A NAMED FILE. This listed one widget by path and
      the widget was later deleted — a guard that names its subject stops
      guarding the moment the subject moves. Every file under `home/` and every
      widget that lands in `features/home/` is checked, so a new one is
      covered on the day it is written.
    */
    const files = [
      ...fs.readdirSync(path.join(SRC, 'home')).map((f) => `home/${f}`),
      ...fs.readdirSync(path.join(SRC, 'features/home')).map((f) => `features/home/${f}`),
    ].filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      expect(strip(fs.readFileSync(path.join(SRC, f), 'utf8'))).not.toMatch(/\bhasModule\(/);
    }
  });
});
