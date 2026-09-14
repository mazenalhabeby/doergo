import { Test } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * Overtime is a LOOP, and the record has to be able to repeat.
 *
 * `OvertimeRequest.timeEntryId` was unique, so a shift carried exactly one
 * overtime record ever: the flow ran a second round and left no trace of it.
 * These are the properties that make "he worked four hours across three
 * approvals, here are the three signatures" answerable.
 */
describe('overtime rounds', () => {
  let service: AttendanceService;
  let prisma: any;
  let notify: { emit: jest.Mock };

  const ENTRY = {
    id: 'e1',
    userId: 'worker',
    locationId: 'loc1',
    organizationId: 'org1',
    expectedClockOutAt: new Date('2026-09-06T16:00:00Z'),
    shift: { graceMin: 5 },
    location: { id: 'loc1', name: 'Main Office', timezone: 'Europe/Vienna' },
    user: { firstName: 'Mike', lastName: 'Weber' },
  };

  beforeEach(async () => {
    prisma = {
      timeEntry: { findFirst: jest.fn().mockResolvedValue(ENTRY), update: jest.fn().mockResolvedValue({}) },
      overtimeRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ot1' }),
        update: jest.fn().mockResolvedValue({ id: 'ot1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'leader', role: 'ADMIN' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'leader', role: 'ADMIN', organizationId: 'org1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'leader' }]),
      },
      shift: { findUnique: jest.fn().mockResolvedValue({ flagToleranceMin: 10 }) },
      // The approver is an org admin: `userCanApproveOvertime` looks for a space
      // grant first, then falls back to ADMIN / canManageUsers.
      spaceAssignment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      accessRole: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: any): Promise<any> => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
    };
    notify = { emit: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        AttendanceService,
        CountedTimeService,
        BreakRulesService,
        { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) } },
        // Who is told about the member, when the workspace has nobody holding
        // the permission. Empty here: these tests are about the ROUND record.
        {
          provide: NotificationRoutingService,
          useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notify },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(AttendanceService);
  });

  describe('asking', () => {
    it('writes a record for the round, not just a state on the entry', async () => {
      await service.requestExtraTime({ userId: 'worker', entryId: 'e1', organizationId: 'org1' });
      expect(prisma.overtimeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timeEntryId: 'e1', cycle: 1, status: 'PENDING_APPROVAL' }),
        }),
      );
    });

    it('numbers the SECOND round 2 — the thing the unique index made impossible', async () => {
      prisma.overtimeRequest.findFirst.mockResolvedValue({ cycle: 1 });
      const r: any = await service.requestExtraTime({ userId: 'worker', entryId: 'e1', organizationId: 'org1' });
      expect(prisma.overtimeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cycle: 2 }) }),
      );
      expect(r.data.cycle).toBe(2);
    });

    it('moves the entry and writes the round in ONE transaction', async () => {
      // Separately, a crash between them leaves a shift waiting for an approval
      // that has no request behind it — invisible from both ends.
      await service.requestExtraTime({ userId: 'worker', entryId: 'e1', organizationId: 'org1' });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('approving', () => {
    beforeEach(() => {
      prisma.overtimeRequest.findFirst.mockResolvedValue({ id: 'ot9' });
    });

    it('records the minutes, the approver and the signature against that round', async () => {
      await service.approveExtraTime({
        approverId: 'leader', entryId: 'e1', minutes: 90, organizationId: 'org1',
        signature: 'data:image/png;base64,AAAA',
      });
      expect(prisma.overtimeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ot9' },
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedById: 'leader',
            maxDurationMinutes: 90,
            approvalMethod: 'SIGNATURE',
            leaderSignature: 'data:image/png;base64,AAAA',
          }),
        }),
      );
    });

    it('marks an unsigned approval REMOTE rather than pretending there was a signature', async () => {
      await service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 30, organizationId: 'org1' });
      expect(prisma.overtimeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvalMethod: 'REMOTE', leaderSignature: null }),
        }),
      );
    });

    it('extends the expected end, which is what makes the counted rule pay it', async () => {
      // Approved BEFORE the shift ends: the grant runs from the shift's end, so
      // ninety minutes means ninety minutes of overtime rather than ninety
      // minutes from whenever the leader happened to look at their phone.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-06T15:50:00Z'));
      await service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 90, organizationId: 'org1' });
      const update = prisma.timeEntry.update.mock.calls[0][0];
      expect(update.data.expectedClockOutAt).toEqual(new Date('2026-09-06T17:30:00Z'));
      expect(update.data.reminderState).toBe('OVERTIME_APPROVED');
      // …and the loop re-arms, so the member is asked again when THAT runs out.
      expect(update.data.nextRemindAt).toEqual(new Date('2026-09-06T17:35:00Z'));
      jest.useRealTimers();
    });

    it('grants the minutes after the shift end, not after the moment of approval', async () => {
      // The leader answers at 18:20 for a shift that ended at 18:00. Ninety minutes
      // approved is ninety minutes of overtime — until 19:30 — whenever the leader
      // happens to look. Counting from the click used to pay until 19:50, and with
      // a phone that sends its clock-out hours later, until whenever.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-06T16:20:00Z'));
      await service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 90, organizationId: 'org1' });
      const update = prisma.timeEntry.update.mock.calls[0][0];
      expect(update.data.expectedClockOutAt).toEqual(new Date('2026-09-06T17:30:00Z'));
      jest.useRealTimers();
    });

    it('asks again after the grace from NOW when the approved time has already run out', async () => {
      // Approved at 19:45 for 90 min after 18:00: that time is used up, so the
      // member is asked again shortly — not "five minutes after 19:30", in the past.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-06T17:45:00Z'));
      await service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 90, organizationId: 'org1' });
      const update = prisma.timeEntry.update.mock.calls[0][0];
      expect(update.data.expectedClockOutAt).toEqual(new Date('2026-09-06T17:30:00Z'));
      expect(update.data.nextRemindAt.getTime()).toBeGreaterThan(new Date('2026-09-06T17:45:00Z').getTime());
      jest.useRealTimers();
    });

    it('refuses a nonsensical amount before touching anything', async () => {
      await expect(
        service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 0, organizationId: 'org1' }),
      ).rejects.toThrow();
      await expect(
        service.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 5000, organizationId: 'org1' }),
      ).rejects.toThrow();
      expect(prisma.overtimeRequest.update).not.toHaveBeenCalled();
    });
  });

  describe('refusing', () => {
    it('records the refusal — a request that vanishes when the answer is no is not a record', async () => {
      prisma.overtimeRequest.findFirst.mockResolvedValue({ id: 'ot9' });
      await service.rejectExtraTime({
        approverId: 'leader', entryId: 'e1', organizationId: 'org1', reason: 'Site closes at six',
      });
      expect(prisma.overtimeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Site closes at six' }),
        }),
      );
    });
  });
});
