import { WebsocketGateway } from '../websocket.gateway';

/**
 * Four things a socket used to get by believing the client or its token:
 *   - joining any task room in its organization (the API refuses some of them);
 *   - "…is typing" on any user's screen / the operator inbox;
 *   - the platform key compared with `===`;
 *   - staying authenticated after removal, suspension or token expiry.
 */
function gatewayWith(prisma: Record<string, any>) {
  const g = Object.create(WebsocketGateway.prototype) as any;
  g.connectedClients = new Map();
  g.agentSockets = new Set();
  g.ticketCreatorCache = new Map();
  g.prisma = prisma;
  g.logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  g.emitted = [] as Array<{ room: string; event: string; data: any }>;
  g.sockets = new Map();
  g.server = {
    to: (room: string) => ({ emit: (event: string, data: any) => g.emitted.push({ room, event, data }) }),
    emit: jest.fn(),
    sockets: { sockets: g.sockets },
  };
  return g;
}

const memberRow = (over: Record<string, unknown> = {}) => ({
  role: 'EMPLOYEE', isActive: true, organizationId: 'org-1',
  canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false, canViewReports: false,
  organization: { suspendedAt: null }, memberRole: null, spaceAssignments: [], ...over,
});

const socket = (id: string) => ({ id, join: jest.fn(), leave: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), rooms: new Set([id]) });

describe('join_task asks the API rule, not just the organization', () => {
  const task = (over: Record<string, unknown> = {}) => ({ organizationId: 'org-1', spaceId: 'sp-1', assignedToId: null, assignees: [], ...over });

  const setup = (user: any, t: any) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) }, task: { findFirst: jest.fn().mockResolvedValue(t) } };
    const g = gatewayWith(prisma);
    g.connectedClients.set('s1', { userId: 'u1', role: user?.role ?? 'EMPLOYEE', organizationId: 'org-1', connectedAt: new Date(), rooms: [] });
    return { g, prisma, s: socket('s1') };
  };

  it("refuses a plain member a task in their organization they are not on", async () => {
    const { g, s } = setup(memberRow(), task());
    expect(await g.handleJoinTask(s, { taskId: 't1' })).toEqual({ success: false, error: 'Task not found' });
    expect(s.join).not.toHaveBeenCalled();
  });

  it('admits the assignee', async () => {
    const { g, s } = setup(memberRow(), task({ assignees: [{ userId: 'u1' }] }));
    expect(await g.handleJoinTask(s, { taskId: 't1' })).toEqual({ success: true });
    expect(s.join).toHaveBeenCalledWith('task:t1');
  });

  it('admits "view all tasks" held in THAT space through a role, and only there', async () => {
    const user = memberRow({ spaceAssignments: [{ spaceId: 'sp-1', role: { isActive: true, permissions: { canViewAllTasks: true } } }] });
    const ok = setup(user, task({ spaceId: 'sp-1' }));
    expect(await ok.g.handleJoinTask(ok.s, { taskId: 't1' })).toEqual({ success: true });
    const no = setup(user, task({ spaceId: 'sp-2' }));
    expect((await no.g.handleJoinTask(no.s, { taskId: 't1' })).success).toBe(false);
  });

  it('refuses a deactivated account and a suspended organization', async () => {
    const off = setup(memberRow({ isActive: false }), task({ assignees: [{ userId: 'u1' }] }));
    expect((await off.g.handleJoinTask(off.s, { taskId: 't1' })).success).toBe(false);
    const sus = setup(memberRow({ organization: { suspendedAt: new Date() } }), task({ assignees: [{ userId: 'u1' }] }));
    expect((await sus.g.handleJoinTask(sus.s, { taskId: 't1' })).success).toBe(false);
  });

  it('a task of another organization is never even loaded across the boundary', async () => {
    const { g, prisma, s } = setup(memberRow({ role: 'ADMIN' }), null);
    expect((await g.handleJoinTask(s, { taskId: 't-other' })).success).toBe(false);
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 't-other', organizationId: 'org-1' });
  });
});

describe('support_typing derives the target from the ticket', () => {
  const setup = (createdById: string | null) => {
    const prisma = { supportTicket: { findUnique: jest.fn().mockResolvedValue(createdById ? { createdById } : null) } };
    return gatewayWith(prisma);
  };

  it('ignores an unauthenticated socket entirely', async () => {
    const g = setup('owner');
    await g.handleSupportTyping(socket('anon'), { ticketId: 't1', customerId: 'victim', from: 'AGENT' });
    expect(g.emitted).toEqual([]);
  });

  it('an agent reaches the ticket creator — never a customerId the client names', async () => {
    const g = setup('owner');
    g.agentSockets.add('agent-1');
    await g.handleSupportTyping(socket('agent-1'), { ticketId: 't1', customerId: 'victim' });
    expect(g.emitted.map((e: any) => [e.room, e.data.from])).toEqual([['user:owner', 'AGENT']]);
  });

  it("a member reaches the agents only for their OWN ticket", async () => {
    const g = setup('owner');
    g.connectedClients.set('s-other', { userId: 'someone', role: 'EMPLOYEE', organizationId: 'o', rooms: [] });
    await g.handleSupportTyping(socket('s-other'), { ticketId: 't1', from: 'CUSTOMER' });
    expect(g.emitted).toEqual([]);
    g.connectedClients.set('s-owner', { userId: 'owner', role: 'EMPLOYEE', organizationId: 'o', rooms: [] });
    await g.handleSupportTyping(socket('s-owner'), { ticketId: 't1', from: 'AGENT' });
    expect(g.emitted.map((e: any) => [e.room, e.data.from])).toEqual([['support-agents', 'CUSTOMER']]);
  });
});

describe('authenticate_agent no longer accepts the static platform key', () => {
  it('the platform key alone is refused — only a console staff token opens an agent socket', async () => {
    const g = gatewayWith({});
    (g as any).platformAdminKey = 'operator-secret';
    const sock = (auth: Record<string, unknown>) => ({ ...socket('a'), handshake: { auth } });
    expect((await g.handleAuthenticateAgent(sock({ platformKey: 'operator-secret' }))).success).toBe(false);
    expect((await g.handleAuthenticateAgent(sock({}))).success).toBe(false);
    expect((await g.handleAuthenticateAgent(sock({ token: 'not-a-jwt' }))).success).toBe(false);
  });
});

describe('revocation reaches live sockets', () => {
  it('a suspended organization loses every socket, other organizations keep theirs', () => {
    const g = gatewayWith({});
    for (const [id, org] of [['a', 'org-1'], ['b', 'org-1'], ['c', 'org-2']]) {
      g.connectedClients.set(id, { userId: id, role: 'EMPLOYEE', organizationId: org, rooms: [] });
      g.sockets.set(id, socket(id));
    }
    g.disconnectOrganization('org-1');
    expect([...g.connectedClients.keys()]).toEqual(['c']);
    expect(g.sockets.get('a').emit).toHaveBeenCalledWith('force_disconnect', { reason: 'organization_suspended' });
    expect(g.sockets.get('a').disconnect).toHaveBeenCalledWith(true);
    expect(g.sockets.get('c').disconnect).not.toHaveBeenCalled();
  });

  it("revoked sessions cut that user's sockets only", () => {
    const g = gatewayWith({});
    g.connectedClients.set('a', { userId: 'u1', organizationId: 'o', rooms: [] });
    g.connectedClients.set('b', { userId: 'u2', organizationId: 'o', rooms: [] });
    g.sockets.set('a', socket('a'));
    g.sockets.set('b', socket('b'));
    g.forceDisconnectUser('u1', 'sessions_revoked');
    expect(g.sockets.get('a').emit).toHaveBeenCalledWith('force_disconnect', { reason: 'sessions_revoked' });
    expect(g.sockets.get('b').disconnect).not.toHaveBeenCalled();
  });

  it('an expired token cycles the transport (client reconnects with its current token)', () => {
    jest.useFakeTimers();
    try {
      const g = gatewayWith({});
      const close = jest.fn();
      const s: any = { ...socket('x'), rooms: new Set(['x', 'org:o', 'task:t1']), conn: { close } };
      g.armExpiry(s, Math.floor(Date.now() / 1000) + 60);
      jest.advanceTimersByTime(60_000);
      expect(close).not.toHaveBeenCalled(); // grace for the client's own refresh
      jest.advanceTimersByTime(31_000);
      expect(s.leave).toHaveBeenCalledWith('org:o');
      expect(s.leave).toHaveBeenCalledWith('task:t1');
      expect(close).toHaveBeenCalled();
      expect(s.disconnect).not.toHaveBeenCalled(); // a hard disconnect would stop auto-reconnect
    } finally {
      jest.useRealTimers();
    }
  });
});
