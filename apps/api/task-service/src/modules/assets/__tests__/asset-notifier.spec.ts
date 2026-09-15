import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { AssetNotifier } from '../asset-notifier.service';

/**
 * Who is told about the organization's things.
 *
 * The notification service only delivers; the decision of WHO lives here, so
 * this is where the rules that matter are pinned: an expense always reaches
 * somebody who can decide, a body naming an asset never reaches somebody who
 * cannot see it, clients and the person who acted are never told, and nothing
 * is announced about a handover that did not happen.
 */

const plan = (over: any = {}) => ({
  opening: [], closing: [], unchanged: [], at: new Date('2026-09-15T10:00:00Z'), problems: [], ...over,
});
const period = (userId: string) => ({ id: `c-${userId}`, userId, customerId: null, startedAt: new Date('2026-01-01'), endedAt: null });

describe('AssetNotifier', () => {
  let notifier: AssetNotifier;
  const routing = { resolveWatchers: jest.fn() };
  const notifications = { emit: jest.fn() };
  const prisma: any = {
    asset: { findFirst: jest.fn() },
    assetMoney: { findFirst: jest.fn() },
    accessRole: { findMany: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.asset.findFirst.mockResolvedValue({ name: 'Ford Transit', category: { spaceId: null } });
    prisma.user.findFirst.mockResolvedValue({ firstName: 'Ahmed', lastName: 'Dessouky' });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.accessRole.findMany.mockResolvedValue([]);
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetNotifier,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationRoutingService, useValue: routing },
        { provide: 'NOTIFICATION_SERVICE', useValue: notifications },
      ],
    }).compile();
    notifier = module.get(AssetNotifier);
  });

  const ENTRY = {
    id: 'm1', organizationId: 'org1', assetId: 'a1', authorId: 'u-ahmed',
    category: 'Fuel', amountCents: 8141, occurredAt: new Date('2026-09-14'),
  };
  const emitted = (event: string) => notifications.emit.mock.calls.filter(([e]: any[]) => e === event).map(([, p]: any[]) => p);

  describe('an expense sent in', () => {
    it('goes to the member’s routed people who can see the register', async () => {
      routing.resolveWatchers.mockResolvedValue({ ids: ['u-boss'], emails: [] });
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u-boss', role: 'EMPLOYEE', canViewAllTasks: false, canManageUsers: false, memberRole: { isActive: true, permissions: { canManageAssets: true } } },
      ]);

      await notifier.expenseSubmitted(ENTRY);

      expect(routing.resolveWatchers).toHaveBeenCalledWith('u-ahmed', 'org1', 'tasks', false);
      expect(emitted('asset_expense_submitted')).toEqual([expect.objectContaining({
        organizationId: 'org1', entryId: 'm1', assetId: 'a1', assetName: 'Ford Transit',
        authorId: 'u-ahmed', authorName: 'Ahmed Dessouky', category: 'Fuel', amountCents: 8141,
        recipientIds: ['u-boss'],
      })]);
    });

    /*
      ⚠️ A body names the asset, so a routed person who cannot open the register
      is not sent it. A shift leader watching a driver is somebody to tell about
      a late clock-out, not somebody entitled to the fleet list.
    */
    it('does not send an asset’s name to a watcher who cannot see assets', async () => {
      routing.resolveWatchers.mockResolvedValue({ ids: ['u-lead', 'u-boss'], emails: [] });
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u-lead', role: 'EMPLOYEE', canViewAllTasks: false, canManageUsers: false, memberRole: { isActive: true, permissions: { canApproveOvertime: true } } },
        { id: 'u-boss', role: 'ADMIN', canViewAllTasks: false, canManageUsers: false, memberRole: null },
      ]);

      await notifier.expenseSubmitted(ENTRY);

      expect(emitted('asset_expense_submitted')[0].recipientIds).toEqual(['u-boss']);
    });

    it('counts a grant held in the workspace the asset’s kind belongs to', async () => {
      prisma.asset.findFirst.mockResolvedValue({ name: 'Forklift 3', category: { spaceId: 'depot' } });
      routing.resolveWatchers.mockResolvedValue({ ids: ['u-depot'], emails: [] });
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u-depot', role: 'EMPLOYEE', canViewAllTasks: false, canManageUsers: false, memberRole: null },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValueOnce([
        { userId: 'u-depot', role: { isActive: true, permissions: { canViewAllTasks: true } } },
      ]);

      await notifier.expenseSubmitted(ENTRY);

      expect(prisma.spaceAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', spaceId: 'depot', userId: { in: ['u-depot'] } }),
      }));
      expect(emitted('asset_expense_submitted')[0].recipientIds).toEqual(['u-depot']);
    });

    it('never asks external members, whatever they hold', async () => {
      routing.resolveWatchers.mockResolvedValue({ ids: ['u-ext'], emails: [] });
      await notifier.expenseSubmitted(ENTRY);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ isExternal: false, organizationId: 'org1' }));
    });

    /*
      ⚠️ WITH A FALLBACK. An expense nobody is told about is money a driver is
      waiting to get back.
    */
    it('falls back to the organization’s approvers when nobody is routed', async () => {
      prisma.accessRole.findMany.mockResolvedValue([
        { id: 'r-assets', permissions: { canManageAssets: true } },
        { id: 'r-staff', permissions: { canViewAllTasks: true } },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'u-owner' }, { id: 'u-fleet' }]);

      await notifier.expenseSubmitted(ENTRY);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toEqual(expect.objectContaining({ organizationId: 'org1', isActive: true, isExternal: false, id: { not: 'u-ahmed' } }));
      expect(where.OR).toContainEqual({ memberRoleId: { in: ['r-assets'] } });
      // Space roles are refused at the review endpoint, so they are not asked.
      expect(prisma.accessRole.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ organizationId: 'org1', scope: { not: 'SPACE' } }),
      );
      expect(emitted('asset_expense_submitted')[0].recipientIds).toEqual(['u-owner', 'u-fleet']);
    });

    it('prefers the approvers assigned to the asset’s workspace', async () => {
      prisma.asset.findFirst.mockResolvedValue({ name: 'Forklift 3', category: { spaceId: 'depot' } });
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'u-owner' }, { id: 'u-depot-mgr' }]);
      prisma.spaceAssignment.findMany.mockResolvedValueOnce([{ userId: 'u-depot-mgr' }]);

      await notifier.expenseSubmitted(ENTRY);

      expect(emitted('asset_expense_submitted')[0].recipientIds).toEqual(['u-depot-mgr']);
    });

    it('never lets "prefer" become "nobody"', async () => {
      prisma.asset.findFirst.mockResolvedValue({ name: 'Forklift 3', category: { spaceId: 'depot' } });
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'u-owner' }, { id: 'u-fleet' }]);
      prisma.spaceAssignment.findMany.mockResolvedValueOnce([]);

      await notifier.expenseSubmitted(ENTRY);

      expect(emitted('asset_expense_submitted')[0].recipientIds).toEqual(['u-owner', 'u-fleet']);
    });

    it('says nothing about an asset from another organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);
      await notifier.expenseSubmitted(ENTRY);
      expect(prisma.asset.findFirst.mock.calls[0][0].where).toEqual({ id: 'a1', organizationId: 'org1' });
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('never fails the filing when routing is down', async () => {
      routing.resolveWatchers.mockRejectedValue(new Error('redis down'));
      await expect(notifier.expenseSubmitted(ENTRY)).resolves.toBeUndefined();
      expect(notifications.emit).not.toHaveBeenCalled();
    });
  });

  describe('an expense decided', () => {
    const decide = (over: any = {}) =>
      notifier.expenseDecided({ entryId: 'm1', organizationId: 'org1', decision: 'reject', note: 'Not our van', reviewerId: 'u-boss', ...over });

    it('goes to the author only, with the reason', async () => {
      prisma.assetMoney.findFirst.mockResolvedValue({
        authorId: 'u-ahmed', assetId: 'a1', category: 'Fuel', amountCents: 8141, asset: { name: 'Ford Transit' },
      });

      await decide();

      expect(prisma.assetMoney.findFirst.mock.calls[0][0].where).toEqual({ id: 'm1', organizationId: 'org1' });
      expect(emitted('asset_expense_decided')).toEqual([{
        organizationId: 'org1', entryId: 'm1', assetId: 'a1', assetName: 'Ford Transit', authorId: 'u-ahmed',
        decision: 'reject', note: 'Not our van', amountCents: 8141, category: 'Fuel',
      }]);
    });

    it('does not tell somebody about their own decision', async () => {
      prisma.assetMoney.findFirst.mockResolvedValue({
        authorId: 'u-boss', assetId: 'a1', category: 'Fuel', amountCents: 1, asset: { name: 'Ford Transit' },
      });
      await decide();
      expect(notifications.emit).not.toHaveBeenCalled();
    });
  });

  describe('a handover', () => {
    const hand = (p: any, actorId = 'u-boss') =>
      notifier.handedOver({ organizationId: 'org1', assetId: 'a1', actorId, plan: p });

    it('tells the receiver and the person it was taken from', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u-mira' }, { id: 'u-ahmed' }]);

      await hand(plan({ opening: [{ userId: 'u-mira' }], closing: [period('u-ahmed')] }));

      expect(emitted('asset_handed_over')).toEqual([expect.objectContaining({
        organizationId: 'org1', assetId: 'a1', assetName: 'Ford Transit',
        openedUserIds: ['u-mira'], closedUserIds: ['u-ahmed'], byUserId: 'u-boss',
      })]);
    });

    it('never tells whoever made the change', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u-ahmed' }]);
      await hand(plan({ opening: [{ userId: 'u-boss' }], closing: [period('u-ahmed')] }));
      const [payload] = emitted('asset_handed_over');
      expect(payload.openedUserIds).toEqual([]);
      expect(payload.closedUserIds).toEqual(['u-ahmed']);
    });

    it('says nothing when the only person involved is the one who acted', async () => {
      await hand(plan({ opening: [{ userId: 'u-boss' }] }));
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('never tells a client, and only members of this organization', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u-mira' }]);
      await hand(plan({ opening: [{ customerId: 'k-resident' }, { userId: 'u-mira' }, { userId: 'u-other-org' }] }));

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
        organizationId: 'org1', isActive: true, role: { not: 'CUSTOMER' },
      }));
      expect(emitted('asset_handed_over')[0].openedUserIds).toEqual(['u-mira']);
    });

    it('announces nothing about a plan that was refused or changed nothing', async () => {
      await hand(plan({ opening: [{ userId: 'u-mira' }], problems: [{ kind: 'too-many', limit: 1, asked: 2 }] }));
      await hand(plan({ problems: [{ kind: 'nobody' }] }));
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(notifications.emit).not.toHaveBeenCalled();
    });
  });
});
