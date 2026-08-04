import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShiftsService } from '../shifts.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('ShiftsService', () => {
  let service: ShiftsService;

  const prisma = {
    shift: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    shiftAssignment: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShiftsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ShiftsService);
  });

  describe('createShift', () => {
    it('derives crossesMidnight for a night shift and clamps reminder params', async () => {
      prisma.shift.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));
      await service.createShift({
        organizationId: 'org-1',
        name: 'Night',
        startLocal: '22:00',
        endLocal: '06:00',
        maxReminders: 999, // clamp → 10
      });
      const data = prisma.shift.create.mock.calls[0][0].data;
      expect(data.crossesMidnight).toBe(true);
      expect(data.maxReminders).toBe(10);
    });

    it('does not flag crossesMidnight for a normal day shift', async () => {
      prisma.shift.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's2', ...data }));
      await service.createShift({ organizationId: 'org-1', name: 'Day', startLocal: '09:00', endLocal: '17:00' });
      expect(prisma.shift.create.mock.calls[0][0].data.crossesMidnight).toBe(false);
    });

    it('rejects an invalid time format', async () => {
      await expect(
        service.createShift({ organizationId: 'org-1', name: 'Bad', startLocal: '25:00', endLocal: '06:00' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createAssignment', () => {
    beforeEach(() => {
      prisma.shift.findFirst.mockResolvedValue({ id: 'sh-1', organizationId: 'org-1', spaceId: null });
      prisma.shiftAssignment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'a1', ...data }));
    });

    it('requires weekdays for WEEKLY recurrence', async () => {
      await expect(
        service.createAssignment({ organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'sh-1', recurrence: 'WEEKLY', daysOfWeek: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a weekly assignment with valid weekdays', async () => {
      const res = (await service.createAssignment({
        organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'sh-1', recurrence: 'WEEKLY', daysOfWeek: [1, 3, 5],
      })) as any;
      expect(res.success).toBe(true);
      expect(prisma.shiftAssignment.create.mock.calls[0][0].data.daysOfWeek).toEqual([1, 3, 5]);
    });

    it('blocks rostering a space-scoped shift into a different space', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 'sh-2', organizationId: 'org-1', spaceId: 'other-space' });
      await expect(
        service.createAssignment({ organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'sh-2', recurrence: 'DAILY' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the shift is not in the org', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(
        service.createAssignment({ organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'nope', recurrence: 'DAILY' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unparseable ONE_OFF date (400, not a DB 500)', async () => {
      await expect(
        service.createAssignment({
          organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'sh-1', recurrence: 'ONE_OFF', dates: ['not-a-date'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects out-of-range weekdays even when provided for a non-weekly recurrence', async () => {
      await expect(
        service.createAssignment({
          organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', shiftId: 'sh-1', recurrence: 'DAILY', daysOfWeek: [9],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAssignment', () => {
    it('validates against the EFFECTIVE state — changing to WEEKLY with no weekdays is rejected', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'a1', organizationId: 'org-1', recurrence: 'DAILY', daysOfWeek: [], daysOfMonth: [], dates: [],
      });
      await expect(
        service.updateAssignment({ organizationId: 'org-1', assignmentId: 'a1', recurrence: 'WEEKLY' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears stale day arrays when the recurrence type changes', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'a1', organizationId: 'org-1', recurrence: 'WEEKLY', daysOfWeek: [1, 3], daysOfMonth: [], dates: [],
      });
      prisma.shiftAssignment.update.mockResolvedValue({});
      await service.updateAssignment({
        organizationId: 'org-1', assignmentId: 'a1', recurrence: 'MONTHLY', daysOfMonth: [15],
      });
      const data = prisma.shiftAssignment.update.mock.calls[0][0].data;
      expect(data.daysOfWeek).toEqual([]); // stale weekly days cleared
      expect(data.daysOfMonth).toEqual([15]);
    });
  });
});
