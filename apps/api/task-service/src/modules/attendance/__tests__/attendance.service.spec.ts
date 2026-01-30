import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AttendanceService } from '../attendance.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TechnicianType,
  TimeEntryStatus,
  ApprovalStatus,
  SERVICE_NAMES,
} from '@doergo/shared';

describe('AttendanceService', () => {
  let service: AttendanceService;

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
    role: 'TECHNICIAN',
    technicianType: TechnicianType.FULL_TIME,
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
    technicianAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    timeEntry: {
      findFirst: jest.fn(),
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
  };

  const mockNotificationClient = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: mockNotificationClient },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
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
      mockPrismaService.technicianAssignment.findFirst.mockResolvedValue(mockAssignment);
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

    it('should throw BadRequestException for non-FULL_TIME technician', async () => {
      const freelanceTech = { ...mockTechnician, technicianType: TechnicianType.FREELANCER };
      mockPrismaService.user.findFirst.mockResolvedValue(freelanceTech);

      await expect(service.clockIn(clockInData)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not assigned to location', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.technicianAssignment.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(clockInData)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already clocked in', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.technicianAssignment.findFirst.mockResolvedValue(mockAssignment);
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(mockTimeEntry);

      await expect(service.clockIn(clockInData)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for low GPS accuracy', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockTechnician);
      mockPrismaService.technicianAssignment.findFirst.mockResolvedValue(mockAssignment);
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
      mockPrismaService.technicianAssignment.findFirst.mockResolvedValue(mockAssignment);
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
      mockPrismaService.technicianAssignment.findMany.mockResolvedValue([
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
      mockPrismaService.technicianAssignment.findMany.mockResolvedValue([]);

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

  describe('autoClockOut', () => {
    it('should auto clock out overdue entries (hourly check)', async () => {
      const overdueEntry = {
        ...mockTimeEntry,
        clockInAt: new Date(Date.now() - 13 * 60 * 60 * 1000), // 13 hours ago
        user: mockTechnician,
        location: mockLocation,
      };
      mockPrismaService.timeEntry.findMany.mockResolvedValue([overdueEntry]);
      mockPrismaService.timeEntry.update.mockResolvedValue({
        ...overdueEntry,
        status: TimeEntryStatus.AUTO_OUT,
      });

      const result = await service.autoClockOut({ type: 'hourly' }) as any;

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('hourly');
      expect(result.data.processedCount).toBe(1);
      expect(mockNotificationClient.emit).toHaveBeenCalledWith(
        'attendance_auto_clock_out',
        expect.any(Object),
      );
    });

    it('should auto clock out all open entries (midnight check)', async () => {
      const openEntry = {
        ...mockTimeEntry,
        clockInAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
        user: mockTechnician,
        location: mockLocation,
      };
      mockPrismaService.timeEntry.findMany.mockResolvedValue([openEntry]);
      mockPrismaService.timeEntry.update.mockResolvedValue({
        ...openEntry,
        status: TimeEntryStatus.AUTO_OUT,
      });

      const result = await service.autoClockOut({ type: 'midnight' }) as any;

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('midnight');
      expect(result.data.processedCount).toBe(1);
    });

    it('should return 0 processed when no overdue entries', async () => {
      mockPrismaService.timeEntry.findMany.mockResolvedValue([]);

      const result = await service.autoClockOut({ type: 'hourly' }) as any;

      expect(result.success).toBe(true);
      expect(result.data.processedCount).toBe(0);
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

      const result = await service.startBreak({
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
        service.startBreak({
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
        service.startBreak({
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

      const result = await service.endBreak({
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
        service.endBreak({
          userId: 'tech-123',
          organizationId: 'org-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not on break', async () => {
      const entryWithNoActiveBreak = { ...mockTimeEntry, breaks: [] };
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(entryWithNoActiveBreak);

      await expect(
        service.endBreak({
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

      const result = await service.getBreakStatus({
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

      const result = await service.getBreakStatus({
        userId: 'tech-123',
        organizationId: 'org-123',
      }) as any;

      expect(result.success).toBe(true);
      expect(result.data.isClockedIn).toBe(true);
      expect(result.data.isOnBreak).toBe(false);
    });

    it('should return not clocked in status', async () => {
      mockPrismaService.timeEntry.findFirst.mockResolvedValue(null);

      const result = await service.getBreakStatus({
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

      const result = await service.getPendingApprovals({
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

      const result = await service.approveEntry({
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
        service.approveEntry({
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
        service.approveEntry({
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

      const result = await service.rejectEntry({
        entryId: 'entry-123',
        approverId: 'admin-123',
        organizationId: 'org-123',
        reason: 'Invalid clock-in location',
      }) as any;

      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException without reason', async () => {
      await expect(
        service.rejectEntry({
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
        service.rejectEntry({
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

      const result = await service.editEntry({
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
        service.editEntry({
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

      await service.editEntry({
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

      const result = await service.bulkApprove({
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

      const result = await service.bulkApprove({
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

      const result = await service.getAttendanceSummary({
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

      const result = await service.exportToCSV({
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
});
