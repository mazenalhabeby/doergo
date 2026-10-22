import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ForbiddenException } from '@nestjs/common';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { ClockOutService } from '../clock-out/clock-out.service';
import { BREAK_SERVICES } from '../rests/break-services';
import {} from './approval.service.fixture';
import { ENTRY_SERVICES } from '../entries/entry-services';
import { AttendanceReportService } from '../reports/attendance-report.service';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '@hbcfield/shared';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { CountedTimeService } from '../core/counted-time.service';
import { BreakRulesService } from '../core/break-rules.service';
import { BreakReminderService } from '../rests/break-reminder.service';
import { PresenceService } from '../presence/presence.service';

/**
 * Leaving the site's ring is approved by SOMEBODY ELSE — the second-party rule
 * every other attendance decision follows (`assertNotSelfDecision`). The two
 * excursion decisions skipped it, so a shift leader could grant themselves time
 * away from the site they were supposed to be at.
 */
describe('out-of-ring requests: nobody decides their own', () => {
  let service: AttendanceService;
  const ORG = 'org-1';
  const LEADER = 'leader-1';

  const prisma: any = {
    geofenceExcursion: { findUnique: jest.fn(), updateMany: jest.fn() },
    timeEntry: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
  };

  const pending = (userId: string) => ({
    id: 'ex-1', userId, organizationId: ORG, spaceId: 'space-1', status: 'PENDING', requestedMinutes: 15, timeEntryId: 'e-1',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.geofenceExcursion.updateMany.mockResolvedValue({ count: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakReminderService,
        BreakRulesService,
        CountedTimeService,
        AttendanceService, ...ATTENDANCE_SERVICE_PARTS,
        { provide: PresenceService, useValue: {} },
        ...BREAK_SERVICES,
        ...ENTRY_SERVICES,
        AttendanceReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
        { provide: ShiftResolverService, useValue: {} },
      ],
    }).compile();
    service = module.get(AttendanceService);
    // Rejecting an excursion clocks the member out — through ClockOutService, which is where the stub goes.
    (module.get(ClockOutService) as any).clockOut = jest.fn().mockResolvedValue({});
  });

  it.each(['approveExcursion', 'rejectExcursion'] as const)('%s refuses a delegated approver on their own request', async (fn) => {
    prisma.geofenceExcursion.findUnique.mockResolvedValue(pending(LEADER));
    prisma.user.findFirst.mockResolvedValue(null); // not an org ADMIN
    await expect(
      (service as any)[fn]({ excursionId: 'ex-1', approverId: LEADER, organizationId: ORG }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.geofenceExcursion.updateMany).not.toHaveBeenCalled();
  });

  it.each(['approveExcursion', 'rejectExcursion'] as const)('%s still decides somebody else’s', async (fn) => {
    prisma.geofenceExcursion.findUnique.mockResolvedValue(pending('worker-9'));
    await (service as any)[fn]({ excursionId: 'ex-1', approverId: LEADER, organizationId: ORG });
    expect(prisma.geofenceExcursion.updateMany).toHaveBeenCalled();
  });

  it('an org ADMIN may decide their own — there is nobody above them', async () => {
    prisma.geofenceExcursion.findUnique.mockResolvedValue(pending(LEADER));
    prisma.user.findFirst.mockResolvedValue({ id: LEADER });
    await service.approveExcursion({ excursionId: 'ex-1', approverId: LEADER, organizationId: ORG });
    expect(prisma.geofenceExcursion.updateMany).toHaveBeenCalled();
  });
});
