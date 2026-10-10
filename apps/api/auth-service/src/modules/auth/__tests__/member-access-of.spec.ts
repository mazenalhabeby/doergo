import { memberAccessOf, orgAllows, loadOrgPermissionCeiling } from '@hbcfield/shared';

/*
  ONE resolver for "what may this member do", asked by sign-in, refresh, token
  validation, the session builder, the socket gateway, the document-reviewer
  lookup and the grant ceiling. Five of those carried their own copy; two had
  drifted, both live in production (ACCESS_IGNORE_LEGACY_FLAGS=true):
    • the reviewer lookup counted an INACTIVE role — a member whose role was
      switched off was still told about documents to review;
    • the grant ceiling always counted the legacy columns, so a stale column
      let a member grant a permission their real access did not hold.
*/
const member = (over: Record<string, unknown> = {}) => ({
  role: 'EMPLOYEE',
  canCreateTasks: false,
  canViewAllTasks: false,
  canAssignTasks: false,
  canManageUsers: false,
  canViewReports: false,
  memberRole: null,
  spaceAssignments: [],
  ...over,
});

describe('memberAccessOf — the one resolver', () => {
  const env = process.env.ACCESS_IGNORE_LEGACY_FLAGS;
  afterEach(() => {
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = env;
  });

  it('an inactive org role grants nothing', () => {
    const m = member({ memberRole: { isActive: false, permissions: { canIssueDocuments: true } } });
    expect(orgAllows(m as never, 'canIssueDocuments')).toBe(false);
    const active = member({ memberRole: { isActive: true, permissions: { canIssueDocuments: true } } });
    expect(orgAllows(active as never, 'canIssueDocuments')).toBe(true);
  });

  it('an inactive SPACE role grants nothing in that space', () => {
    const m = member({
      spaceAssignments: [
        { spaceId: 's1', role: { isActive: false, permissions: { canViewAllTasks: true } } },
        { spaceId: 's2', role: { isActive: true, permissions: { canViewAllTasks: true } } },
      ],
    });
    const access = memberAccessOf(m as never);
    expect(access.perSpace.s1?.canViewAllTasks).toBeFalsy();
    expect(access.perSpace.s2?.canViewAllTasks).toBe(true);
  });

  it('the legacy columns count only while the switch is off', () => {
    const m = member({ canManageUsers: true });
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'false';
    expect(orgAllows(m as never, 'canManageUsers')).toBe(true);
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'true';
    expect(orgAllows(m as never, 'canManageUsers')).toBe(false);
  });

  it('an ADMIN holds everything by being one, whatever their role says', () => {
    const admin = member({ role: 'ADMIN', memberRole: { isActive: true, permissions: {} } });
    expect(orgAllows(admin as never, 'canManageUsers')).toBe(true);
    expect(orgAllows(admin as never, 'canIssueDocuments')).toBe(true);
  });

  it('the grant ceiling equals the member’s real access — a stale column does not raise it', async () => {
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'true';
    const row = member({ canManageUsers: true, memberRole: { isActive: true, permissions: { canCreateTasks: true } } });
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(row) } };
    const ceiling = await loadOrgPermissionCeiling(prisma as never, 'u1', 'o1');
    expect(ceiling?.perms.canCreateTasks).toBe(true);
    expect(ceiling?.perms.canManageUsers).toBeFalsy();
    expect(ceiling?.perms).toEqual(memberAccessOf(row as never).org);
  });
});
