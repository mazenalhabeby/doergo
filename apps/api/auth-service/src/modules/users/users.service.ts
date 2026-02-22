import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, TechnicianType, WorkMode, Platform, TaskStatus } from '@doergo/shared';
import * as bcrypt from 'bcrypt';
import {
  CreateTechnicianDto,
  UpdateTechnicianDto,
  ListTechniciansDto,
  GetTechnicianDetailDto,
  GetTechnicianPerformanceDto,
  ListOrgMembersDto,
  UpdateMemberRoleDto,
  RemoveMemberDto,
} from './dto';

const BCRYPT_COST_FACTOR = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        onboardingCompleted: true,
        isActive: true,
        createdAt: true,
        // Permission fields
        platform: true,
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { success: true, data: user };
  }

  async getWorkers(organizationId?: string) {
    const where: any = { role: Role.TECHNICIAN, isActive: true };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const workers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        lastLocation: true,
      },
    });

    return { success: true, data: workers };
  }

  async getWorkerTasks(workerId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { assignedToId: workerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        locationAddress: true,
        createdAt: true,
      },
    });

    return { success: true, data: tasks };
  }

  // ============================================================================
  // TECHNICIAN MANAGEMENT METHODS
  // ============================================================================

  /**
   * List technicians with filtering and pagination
   */
  async listTechnicians(dto: ListTechniciansDto) {
    const {
      organizationId,
      status = 'active',
      type = 'all',
      specialty,
      search,
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'asc',
    } = dto;

    // Build where clause
    const where: any = {
      role: Role.TECHNICIAN,
      organizationId,
    };

    // Status filter
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // Type filter
    if (type !== 'all') {
      where.technicianType = type;
    }

    // Work mode filter
    if (dto.workMode && dto.workMode !== 'all') {
      where.workMode = dto.workMode;
    }

    // Specialty filter
    if (specialty) {
      where.specialty = {
        contains: specialty,
        mode: 'insensitive',
      };
    }

    // Search filter (name or email)
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    let orderBy: any;
    switch (sortBy) {
      case 'name':
        orderBy = [{ firstName: sortOrder }, { lastName: sortOrder }];
        break;
      case 'email':
        orderBy = { email: sortOrder };
        break;
      case 'rating':
        orderBy = { rating: sortOrder };
        break;
      case 'createdAt':
        orderBy = { createdAt: sortOrder };
        break;
      default:
        orderBy = { firstName: sortOrder };
    }

    // Get total count
    const total = await this.prisma.user.count({ where });

    // Get technicians with task counts
    const technicians = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        technicianType: true,
        workMode: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        createdAt: true,
        lastLocation: {
          select: {
            lat: true,
            lng: true,
            accuracy: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  in: [
                    TaskStatus.ASSIGNED,
                    TaskStatus.ACCEPTED,
                    TaskStatus.EN_ROUTE,
                    TaskStatus.ARRIVED,
                    TaskStatus.IN_PROGRESS,
                  ],
                },
              },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform to TechnicianListItem format
    const data = technicians.map((tech) => ({
      id: tech.id,
      email: tech.email,
      firstName: tech.firstName,
      lastName: tech.lastName,
      isActive: tech.isActive,
      technicianType: tech.technicianType,
      workMode: tech.workMode,
      specialty: tech.specialty,
      rating: tech.rating || 5.0,
      ratingCount: tech.ratingCount || 0,
      maxDailyJobs: tech.maxDailyJobs || 5,
      currentTaskCount: tech._count.assignedTasks,
      todayTaskCount: tech._count.assignedTasks, // Will be refined if needed
      isOnline: this.isOnline(tech.lastLocation?.updatedAt),
      lastLocationUpdatedAt: tech.lastLocation?.updatedAt?.toISOString() || null,
    }));

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get full technician detail with stats
   */
  async getTechnicianDetail(dto: GetTechnicianDetailDto) {
    const { id, organizationId } = dto;

    const technician = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.TECHNICIAN,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        technicianType: true,
        workMode: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        organizationId: true,
        platform: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        lastLocation: {
          select: {
            lat: true,
            lng: true,
            accuracy: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    // Get task statistics
    const taskStats = await this.getTaskStatsForTechnician(id);

    // Get attendance statistics
    const attendanceStats = await this.getAttendanceStatsForTechnician(id);

    // Get recent activity
    const recentActivity = await this.getRecentActivityForTechnician(id);

    // Build response
    const profile = {
      id: technician.id,
      email: technician.email,
      firstName: technician.firstName,
      lastName: technician.lastName,
      role: technician.role,
      isActive: technician.isActive,
      createdAt: technician.createdAt.toISOString(),
      updatedAt: technician.updatedAt.toISOString(),
      technicianType: technician.technicianType,
      workMode: technician.workMode,
      specialty: technician.specialty,
      rating: technician.rating || 5.0,
      ratingCount: technician.ratingCount || 0,
      maxDailyJobs: technician.maxDailyJobs || 5,
      organizationId: technician.organizationId,
      platform: technician.platform,
      organization: technician.organization,
      lastLocation: technician.lastLocation
        ? {
            lat: technician.lastLocation.lat,
            lng: technician.lastLocation.lng,
            accuracy: technician.lastLocation.accuracy,
            updatedAt: technician.lastLocation.updatedAt.toISOString(),
          }
        : null,
      lastLocationUpdatedAt:
        technician.lastLocation?.updatedAt?.toISOString() || null,
      isOnline: this.isOnline(technician.lastLocation?.updatedAt),
      currentTaskCount: taskStats.inProgress,
      todayTaskCount: taskStats.todayTotal,
      completedTaskCount: taskStats.completed,
    };

    const stats = {
      tasks: taskStats,
      attendance: attendanceStats,
      performance: {
        completionRate: taskStats.completionRate,
        onTimeRate: taskStats.onTimeRate,
        customerRating: technician.rating || 5.0,
        ratingCount: technician.ratingCount || 0,
        responseTimeMinutes: 0, // TODO: Calculate average response time
      },
      recentActivity,
    };

    return {
      success: true,
      data: {
        ...profile,
        stats,
      },
    };
  }

  /**
   * Create a new technician
   */
  async createTechnician(dto: CreateTechnicianDto) {
    const {
      email,
      firstName,
      lastName,
      password,
      technicianType = TechnicianType.FREELANCER,
      workMode = WorkMode.HYBRID,
      specialty,
      maxDailyJobs = 5,
      organizationId,
    } = dto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Generate password if not provided
    const actualPassword = password || this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(actualPassword, BCRYPT_COST_FACTOR);

    // Create technician
    const technician = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        role: Role.TECHNICIAN,
        technicianType,
        workMode,
        specialty,
        maxDailyJobs,
        organizationId,
        platform: Platform.MOBILE, // Technicians default to mobile
        canCreateTasks: false,
        canViewAllTasks: false,
        canAssignTasks: false,
        canManageUsers: false,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        technicianType: true,
        workMode: true,
        specialty: true,
        maxDailyJobs: true,
        organizationId: true,
        platform: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: technician,
      // Include generated password only if we generated it
      ...(password ? {} : { generatedPassword: actualPassword }),
    };
  }

  /**
   * Update a technician
   */
  async updateTechnician(
    id: string,
    organizationId: string,
    dto: UpdateTechnicianDto,
  ) {
    // Verify technician exists and belongs to organization
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.TECHNICIAN,
      },
    });

    if (!existing) {
      throw new NotFoundException('Technician not found');
    }

    const technician = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.technicianType !== undefined && {
          technicianType: dto.technicianType,
        }),
        ...(dto.workMode !== undefined && { workMode: dto.workMode }),
        ...(dto.specialty !== undefined && { specialty: dto.specialty }),
        ...(dto.maxDailyJobs !== undefined && { maxDailyJobs: dto.maxDailyJobs }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.ratingCount !== undefined && { ratingCount: dto.ratingCount }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        technicianType: true,
        workMode: true,
        specialty: true,
        maxDailyJobs: true,
        rating: true,
        ratingCount: true,
        organizationId: true,
        platform: true,
        updatedAt: true,
      },
    });

    return { success: true, data: technician };
  }

  /**
   * Deactivate a technician (soft delete)
   */
  async deactivateTechnician(id: string, organizationId: string) {
    // Verify technician exists and belongs to organization
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.TECHNICIAN,
      },
    });

    if (!existing) {
      throw new NotFoundException('Technician not found');
    }

    // Check for active tasks
    const activeTasks = await this.prisma.task.count({
      where: {
        assignedToId: id,
        status: {
          in: [
            TaskStatus.ASSIGNED,
            TaskStatus.ACCEPTED,
            TaskStatus.EN_ROUTE,
            TaskStatus.ARRIVED,
            TaskStatus.IN_PROGRESS,
          ],
        },
      },
    });

    if (activeTasks > 0) {
      throw new BadRequestException(
        `Cannot deactivate technician with ${activeTasks} active task(s). Please reassign tasks first.`,
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true, message: 'Technician deactivated successfully' };
  }

  /**
   * Get technician performance metrics
   */
  async getTechnicianPerformance(dto: GetTechnicianPerformanceDto) {
    const { id, organizationId, startDate, endDate } = dto;

    // Verify technician exists
    const technician = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.TECHNICIAN,
      },
      select: { rating: true, ratingCount: true },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    // Default to last 30 days if no date range provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get tasks in date range
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: id,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get time entries in date range
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: id,
        clockInAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        totalMinutes: true,
        clockInAt: true,
      },
    });

    // Calculate metrics
    const completed = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED,
    ).length;
    const total = tasks.length;
    const completedOnTime = tasks.filter((t) => {
      if (t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CLOSED)
        return false;
      if (!t.dueDate) return true; // No due date = on time
      return new Date(t.updatedAt) <= new Date(t.dueDate);
    }).length;

    const totalHours =
      timeEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    // Build daily trends
    const trends = this.buildDailyTrends(tasks, timeEntries, start, end);

    return {
      success: true,
      data: {
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
        summary: {
          completionRate: total > 0 ? (completed / total) * 100 : 0,
          onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
          avgTaskDuration: 0, // TODO: Calculate from task events
          tasksCompleted: completed,
          customerRating: technician.rating || 5.0,
          totalHoursWorked: totalHours,
        },
        trends,
        comparison: null, // TODO: Calculate comparison with previous period
      },
    };
  }

  // ============================================================================
  // ORGANIZATION MEMBERS METHODS
  // ============================================================================

  /**
   * List all members of an organization with filtering and pagination
   */
  async listOrgMembers(dto: ListOrgMembersDto) {
    const { organizationId, search, role, page = 1, limit = 10 } = dto;

    const where: any = { organizationId };

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    const members = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        platform: true,
        isActive: true,
        createdAt: true,
        technicianType: true,
        workMode: true,
        specialty: true,
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      success: true,
      data: members,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a member's role and permissions
   */
  async updateMemberRole(
    memberId: string,
    organizationId: string,
    requesterId: string,
    dto: UpdateMemberRoleDto,
  ) {
    // Can't change own role
    if (memberId === requesterId) {
      throw new BadRequestException('You cannot change your own role');
    }

    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // If demoting from ADMIN, check there's at least one other active ADMIN
    if (member.role === Role.ADMIN && dto.role !== Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: Role.ADMIN,
          isActive: true,
          id: { not: memberId },
        },
      });

      if (adminCount === 0) {
        throw new BadRequestException(
          'Cannot demote the last admin. Promote another member to admin first.',
        );
      }
    }

    // Set default platform based on role if not provided
    const platform =
      dto.platform ||
      (dto.role === Role.TECHNICIAN
        ? Platform.MOBILE
        : dto.role === Role.DISPATCHER
          ? Platform.WEB
          : Platform.BOTH);

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data: {
        role: dto.role,
        platform,
        canCreateTasks: dto.canCreateTasks ?? (dto.role === Role.ADMIN),
        canViewAllTasks:
          dto.canViewAllTasks ??
          (dto.role === Role.ADMIN || dto.role === Role.DISPATCHER),
        canAssignTasks:
          dto.canAssignTasks ??
          (dto.role === Role.ADMIN || dto.role === Role.DISPATCHER),
        canManageUsers: dto.canManageUsers ?? (dto.role === Role.ADMIN),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        platform: true,
        isActive: true,
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Remove a member from the organization
   */
  async removeMember(dto: RemoveMemberDto) {
    const { memberId, organizationId, requesterId } = dto;

    // Can't remove self
    if (memberId === requesterId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Can't remove the last ADMIN
    if (member.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: Role.ADMIN,
          isActive: true,
          id: { not: memberId },
        },
      });

      if (adminCount === 0) {
        throw new BadRequestException(
          'Cannot remove the last admin from the organization.',
        );
      }
    }

    // Remove from org (set organizationId to null, deactivate)
    await this.prisma.user.update({
      where: { id: memberId },
      data: {
        organizationId: null,
        isActive: false,
        onboardingCompleted: false,
      },
    });

    return { success: true, message: 'Member removed successfully' };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private isOnline(lastUpdate: Date | null | undefined): boolean {
    if (!lastUpdate) return false;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastUpdate.getTime() > fiveMinutesAgo;
  }

  private generateRandomPassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async getTaskStatsForTechnician(technicianId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { assignedToId: technicianId },
      select: {
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let completed = 0;
    let inProgress = 0;
    let assigned = 0;
    let completedOnTime = 0;
    let todayTotal = 0;

    for (const task of tasks) {
      // Count by status
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;

      // Count by priority
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;

      // Track specific counts
      if (
        task.status === TaskStatus.COMPLETED ||
        task.status === TaskStatus.CLOSED
      ) {
        completed++;
        if (!task.dueDate || new Date(task.updatedAt) <= new Date(task.dueDate)) {
          completedOnTime++;
        }
      }

      if (
        task.status === TaskStatus.EN_ROUTE ||
        task.status === TaskStatus.ARRIVED ||
        task.status === TaskStatus.IN_PROGRESS
      ) {
        inProgress++;
      }

      if (task.status === TaskStatus.ASSIGNED) {
        assigned++;
      }

      // Today's tasks
      if (new Date(task.createdAt) >= todayStart) {
        todayTotal++;
      }
    }

    return {
      total: tasks.length,
      completed,
      inProgress,
      assigned,
      completedOnTime,
      avgCompletionTimeMinutes: 0, // TODO: Calculate from task events
      byStatus,
      byPriority,
      completionRate: tasks.length > 0 ? (completed / tasks.length) * 100 : 0,
      onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
      todayTotal,
    };
  }

  private async getAttendanceStatsForTechnician(technicianId: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get time entries for current week
    const weekEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: technicianId,
        clockInAt: { gte: weekStart },
      },
      select: {
        totalMinutes: true,
        clockInWithinGeofence: true,
        clockOutWithinGeofence: true,
      },
    });

    // Get time entries for current month
    const monthEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: technicianId,
        clockInAt: { gte: monthStart },
      },
      select: {
        totalMinutes: true,
        clockInWithinGeofence: true,
      },
    });

    const weekHours =
      weekEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;
    const monthHours =
      monthEntries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

    const geofenceViolations = monthEntries.filter(
      (e) => !e.clockInWithinGeofence,
    ).length;

    return {
      totalHoursThisWeek: weekHours,
      totalHoursThisMonth: monthHours,
      shiftsThisWeek: weekEntries.length,
      shiftsThisMonth: monthEntries.length,
      averageShiftHours:
        monthEntries.length > 0 ? monthHours / monthEntries.length : 0,
      geofenceViolations,
      lateClockIns: 0, // TODO: Implement late detection
    };
  }

  private async getRecentActivityForTechnician(technicianId: string) {
    const activities: any[] = [];

    // Get recent task events
    const taskEvents = await this.prisma.taskEvent.findMany({
      where: { userId: technicianId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        task: {
          select: { title: true },
        },
      },
    });

    for (const event of taskEvents) {
      activities.push({
        id: event.id,
        type: this.mapEventTypeToActivityType(event.eventType),
        description: `${event.eventType} - ${event.task.title}`,
        timestamp: event.createdAt.toISOString(),
      });
    }

    // Get recent time entries
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: { userId: technicianId },
      orderBy: { clockInAt: 'desc' },
      take: 5,
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        location: {
          select: { name: true },
        },
      },
    });

    for (const entry of timeEntries) {
      activities.push({
        id: `clock-in-${entry.id}`,
        type: 'CLOCK_IN',
        description: `Clocked in at ${entry.location.name}`,
        timestamp: entry.clockInAt.toISOString(),
      });
      if (entry.clockOutAt) {
        activities.push({
          id: `clock-out-${entry.id}`,
          type: 'CLOCK_OUT',
          description: `Clocked out from ${entry.location.name}`,
          timestamp: entry.clockOutAt.toISOString(),
        });
      }
    }

    // Sort by timestamp and take top 10
    return activities
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 10);
  }

  private mapEventTypeToActivityType(eventType: string): string {
    switch (eventType) {
      case 'STATUS_CHANGED':
        return 'TASK_STARTED';
      case 'ASSIGNED':
        return 'TASK_ASSIGNED';
      case 'COMPLETED':
        return 'TASK_COMPLETED';
      default:
        return 'TASK_STARTED';
    }
  }

  private buildDailyTrends(
    tasks: any[],
    timeEntries: any[],
    start: Date,
    end: Date,
  ) {
    const trends: any[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayStart = new Date(current);
      const dayEnd = new Date(current);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // Tasks completed on this day
      const completedToday = tasks.filter((t) => {
        const updated = new Date(t.updatedAt);
        return (
          (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED) &&
          updated >= dayStart &&
          updated < dayEnd
        );
      }).length;

      // Hours worked on this day
      const hoursToday =
        timeEntries
          .filter((e) => {
            const clockIn = new Date(e.clockInAt);
            return clockIn >= dayStart && clockIn < dayEnd;
          })
          .reduce((sum, e) => sum + (e.totalMinutes || 0), 0) / 60;

      trends.push({
        date: dateStr,
        completedTasks: completedToday,
        avgDurationMinutes: 0,
        rating: null,
        hoursWorked: hoursToday,
        onTimeRate: 100,
      });

      current.setDate(current.getDate() + 1);
    }

    return trends;
  }
}
