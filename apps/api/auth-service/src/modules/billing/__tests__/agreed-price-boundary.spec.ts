import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/*
  An agreed price decides what a real customer is charged. The whole security
  story is one sentence — only a platform operator may write it — and a sentence
  is not enforcement. This walks the source and fails if a second writer appears.

  Written as a source scan rather than a request test on purpose. A request test
  proves the routes that exist today refuse; this catches the route somebody adds
  next year, which is the one that will not have a test of its own.
*/

const SERVICES = ['auth-service', 'gateway', 'task-service'];
const AGREED_COLUMNS = ['agreedMonthlyCents', 'agreedListCents', 'agreedUntil', 'agreedNote', 'agreedSetAt', 'agreedSetById'];

/** The one file allowed to write them, and the tests that check it does. */
const ALLOWED = [
  join('platform-admin', 'platform-admin.service.ts'),
  '__tests__',
  '.spec.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('who may set an agreed price', () => {
  const root = join(__dirname, '..', '..', '..', '..', '..');

  const writers: string[] = [];
  for (const svc of SERVICES) {
    for (const file of walk(join(root, svc, 'src'))) {
      const src = readFileSync(file, 'utf8');
      /*
        A WRITE, not a read.

        The columns are legitimately SELECTED in several places — the bill reads
        them, the console lists them, the org detail shows them — so matching the
        column name anywhere finds honest code. What must stay rare is a Prisma
        mutation of the organization row that touches one, so this looks only
        inside such a call.
      */
      const writes = [...src.matchAll(/organization\.(update|updateMany|upsert|create)\s*\(/g)].some((m) => {
        const call = src.slice(m.index ?? 0, (m.index ?? 0) + 900);
        return AGREED_COLUMNS.some((c) => call.includes(`${c}:`));
      });
      if (writes && !ALLOWED.some((a) => file.includes(a))) writers.push(file.slice(root.length + 1));
    }
  }

  it('is only the platform-admin service', () => {
    expect(writers).toEqual([]);
  });

  it('is a route no customer session can reach', () => {
    /*
      The routes themselves: platform-gated, and gated on `billingOps` rather
      than `manageOrgs` — the operator who may switch an account off is not
      automatically the one who may discount it.
    */
    const controller = readFileSync(
      join(root, 'gateway', 'src', 'modules', 'platform-admin', 'platform-admin.controller.ts'),
      'utf8',
    );
    const block = controller.slice(controller.indexOf("@Post('orgs/:id/agreed-price')"));
    expect(block).toContain("@RequirePlatformPerm('billingOps')");
    expect(block.slice(0, block.indexOf('async clearAgreedPrice'))).toContain('organizationId: id');
    // The operator is taken from the verified session, never from the body — a
    // crafted request must not be able to attribute a discount to someone else.
    expect(block).toContain('byUserId: this.actor(req)');
    expect(block).not.toContain('byUserId: body');
  });
});
