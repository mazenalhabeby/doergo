import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every rate is written through ONE writer — `writeRateChange` in shared.
 *
 * ⚠️ A rate written straight onto its column re-prices the past: every day
 * worked before the change, not yet invoiced, silently moves to the new rate.
 * The dated writer records the change from a day and leaves the past alone.
 * A fifth path added next year that writes the column directly would undo that
 * without anybody noticing until two documents disagree — so this reads the
 * services and fails first.
 *
 * Two checks:
 *   1. `cleanRateCents(` — what every old column write used — appears only where
 *      an invoice LINE snapshots the rate it was issued with (a record, not a rate).
 *   2. Each place that owns a rate column calls the writer.
 */
const API = join(__dirname, '..', '..', '..', '..', '..');
const ROOTS = ['auth-service/src', 'task-service/src', 'gateway/src'].map((r) => join(API, r));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

const ALL = ROOTS.flatMap(files);
const read = (rel: string) => readFileSync(join(API, rel), 'utf8');

describe('rates are written through the dated writer', () => {
  it('nothing outside an invoice line cleans a rate onto a column', () => {
    const allowed = new Set(['auth-service/src/modules/invoices/invoice-create.service.ts']);
    const offenders = ALL.filter((p) => readFileSync(p, 'utf8').includes('cleanRateCents('))
      .map((p) => relative(API, p))
      .filter((p) => !allowed.has(p));
    expect(offenders).toEqual([]);
  });

  it.each([
    ['organization default', 'auth-service/src/modules/onboarding/org-profile.service.ts', "target: 'ORGANIZATION'"],
    ['a member', 'auth-service/src/modules/users/employee-write.service.ts', "target: 'MEMBER'"],
    ['a workspace', 'task-service/src/modules/spaces/space-write-rules.ts', "target: 'SPACE'"],
    ['a member at one client', 'task-service/src/modules/space-roles/member-terms.service.ts', "target: 'ASSIGNMENT'"],
    ["a work role's day rate", 'task-service/src/modules/space-roles/role-admin.service.ts', "target: 'ROLE'"],
  ])('%s goes through writeRateChange', (_label, file, target) => {
    const src = read(file);
    expect(src).toContain('writeRateChange(');
    expect(src).toContain(target);
  });

  it('no service writes a rate column inside a plain update payload', () => {
    // `data: { ... billRateCents: <something that is not the writer's answer> }`
    const direct = /(billRateCents|costRateCents|billableRateCents)\s*:\s*(?!true\b)(?!.*nowCents)[^,\n}]*cleanRate/;
    const offenders = ALL.filter((p) => direct.test(readFileSync(p, 'utf8'))).map((p) => relative(API, p));
    expect(offenders.filter((p) => !p.endsWith('invoice-create.service.ts'))).toEqual([]);
  });
});
