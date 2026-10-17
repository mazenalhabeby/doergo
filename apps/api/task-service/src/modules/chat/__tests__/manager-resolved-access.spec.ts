import { ChatReachService } from '../chat-reach.service';

/**
 * "Managers reach anyone in chat" asked the flat `User.canManageUsers` column.
 * A manager whose authority comes from their ROLE was treated as an ordinary
 * member, and a column left over after a move to a narrower role kept
 * granting once the legacy columns were retired. It reads resolved access now.
 */
describe('chat: who counts as a manager', () => {
  const svc = new ChatReachService({} as any, {} as any);
  const canReach = (me: any) =>
    (svc as any).canReach(
      { enabledModules: null, contactScope: 'NONE', contactAllowedIds: [], ...me },
      { id: 't', role: 'EMPLOYEE', contactable: true },
      async () => new Set<string>(),
    );
  const prev = process.env.ACCESS_IGNORE_LEGACY_FLAGS;
  afterEach(() => {
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = prev;
  });

  it('a manager BY ROLE reaches anyone in chat', async () => {
    expect(
      await canReach({ role: 'EMPLOYEE', memberRole: { isActive: true, permissions: { canManageUsers: true } } }),
    ).toBe(true);
  });

  it('a switched-off role grants nothing', async () => {
    expect(
      await canReach({ role: 'EMPLOYEE', memberRole: { isActive: false, permissions: { canManageUsers: true } } }),
    ).toBe(false);
  });

  it('a stale column stops granting once the legacy columns are retired', async () => {
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'true';
    expect(await canReach({ role: 'EMPLOYEE', canManageUsers: true, memberRole: null })).toBe(false);
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'false';
    expect(await canReach({ role: 'EMPLOYEE', canManageUsers: true, memberRole: null })).toBe(true);
  });

  it('an admin holds it by being one, whatever the role says', async () => {
    process.env.ACCESS_IGNORE_LEGACY_FLAGS = 'true';
    expect(await canReach({ role: 'ADMIN', memberRole: { isActive: true, permissions: {} } })).toBe(true);
  });
});
