import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every per-task authorization check gets the WHOLE caller, not a hand-picked
 * few of their facts.
 *
 * `checkTaskAccess` used to take seven positional arguments, and the last two —
 * the cross-org shares and the SPACE grants — were supplied by exactly one of
 * its eleven call sites. The gateway resolved and sent them on every route; ten
 * checks simply dropped them on the floor and asked the ORG-wide question
 * instead.
 *
 * What that looked like: a member whose authority comes from a space opened a
 * task from their own list, and the detail screen — which loads the task, its
 * comments, its timeline and its attachments together — failed as a whole with
 * "Access denied". The task read had been fixed; its five siblings had not, and
 * nothing connected them.
 *
 * Three files carried a copy of this rule (tasks, attachments, reports), so the
 * scan covers the module tree rather than one file. Passing the payload object
 * means a fact the gateway adds tomorrow reaches every check by construction —
 * these assertions keep it that way.
 */
describe('per-task access checks take the caller in one piece', () => {
  const SRC = join(__dirname, '..', '..');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
      return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
    });

  /** Comments are stripped: this very file's prose must not read as code. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const files = walk(SRC).map((f) => ({ path: f, code: stripComments(readFileSync(f, 'utf8')) }));

  const callSites = files.flatMap(({ path, code }) =>
    [...code.matchAll(/checkTaskAccess\(([^;]*?)\)\s*;/gs)].map((m) => ({
      path,
      args: m[1] ?? '',
    })),
  );

  it('finds the call sites at all — a passing scan of nothing proves nothing', () => {
    expect(callSites.length).toBeGreaterThanOrEqual(10);
  });

  it.each(callSites.map((c, i) => [i, c] as const))(
    'call site %i passes the payload, not selected fields',
    (_i, site) => {
      // `data.userId, data.userRole, ...` is the shape that lost the space
      // grants. The object form cannot lose a field it never names.
      expect(site.args).not.toMatch(/\.userRole\s*,/);
      expect(site.args).not.toMatch(/\.organizationId\s*,/);
    },
  );

  it('no check reaches for canViewAllTasks alone through a cast', () => {
    // `(data as any).canViewAllTasks` as the LAST argument was the tell: it
    // named the org-wide flag and stopped there.
    for (const site of callSites) {
      expect(site.args).not.toMatch(/canViewAllTasks\s*\)?\s*$/);
    }
  });
});
