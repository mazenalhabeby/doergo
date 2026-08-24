import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ForbiddenException } from '@nestjs/common';
import { AttendanceService } from '../attendance.service';
import { BreakService } from '../break.service';
import { ApprovalService } from '../approval.service';
import { AttendanceReportService } from '../attendance-report.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TimeEntryStatus, SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';

/**
 * Audit AT-B1 — overtime is paid time, and the request/approve flow exists so a
 * SECOND party sanctions it.
 *
 * `userCanApproveOvertime` answered "may you approve in this space?" and said
 * nothing about whose shift it was, so a shift leader holding `canApproveOvertime`
 * could approve their own extra time. It was not even an API-only gap: the pending
 * list did not exclude the caller, so their own row appeared with an approve button
 * on it.
 *
 * A true org ADMIN stays exempt — they are the owner, nobody is above them, and in
 * a one-person organization the shift would otherwise be impossible to extend.
 */
describe('overtime self-approval (AT-B1)', () => {
  let service: AttendanceService;

  const LEADER = 'leader-1';
  const ORG = 'org-1';
  const SPACE = 'space-1';

  const prisma: any = {
    timeEntry: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    spaceAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const notificationClient = { emit: jest.fn() };

  /** An open shift belonging to `userId`. */
  const openShift = (userId: string) => ({
    id: 'entry-1', userId, locationId: SPACE, organizationId: ORG,
    status: TimeEntryStatus.CLOCKED_IN, expectedClockOutAt: new Date(Date.now() + 60_000),
    shift: { graceMin: 10 },
  });

  /** The caller holds a space role granting canApproveOvertime. */
  const grantSpaceApproval = () =>
    prisma.spaceAssignment.findFirst.mockResolvedValue({
      role: { permissions: { canApproveOvertime: true } },
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.timeEntry.update.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService, BreakService, ApprovalService, AttendanceReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
        { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();
    service = module.get(AttendanceService);
  });

  const approveOwn = () =>
    service.approveExtraTime({ approverId: LEADER, entryId: 'entry-1', minutes: 30, organizationId: ORG });

  describe('a delegated approver', () => {
    beforeEach(() => {
      prisma.timeEntry.findFirst.mockResolvedValue(openShift(LEADER)); // their OWN shift
      grantSpaceApproval();
      prisma.user.findFirst.mockResolvedValue(null); // not an org ADMIN
    });

    it('cannot approve their own overtime', async () => {
      await expect(approveOwn()).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('cannot reject their own request either — the decision is the same authority', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'entry-1', locationId: SPACE, userId: LEADER });
      await expect(
        service.rejectExtraTime({ approverId: LEADER, entryId: 'entry-1', organizationId: ORG }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('CAN still approve somebody else’s', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(openShift('worker-9'));
      await expect(approveOwn()).resolves.toMatchObject({ success: true });
      expect(prisma.timeEntry.update).toHaveBeenCalled();
    });
  });

  describe('an org ADMIN', () => {
    it('may approve their own — nobody is above them, and a solo owner has no one else', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(openShift(LEADER));
      grantSpaceApproval();
      prisma.user.findFirst.mockResolvedValue({ id: LEADER }); // IS an org ADMIN
      await expect(approveOwn()).resolves.toMatchObject({ success: true });
    });
  });

  describe('the pending list', () => {
    it('never offers the caller their own request', async () => {
      prisma.spaceAssignment.findMany.mockResolvedValue([
        { spaceId: SPACE, role: { permissions: { canApproveOvertime: true } } },
      ]);
      prisma.timeEntry.findMany.mockResolvedValue([]);
      await service.listPendingExtraTime({ userId: LEADER, organizationId: ORG });
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.userId).toEqual({ not: LEADER });
    });

    it('excludes it for an admin too — they should not be nudged into it', async () => {
      prisma.timeEntry.findMany.mockResolvedValue([]);
      await service.listPendingExtraTime({ userId: LEADER, organizationId: ORG, isAdmin: true });
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.userId).toEqual({ not: LEADER });
    });
  });
});
