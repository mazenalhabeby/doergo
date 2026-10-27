import { noOfficeRules } from '../../modules/approvals/__tests__/no-office-rules';
import { NotFoundException } from '@nestjs/common';
import { SprintsService } from '../../modules/sprints/sprints.service';
import { EpicsService } from '../../modules/epics/epics.service';
import { PhasesService } from '../../modules/phases/phases.service';
import { recurringParts } from '../../modules/recurring-tasks/__tests__/recurring-tasks.service.fixture';
import { SpacesService } from '../../modules/spaces/spaces.service';
import { SpaceAnnouncer } from '../../modules/spaces/space-announcer.service';
import { AssetProposalService } from '../../modules/assets/proposals/asset-proposal.service';

/**
 * An id from a request body says nothing about whose it is. Each of these was
 * written straight through: a sprint/epic/phase filed in another tenant's (or
 * an archived) workspace, a recurring template carrying another tenant's
 * client onto every job it generates, a workspace running on another tenant's
 * task type, and a member's proposal routed into a depot's queue by naming a
 * kind from a workspace they are not in. All answered 404 (tenant-scope.util).
 */
describe('client-supplied ids are checked before the write', () => {
  const ORG = 'org-1';
  const prisma: any = {
    companyLocation: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(1), create: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    statusWorkflow: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    sprint: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    epic: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    phase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    recurringTaskTemplate: { create: jest.fn() },
    assetCategory: { findFirst: jest.fn() },
    spaceAssignment: { findFirst: jest.fn() },
    assetProposal: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
  };
  beforeEach(() => jest.clearAllMocks());

  describe('planning records (sprint, epic, phase) — spaceId', () => {
    const cases: Array<[string, () => Promise<unknown>, string]> = [
      [
        'sprint',
        () =>
          new SprintsService(prisma).create({
            name: 'S',
            spaceId: 'theirs',
            startDate: '2026-10-01',
            endDate: '2026-10-14',
            organizationId: ORG,
          }),
        'sprint',
      ],
      ['epic', () => new EpicsService(prisma).create({ name: 'E', spaceId: 'theirs', organizationId: ORG }), 'epic'],
      ['phase', () => new PhasesService(prisma).create({ name: 'P', spaceId: 'theirs', organizationId: ORG }), 'phase'],
    ];
    it.each(cases)('a %s in a workspace not this organization’s (or archived) is refused', async (_n, run, model) => {
      prisma.companyLocation.findFirst.mockResolvedValue(null);
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'theirs', organizationId: ORG, isActive: true } }),
      );
      expect(prisma[model].create).not.toHaveBeenCalled();
    });
  });

  it('a recurring template’s client must be the organization’s', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    const svc = recurringParts(prisma);
    await expect(
      svc.create({
        title: 'T',
        frequency: 'DAILY',
        startDate: '2099-01-01',
        customerId: 'theirs',
        organizationId: ORG,
        createdById: 'u',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'theirs', organizationId: ORG } }),
    );
    expect(prisma.recurringTaskTemplate.create).not.toHaveBeenCalled();
  });

  it('a workspace’s task type must be the organization’s', async () => {
    prisma.statusWorkflow.findFirst.mockResolvedValue(null);
    const svc = new SpacesService(prisma, new SpaceAnnouncer(prisma, { emit: jest.fn() } as any));
    await expect(
      svc.create({ name: 'W', workflowId: 'theirs', organizationId: ORG, userId: 'u' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyLocation.create).not.toHaveBeenCalled();
  });

  describe('a proposal’s chosen kind', () => {
    // Who is told is ProposalNoticesService's; here it is quiet.
    const svc = () => new AssetProposalService(prisma, { raised: jest.fn().mockResolvedValue(undefined) } as any, null, noOfficeRules());
    const raise = () =>
      svc().raise({
        fields: { name: 'Van' } as any,
        categoryId: 'kind-1',
        userId: 'm-1',
        userRole: 'EMPLOYEE',
        organizationId: ORG,
      });

    it('refuses another organization’s kind', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue(null);
      await expect(raise()).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.assetProposal.create).not.toHaveBeenCalled();
    });

    it('refuses a kind in a workspace the holder is not in — it would land in that depot’s queue', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue({ id: 'kind-1', spaceId: 'depot-B' });
      prisma.spaceAssignment.findFirst.mockResolvedValue(null);
      await expect(raise()).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.assetProposal.create).not.toHaveBeenCalled();
    });

    it('keeps a kind in the holder’s own workspace', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue({ id: 'kind-1', spaceId: 'depot-A' });
      prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'sa' });
      prisma.assetProposal.create.mockResolvedValue({ id: 'p' });
      await raise();
      expect(prisma.assetProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 'kind-1' }) }),
      );
    });
  });
});
