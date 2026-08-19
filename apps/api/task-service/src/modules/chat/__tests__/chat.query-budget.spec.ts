import { Test, TestingModule } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { ChatService } from '../chat.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A budget for what sending a message is allowed to cost.
 *
 * Re-checking permission on every send turned a one-query operation into
 * several, so the counts are pinned here. These are ceilings, not targets — if
 * a change makes a send cheaper, lower them; if it makes one dearer, that
 * should be a deliberate decision with a reason, not something noticed in
 * production months later.
 *
 * Counting mock calls is a proxy for round trips, which is what actually costs
 * time across PgBouncer. It does not measure row counts or index use.
 */
describe('query budget for sending a message', () => {
  let service: ChatService;
  let calls: string[];

  const track = (name: string, impl: any) => (...args: any[]) => { calls.push(name); return impl(...args); };

  const users: any = {
    me:   { id: 'me',   organizationId: 'A', role: 'EMPLOYEE', isActive: true },
    them: { id: 'them', organizationId: 'B', role: 'EMPLOYEE', isActive: true },
    same: { id: 'same', organizationId: 'A', role: 'EMPLOYEE', isActive: true },
  };

  const prisma: any = {};

  const build = async () => {
    calls = [];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: () => {} } },
      ],
    }).compile();
    service = module.get(ChatService);
  };

  const setup = (originSpaceId: string | null, other: string, meScope = 'NONE') => {
    prisma.user = {
      findUnique: track('user.findUnique', ({ where }: any) =>
        Promise.resolve({ ...users[where.id], enabledModules: null, contactScope: meScope, contactAllowedIds: [], canManageUsers: false })),
      findFirst: track('user.findFirst', () => Promise.resolve({ id: other, role: 'EMPLOYEE', contactable: true, canManageUsers: false })),
      findMany: track('user.findMany', ({ where }: any) =>
        Promise.resolve((where.id.in as string[]).map((id) => users[id]).filter(Boolean))),
    };
    prisma.spaceAssignment = { findMany: track('spaceAssignment.findMany', ({ where }: any) =>
      Promise.resolve((where.userId?.in ?? [where.userId]).map((id: string) => ({ userId: id, spaceId: 'sp' })))) };
    prisma.spaceShare = { findMany: track('spaceShare.findMany', () => Promise.resolve([
      { spaceId: 'sp', ownerOrgId: 'A', guestOrgId: 'B', status: 'ACTIVE', showWorkers: true, expiresAt: null },
    ])), findFirst: track('spaceShare.findFirst', () => Promise.resolve({ ownerOrgId: 'A' })) };
    prisma.companyLocation = { findMany: track('companyLocation.findMany', () => Promise.resolve([])) };
    prisma.accessRole = { findMany: track('accessRole.findMany', () => Promise.resolve([])) };
    prisma.conversationMember = {
      findUnique: track('conversationMember.findUnique', () => Promise.resolve({
        id: 'cm', conversation: { id: 'c', type: 'DIRECT', organizationId: 'A', originSpaceId, members: [
          { userId: 'me', user: { id: 'me', organizationId: 'A', role: 'EMPLOYEE', isActive: true, contactable: true, canManageUsers: false } },
          { userId: other, user: { id: other, organizationId: users[other].organizationId, role: 'EMPLOYEE', isActive: true, contactable: true, canManageUsers: false } },
        ] },
      })),
      update: track('conversationMember.update', () => Promise.resolve({})),
    };
    prisma.conversation = { update: track('conversation.update', () => Promise.resolve({})), findFirst: track('conversation.findFirst', () => Promise.resolve(null)) };
    prisma.message = { create: track('message.create', () => Promise.resolve({})) };
    prisma.$transaction = track('$transaction', async () => [{ id: 'm' }]);
  };

  /** Everything before the write — the cost the permission check adds. */
  const authCalls = () => calls.filter((c) => !['$transaction', 'message.create', 'conversation.update', 'conversationMember.update'].includes(c));

  it('costs 2 queries for an ordinary in-org send', async () => {
    // The membership read (which brings the counterpart with it) and the
    // sender's own permissions. Nothing else.
    setup(null, 'same', 'ALL'); await build();
    await service.sendMessage({ conversationId: 'c', senderId: 'me', body: 'x' });
    expect(authCalls()).toEqual(['conversationMember.findUnique', 'user.findUnique']);
  });

  it('costs 5 for a member whose reach runs through spaces', async () => {
    // contactScope NONE resolves space-driven contact targets, which was four
    // reads on its own (the person's spaces fetched twice, then two more
    // against the same table, all sequential) and is three now — two of which
    // run together, so it is two round trips rather than four.
    setup(null, 'same', 'NONE'); await build();
    await service.sendMessage({ conversationId: 'c', senderId: 'me', body: 'x' }).catch(() => {});
    expect(authCalls().length).toBeLessThanOrEqual(5);
  });

  it('costs 4 for a cross-org send', async () => {
    // Membership, both parties in one read, their assignments in one read, and
    // the shares between the two orgs.
    setup('sp', 'them'); await build();
    await service.sendMessage({ conversationId: 'c', senderId: 'me', body: 'x' });
    expect(authCalls().sort()).toEqual(
      ['conversationMember.findUnique', 'spaceAssignment.findMany', 'spaceShare.findMany', 'user.findMany'].sort(),
    );
  });
});
