import { operatorMaySupport, resolveSocketAccess, socketMayOpenTask } from '../socket-access';

/**
 * Three things a socket still got by believing its token:
 *   - an app token minted before the account's session cut-off (a password
 *     change, "sign out everywhere") kept authenticating until its own `exp`;
 *   - an operator token did the same, and with the role it was minted with,
 *     even after the operator was switched off;
 *   - a task open to a work role, readable through the API by whoever holds
 *     that role, could not be followed live: the room refused them.
 */
const memberRow = (over: Record<string, unknown> = {}) => ({
  role: 'EMPLOYEE', isActive: true, organizationId: 'org-1', tokensValidAfter: null,
  canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false, canViewReports: false,
  organization: { suspendedAt: null }, memberRole: null, spaceAssignments: [], ...over,
});
const db = (user: any, task: any = null, holder: any = null) => ({
  user: { findUnique: jest.fn().mockResolvedValue(user) },
  task: { findFirst: jest.fn().mockResolvedValue(task) },
  spaceAssignment: { findFirst: jest.fn().mockResolvedValue(holder) },
});

describe('the session cut-off reaches sockets', () => {
  const cutoff = new Date('2026-10-01T12:00:00Z');
  const before = Math.floor(cutoff.getTime() / 1000) - 60;
  const after = Math.floor(cutoff.getTime() / 1000) + 60;

  it('a token minted before the cut-off is refused', async () => {
    expect(await resolveSocketAccess(db(memberRow({ tokensValidAfter: cutoff })), 'u1', 'org-1', before)).toBeNull();
  });

  it('a token minted after it, or an account with no cut-off, is let in', async () => {
    expect(await resolveSocketAccess(db(memberRow({ tokensValidAfter: cutoff })), 'u1', 'org-1', after)).not.toBeNull();
    expect(await resolveSocketAccess(db(memberRow()), 'u1', 'org-1', before)).not.toBeNull();
  });
});

describe('operator sockets ask the database', () => {
  const can = (role: string) => role === 'OWNER' || role === 'SUPPORT';
  const op = (over: Record<string, unknown> = {}) => ({ platformUser: { findUnique: jest.fn().mockResolvedValue({ isActive: true, role: 'SUPPORT', tokensValidAfter: null, twoFactorEnabled: true, ...over }) } });
  const token = { typ: 'platform', sub: 'op-1', iat: 2_000_000_000 };

  it('admits an active operator whose CURRENT role supports', async () => {
    expect(await operatorMaySupport(op(), token, can)).toBe(true);
  });

  it('refuses one switched off, one since moved to a role without support, and a token older than the cut-off', async () => {
    expect(await operatorMaySupport(op({ isActive: false }), token, can)).toBe(false);
    expect(await operatorMaySupport(op({ role: 'BILLING' }), token, can)).toBe(false);
    expect(await operatorMaySupport(op({ tokensValidAfter: new Date(2_000_000_100 * 1000) }), token, can)).toBe(false);
  });

  it('refuses an operator who has not enrolled a second factor (2FA is mandatory on the console)', async () => {
    expect(await operatorMaySupport(op({ twoFactorEnabled: false }), token, can)).toBe(false);
  });

  it('refuses a token that is not an operator token at all', async () => {
    expect(await operatorMaySupport(op(), { sub: 'op-1', iat: 1 }, can)).toBe(false);
  });
});

describe('a task open to a work role', () => {
  const openTask = { organizationId: 'org-1', spaceId: 'sp-1', assignedToId: null, assignees: [], openRoleId: 'mechanic', openSpotsLeft: 1, status: 'NEW' };
  const caller = { userId: 'u1', organizationId: 'org-1', role: 'EMPLOYEE', access: { org: {}, perSpace: {} } as any };

  it("admits whoever holds the role in the task's workspace", async () => {
    const prisma = db(null, openTask, { user: { role: 'EMPLOYEE', enabledModules: null, isExternal: false } });
    expect(await socketMayOpenTask(prisma, caller, 't1')).toBe(true);
    expect(prisma.spaceAssignment.findFirst.mock.calls[0][0].where).toMatchObject({ userId: 'u1', spaceId: 'sp-1', workRoleId: 'mechanic' });
  });

  it('refuses an external holder, a non-holder, and a task with no places left', async () => {
    expect(await socketMayOpenTask(db(null, openTask, { user: { role: 'EMPLOYEE', enabledModules: null, isExternal: true } }), caller, 't1')).toBe(false);
    expect(await socketMayOpenTask(db(null, openTask, null), caller, 't1')).toBe(false);
    const full = db(null, { ...openTask, openSpotsLeft: 0 }, { user: { role: 'EMPLOYEE', enabledModules: null, isExternal: false } });
    expect(await socketMayOpenTask(full, caller, 't1')).toBe(false);
    expect(full.spaceAssignment.findFirst).not.toHaveBeenCalled();
  });
});

describe('a static-key agent socket is recorded in the operator audit trail', () => {
  it('writes one STATIC_KEY row with the declared agent name', async () => {
    const { recordStaticKeyAgentSocket } = require('../socket-access');
    const create = jest.fn().mockResolvedValue({});
    await recordStaticKeyAgentSocket({ platformAuditLog: { create } }, { agent: 'Lena', ip: '1.2.3.4', userAgent: 'ua' });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorType: 'STATIC_KEY', actorLabel: 'Lena', action: 'SUPPORT_AGENT_SOCKET_OPENED', ok: true }) });
    await recordStaticKeyAgentSocket({ platformAuditLog: { create } }, {});
    expect(create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ actorLabel: 'static-key' }) });
  });
});
