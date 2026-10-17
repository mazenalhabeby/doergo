import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { compile } from '../query-engine';
import { DATASETS } from '../registry';
import { analyticsParts } from './analytics.service.fixture';
import { ReportScheduleService } from '../report-schedule.service';

/*
  Reports were org-scoped and nothing more: a member admitted to reports in ONE
  workspace read every person's hours, leave and jobs. Pinned here: every
  dataset narrows to the granted spaces, granted-nowhere reads nothing, the
  timesheet asks whether the person is in the reader's crew, a saved report is
  changed only by its owner or an admin, and a schedule's addresses are real
  and bounded.
*/
describe('report scope', () => {
  const ORG = 'org-1';

  describe('compile', () => {
    it.each(Object.keys(DATASETS))('dataset %s narrows to the granted spaces', (key) => {
      const ds = DATASETS[key];
      const def = { dataset: key, measures: [Object.keys(ds.measures)[0]] };
      const wide = compile(def, ORG);
      const narrow = compile(def, ORG, ['sp-1']);
      expect(wide.params).toEqual([ORG]);
      expect(narrow.params).toEqual([ORG, ['sp-1']]);
      expect(narrow.sql).toContain('$2::text[]');
      expect(wide.sql).not.toContain('$2::text[]');
    });

    it('granted nowhere binds an EMPTY list (matches nothing), never "no filter"', () => {
      const q = compile({ dataset: 'attendance', measures: ['hours'] }, ORG, []);
      expect(q.params[1]).toEqual([]);
      expect(q.sql).toContain('te."locationId" = ANY($2::text[])');
    });

    it('null is org-wide (the admin / org-wide grant the gateway sends)', () => {
      expect(compile({ dataset: 'tasks', measures: ['count'] }, ORG, null).params).toEqual([ORG]);
    });

    it('leave — a person\'s, belonging to no space — narrows by a CURRENT crew membership', () => {
      const q = compile({ dataset: 'leave', measures: ['requests'] }, ORG, ['sp-1']);
      expect(q.sql).toMatch(/space_assignments[\s\S]*effectiveTo" IS NULL OR sa."effectiveTo" >= now\(\)/);
    });
  });

  describe('timesheet', () => {
    it('a space-scoped reader cannot open somebody outside their crew', async () => {
      const prisma: any = {
        spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { findFirst: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = analyticsParts(prisma);
      await expect(svc.timesheetDetail({ organizationId: ORG, userId: 'u-x', scopeSpaceIds: ['sp-1'] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.timesheetDetail({ organizationId: ORG, userId: 'u-x', scopeSpaceIds: [] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('in the crew: the sheet is narrowed to the granted spaces ($5)', async () => {
      const prisma: any = {
        spaceAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'sa-1' }) },
        user: { findFirst: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }) },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      await analyticsParts(prisma).timesheetDetail({ organizationId: ORG, userId: 'u-1', scopeSpaceIds: ['sp-1'] });
      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(params[4]).toEqual(['sp-1']);
      expect(sql).toContain('te."locationId" = ANY($5::text[])');
      // Org-wide: $5 is null, and the crew lookup is never asked.
      prisma.spaceAssignment.findFirst.mockClear();
      await analyticsParts(prisma).timesheetDetail({ organizationId: ORG, userId: 'u-1', scopeSpaceIds: null });
      expect(prisma.$queryRawUnsafe.mock.calls[1][5]).toBeNull();
      expect(prisma.spaceAssignment.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('saved reports', () => {
    const prisma: any = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r-1', createdById: 'owner' }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = analyticsParts(prisma);
    beforeEach(() => jest.clearAllMocks());

    it('somebody else\'s shared report cannot be edited or deleted', async () => {
      await expect(svc.updateSaved({ id: 'r-1', organizationId: ORG, userId: 'other', name: 'Mine now' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.deleteSaved({ id: 'r-1', organizationId: ORG, userId: 'other' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.reportDefinition.update).not.toHaveBeenCalled();
      expect(prisma.reportDefinition.delete).not.toHaveBeenCalled();
    });

    it('the owner and an admin may', async () => {
      await svc.updateSaved({ id: 'r-1', organizationId: ORG, userId: 'owner', name: 'X' });
      await svc.deleteSaved({ id: 'r-1', organizationId: ORG, userId: 'someone', isAdmin: true });
      expect(prisma.reportDefinition.update).toHaveBeenCalled();
      expect(prisma.reportDefinition.delete).toHaveBeenCalled();
    });
  });

  describe('schedule recipients', () => {
    const prisma: any = {
      reportDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 'r-1' }) },
      reportSchedule: { create: jest.fn(async ({ data }: any) => data) },
    };
    const svc = new ReportScheduleService(prisma, {} as any, { emit: jest.fn() } as any);
    const base = { organizationId: ORG, userId: 'u-1', reportDefinitionId: 'r-1', cadence: 'daily' as const };

    it('refuses a non-address, and more than 20', async () => {
      await expect(svc.create({ ...base, recipients: ['not-an-email'] })).rejects.toBeInstanceOf(BadRequestException);
      const many = Array.from({ length: 21 }, (_, i) => `p${i}@example.com`);
      await expect(svc.create({ ...base, recipients: many })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create({ ...base, recipients: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stores them trimmed, lower-cased, once', async () => {
      const { data } = await svc.create({ ...base, recipients: [' A@Example.com', 'a@example.com', 'b@example.com'] });
      expect(data.recipients).toEqual(['a@example.com', 'b@example.com']);
    });

    it('only a report the caller can see — shared, or their own', async () => {
      await svc.create({ ...base, recipients: ['a@example.com'] });
      expect(prisma.reportDefinition.findFirst.mock.calls.at(-1)[0].where.OR).toEqual([{ isShared: true }, { createdById: 'u-1' }]);
    });
  });
});
