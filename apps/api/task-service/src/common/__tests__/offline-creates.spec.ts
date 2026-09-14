/**
 * Everything a worker creates from the phone is created once, however often
 * the queue sends it — and somebody else's id is never an answer.
 */
import { ChatService } from '../../modules/chat/chat.service';
import { SupportService } from '../../modules/support/support.service';
import { TechniciansService } from '../../modules/technicians/technicians.service';
import { AssetExpenseService } from '../../modules/assets/asset-expense.service';

/** A service instance with only the collaborators a test gives it. */
function withDeps<T extends object>(Cls: new (...a: any[]) => T, deps: Record<string, unknown>): T {
  return Object.assign(Object.create(Cls.prototype), deps);
}

describe('chat', () => {
  const membership = { id: 'm1', conversation: { members: [{ userId: 'u1' }, { userId: 'u2' }], organizationId: 'o1', type: 'GROUP' } };

  it('returns the delivered message for a resend, before sending anything', async () => {
    const prisma: any = { message: { findUnique: jest.fn(async () => ({ id: 'msg-phone-00000000001', senderId: 'u1', conversationId: 'c1' })) }, $transaction: jest.fn() };
    const chat = withDeps(ChatService, { prisma, notificationClient: { emit: jest.fn() } });
    (chat as any).assertMember = jest.fn(async () => membership);
    (chat as any).assertStillReachable = jest.fn();
    const res: any = await chat.sendMessage({ conversationId: 'c1', senderId: 'u1', body: 'hi', id: 'msg-phone-00000000001' });
    expect(res.data.id).toBe('msg-phone-00000000001');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps when a late message was written, and never a time in the future', async () => {
    const created: any[] = [];
    const prisma: any = {
      message: { findUnique: jest.fn(async () => null), create: jest.fn((args: any) => { created.push(args.data); return args; }) },
      conversation: { update: jest.fn() },
      conversationMember: { update: jest.fn() },
      $transaction: jest.fn(async (ops: any[]) => [{ id: 'x' }]),
    };
    const chat = withDeps(ChatService, { prisma, notificationClient: { emit: jest.fn() } });
    (chat as any).assertMember = jest.fn(async () => membership);
    (chat as any).assertStillReachable = jest.fn();
    await chat.sendMessage({ conversationId: 'c1', senderId: 'u1', body: 'late', sentAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    await chat.sendMessage({ conversationId: 'c1', senderId: 'u1', body: 'future', sentAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(created[0].sentAt).toBeInstanceOf(Date);
    expect(created[1].sentAt).toBeNull();
  });
});

describe('time off', () => {
  it('answers a resend before the overlap rule could refuse it as overlapping itself', async () => {
    const prior = { id: 'to-phone-0000000001', technicianId: 'u1', startDate: new Date(), endDate: new Date() };
    const prisma: any = {
      user: { findFirst: jest.fn(async () => ({ id: 'u1' })) },
      timeOff: { findUnique: jest.fn(async () => prior), findFirst: jest.fn(async () => prior), create: jest.fn() },
    };
    const svc = withDeps(TechniciansService, { prisma });
    const res: any = await svc.requestTimeOff({ id: 'to-phone-0000000001', technicianId: 'u1', organizationId: 'o1', startDate: '2030-01-01', endDate: '2030-01-02' } as any);
    expect(res.data.id).toBe('to-phone-0000000001');
    expect(prisma.timeOff.findFirst).not.toHaveBeenCalled();
    expect(prisma.timeOff.create).not.toHaveBeenCalled();
  });

  it("refuses an id that is somebody else's request", async () => {
    const prisma: any = {
      user: { findFirst: jest.fn(async () => ({ id: 'u1' })) },
      timeOff: { findUnique: jest.fn(async () => ({ id: 'x', technicianId: 'u2' })) },
    };
    const svc = withDeps(TechniciansService, { prisma });
    await expect(svc.requestTimeOff({ id: 'to-phone-0000000001', technicianId: 'u1', organizationId: 'o1', startDate: '2030-01-01', endDate: '2030-01-02' } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ID_IN_USE' }),
    });
  });
});

describe('support', () => {
  it('a resent ticket and a resent reply are the same records', async () => {
    const prisma: any = {
      supportTicket: {
        findUnique: jest.fn(async ({ where }: any) => (where.id === 'tk-phone-0000000001' ? { id: 'tk-phone-0000000001', createdById: 'u1', organizationId: 'o1', status: 'OPEN' } : null)),
        create: jest.fn(),
      },
      supportMessage: { findUnique: jest.fn(async () => ({ id: 'rp-phone-0000000001', ticketId: 'tk-phone-0000000001', authorId: 'u1' })) },
      $transaction: jest.fn(),
    };
    const svc = withDeps(SupportService, { prisma, notificationClient: { emit: jest.fn() } });
    (svc as any).createdBySelect = () => ({});
    const t: any = await svc.createTicket({ id: 'tk-phone-0000000001', organizationId: 'o1', createdById: 'u1', subject: 'Help', body: 'x' });
    const m: any = await svc.addMessage({ id: 'rp-phone-0000000001', ticketId: 'tk-phone-0000000001', authorId: 'u1', authorType: 'CUSTOMER', body: 'y', organizationId: 'o1', userId: 'u1' });
    expect(t.data.id).toBe('tk-phone-0000000001');
    expect(m.data.id).toBe('rp-phone-0000000001');
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('expenses', () => {
  it('files an expense once, and only after the custody gate', async () => {
    const prisma: any = { assetMoney: { findUnique: jest.fn(async () => ({ id: 'ex-phone-0000000001', authorId: 'u1', assetId: 'a1' })), create: jest.fn() } };
    const svc = withDeps(AssetExpenseService, { prisma });
    const gate = jest.fn(async () => ({ category: { config: {} } }));
    (svc as any).gate = gate;
    (svc as any).readDate = () => new Date();
    const res: any = await svc.submit({ id: 'a1', entryId: 'ex-phone-0000000001', category: 'Fuel', amountCents: 5000, userId: 'u1', userRole: 'EMPLOYEE', organizationId: 'o1' });
    expect(gate).toHaveBeenCalled();
    expect(res.data.id).toBe('ex-phone-0000000001');
    expect(prisma.assetMoney.create).not.toHaveBeenCalled();
  });
});
