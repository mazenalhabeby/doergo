import { CrmReachService } from '../crm-reach.service';
import { CustomerReminderScheduler } from '../customer-reminder.scheduler';

/*
  A client reminder reaches only people who still reach the client, and only
  for an ACTIVE client. The sweep pushed every listed manager / the owner /
  the author — including a rep moved off the account, or who had left — and
  swept reminders of deleted clients too.
*/

const ORG = 'org-1';
const ownBookRep = (id: string) => ({
  id,
  role: 'EMPLOYEE',
  organizationId: ORG,
  isExternal: false,
  organization: { enabledModules: ['crm'] },
  memberRole: { permissions: { crmViewOwn: true }, isActive: true },
  spaceAssignments: [],
});

function setup() {
  const users: Record<string, any> = { owner: ownBookRep('owner'), author: ownBookRep('author') };
  const prisma: any = {
    customerActivity: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          organizationId: ORG,
          customerId: 'c1',
          authorId: 'author', // moved off the account: neither owner nor manager any more
          reminderAssigneeId: null,
          body: 'Call back',
          customer: { name: 'Client', managerIds: ['gone'], ownerId: 'owner', spaceId: null },
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // 'gone' left the organization (inactive): not found by an active-only lookup.
    user: {
      findFirst: jest.fn(async ({ where }: any) => (where.isActive !== false ? (users[where.id] ?? null) : null)),
    },
  };
  const notify = { emit: jest.fn() };
  const scheduler = new CustomerReminderScheduler(prisma, notify as never, new CrmReachService(prisma));
  return { prisma, notify, scheduler };
}

describe('client reminders', () => {
  it('only active clients are swept', async () => {
    const { prisma, scheduler } = setup();
    await scheduler.sweep();
    expect(prisma.customerActivity.findMany.mock.calls[0][0].where.customer).toEqual({ isActive: true });
  });

  it('are sent only to people who still reach the client', async () => {
    const { notify, scheduler } = setup();
    await scheduler.sweep();
    expect(notify.emit).toHaveBeenCalledTimes(1);
    expect(notify.emit.mock.calls[0][1].userIds).toEqual(['owner']);
  });
});
