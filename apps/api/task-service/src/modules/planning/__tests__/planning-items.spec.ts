import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EpicsService } from '../../epics/epics.service';
import { PhasesService } from '../../phases/phases.service';

/**
 * Epics and phases are one record with a different second date (planning-items.ts).
 * The rules both inherit: a space sees its own items AND the organization-wide
 * ones, a new item goes to the end, an update writes only what was sent, a
 * delete unlinks the tasks instead of deleting them, and another organization's
 * item answers like a missing one.
 */
const ORG = 'org-1';

function setup() {
  const rows = () => ({
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
    update: jest.fn(async ({ data }: any) => ({ id: 'x', ...data })),
    delete: jest.fn(),
  });
  const prisma: any = {
    epic: rows(),
    phase: rows(),
    task: { updateMany: jest.fn() },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) },
  };
  return { prisma, epics: new EpicsService(prisma), phases: new PhasesService(prisma) };
}

describe('planning items — reading', () => {
  it('a space sees its own items and the organization-wide ones', async () => {
    const { prisma, epics } = setup();
    await epics.findAll({ organizationId: ORG, spaceId: 'space-1' });
    expect(prisma.epic.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      OR: [{ spaceId: 'space-1' }, { spaceId: null }],
    });
  });

  it('without a space, the whole organization, in board order', async () => {
    const { prisma, phases } = setup();
    await phases.findAll({ organizationId: ORG });
    const args = prisma.phase.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ organizationId: ORG });
    expect(args.orderBy).toEqual({ position: 'asc' });
    expect(args.take).toBe(100);
  });

  it('findOne is scoped to the organization — another one reads as missing', async () => {
    const { prisma, epics } = setup();
    await expect(epics.findOne({ id: 'e1', organizationId: ORG })).rejects.toThrow(NotFoundException);
    expect(prisma.epic.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', organizationId: ORG });
  });
});

describe('planning items — creating', () => {
  it('goes after the last item, and the first one is at 0', async () => {
    const { prisma, epics } = setup();
    await epics.create({ name: 'First', organizationId: ORG });
    expect(prisma.epic.create.mock.calls[0][0].data.position).toBe(0);

    prisma.epic.findFirst.mockResolvedValueOnce({ position: 4 });
    await epics.create({ name: 'Next', organizationId: ORG });
    expect(prisma.epic.create.mock.calls[1][0].data.position).toBe(5);
  });

  it('keeps a position that was sent', async () => {
    const { prisma, phases } = setup();
    await phases.create({ name: 'P', organizationId: ORG, position: 2 });
    expect(prisma.phase.findFirst).not.toHaveBeenCalled();
    expect(prisma.phase.create.mock.calls[0][0].data.position).toBe(2);
  });

  it('fills the defaults: organization-wide, the kind colour, a phase is a phase', async () => {
    const { prisma, epics, phases } = setup();
    await epics.create({ name: 'E', organizationId: ORG });
    await phases.create({ name: 'P', organizationId: ORG });
    const epic = prisma.epic.create.mock.calls[0][0].data;
    const phase = prisma.phase.create.mock.calls[0][0].data;
    expect(epic).toMatchObject({ spaceId: null, color: '#8b5cf6', startDate: null, targetDate: null });
    expect(phase).toMatchObject({ spaceId: null, color: '#3b82f6', type: 'phase', endDate: null });
  });

  it('refuses a workspace of another organization (or an archived one) before writing', async () => {
    const { prisma, epics } = setup();
    prisma.companyLocation.findFirst.mockResolvedValueOnce(null);
    await expect(epics.create({ name: 'E', spaceId: 'theirs', organizationId: ORG })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.companyLocation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'theirs',
      organizationId: ORG,
      isActive: true,
    });
    expect(prisma.epic.create).not.toHaveBeenCalled();
  });

  it('a phase is a phase or a milestone — nothing else is written', async () => {
    const { prisma, phases } = setup();
    await expect(phases.create({ name: 'P', type: 'sprint', organizationId: ORG })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.phase.create).not.toHaveBeenCalled();
    await phases.create({ name: 'M', type: 'milestone', endDate: '2026-11-01', organizationId: ORG });
    expect(prisma.phase.create.mock.calls[0][0].data).toMatchObject({
      type: 'milestone',
      endDate: new Date('2026-11-01'),
    });
  });
});

describe('planning items — updating', () => {
  const mine = { id: 'x', organizationId: ORG };

  it('writes only the fields that were sent; an empty day clears it', async () => {
    const { prisma, epics } = setup();
    prisma.epic.findUnique.mockResolvedValue(mine);
    await epics.update({ id: 'x', organizationId: ORG, name: 'Renamed', startDate: '', targetDate: '2026-12-01' });
    expect(prisma.epic.update.mock.calls[0][0].data).toEqual({
      name: 'Renamed',
      startDate: null,
      targetDate: new Date('2026-12-01'),
    });
  });

  it('an epic status must be OPEN, IN_PROGRESS or DONE', async () => {
    const { prisma, epics } = setup();
    prisma.epic.findUnique.mockResolvedValue(mine);
    await expect(epics.update({ id: 'x', organizationId: ORG, status: 'CLOSED' })).rejects.toThrow(BadRequestException);
    expect(prisma.epic.update).not.toHaveBeenCalled();
    await epics.update({ id: 'x', organizationId: ORG, status: 'DONE' });
    expect(prisma.epic.update.mock.calls[0][0].data).toEqual({ status: 'DONE' });
  });

  it('a phase can be switched off and its type checked', async () => {
    const { prisma, phases } = setup();
    prisma.phase.findUnique.mockResolvedValue(mine);
    await expect(phases.update({ id: 'x', organizationId: ORG, type: 'epic' })).rejects.toThrow(BadRequestException);
    await phases.update({ id: 'x', organizationId: ORG, isActive: false });
    expect(prisma.phase.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it("another organization's item answers 404 and is not touched", async () => {
    const { prisma, epics } = setup();
    prisma.epic.findUnique.mockResolvedValue({ id: 'x', organizationId: 'org-2' });
    await expect(epics.update({ id: 'x', organizationId: ORG, name: 'Mine now' })).rejects.toThrow(NotFoundException);
    expect(prisma.epic.update).not.toHaveBeenCalled();
  });
});

describe('planning items — deleting', () => {
  it('unlinks its tasks (never deletes them), then deletes the item', async () => {
    const { prisma, phases } = setup();
    prisma.phase.findUnique.mockResolvedValue({ id: 'p1', organizationId: ORG });
    await phases.remove({ id: 'p1', organizationId: ORG });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { phaseId: 'p1' }, data: { phaseId: null } });
    expect(prisma.phase.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it("another organization's item: nothing is unlinked or deleted", async () => {
    const { prisma, epics } = setup();
    prisma.epic.findUnique.mockResolvedValue({ id: 'e1', organizationId: 'org-2' });
    await expect(epics.remove({ id: 'e1', organizationId: ORG })).rejects.toThrow(NotFoundException);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.epic.delete).not.toHaveBeenCalled();
  });
});
