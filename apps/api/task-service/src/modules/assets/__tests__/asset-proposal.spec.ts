import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mayReviewProposal, proposalInSpace, proposalReviewSpaces } from '@hbcfield/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { AssetAccessService } from '../asset-access.service';
import { AssetContractService } from '../asset-contract.service';
import { AssetProposalService } from '../asset-proposal.service';
import { AssetNotifier } from '../asset-notifier.service';
import { AssetResponsibleService } from '../asset-responsible.service';

/**
 * A member sends a page in; somebody responsible decides.
 *
 * The reading is pinned in shared. What is asserted here is everything only the
 * server can be trusted with: that a member cannot create an asset, that two
 * reviewers cannot both act on one page, that a failed accept goes BACK in the
 * queue, and that a proposal always reaches somebody.
 */

const FIELDS = { registration: 'GM-472 DK', vin: 'WF0YXXTTGYKA12345' };

describe('AssetProposalService', () => {
  let service: AssetProposalService;
  // `assertMay` is the REAL rule, so the proposal queue is tested against the
  // same door the contract flow opens; only `apply` is stubbed.
  const contracts = {
    apply: jest.fn(),
    assertMay: AssetContractService.prototype.assertMay.bind({ access: { assertMay: jest.fn() } }),
  };
  const routing = { resolveWatchers: jest.fn() };
  const notifications = { emit: jest.fn() };
  // Every uploaded page exists and is small, unless a test says otherwise.
  const store = {
    head: jest.fn(async () => ({ exists: true, sizeBytes: 1000 })),
    presignDownload: jest.fn(async () => 'https://s3/page'),
  };

  const prisma: any = {
    assetProposal: {
      create: jest.fn(), count: jest.fn(), findMany: jest.fn(),
      findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(),
    },
    assetCategory: { findMany: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    accessRole: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.assetProposal.count.mockResolvedValue(0);
    prisma.assetProposal.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p1', ...data }));
    prisma.assetCategory.findMany.mockResolvedValue([]);
    prisma.accessRole.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ firstName: 'Ahmed', lastName: 'Dessouky' });
    routing.resolveWatchers.mockResolvedValue({ ids: ['u-boss'], emails: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetProposalService,
        // The real one: the fallback it owns is what these tests pin.
        AssetNotifier,
        AssetResponsibleService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (_k: string, d?: string) => d ?? '' } },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn() } },
        { provide: AssetContractService, useValue: contracts },
        { provide: NotificationRoutingService, useValue: routing },
        { provide: 'NOTIFICATION_SERVICE', useValue: notifications },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(AssetProposalService);
  });

  const raise = (over: any = {}) =>
    service.raise({
      fields: FIELDS, userId: 'u-ahmed', userRole: 'EMPLOYEE', organizationId: 'org1', ...over,
    } as any);

  describe('raising one', () => {
    it('files it as waiting, and creates no asset', async () => {
      const res: any = await raise();
      expect(res.data.status).toBeUndefined(); // default applied by the column
      expect(contracts.apply).not.toHaveBeenCalled();
      expect(prisma.assetProposal.create).toHaveBeenCalled();
    });

    /*
      ⚠️ A member may only raise one FOR THEMSELVES.

      Naming somebody else is how a proposal quietly becomes a way to attach a
      vehicle — and its running costs — to a colleague.
    */
    it('ignores a holder somebody else named, unless they manage the register', async () => {
      await raise({ holderUserId: 'u-someone-else' });
      expect(prisma.assetProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ holderUserId: 'u-ahmed' }) }),
      );
    });

    it('lets somebody who manages the register raise one on a member’s behalf', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u-mira' });
      await raise({ holderUserId: 'u-mira', canManageAssets: true });
      expect(prisma.assetProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ holderUserId: 'u-mira' }) }),
      );
    });

    it('refuses a page that identifies nothing', async () => {
      // A queue item nobody can act on can only be dismissed, which teaches
      // people to dismiss the queue.
      await expect(raise({ fields: {} })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a document key from somewhere else', async () => {
      await expect(raise({ fileKey: 'other-org/asset-proposals/x.jpg' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts one under this member’s own prefix', async () => {
      const key = 'org1/asset-proposals/u-ahmed/abc.jpg';
      const res: any = await raise({ fileKey: key, fileName: 'c.jpg', fileMime: 'image/jpeg' });
      expect(res.data.fileKey).toBe(key);
    });

    it('refuses a colleague’s page in the same organization', async () => {
      // ⚠️ The prefix used to be the organization's, so any member's upload was accepted.
      await expect(raise({ fileKey: 'org1/asset-proposals/u-colleague/abc.jpg' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a page that never finished uploading', async () => {
      store.head.mockResolvedValueOnce({ exists: false, sizeBytes: 0 });
      await expect(raise({ fileKey: 'org1/asset-proposals/u-ahmed/abc.jpg' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('stops one person filling the queue', async () => {
      prisma.assetProposal.count.mockResolvedValue(10);
      await expect(raise()).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
      The member does not know the organization's taxonomy and must not guess —
      but where exactly ONE kind is held by a member there is nothing to choose,
      and asking a reviewer to pick from a list of one is ceremony.
    */
    it('fills in the kind only when there is no choice to make', async () => {
      const held = { holder: { enabled: true, members: true } };
      prisma.assetCategory.findMany.mockResolvedValue([{ id: 'k1', config: held }]);
      await raise();
      expect(prisma.assetProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 'k1' }) }),
      );

      jest.clearAllMocks();
      prisma.assetProposal.count.mockResolvedValue(0);
      prisma.assetProposal.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p2', ...data }));
      prisma.assetCategory.findMany.mockResolvedValue([{ id: 'k1', config: held }, { id: 'k2', config: held }]);
      await raise();
      expect(prisma.assetProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: null }) }),
      );
    });
  });

  describe('telling somebody', () => {
    it('goes to the people responsible for that member', async () => {
      await raise();
      expect(notifications.emit).toHaveBeenCalledWith(
        'asset_proposal_raised',
        expect.objectContaining({ recipientIds: ['u-boss'], raisedById: 'u-ahmed' }),
      );
    });

    /*
      ⚠️ WITH A FALLBACK, unlike every other use of this routing.

      Attendance deliberately notifies nobody when an organization configured
      nobody — not being told about a late clock-out is a choice. A proposal is
      different in kind: it is WORK THAT STOPS. Silence means the member waits
      forever and stops sending pages in.
    */
    it('falls back to whoever can actually act when nobody is configured', async () => {
      routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });
      prisma.accessRole.findMany.mockResolvedValue([
        { id: 'r-mgr', permissions: { canManageAssets: true } },
        { id: 'r-tech', permissions: { canViewAllTasks: true } },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u-owner' }]);
      await raise();
      // Only the role that GRANTS it is asked for.
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ memberRoleId: { in: ['r-mgr'] } }]),
          }),
        }),
      );
      expect(notifications.emit).toHaveBeenCalledWith(
        'asset_proposal_raised',
        expect.objectContaining({ recipientIds: ['u-owner'] }),
      );
    });

    it('does not fail the upload when nothing could be told', async () => {
      // The proposal is IN the queue either way; losing the member's reading
      // because a socket was down would be the worse outcome by far.
      routing.resolveWatchers.mockRejectedValue(new Error('redis down'));
      await expect(raise()).resolves.toBeDefined();
    });
  });

  describe('accepting one', () => {
    const PENDING = {
      id: 'p1', raisedById: 'u-ahmed', holderUserId: 'u-ahmed',
      categoryId: 'k1', fields: FIELDS, status: 'PENDING',
    };

    beforeEach(() => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetProposal.findUniqueOrThrow.mockResolvedValue(PENDING);
      contracts.apply.mockResolvedValue({ data: { assetId: 'a-new', name: 'GM-472 DK' } });
    });

    const accept = (over: any = {}) =>
      service.accept({ id: 'p1', userId: 'u-boss', userRole: 'ADMIN', organizationId: 'org1', ...over } as any);

    /*
      ⚠️ The plan is built HERE AND NOW, never stored on the proposal.

      A page uploaded three weeks ago may name a van since given to somebody
      else; executing a plan frozen at upload would quietly undo that.
    */
    it('builds the plan at review time, through the contract service', async () => {
      await accept();
      expect(contracts.apply).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'k1', holderUserId: 'u-ahmed', fields: FIELDS }),
        expect.anything(),
      );
    });

    /*
      ⚠️ No double notification. The member is told "Added to the register" by
      the proposal; the handover push would say the same thing a second time.
    */
    it('keeps the handover quiet — the decision already tells the member', async () => {
      await accept();
      expect(contracts.apply).toHaveBeenCalledWith(expect.anything(), { announceHandover: false });
      const decided = notifications.emit.mock.calls.filter(([e]: any[]) => e === 'asset_proposal_decided');
      expect(decided).toHaveLength(1);
    });

    it('lets the reviewer’s corrections win — they are looking at the page too', async () => {
      await accept({ fields: { registration: 'GM-999 ZZ' } });
      expect(contracts.apply).toHaveBeenCalledWith(
        expect.objectContaining({ fields: expect.objectContaining({ registration: 'GM-999 ZZ', vin: FIELDS.vin }) }),
        expect.anything(),
      );
    });

    it('refuses without a kind, rather than guessing one', async () => {
      prisma.assetProposal.findUniqueOrThrow.mockResolvedValue({ ...PENDING, categoryId: null });
      await expect(accept()).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
      ⚠️ Claimed with a CONDITIONAL update, not a read-then-write. Two reviewers
      opening the queue at once would otherwise both see it pending — and the
      second would create a SECOND vehicle from the same page.
    */
    it('cannot be accepted twice', async () => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 0 });
      await expect(accept()).rejects.toBeInstanceOf(NotFoundException);
      expect(contracts.apply).not.toHaveBeenCalled();
    });

    /*
      ⚠️ And a failed accept goes BACK in the queue.

      The claim took it out. If the apply then fails, one bad click would
      otherwise make a member's proposal disappear with nothing created and
      nothing said.
    */
    it('puts it back when the create fails', async () => {
      contracts.apply.mockRejectedValue(new BadRequestException('this type is held by clients'));
      await expect(accept()).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.assetProposal.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });

    it('tells the member it was added', async () => {
      await accept();
      expect(notifications.emit).toHaveBeenCalledWith(
        'asset_proposal_decided',
        expect.objectContaining({ userId: 'u-ahmed', outcome: 'accepted' }),
      );
    });
  });

  describe('refusing one', () => {
    it('carries the reason back to the member', async () => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetProposal.findUnique.mockResolvedValue({ raisedById: 'u-ahmed' });
      await service.reject({
        id: 'p1', note: 'That is the old contract', userId: 'u-boss', userRole: 'ADMIN', organizationId: 'org1',
      } as any);
      // A refusal with no reason teaches nothing and gets re-sent unchanged.
      expect(notifications.emit).toHaveBeenCalledWith(
        'asset_proposal_decided',
        expect.objectContaining({ outcome: 'rejected', detail: 'That is the old contract' }),
      );
    });

    it('refuses one that has already been decided', async () => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.reject({ id: 'p1', userId: 'u', userRole: 'ADMIN', organizationId: 'org1' } as any))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('taking one back', () => {
    it('is scoped to the person who raised it, and to PENDING', async () => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 1 });
      await service.withdraw({ id: 'p1', userId: 'u-ahmed', organizationId: 'org1' } as any);
      expect(prisma.assetProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ raisedById: 'u-ahmed', status: 'PENDING', organizationId: 'org1' }),
        }),
      );
    });

    it('cannot take back somebody else’s', async () => {
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.withdraw({ id: 'p1', userId: 'u-mira', organizationId: 'org1' } as any))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the page itself', () => {
    it('is never handed to somebody who neither sent it nor manages the register', async () => {
      prisma.assetProposal.findFirst.mockResolvedValue({
        fileKey: 'org1/asset-proposals/a.jpg', fileMime: 'image/jpeg', raisedById: 'u-ahmed',
      });
      await expect(service.documentUrl({
        id: 'p1', userId: 'u-nosy', userRole: 'EMPLOYEE', organizationId: 'org1',
      } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('never leaves a key in a list', async () => {
      prisma.assetProposal.findMany.mockResolvedValue([
        { id: 'p1', fields: FIELDS, status: 'PENDING', fileKey: 'org1/asset-proposals/a.jpg' },
      ]);
      const res: any = await service.mine({ userId: 'u-ahmed', organizationId: 'org1' } as any);
      expect(res.data[0].fileKey).toBeUndefined();
      expect(res.data[0].hasDocument).toBe(true);
    });
  });

  /*
    ⚠️ A Space Manager decides the pages meant for their workspace.

    Accept, reject and the queue asked `canManageAssets` ORG-wide while the
    contract flow they run on had already opened to a manager of one depot. The
    rule is written once in shared (`mayReviewProposal`): a chosen kind decides
    by its own workspace; with no kind yet, the member's assignments decide.
  */
  describe('a space-scoped reviewer', () => {
    const KINDS: Record<string, string | null> = { 'k-linz': 'linz', 'k-graz': 'graz', 'k-nowhere': null };
    const ASSIGNED: Record<string, string[]> = { 'u-linz-driver': ['linz'], 'u-graz-driver': ['graz'] };
    const row = (id: string, categoryId: string | null, holder: string) => ({
      id, categoryId, holderUserId: holder, raisedById: holder, fields: FIELDS, status: 'PENDING',
      createdAt: new Date(), fileKey: null,
    });
    const QUEUE = [
      row('p-linz-kind', 'k-linz', 'u-graz-driver'),   // the kind is Linz's → Linz decides
      row('p-graz-kind', 'k-graz', 'u-linz-driver'),   // the kind is Graz's → not Linz, whoever the driver is
      row('p-nokind-linz', null, 'u-linz-driver'),     // no kind, a Linz driver → Linz
      row('p-nokind-graz', null, 'u-graz-driver'),     // no kind, a Graz driver → not Linz
      row('p-nowhere-kind', 'k-nowhere', 'u-linz-driver'), // a kind in no workspace → org-wide only
      row('p-deleted-kind', 'k-gone', 'u-linz-driver'),    // a kind since deleted → read as not chosen
    ];
    const byId = (id: string) => QUEUE.find((r) => r.id === id)!;
    const linz = { userId: 'u-lena', userRole: 'EMPLOYEE', organizationId: 'org1', manageSpaceIds: ['linz'] };

    beforeEach(() => {
      prisma.assetCategory.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          (where.id?.in ?? []).filter((id: string) => id in KINDS).map((id: string) => ({ id, spaceId: KINDS[id] })),
        ),
      );
      prisma.spaceAssignment.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          (where.userId?.in ?? []).flatMap((u: string) => (ASSIGNED[u] ?? []).map((spaceId) => ({ userId: u, spaceId }))),
        ),
      );
      prisma.assetProposal.findMany.mockResolvedValue(QUEUE);
      prisma.assetProposal.findFirst.mockImplementation(({ where }: any) => Promise.resolve(byId(where.id) ?? null));
      prisma.assetProposal.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetProposal.findUniqueOrThrow.mockImplementation(({ where }: any) => Promise.resolve(byId(where.id)));
      contracts.apply.mockResolvedValue({ data: { assetId: 'a-new', name: 'GM-472 DK' } });
    });

    describe('the rule, in shared', () => {
      it('lets a chosen kind decide by its own workspace, and only that', () => {
        expect(mayReviewProposal({ kindSpaceId: 'linz', holderSpaceIds: ['graz'] }, ['linz'])).toBe(true);
        expect(mayReviewProposal({ kindSpaceId: 'graz', holderSpaceIds: ['linz'] }, ['linz'])).toBe(false);
        expect(mayReviewProposal({ kindSpaceId: null, holderSpaceIds: ['linz'] }, ['linz'])).toBe(false);
      });

      it('falls to the member’s workspaces while no kind is chosen', () => {
        expect(mayReviewProposal({ kindSpaceId: undefined, holderSpaceIds: ['graz', 'linz'] }, ['linz'])).toBe(true);
        expect(mayReviewProposal({ kindSpaceId: undefined, holderSpaceIds: ['graz'] }, ['linz'])).toBe(false);
        expect(mayReviewProposal({ kindSpaceId: undefined, holderSpaceIds: [] }, ['linz'])).toBe(false);
      });

      it('org-wide reaches everything; granted nowhere reaches nothing', () => {
        expect(mayReviewProposal({ kindSpaceId: null, holderSpaceIds: [] }, null)).toBe(true);
        expect(mayReviewProposal({ kindSpaceId: null, holderSpaceIds: [] }, undefined)).toBe(true);
        expect(mayReviewProposal({ kindSpaceId: 'linz', holderSpaceIds: ['linz'] }, [])).toBe(false);
      });

      it('names the same workspaces for routing', () => {
        expect(proposalReviewSpaces({ kindSpaceId: 'graz', holderSpaceIds: ['linz'] })).toEqual(['graz']);
        expect(proposalReviewSpaces({ kindSpaceId: undefined, holderSpaceIds: ['linz', 'linz', 'wels'] })).toEqual(['linz', 'wels']);
        expect(proposalReviewSpaces({ kindSpaceId: null, holderSpaceIds: ['linz'] })).toEqual([]);
      });
    });

    describe('the queue', () => {
      it('shows only what they may decide', async () => {
        const res: any = await service.pending(linz as any);
        expect(res.data.proposals.map((p: any) => p.id)).toEqual(['p-linz-kind', 'p-nokind-linz', 'p-deleted-kind']);
      });

      it('is unchanged for an org-wide manager — and costs no lookups', async () => {
        const res: any = await service.pending({ userId: 'u-boss', userRole: 'ADMIN', organizationId: 'org1' } as any);
        expect(res.data.proposals).toHaveLength(QUEUE.length);
        expect(prisma.spaceAssignment.findMany).not.toHaveBeenCalled();
      });

      it('is refused to somebody who manages assets nowhere, before anything is read', async () => {
        await expect(service.pending({ ...linz, manageSpaceIds: [] } as any)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.assetProposal.findMany).not.toHaveBeenCalled();
      });
    });

    /*
      ⚠️ A workspace's own tab shows THAT workspace's proposals. A manager of
      Linz and Graz on Linz's Assets tab was shown Graz's van too — in a kind
      that tab's picker does not offer, so it could not be decided from there.
    */
    describe('one workspace’s queue', () => {
      const both = { ...linz, manageSpaceIds: ['linz', 'graz'] };
      const ids = (res: any) => res.data.proposals.map((p: any) => p.id);

      it('the rule, in shared: a chosen kind by its workspace, else the member’s', () => {
        expect(proposalInSpace({ kindSpaceId: 'linz', holderSpaceIds: ['graz'] }, 'linz')).toBe(true);
        expect(proposalInSpace({ kindSpaceId: 'graz', holderSpaceIds: ['linz'] }, 'linz')).toBe(false);
        expect(proposalInSpace({ kindSpaceId: undefined, holderSpaceIds: ['graz', 'linz'] }, 'linz')).toBe(true);
        expect(proposalInSpace({ kindSpaceId: undefined, holderSpaceIds: ['graz'] }, 'linz')).toBe(false);
        // A kind in no workspace is on no workspace's tab.
        expect(proposalInSpace({ kindSpaceId: null, holderSpaceIds: ['linz'] }, 'linz')).toBe(false);
      });

      it('narrows a manager of two workspaces to the tab they are on', async () => {
        expect(ids(await service.pending({ ...both, spaceId: 'linz' } as any)))
          .toEqual(['p-linz-kind', 'p-nokind-linz', 'p-deleted-kind']);
        expect(ids(await service.pending({ ...both, spaceId: 'graz' } as any)))
          .toEqual(['p-graz-kind', 'p-nokind-graz']);
      });

      it('without a workspace, keeps the whole in-scope queue', async () => {
        expect(ids(await service.pending(both as any)))
          .toEqual(['p-linz-kind', 'p-graz-kind', 'p-nokind-linz', 'p-nokind-graz', 'p-deleted-kind']);
      });

      it('narrows an org-wide manager too — and their unfiled ones stay on the org-wide queue', async () => {
        const boss = { userId: 'u-boss', userRole: 'ADMIN', organizationId: 'org1' };
        expect(ids(await service.pending({ ...boss, spaceId: 'linz' } as any)))
          .toEqual(['p-linz-kind', 'p-nokind-linz', 'p-deleted-kind']);
        expect(ids(await service.pending(boss as any))).toContain('p-nowhere-kind');
      });

      it('never widens: a workspace outside the caller’s scope adds nothing they could not already decide', async () => {
        // Linz only, asking for Graz: Graz's kind is not theirs, and no Linz member's page is Graz's.
        expect(ids(await service.pending({ ...linz, spaceId: 'graz' } as any))).toEqual([]);
      });

      it('a workspace id from nowhere matches nothing', async () => {
        expect(ids(await service.pending({ ...both, spaceId: 'not-a-space' } as any))).toEqual([]);
      });
    });

    describe('deciding', () => {
      const accept = (id: string, over: any = {}) => service.accept({ id, categoryId: 'k-linz', ...linz, ...over } as any);

      it('accepts one in scope, and carries their workspaces into apply', async () => {
        await accept('p-nokind-linz');
        expect(contracts.apply).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: 'k-linz', manageSpaceIds: ['linz'], holderUserId: 'u-linz-driver' }),
          expect.anything(),
        );
      });

      it('is told a proposal outside their workspaces does not exist — 404, and nothing is claimed', async () => {
        for (const id of ['p-graz-kind', 'p-nokind-graz', 'p-nowhere-kind']) {
          await expect(accept(id)).rejects.toBeInstanceOf(NotFoundException);
        }
        expect(prisma.assetProposal.updateMany).not.toHaveBeenCalled();
        expect(contracts.apply).not.toHaveBeenCalled();
      });

      /*
        Reviewing a Linz driver's page is not creating it in Graz's register.
        `apply` narrows the chosen kind (asset-contract.spec.ts pins that); here,
        its 404 must leave the proposal back in the queue.
      */
      it('cannot create it in a kind outside their workspaces — and the proposal goes back in the queue', async () => {
        contracts.apply.mockRejectedValue(new NotFoundException('That type is not in this organization'));
        await expect(accept('p-nokind-linz', { categoryId: 'k-graz' })).rejects.toBeInstanceOf(NotFoundException);
        expect(contracts.apply).toHaveBeenCalledWith(
          expect.objectContaining({ categoryId: 'k-graz', manageSpaceIds: ['linz'] }), expect.anything(),
        );
        expect(prisma.assetProposal.updateMany).toHaveBeenLastCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
        );
      });

      it('still cannot accept one twice', async () => {
        prisma.assetProposal.updateMany.mockResolvedValue({ count: 0 });
        await expect(accept('p-nokind-linz')).rejects.toBeInstanceOf(NotFoundException);
        expect(contracts.apply).not.toHaveBeenCalled();
      });

      it('an org-wide manager is not narrowed at all', async () => {
        await service.accept({ id: 'p-graz-kind', userId: 'u-boss', userRole: 'ADMIN', organizationId: 'org1' } as any);
        expect(prisma.assetProposal.findFirst).not.toHaveBeenCalled();
        expect(contracts.apply).toHaveBeenCalledWith(
          expect.not.objectContaining({ manageSpaceIds: expect.anything() }), expect.anything(),
        );
      });

      it('refuses one in scope, and 404s one outside without touching it', async () => {
        prisma.assetProposal.findUnique.mockResolvedValue({ raisedById: 'u-linz-driver' });
        await service.reject({ id: 'p-nokind-linz', note: 'old', ...linz } as any);
        expect(prisma.assetProposal.updateMany).toHaveBeenCalledTimes(1);

        prisma.assetProposal.updateMany.mockClear();
        await expect(service.reject({ id: 'p-graz-kind', ...linz } as any)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.assetProposal.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('the page', () => {
      const withPage = (id: string) => ({ ...byId(id), fileKey: 'org1/asset-proposals/x/a.jpg', fileMime: 'image/jpeg' });

      it('opens for the reviewer of that workspace, and for nobody else’s', async () => {
        prisma.assetProposal.findFirst.mockResolvedValueOnce(withPage('p-nokind-linz'));
        await expect(service.documentUrl({ id: 'p-nokind-linz', ...linz } as any)).resolves.toBeDefined();

        prisma.assetProposal.findFirst.mockResolvedValueOnce(withPage('p-graz-kind'));
        await expect(service.documentUrl({ id: 'p-graz-kind', ...linz } as any)).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('who is told', () => {
      /*
        The managers of the workspace it belongs to, before the whole office —
        through the same place the queue narrows by, so whoever is told finds
        it in their queue.
      */
      it('tells the workspace’s managers before falling back to the organization’s', async () => {
        routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });
        prisma.assetProposal.findUnique.mockResolvedValue({
          id: 'p1', categoryId: null, holderUserId: 'u-linz-driver', raisedById: 'u-linz-driver',
        });
        prisma.spaceAssignment.findMany.mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.spaceId === 'linz'
              ? [{ userId: 'u-lena', role: { isActive: true, permissions: { canManageAssets: true } } }]
              : [{ userId: 'u-linz-driver', spaceId: 'linz' }],
          ),
        );
        await raise({ userId: 'u-linz-driver' });
        expect(notifications.emit).toHaveBeenCalledWith(
          'asset_proposal_raised', expect.objectContaining({ recipientIds: ['u-lena'] }),
        );
        expect(prisma.accessRole.findMany).not.toHaveBeenCalled();
      });
    });
  });
});
