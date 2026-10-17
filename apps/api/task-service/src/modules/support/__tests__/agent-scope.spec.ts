import { NotFoundException } from '@nestjs/common';
import { supportParts } from './support.service.fixture';

/*
  Support scoping (2026-10-10): the inbox was scoped to the operator's teams,
  but opening, answering, re-routing, closing or marking a ticket read took only
  its id. Every agent action now asks the same rule (shared support-scope.ts);
  outside it is 404, like a ticket that does not exist.
*/
describe('support — agent scope on every ticket operation', () => {
  const tickets: Record<string, any> = {
    triage: { id: 'triage', assignedTeamId: null, assignedAgentId: null, organizationId: 'o', createdById: 'c', status: 'OPEN', messages: [] },
    mine: { id: 'mine', assignedTeamId: 'other-team', assignedAgentId: 'op-3', organizationId: 'o', createdById: 'c', status: 'OPEN', messages: [] },
    team: { id: 'team', assignedTeamId: 't1', assignedAgentId: null, organizationId: 'o', createdById: 'c', status: 'OPEN', messages: [] },
    elsewhere: { id: 'elsewhere', assignedTeamId: 'other-team', assignedAgentId: 'op-9', organizationId: 'o', createdById: 'c', status: 'OPEN', messages: [] },
  };
  const prisma: any = {
    supportTicket: {
      findUnique: jest.fn(async ({ where }: any) => tickets[where.id] ?? null),
      update: jest.fn(async ({ where }: any) => tickets[where.id]),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    supportMessage: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn(async ({ data }: any) => data), groupBy: jest.fn().mockResolvedValue([]) },
    platformUser: { findMany: jest.fn().mockResolvedValue([{ id: 'op-3', firstName: 'Ann', lastName: 'Agent', email: 'a@x' }]) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const notify = { emit: jest.fn() };
  const queue = { getJob: jest.fn(), add: jest.fn() };
  const svc = supportParts(prisma, notify as any, queue as any);
  const scoped = { isSupervisor: false, teamIds: ['t1'], platformUserId: 'op-3' };

  const ops = (id: string, scope: any) => [
    () => svc.getThread({ ticketId: id, asAgent: true, scope }),
    () => svc.addMessage({ ticketId: id, authorId: 'op-3', authorType: 'AGENT', body: 'x', asAgent: true, scope }),
    () => svc.assign({ ticketId: id, teamId: null, scope }),
    () => svc.setStatus({ ticketId: id, status: 'RESOLVED' as any, scope }),
    () => svc.markRead({ ticketId: id, reader: 'AGENT', scope }),
  ];

  it('a ticket outside the scope is 404 for all five operations', async () => {
    for (const op of ops('elsewhere', scoped)) await expect(op()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('triage, the operator\'s team and their own assignment are reachable', async () => {
    for (const id of ['triage', 'team', 'mine']) for (const op of ops(id, scoped)) await expect(op()).resolves.toBeTruthy();
  });

  it('a supervisor reaches everything', async () => {
    for (const op of ops('elsewhere', { isSupervisor: true, teamIds: [] })) await expect(op()).resolves.toBeTruthy();
  });

  it('no scope at all is the NARROWEST scope (triage only), never everything', async () => {
    await expect(svc.getThread({ ticketId: 'team', asAgent: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getThread({ ticketId: 'triage', asAgent: true })).resolves.toBeTruthy();
  });

  it('agent names are read at display time; an old row holding a name is shown as written', async () => {
    tickets.mine.messages = [
      { id: 'm1', authorType: 'AGENT', authorId: 'op-3' },
      { id: 'm2', authorType: 'AGENT', authorId: 'Lena (legacy)' },
      { id: 'm3', authorType: 'CUSTOMER', authorId: 'c' },
    ];
    const r: any = await svc.getThread({ ticketId: 'mine', asAgent: true, scope: scoped });
    expect(r.data.assignedAgentName).toBe('Ann Agent');
    expect(r.data.messages.map((m: any) => m.authorName)).toEqual(['Ann Agent', 'Lena (legacy)', undefined]);
  });

  it('the inbox applies the same rule as a list filter', async () => {
    await svc.agentInbox({ isSupervisor: false, teamIds: ['t1'], agentId: 'op-3' });
    const where = prisma.supportTicket.findMany.mock.calls.at(-1)[0].where;
    expect(where.AND[0]).toEqual({ OR: [{ assignedTeamId: null }, { assignedTeamId: { in: ['t1'] } }, { assignedAgentId: 'op-3' }] });
  });
});
