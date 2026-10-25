import * as fs from 'fs';
import * as path from 'path';
import { scopeFor, scopeForAll, scopeIdsFor } from '../permission-scope';

import { fakeUser } from '../testing/fake-request';
/**
 * scopeFor is THE narrowing rule (common/permission-scope.ts). The case that
 * broke: a member whose permission is a BRIDGE (org-wide canManageUsers →
 * canApproveAttendance) passed the guard and was then narrowed to nothing.
 */
describe('scopeFor', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({
    org,
    perSpace,
  });

  it('an administrator is never narrowed', () => {
    expect(scopeFor(fakeUser({ role: 'ADMIN', access: access({}) }), 'canApproveAttendance')).toBeNull();
  });

  it('a bridged org flag is org-wide, not an empty list', () => {
    const user = { role: 'EMPLOYEE', canApproveAttendance: true, access: access({ canManageUsers: true }) };
    expect(scopeFor(fakeUser(user), 'canApproveAttendance')).toBeNull();
  });

  it('a space grant narrows to exactly those spaces', () => {
    const user = {
      role: 'EMPLOYEE',
      access: access({}, { A: { canApproveAttendance: true }, B: { canViewAllTasks: true } }),
    };
    expect(scopeFor(fakeUser(user), 'canApproveAttendance')).toEqual(['A']);
  });

  it('granted nowhere is an empty list (matches nothing), never null', () => {
    expect(scopeFor(fakeUser({ role: 'EMPLOYEE', access: access({}) }), 'canDeleteAttendance')).toEqual([]);
    expect(scopeFor(undefined, 'canDeleteAttendance')).toEqual([]);
  });

  it('a flat flag set to anything but true does not widen', () => {
    expect(
      scopeFor(
        fakeUser({ role: 'EMPLOYEE', canApproveAttendance: 'true', access: access({}) }),
        'canApproveAttendance',
      ),
    ).toEqual([]);
  });
});

describe('scopeIdsFor (the shape the services take)', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({
    org,
    perSpace,
  });

  it('an org-wide Manager (canViewAllTasks) sees attendance and cover org-wide, not an empty page', () => {
    // canViewSpaceAttendance is bridged from canViewAllTasks; the flag carries it, access.org does not.
    const manager = {
      role: 'EMPLOYEE',
      canViewAllTasks: true,
      canViewSpaceAttendance: true,
      access: access({ canViewAllTasks: true }),
    };
    expect(scopeIdsFor(fakeUser(manager), 'canViewSpaceAttendance')).toBeUndefined();
  });

  it('a space grant stays narrowed; nowhere stays empty', () => {
    const lead = { role: 'EMPLOYEE', access: access({}, { A: { canViewSpaceAttendance: true } }) };
    expect(scopeIdsFor(fakeUser(lead), 'canViewSpaceAttendance')).toEqual(['A']);
    expect(scopeIdsFor(fakeUser({ role: 'EMPLOYEE', access: access({}) }), 'canViewSpaceAttendance')).toEqual([]);
  });
});

describe('ONE narrowing rule in the gateway', () => {
  /*
    `isAdmin(u) ? undefined : spacesGranting(...)` by hand skips the org flag and
    its bridges: the guard lets an org-wide Manager in, the list comes back empty.
    That was 24 copies; these are the only direct callers left, each with why.
  */
  const ALLOWED: Record<string, string> = {
    'common/permission-scope.ts': 'the rule itself',
    'common/tracking-visibility.ts': 'also reads the legacy flat column as org-wide',
    'modules/approvals/approvals-helpers.ts': 'reads OWN access (a stand-in is never a ceiling)',
    'modules/spaces/spaces.controller.ts': 'external members only: closed when nothing is granted',
    'modules/members/members.controller.ts': 'member card: org-wide is canViewAllTasks/canManageUsers, decided above',
  };
  const root = path.resolve(__dirname, '../..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
      return e.name.endsWith('.ts') ? [p] : [];
    });

  it('spacesGranting is called only where a reason is named', () => {
    const callers = walk(root)
      .filter((f) => /spacesGranting\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f));
    expect(callers.filter((f) => !ALLOWED[f])).toEqual([]);
  });
});

/** Two permissions at once (clock review A10: approve hours AND overtime). */
describe('scopeForAll', () => {
  const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({
    org,
    perSpace,
  });
  const keys = ['canApproveAttendance', 'canApproveOvertime'] as const;

  it('an administrator is org-wide', () => {
    expect(scopeForAll(fakeUser({ role: 'ADMIN', access: access({}) }), keys)).toBeNull();
  });

  it('only the workspaces where BOTH are held', () => {
    const user = {
      role: 'EMPLOYEE',
      access: access(
        {},
        {
          A: { canApproveAttendance: true, canApproveOvertime: true },
          B: { canApproveOvertime: true }, // a team leader here: overtime only
          C: { canApproveAttendance: true },
        },
      ),
    };
    expect(scopeForAll(fakeUser(user), keys)).toEqual(['A']);
  });

  it('one key org-wide narrows to where the other is held', () => {
    const user = {
      role: 'EMPLOYEE',
      canApproveOvertime: true,
      access: access({ canApproveOvertime: true }, { A: { canApproveAttendance: true } }),
    };
    expect(scopeForAll(fakeUser(user), keys)).toEqual(['A']);
  });

  it('a team leader (overtime only) matches nothing', () => {
    const user = { role: 'EMPLOYEE', access: access({}, { A: { canApproveOvertime: true } }) };
    expect(scopeForAll(fakeUser(user), keys)).toEqual([]);
  });
});
