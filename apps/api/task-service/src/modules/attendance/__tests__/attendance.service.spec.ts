import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { computeScheduleFlags } from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { BreakService } from '../break.service';
import { ApprovalService } from '../approval.service';
import { AttendanceReportService } from '../attendance-report.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TimeEntryStatus,
  ApprovalStatus,
  SERVICE_NAMES,
  QUEUE_NAMES,
} from '@hbcfield/shared';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let breakService: BreakService;
  let approvalService: ApprovalService;
  let reportService: AttendanceReportService;

  const mockLocation = {
    id: 'loc-123',
    name: 'Main Office',
    address: '123 Business Ave',
    lat: 40.7128,
    lng: -74.006,
    geofenceRadius: 50,
    isActive: true,
    organizationId: 'org-123',
  };

  const mockTechnician = {
    id: 'tech-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    role: 'EMPLOYEE',
    
    organizationId: 'org-123',
    isActive: true,
  };

  const mockAssignment = {
    id: 'assignment-123',
    userId: 'tech-123',
    locationId: 'loc-123',
    effectiveFrom: new Date(),
    effectiveTo: null,
    isPrimary: true,
  };

  const mockTimeEntry = {
    id: 'entry-123',
    userId: 'tech-123',
    locationId: 'loc-123',
    status: TimeEntryStatus.CLOCKED_IN,
    clockInAt: new Date(),
    clockInLat: 40.7128,
    clockInLng: -74.006,
    clockInAccuracy: 10,
    clockInWithinGeofence: true,
    clockOutAt: null,
    totalMinutes: null,
    organizationId: 'org-123',
    approvalStatus: ApprovalStatus.PENDING,
    location: mockLocation,
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    companyLocation: {
      findFirst: jest.fn(),
    },
    spaceAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    timeEntry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    break: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    // Batched lookups used by autoClockOut's overtime/schedule resolution.
    overtimeRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    technicianSchedule: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    organization: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Space members + roles used by the reminder engine's escalation routing.
    spaceMember: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // Geofence excursion ("out of ring") workflow.
    geofenceExcursion: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const mockNotificationClient = {
    emit: jest.fn(),
  };

  // OVERTIME queue (BullMQ) — AttendanceService.autoClockOut enqueues onto it.
  const mockOvertimeQueue = {
    add: jest.fn(),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        BreakService,
        ApprovalService,
        AttendanceReportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: mockNotificationClient },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: mockOvertimeQueue },
        {
          provide: NotificationRoutingService,
          useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) },
        },
        // Default: resolver returns null (no shift stamp) so existing clock-in
        // assertions are unaffected. Shift resolution is covered by its own spec.
        {
          provide: ShiftResolverService,
          useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    breakService = module.get<BreakService>(BreakService);
    approvalService = module.get<ApprovalService>(ApprovalService);
    reportService = module.get<AttendanceReportService>(AttendanceReportService);
  });

  describe('clockIn', () => {
    const clockInData = {
      userId: 'tech-123',
      locationId: 'loc-123',
      lat: 40.7128,
      lng: -74.006,
      accuracy: 10,
      organizationId: 'org-123',
    };

    it('should clock in successfully within geofence', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);
      mockPrismaService.companyLocation.findFirst.mockResolvedValue(mockLocation);
      mockPrismaService.timeEntry.create.mockResolvedValue(mockTimeEntry);

      const result = await service.clockIn(clockInData) as any;

      expect(result.success).toBe(true);
      expect(mockPrismaService.timeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TimeEntryStatus.CLOCKED_IN,
            clockInWithinGeofence: true,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent technician', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(clockInData)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      // (WorkMode decoupling removed the old FULL_TIME-only gate; an unknown
      // user now surfaces as NotFoundException.)
      await expect(service.clockIn(clockInData)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if not assigned to location', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(clockInData)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already clocked in', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(mockTimeEntry);

      await expect(service.clockIn(clockInData)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for low GPS accuracy', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);
      mockPrismaService.companyLocation.findFirst.mockResolvedValue(mockLocation);

      await expect(
        service.clockIn({
          ...clockInData,
          accuracy: 200, // Above threshold
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for inactive location', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);
      mockPrismaService.companyLocation.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(clockInData)).rejects.toThrow(NotFoundException);
    });
  });

  describe('clockOut', () => {
    const clockOutData = {
      userId: 'tech-123',
      lat: 40.7128,
      lng: -74.006,
      accuracy: 10,
      organizationId: 'org-123',
    };

    it('should clock out successfully', async () => {
      const updatedEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: new Date(),
        totalMinutes: 480,
      };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(mockTimeEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue(updatedEntry);

      const result = await service.clockOut(clockOutData) as any;

      expect(result.success).toBe(true);
      expect(mockPrismaService.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TimeEntryStatus.CLOCKED_OUT,
          }),
        }),
      );
    });

    it('should throw BadRequestException if not clocked in', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      await expect(service.clockOut(clockOutData)).rejects.toThrow(BadRequestException);
    });

    it('should track geofence violation on clock out', async () => {
      const farClockOutData = {
        ...clockOutData,
        lat: 41.0, // Far from office
        lng: -75.0,
      };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(mockTimeEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue({
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutWithinGeofence: false,
      });
      mockPrismaService.user.findUnique.mockResolvedValue(mockTechnician);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.clockOut(farClockOutData);

      expect(mockPrismaService.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clockOutWithinGeofence: false,
          }),
        }),
      );
    });
  });

  describe('getStatus', () => {
    it('should return clocked in status', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(mockTimeEntry);
      mockPrismaService.spaceAssignment.findMany.mockResolvedValue([
        { ...mockAssignment, location: mockLocation },
      ]);

      const result = await service.getStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(true);
      expect(result.data.currentEntry).toEqual(mockTimeEntry);
    });

    it('should return not clocked in status', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);
      mockPrismaService.spaceAssignment.findMany.mockResolvedValue([]);

      const result = await service.getStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(false);
      expect(result.data.currentEntry).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return paginated history', async () => {
      const entries = [mockTimeEntry, { ...mockTimeEntry, id: 'entry-456' }];
      mockPrismaService.timeEntry.findMany.mockResolvedValue(entries);
      mockPrismaService.timeEntry.count.mockResolvedValue(2);

      const result = await service.getHistory({
        userId: 'tech-123',
        organizationId: 'org-123',
        page: 1,
        limit: 10,
      }) as any;

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('should filter by date range', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([]);
      mockPrismaService.timeEntry.count.mockResolvedValue(0);

      await service.getHistory({
        userId: 'tech-123',
        organizationId: 'org-123',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });

      expect(mockPrismaService.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clockInAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe('runShiftReminders (reminder engine — never force-closes)', () => {
    const dueEntry = (over: any = {}) => ({
      ...mockTimeEntry,
      id: over.id ?? 'entry-123',
      userId: over.userId ?? 'tech-123',
      locationId: 'loc-123',
      organizationId: 'org-123',
      reminderCount: over.reminderCount ?? 0,
      expectedClockOutAt: new Date(Date.now() - 6 * 60 * 1000),
      nextRemindAt: new Date(Date.now() - 60 * 1000), // due
      user: { id: over.userId ?? 'tech-123', firstName: 'John', lastName: 'Doe', email: 'j@e.com' },
      location: { id: 'loc-123', name: 'Main Office' },
      shift: over.shift ?? { reminderIntervalMin: 5, maxReminders: 3 },
      ...over,
    });

    it('sends a reminder and re-arms — it does NOT clock anyone out', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([dueEntry({ reminderCount: 0 })]);
      mockPrismaService.timeEntry.update.mockResolvedValue({});

      const result = (await service.runShiftReminders()) as any;

      expect(result.success).toBe(true);
      expect(result.data.remindedCount).toBe(1);
      expect(result.data.escalatedCount).toBe(0);

      // Reminder push emitted — NOT the old auto-clock-out event.
      expect(mockNotificationClient.emit).toHaveBeenCalledWith('attendance_shift_reminder', expect.any(Object));
      expect(mockNotificationClient.emit).not.toHaveBeenCalledWith('attendance_auto_clock_out', expect.anything());

      // The write bumps reminder state/count + re-arms nextRemindAt; it never
      // sets AUTO_OUT or a clockOutAt.
      const updateArg = mockPrismaService.timeEntry.update.mock.calls[0][0];
      expect(updateArg.data.reminderState).toBe('REMINDED');
      expect(updateArg.data.reminderCount).toBe(1);
      expect(updateArg.data.nextRemindAt).toBeInstanceOf(Date);
      expect(updateArg.data.status).toBeUndefined();
      expect(updateArg.data.clockOutAt).toBeUndefined();
    });

    it('escalates to a space leader after max reminders, then stops nudging', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([dueEntry({ reminderCount: 3 })]); // already at max=3
      mockPrismaService.timeEntry.update.mockResolvedValue({});
      mockPrismaService.spaceAssignment.findMany.mockResolvedValue([
        { userId: 'leader-1', role: { permissions: { canReconcileAttendance: true } } },
        { userId: 'other', role: { permissions: { canReconcileAttendance: false } } },
      ]);

      const result = (await service.runShiftReminders()) as any;

      expect(result.data.remindedCount).toBe(0);
      expect(result.data.escalatedCount).toBe(1);

      const updateArg = mockPrismaService.timeEntry.update.mock.calls[0][0];
      expect(updateArg.data.reminderState).toBe('ESCALATED');
      expect(updateArg.data.nextRemindAt).toBeNull(); // stop the loop

      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'attendance_shift_escalation',
        expect.objectContaining({ leaderIds: ['leader-1'] }),
      );
    });

    it('falls back to org admins when the space has no reconcile leaders', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([dueEntry({ reminderCount: 3 })]);
      mockPrismaService.timeEntry.update.mockResolvedValue({});
      mockPrismaService.spaceAssignment.findMany.mockResolvedValue([]); // no space leaders
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

      await service.runShiftReminders();

      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'attendance_shift_escalation',
        expect.objectContaining({ leaderIds: ['admin-1'] }),
      );
    });

    it('returns zero and does nothing when no reminders are due', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([]);

      const result = (await service.runShiftReminders()) as any;

      expect(result.success).toBe(true);
      expect(result.data.remindedCount).toBe(0);
      expect(result.data.escalatedCount).toBe(0);
      expect(mockPrismaService.timeEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('shift reminder responses (Phase 3)', () => {
    const openEntry = (over: any = {}) => ({
      ...mockTimeEntry,
      id: 'entry-123',
      userId: 'tech-123',
      locationId: 'loc-123',
      organizationId: 'org-123',
      status: TimeEntryStatus.CLOCKED_IN,
      clockInAt: new Date('2026-08-03T07:00:00Z'),
      breakMinutes: 0,
      flagReasons: [],
      expectedClockOutAt: new Date('2026-08-03T15:00:00Z'),
      location: { id: 'loc-123', name: 'Main Office' },
      user: { id: 'tech-123', firstName: 'John', lastName: 'Doe' },
      shift: null,
      ...over,
    });

    describe('resolveForgotClockOut', () => {
      it('closes at the self-reported time within the shift (no overtime flag)', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(openEntry());
        mockPrismaService.timeEntry.update.mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'entry-123', ...data, location: { name: 'Main Office' }, user: {} }),
        );

        const result = (await service.resolveForgotClockOut({
          userId: 'tech-123',
          entryId: 'entry-123',
          clockOutAt: '2026-08-03T14:30:00Z', // before 15:00 expected end
          organizationId: 'org-123',
        })) as any;

        expect(result.success).toBe(true);
        const data = mockPrismaService.timeEntry.update.mock.calls[0][0].data;
        expect(data.status).toBe(TimeEntryStatus.CLOCKED_OUT);
        expect(data.reminderState).toBe('RESOLVED');
        expect(data.nextRemindAt).toBeNull();
        expect(data.flagReasons).toContain('MISSED_CLOCK_OUT');
        expect(data.flagReasons).not.toContain('OVERTIME');
      });

      it('flags OVERTIME when the reported time is past the expected end', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(openEntry());
        mockPrismaService.timeEntry.update.mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'entry-123', ...data, location: { name: 'Main Office' }, user: {} }),
        );

        await service.resolveForgotClockOut({
          userId: 'tech-123',
          entryId: 'entry-123',
          clockOutAt: '2026-08-03T17:00:00Z', // 2h past 15:00
          organizationId: 'org-123',
        });

        const data = mockPrismaService.timeEntry.update.mock.calls[0][0].data;
        expect(data.flagReasons).toContain('OVERTIME');
        expect(data.approvalStatus).toBe('PENDING');
      });

      it('rejects a future clock-out time', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(openEntry());
        await expect(
          service.resolveForgotClockOut({
            userId: 'tech-123',
            entryId: 'entry-123',
            clockOutAt: new Date(Date.now() + 3600_000).toISOString(),
            organizationId: 'org-123',
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('requestExtraTime', () => {
      it('sets OVERTIME_PENDING, stops reminders, and routes to approvers', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(openEntry());
        mockPrismaService.timeEntry.update.mockResolvedValue({});
        mockPrismaService.spaceAssignment.findMany.mockResolvedValue([
          { userId: 'leader-1', role: { permissions: { canApproveOvertime: true } } },
        ]);

        const result = (await service.requestExtraTime({
          userId: 'tech-123',
          entryId: 'entry-123',
          organizationId: 'org-123',
        })) as any;

        expect(result.success).toBe(true);
        const data = mockPrismaService.timeEntry.update.mock.calls[0][0].data;
        expect(data.reminderState).toBe('OVERTIME_PENDING');
        expect(data.nextRemindAt).toBeNull();
        expect(mockNotificationClient.emit).toHaveBeenCalledWith(
          'attendance_overtime_request',
          expect.objectContaining({ leaderIds: ['leader-1'] }),
        );
      });
    });

    describe('approveExtraTime', () => {
      it('extends the expected end and re-arms reminders (admin approver)', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(
          openEntry({ expectedClockOutAt: new Date('2026-08-03T15:00:00Z') }),
        );
        mockPrismaService.timeEntry.update.mockResolvedValue({});
        mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(null); // no space role
        mockPrismaService.user.findFirst.mockResolvedValue({ id: 'admin-1' }); // admin fallback

        const result = (await service.approveExtraTime({
          approverId: 'admin-1',
          entryId: 'entry-123',
          minutes: 60,
          organizationId: 'org-123',
        })) as any;

        expect(result.success).toBe(true);
        const data = mockPrismaService.timeEntry.update.mock.calls[0][0].data;
        expect(data.reminderState).toBe('OVERTIME_APPROVED');
        expect(data.reminderCount).toBe(0);
        expect(data.expectedClockOutAt).toBeInstanceOf(Date);
        expect(data.nextRemindAt).toBeInstanceOf(Date);
        expect(mockNotificationClient.emit).toHaveBeenCalledWith(
          'attendance_overtime_decision',
          expect.objectContaining({ decision: 'approved', minutes: 60 }),
        );
      });

      it('forbids approval when the user lacks the permission', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue(openEntry());
        mockPrismaService.spaceAssignment.findFirst.mockResolvedValue(null);
        mockPrismaService.user.findFirst.mockResolvedValue(null); // not an admin either

        await expect(
          service.approveExtraTime({ approverId: 'nobody', entryId: 'entry-123', minutes: 30, organizationId: 'org-123' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects invalid minutes', async () => {
        await expect(
          service.approveExtraTime({ approverId: 'admin-1', entryId: 'entry-123', minutes: 0, organizationId: 'org-123' }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('rejectExtraTime', () => {
      it('re-arms an immediate reminder and notifies the worker', async () => {
        mockPrismaService.timeEntry.findFirst.mockResolvedValue({ id: 'entry-123', locationId: 'loc-123', userId: 'tech-123' });
        mockPrismaService.timeEntry.update.mockResolvedValue({});
        mockPrismaService.spaceAssignment.findFirst.mockResolvedValue({
          role: { permissions: { canApproveOvertime: true } },
        });

        const result = (await service.rejectExtraTime({
          approverId: 'leader-1',
          entryId: 'entry-123',
          organizationId: 'org-123',
        })) as any;

        expect(result.success).toBe(true);
        const data = mockPrismaService.timeEntry.update.mock.calls[0][0].data;
        expect(data.reminderState).toBe('REMINDED');
        expect(data.nextRemindAt).toBeInstanceOf(Date);
        expect(mockNotificationClient.emit).toHaveBeenCalledWith(
          'attendance_overtime_decision',
          expect.objectContaining({ decision: 'rejected' }),
        );
      });
    });
  });

  describe('startBreak', () => {
    it('should start a break successfully', async () => {
      const entryWithNoBreaks = { ...mockTimeEntry, breaks: [] };
      const newBreak = {
        id: 'break-123',
        timeEntryId: 'entry-123',
        type: 'SHORT',
        startedAt: new Date(),
        endedAt: null,
      };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithNoBreaks);
      mockPrismaService.break.create.mockResolvedValue(newBreak);
      mockPrismaService.user.findUnique.mockResolvedValue(mockTechnician);

      const result = await breakService.startBreak({
        userId: 'tech-123',
        organizationId: 'org-123',
        type: 'SHORT',
      }) as any;

      expect(result.success).toBe(true);
      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'break_started',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if not clocked in', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        breakService.startBreak({
          userId: 'tech-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already on break', async () => {
      const entryWithActiveBreak = {
        ...mockTimeEntry,
        breaks: [{ id: 'break-123', endedAt: null }],
      };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithActiveBreak);

      await expect(
        breakService.startBreak({
          userId: 'tech-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('endBreak', () => {
    it('should end a break successfully', async () => {
      const activeBreak = {
        id: 'break-123',
        timeEntryId: 'entry-123',
        type: 'SHORT',
        startedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        endedAt: null,
      };
      const entryWithActiveBreak = { ...mockTimeEntry, breaks: [activeBreak] };
      const endedBreak = { ...activeBreak, endedAt: new Date(), durationMinutes: 15 };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithActiveBreak);
      mockPrismaService.break.update.mockResolvedValue(endedBreak);
      mockPrismaService.break.findMany.mockResolvedValue([endedBreak]);
      mockPrismaService.timeEntry.update.mockResolvedValue(mockTimeEntry);
      mockPrismaService.user.findUnique.mockResolvedValue(mockTechnician);

      const result = await breakService.endBreak({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'break_ended',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if not clocked in', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        breakService.endBreak({
          userId: 'tech-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not on break', async () => {
      const entryWithNoActiveBreak = { ...mockTimeEntry, breaks: [] };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithNoActiveBreak);

      await expect(
        breakService.endBreak({
          userId: 'tech-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBreakStatus', () => {
    it('should return on break status', async () => {
      const activeBreak = { id: 'break-123', startedAt: new Date(), endedAt: null };
      const entryWithBreak = { ...mockTimeEntry, breaks: [activeBreak] };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithBreak);

      const result = await breakService.getBreakStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(true);
      expect(result.data.isOnBreak).toBe(true);
      expect(result.data.currentBreak).toEqual(activeBreak);
    });

    it('should return not on break status', async () => {
      const entryWithNoBreaks = { ...mockTimeEntry, breaks: [] };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithNoBreaks);

      const result = await breakService.getBreakStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(true);
      expect(result.data.isOnBreak).toBe(false);
    });

    it('should return not clocked in status', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      const result = await breakService.getBreakStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(false);
      expect(result.data.isOnBreak).toBe(false);
    });
  });

  describe('getPendingApprovals', () => {
    it('should return pending approvals', async () => {
      const pendingEntries = [
        { ...mockTimeEntry, status: TimeEntryStatus.CLOCKED_OUT, approvalStatus: ApprovalStatus.PENDING },
      ];
      mockPrismaService.timeEntry.findMany.mockResolvedValue(pendingEntries);
      mockPrismaService.timeEntry.count.mockResolvedValue(1);

      const result = await approvalService.getPendingApprovals({
        organizationId: 'org-123',
        page: 1,
        limit: 20,
      }) as any;

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('approveEntry', () => {
    it('should approve entry successfully', async () => {
      const pendingEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        approvalStatus: ApprovalStatus.PENDING,
      };
      const approvedEntry = { ...pendingEntry, approvalStatus: ApprovalStatus.APPROVED };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(pendingEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue(approvedEntry);

      const result = await approvalService.approveEntry({
        entryId: 'entry-123',
        approverId: 'admin-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(mockPrismaService.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: ApprovalStatus.APPROVED,
            approvedById: 'admin-123',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent entry', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        approvalService.approveEntry({
          entryId: 'non-existent',
          approverId: 'admin-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already approved', async () => {
      const approvedEntry = {
        ...mockTimeEntry,
        approvalStatus: ApprovalStatus.APPROVED,
      };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(approvedEntry);

      await expect(
        approvalService.approveEntry({
          entryId: 'entry-123',
          approverId: 'admin-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectEntry', () => {
    it('should reject entry successfully', async () => {
      const pendingEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        approvalStatus: ApprovalStatus.PENDING,
      };
      const rejectedEntry = { ...pendingEntry, approvalStatus: ApprovalStatus.REJECTED };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(pendingEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue(rejectedEntry);

      const result = await approvalService.rejectEntry({
        entryId: 'entry-123',
        approverId: 'admin-123',
        organizationId: 'org-123',
        reason: 'Invalid clock-in location',
      }) as any;

      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException without reason', async () => {
      await expect(
        approvalService.rejectEntry({
          entryId: 'entry-123',
          approverId: 'admin-123',
          organizationId: 'org-123',
          reason: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent entry', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        approvalService.rejectEntry({
          entryId: 'non-existent',
          approverId: 'admin-123',
          organizationId: 'org-123',
          reason: 'Test reason',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('editEntry', () => {
    it('should edit entry successfully', async () => {
      const existingEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: new Date(),
        isEdited: false,
      };
      const editedEntry = {
        ...existingEntry,
        isEdited: true,
        editedById: 'admin-123',
      };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(existingEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue(editedEntry);

      const result = await approvalService.editEntry({
        entryId: 'entry-123',
        editorId: 'admin-123',
        organizationId: 'org-123',
        reason: 'Correcting clock-in time',
        clockInAt: '2026-01-30T09:00:00Z',
      }) as any;

      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException without reason', async () => {
      await expect(
        approvalService.editEntry({
          entryId: 'entry-123',
          editorId: 'admin-123',
          organizationId: 'org-123',
          reason: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should save original values on first edit', async () => {
      const existingEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: new Date(),
        isEdited: false,
      };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(existingEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue({ ...existingEntry, isEdited: true });

      await approvalService.editEntry({
        entryId: 'entry-123',
        editorId: 'admin-123',
        organizationId: 'org-123',
        reason: 'Correction',
        clockInAt: '2026-01-30T09:00:00Z',
      });

      expect(mockPrismaService.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isEdited: true,
            originalClockIn: existingEntry.clockInAt,
            originalClockOut: existingEntry.clockOutAt,
          }),
        }),
      );
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple entries', async () => {
      const pendingEntry = {
        ...mockTimeEntry,
        approvalStatus: ApprovalStatus.PENDING,
      };

      mockPrismaService.timeEntry.findFirst.mockResolvedValue(pendingEntry);
      mockPrismaService.timeEntry.update.mockResolvedValue({
        ...pendingEntry,
        approvalStatus: ApprovalStatus.APPROVED,
      });

      const result = await approvalService.bulkApprove({
        entryIds: ['entry-1', 'entry-2', 'entry-3'],
        approverId: 'admin-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.approved).toHaveLength(3);
    });

    it('should track failed approvals', async () => {
      mockPrismaService.timeEntry.findFirst
        .mockResolvedValueOnce({
          ...mockTimeEntry,
          approvalStatus: ApprovalStatus.PENDING,
        })
        .mockResolvedValueOnce(null) // Not found
        .mockResolvedValueOnce({
          ...mockTimeEntry,
          approvalStatus: ApprovalStatus.APPROVED, // Already approved
        });

      mockPrismaService.timeEntry.update.mockResolvedValue({
        ...mockTimeEntry,
        approvalStatus: ApprovalStatus.APPROVED,
      });

      const result = await approvalService.bulkApprove({
        entryIds: ['entry-1', 'entry-2', 'entry-3'],
        approverId: 'admin-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.approved).toHaveLength(1);
      expect(result.data.failed).toHaveLength(2);
    });
  });

  describe('getAttendanceSummary', () => {
    it('should return summary statistics', async () => {
      const entries = [
        {
          ...mockTimeEntry,
          status: TimeEntryStatus.CLOCKED_OUT,
          totalMinutes: 480,
          user: mockTechnician,
          location: mockLocation,
        },
        {
          ...mockTimeEntry,
          id: 'entry-456',
          status: TimeEntryStatus.CLOCKED_OUT,
          totalMinutes: 450,
          user: mockTechnician,
          location: mockLocation,
        },
      ];

      mockPrismaService.timeEntry.findMany.mockResolvedValue(entries);

      const result = await reportService.getAttendanceSummary({
        organizationId: 'org-123',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.summary.totalShifts).toBe(2);
      expect(result.data.byUser).toHaveLength(1);
      expect(result.data.byLocation).toHaveLength(1);
    });
  });

  describe('exportToCSV', () => {
    it('should generate CSV content', async () => {
      const entries = [
        {
          ...mockTimeEntry,
          status: TimeEntryStatus.CLOCKED_OUT,
          clockOutAt: new Date(),
          totalMinutes: 480,
          user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
          location: { name: 'Main Office' },
        },
      ];

      mockPrismaService.timeEntry.findMany.mockResolvedValue(entries);

      const result = await reportService.exportToCSV({
        organizationId: 'org-123',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.mimeType).toBe('text/csv');
      expect(result.data.content).toContain('Date,Technician,Email');
      expect(result.data.recordCount).toBe(1);
    });
  });

  // ── Geofence excursion ("out of ring") state machine ──────────────────────
  describe('geofence excursions', () => {
    const clockedInEntry = {
      id: 'entry-1',
      userId: 'tech-123',
      organizationId: 'org-123',
      locationId: 'loc-1',
      status: 'CLOCKED_IN',
      location: { id: 'loc-1', name: 'Main Office', lat: 40.0, lng: -74.0, geofenceRadius: 50, isActive: true },
    };

    it('heartbeat: opens OUT_UNREPORTED when clearly past the ring + buffer, never auto-clocks-out', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(clockedInEntry);
      mockPrismaService.geofenceExcursion.findFirst.mockResolvedValue(null); // no active excursion
      const created = { id: 'ex-1', status: 'OUT_UNREPORTED' };
      mockPrismaService.geofenceExcursion.create.mockResolvedValue(created);
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'Joe', lastName: 'X', email: 'j@x.io' });

      // ~1.4km away → well past radius(50)+hysteresis(15)
      const res: any = await service.heartbeat({ userId: 'tech-123', lat: 40.01, lng: -74.0, organizationId: 'org-123' });

      expect(mockPrismaService.geofenceExcursion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OUT_UNREPORTED', timeEntryId: 'entry-1' }) }),
      );
      expect(res.data.inRing).toBe(false);
      expect(res.data.autoClockedOut).toBe(false);
      expect(res.data.activeExcursion).toBe(created);
    });

    it('heartbeat: back inside the ring resolves the active excursion as RETURNED', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(clockedInEntry);
      mockPrismaService.geofenceExcursion.findFirst.mockResolvedValue({ id: 'ex-1', status: 'PENDING' });
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'Joe', lastName: 'X' });

      const res: any = await service.heartbeat({ userId: 'tech-123', lat: 40.0, lng: -74.0, organizationId: 'org-123' });

      expect(mockPrismaService.geofenceExcursion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RETURNED' }) }),
      );
      expect(res.data.inRing).toBe(true);
      expect(res.data.activeExcursion).toBeNull();
    });

    it('reportExcursion: OUT_UNREPORTED → PENDING with clamped minutes', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(clockedInEntry);
      mockPrismaService.geofenceExcursion.findFirst.mockResolvedValue({ id: 'ex-1', status: 'OUT_UNREPORTED' });
      mockPrismaService.geofenceExcursion.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.geofenceExcursion.findUnique.mockResolvedValue({ id: 'ex-1', status: 'PENDING', reason: 'lunch', requestedMinutes: 30 });
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'Joe', lastName: 'X' });

      const res: any = await service.reportExcursion({ userId: 'tech-123', organizationId: 'org-123', reason: 'lunch', requestedMinutes: 30 });

      expect(mockPrismaService.geofenceExcursion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'OUT_UNREPORTED' }), data: expect.objectContaining({ status: 'PENDING', requestedMinutes: 30 }) }),
      );
      expect(res.success).toBe(true);
    });

    it('approveExcursion: PENDING → APPROVED sets expiresAt from granted minutes', async () => {
      mockPrismaService.geofenceExcursion.findUnique
        .mockResolvedValueOnce({ id: 'ex-1', organizationId: 'org-123', status: 'PENDING', requestedMinutes: 30, timeEntryId: 'entry-1', userId: 'tech-123' })
        .mockResolvedValueOnce({ id: 'ex-1', status: 'APPROVED', grantedMinutes: 60 });
      mockPrismaService.geofenceExcursion.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.timeEntry.findUnique.mockResolvedValue(clockedInEntry);
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'Joe', lastName: 'X' });

      const res: any = await service.approveExcursion({ excursionId: 'ex-1', approverId: 'mgr-1', organizationId: 'org-123', grantedMinutes: 60 });

      expect(mockPrismaService.geofenceExcursion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', grantedMinutes: 60, expiresAt: expect.any(Date) }) }),
      );
      expect(res.success).toBe(true);
    });

    it('rejectExcursion: PENDING → REJECTED then clocks the worker out', async () => {
      mockPrismaService.geofenceExcursion.findUnique
        .mockResolvedValueOnce({ id: 'ex-1', organizationId: 'org-123', status: 'PENDING', timeEntryId: 'entry-1', userId: 'tech-123' })
        .mockResolvedValueOnce({ id: 'ex-1', status: 'REJECTED' });
      mockPrismaService.geofenceExcursion.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.timeEntry.findUnique.mockResolvedValue(clockedInEntry);
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'Joe', lastName: 'X' });
      // clockOut path: active entry lookup + update
      mockPrismaService.timeEntry.findFirst.mockResolvedValue({ ...clockedInEntry, breaks: [] });
      mockPrismaService.timeEntry.update.mockResolvedValue({ ...clockedInEntry, status: 'CLOCKED_OUT' });

      const res: any = await service.rejectExcursion({ excursionId: 'ex-1', approverId: 'mgr-1', organizationId: 'org-123' });

      expect(mockPrismaService.geofenceExcursion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
      // Reject attempts a clock-out (its own path is covered by clockOut tests;
      // failures are intentionally swallowed so the rejection still stands).
      expect(mockPrismaService.timeEntry.findFirst).toHaveBeenCalled();
      expect(res.success).toBe(true);
    });
  });

  // Shared schedule-flag logic (used by clock-in, clock-out, and edit).
  describe('computeScheduleFlags (dynamic tolerance)', () => {
    const start = new Date('2026-08-10T22:00:00Z'); // 6 PM EDT shift start
    const end = new Date('2026-08-11T10:00:00Z'); // 6 AM EDT shift end

    it('does not flag late within the tolerance', () => {
      const flags = computeScheduleFlags({
        clockInAt: new Date('2026-08-10T22:08:00Z'), // 8 min late
        expectedClockInAt: start,
        toleranceMin: 10,
      });
      expect(flags).not.toContain('LATE_ARRIVAL');
    });

    it('flags late past the tolerance', () => {
      const flags = computeScheduleFlags({
        clockInAt: new Date('2026-08-10T22:15:00Z'), // 15 min late
        expectedClockInAt: start,
        toleranceMin: 10,
      });
      expect(flags).toContain('LATE_ARRIVAL');
    });

    it('respects a per-shift tolerance (25 min → 15 min late is fine)', () => {
      const flags = computeScheduleFlags({
        clockInAt: new Date('2026-08-10T22:15:00Z'),
        expectedClockInAt: start,
        toleranceMin: 25,
      });
      expect(flags).not.toContain('LATE_ARRIVAL');
    });

    it('flags overtime and early departure off the expected end', () => {
      expect(
        computeScheduleFlags({ clockOutAt: new Date('2026-08-11T10:30:00Z'), expectedClockOutAt: end, toleranceMin: 10 }),
      ).toContain('OVERTIME');
      expect(
        computeScheduleFlags({ clockOutAt: new Date('2026-08-11T09:30:00Z'), expectedClockOutAt: end, toleranceMin: 10 }),
      ).toContain('EARLY_DEPARTURE');
    });

    it('returns nothing when the matching expected time is absent', () => {
      expect(computeScheduleFlags({ clockInAt: start, toleranceMin: 10 })).toEqual([]);
    });
  });
});
