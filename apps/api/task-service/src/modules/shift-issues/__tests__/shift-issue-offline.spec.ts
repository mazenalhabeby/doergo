/**
 * A shift issue reported, or a message sent, from a phone that was offline.
 */
import { ShiftIssuesService } from '../shift-issues.service';

function build() {
  const issues = new Map<string, any>();
  const events = new Map<string, any>();
  const prisma: any = {
    shiftIssue: {
      findUnique: jest.fn(async ({ where }: any) => issues.get(where.id) ?? null),
      findFirst: jest.fn(async ({ where }: any) => issues.get(where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: data.id ?? `i${issues.size + 1}`, ...data, events: [] };
        issues.set(row.id, row);
        return row;
      }),
      update: jest.fn(async () => ({})),
    },
    shiftIssueEvent: {
      findUnique: jest.fn(async ({ where }: any) => events.get(where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: data.id ?? `e${events.size + 1}`, ...data };
        events.set(row.id, row);
        return row;
      }),
    },
    timeEntry: { findFirst: jest.fn(async ({ where }: any) => (where.id === 'my-entry' && where.userId === 'u1' ? { id: 'my-entry' } : null)) },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => (where.organizationId === 'o1' && where.id === 'site-1' ? { id: 'site-1' } : null)) },
    user: { findUnique: jest.fn(async () => ({ firstName: 'Mike', lastName: 'Weber' })), findMany: jest.fn(async () => []) },
  };
  const routing: any = { resolveWatchers: jest.fn(async () => ({ ids: [] })) };
  const service = new ShiftIssuesService(prisma, routing, { emit: jest.fn() } as any, null, { signAll: async (r: any) => r } as any);
  (service as any).broadcast = jest.fn();
  (service as any).signAttachments = async (_i: any, a: any) => a ?? [];
  return { service, prisma, issues };
}

const ctx = { organizationId: 'o1', callerUserId: 'u1', canManage: false };

describe('shift issues from the outbox', () => {
  it('keeps the phone id, and a resend returns the same issue', async () => {
    const { service, prisma } = build();
    const first: any = await service.create({ ...ctx, id: 'issue-phone-0000000001', title: 'No power in hall B' });
    const again: any = await service.create({ ...ctx, id: 'issue-phone-0000000001', title: 'No power in hall B' });
    expect(first.data.id).toBe('issue-phone-0000000001');
    expect(again.data.id).toBe('issue-phone-0000000001');
    expect(prisma.shiftIssue.create).toHaveBeenCalledTimes(1);
  });

  it("does not attach an issue to somebody else's shift or another organization's site", async () => {
    const { service, prisma } = build();
    await service.create({ ...ctx, title: 'x', timeEntryId: 'their-entry', spaceId: 'other-org-site' });
    expect(prisma.shiftIssue.create.mock.calls[0][0].data).toMatchObject({ timeEntryId: null, spaceId: null });
    await service.create({ ...ctx, title: 'y', timeEntryId: 'my-entry', spaceId: 'site-1' });
    expect(prisma.shiftIssue.create.mock.calls[1][0].data).toMatchObject({ timeEntryId: 'my-entry', spaceId: 'site-1' });
  });

  it('writes a message once however often it is sent', async () => {
    const { service, prisma, issues } = build();
    issues.set('iss', { id: 'iss', organizationId: 'o1', reportedById: 'u1', assignedToId: null, spaceId: null });
    await service.addMessage({ ...ctx, issueId: 'iss', id: 'msg-phone-00000000001', body: 'Still no power' });
    await service.addMessage({ ...ctx, issueId: 'iss', id: 'msg-phone-00000000001', body: 'Still no power' });
    expect(prisma.shiftIssueEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.shiftIssue.update).toHaveBeenCalledTimes(1);
  });
});
