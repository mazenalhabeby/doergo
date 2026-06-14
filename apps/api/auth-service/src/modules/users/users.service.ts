import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, TaskStatus, getDefaultModules } from '@hbcfield/shared';
import * as bcrypt from 'bcrypt';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
  GetEmployeeDetailDto,
  GetEmployeePerformanceDto,
  ListOrgMembersDto,
  UpdateMemberRoleDto,
  UpdateMemberProfileDto,
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
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        // Permission fields
        canCreateTasks: true,
        taskCreationScope: true,
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
    const where: any = { isActive: true };

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
        avatarUrl: true,
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
      take: 100, // Limit to prevent unbounded queries
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
  // EMPLOYEE MANAGEMENT METHODS
  // ============================================================================

  /**
   * List employees with filtering and pagination
   */
  async listEmployees(dto: ListEmployeesDto) {
    const {
      organizationId,
      status = 'active',

      specialty,
      search,
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'asc',
    } = dto;

    // Build where clause
    const where: any = {
      role: Role.EMPLOYEE,
      organizationId,
    };

    // Status filter
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // Position filter
    if (dto.position) {
      where.position = { contains: dto.position, mode: 'insensitive' };
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

    // Get employees with task counts
    const employees = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isActive: true,
        position: true,
        enabledModules: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        canCreateTasks: true,
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

    // Transform to list item format
    const data = employees.map((emp) => ({
      id: emp.id,
      email: emp.email,
      firstName: emp.firstName,
      lastName: emp.lastName,
      isActive: emp.isActive,
      position: emp.position,
      enabledModules: emp.enabledModules as string[] | null,
      specialty: emp.specialty,
      rating: emp.rating || 5.0,
      ratingCount: emp.ratingCount || 0,
      maxDailyJobs: emp.maxDailyJobs || 5,
      canCreateTasks: emp.canCreateTasks,
      currentTaskCount: emp._count.assignedTasks,
      todayTaskCount: emp._count.assignedTasks, // Will be refined if needed
      isOnline: this.isOnline(emp.lastLocation?.updatedAt),
      lastLocationUpdatedAt: emp.lastLocation?.updatedAt?.toISOString() || null,
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
   * Get full employee detail with stats
   */
  async getEmployeeDetail(dto: GetEmployeeDetailDto) {
    const { id, organizationId } = dto;

    const employee = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        position: true,
        enabledModules: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        canCreateTasks: true,
        organizationId: true,
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

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Batch all stats queries in parallel to avoid N+1
    const [taskStats, attendanceStats, recentActivity] = await Promise.all([
      this.getTaskStatsForEmployee(id),
      this.getAttendanceStatsForEmployee(id),
      this.getRecentActivityForEmployee(id),
    ]);

    // Build response
    const profile = {
      id: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      isActive: employee.isActive,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
      position: employee.position,
      enabledModules: employee.enabledModules as string[] | null,
      specialty: employee.specialty,
      rating: employee.rating || 5.0,
      ratingCount: employee.ratingCount || 0,
      maxDailyJobs: employee.maxDailyJobs || 5,
      canCreateTasks: employee.canCreateTasks,
      organizationId: employee.organizationId,
      organization: employee.organization,
      lastLocation: employee.lastLocation
        ? {
            lat: employee.lastLocation.lat,
            lng: employee.lastLocation.lng,
            accuracy: employee.lastLocation.accuracy,
            updatedAt: employee.lastLocation.updatedAt.toISOString(),
          }
        : null,
      lastLocationUpdatedAt:
        employee.lastLocation?.updatedAt?.toISOString() || null,
      isOnline: this.isOnline(employee.lastLocation?.updatedAt),
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
        customerRating: employee.rating || 5.0,
        ratingCount: employee.ratingCount || 0,
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
   * Create a new employee
   */
  async createEmployee(dto: CreateEmployeeDto) {
    const {
      email,
      firstName,
      lastName,
      password,

      position = 'technician',
      enabledModules,
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

    // Determine default modules from position if not provided
    const modules = enabledModules || getDefaultModules(position);

    // Create employee
    const employee = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        role: Role.EMPLOYEE,
        position,
        enabledModules: modules,
        specialty,
        maxDailyJobs,
        organizationId,
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
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        enabledModules: true,
        specialty: true,
        maxDailyJobs: true,
        organizationId: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: employee,
      // Include generated password only if we generated it
      ...(password ? {} : { generatedPassword: actualPassword }),
    };
  }

  /**
   * Update an employee
   */
  async updateEmployee(
    id: string,
    organizationId: string,
    dto: UpdateEmployeeDto,
  ) {
    // Verify employee exists and belongs to organization
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    const employee = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.enabledModules !== undefined && { enabledModules: dto.enabledModules }),
        ...(dto.specialty !== undefined && { specialty: dto.specialty }),
        ...(dto.maxDailyJobs !== undefined && { maxDailyJobs: dto.maxDailyJobs }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.ratingCount !== undefined && { ratingCount: dto.ratingCount }),
        ...(dto.canCreateTasks !== undefined && { canCreateTasks: dto.canCreateTasks }),
        ...(dto.profileBadges !== undefined && { profileBadges: dto.profileBadges }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        enabledModules: true,
        specialty: true,
        maxDailyJobs: true,
        rating: true,
        ratingCount: true,
        canCreateTasks: true,
        organizationId: true,
        updatedAt: true,
      },
    });

    return { success: true, data: employee };
  }

  /**
   * Deactivate an employee (soft delete)
   */
  async deactivateEmployee(id: string, organizationId: string) {
    // Verify employee exists and belongs to organization
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
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
        `Cannot deactivate employee with ${activeTasks} active task(s). Please reassign tasks first.`,
      );
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true, message: 'Employee deactivated successfully' };
  }

  /**
   * Get employee performance metrics
   */
  async getEmployeePerformance(dto: GetEmployeePerformanceDto) {
    const { id, organizationId, startDate, endDate } = dto;

    // Verify employee exists
    const employee = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
      select: { rating: true, ratingCount: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
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
          tasksCompleted: completed,
          customerRating: employee.rating || 5.0,
          totalHoursWorked: totalHours,
        },
        trends,
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
        isActive: true,
        avatarUrl: true,
        createdAt: true,
        position: true,
        scheduleType: true,
        monthlyHourBudget: true,
        enabledModules: true,
        specialty: true,
        canCreateTasks: true,
        taskCreationScope: true,
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
  /**
   * Guard against privilege escalation: only an ADMIN may create/modify admins
   * or grant the user-management power. A non-admin holding `canManageUsers`
   * (e.g. a MANAGER) can still manage lower roles, but cannot mint admins or
   * touch an existing admin.
   */
  private async assertCanGrantRoleAndPerms(
    requesterId: string,
    organizationId: string,
    member: { role: string },
    dto: { role?: string; canManageUsers?: boolean },
  ) {
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, organizationId },
      select: { role: true },
    });
    if (requester?.role === Role.ADMIN) return; // admins may do anything

    const grantsAdmin = dto.role === Role.ADMIN;
    const targetIsAdmin = member.role === Role.ADMIN;
    const grantsUserMgmt = dto.canManageUsers === true || dto.role === Role.ADMIN;
    if (grantsAdmin || targetIsAdmin || grantsUserMgmt) {
      throw new ForbiddenException(
        'Only an admin can grant or modify admin-level access',
      );
    }
  }

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

    await this.assertCanGrantRoleAndPerms(requesterId, organizationId, member, dto);

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

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data: {
        role: dto.role as any,

        canCreateTasks: dto.canCreateTasks ?? (dto.role === Role.ADMIN),
        canViewAllTasks:
          dto.canViewAllTasks ??
          (dto.role === Role.ADMIN || dto.role === Role.MANAGER),
        canAssignTasks:
          dto.canAssignTasks ??
          (dto.role === Role.ADMIN || dto.role === Role.MANAGER),
        canManageUsers: dto.canManageUsers ?? (dto.role === Role.ADMIN),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
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

  /**
   * Update a member's profile and/or role/permissions (combined endpoint)
   */
  async updateMemberProfile(
    memberId: string,
    organizationId: string,
    requesterId: string,
    dto: UpdateMemberProfileDto,
  ) {
    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Block privilege escalation when role/permissions are being changed.
    if (dto.role !== undefined || dto.canManageUsers !== undefined) {
      await this.assertCanGrantRoleAndPerms(requesterId, organizationId, member, dto);
    }

    const data: any = {};

    // Profile fields
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.scheduleType !== undefined) data.scheduleType = dto.scheduleType;
    if (dto.monthlyHourBudget !== undefined) data.monthlyHourBudget = dto.monthlyHourBudget;

    // Role/permission fields — only if role is provided
    if (dto.role !== undefined) {
      // Can't change own role
      if (memberId === requesterId) {
        throw new BadRequestException('You cannot change your own role');
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

      data.role = dto.role;

      // Set default platform based on role if not provided
      data.canCreateTasks = dto.canCreateTasks ?? (dto.role === Role.ADMIN);
      // Default taskCreationScope by role
      const defaultScope = dto.role === Role.ADMIN ? 'ORG'
        : dto.role === Role.MANAGER ? 'SPACE'
        : 'SELF';
      data.taskCreationScope = dto.taskCreationScope ?? defaultScope;
      data.canViewAllTasks =
        dto.canViewAllTasks ??
        (dto.role === Role.ADMIN || dto.role === Role.MANAGER);
      data.canAssignTasks =
        dto.canAssignTasks ??
        (dto.role === Role.ADMIN || dto.role === Role.MANAGER);
      data.canManageUsers = dto.canManageUsers ?? (dto.role === Role.ADMIN);
    } else {
      // No role change — still allow updating individual permission/platform fields
      if (dto.canCreateTasks !== undefined) data.canCreateTasks = dto.canCreateTasks;
      if (dto.taskCreationScope !== undefined) data.taskCreationScope = dto.taskCreationScope;
      if (dto.canViewAllTasks !== undefined) data.canViewAllTasks = dto.canViewAllTasks;
      if (dto.canAssignTasks !== undefined) data.canAssignTasks = dto.canAssignTasks;
      if (dto.canManageUsers !== undefined) data.canManageUsers = dto.canManageUsers;
    }

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        scheduleType: true,
        monthlyHourBudget: true,
        canCreateTasks: true,
        taskCreationScope: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Admin resets a member's password, returning a temporary password
   */
  async adminResetMemberPassword(
    memberId: string,
    organizationId: string,
    requesterId: string,
  ) {
    // Can't reset own password via this method
    if (memberId === requesterId) {
      throw new BadRequestException(
        'Use the change password feature to update your own password',
      );
    }

    // Verify member exists and belongs to the organization
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Generate temporary password
    const temporaryPassword = this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST_FACTOR);

    // Update the hash AND revoke all of the member's sessions atomically — an
    // admin resets a compromised account to lock an attacker out, so any
    // existing refresh tokens must stop working immediately.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: memberId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: memberId } }),
    ]);

    return { success: true, temporaryPassword };
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

  private async getTaskStatsForEmployee(employeeId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Use aggregation queries instead of fetching all tasks into memory
    const [statusCounts, priorityCounts, todayCount] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { assignedToId: employeeId },
        _count: { status: true },
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { assignedToId: employeeId },
        _count: { priority: true },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: employeeId,
          createdAt: { gte: todayStart },
        },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let assigned = 0;

    for (const sc of statusCounts) {
      byStatus[sc.status] = sc._count.status;
      total += sc._count.status;

      if (sc.status === TaskStatus.COMPLETED || sc.status === TaskStatus.CLOSED) {
        completed += sc._count.status;
      }
      if (
        sc.status === TaskStatus.EN_ROUTE ||
        sc.status === TaskStatus.ARRIVED ||
        sc.status === TaskStatus.IN_PROGRESS
      ) {
        inProgress += sc._count.status;
      }
      if (sc.status === TaskStatus.ASSIGNED) {
        assigned += sc._count.status;
      }
    }

    const byPriority: Record<string, number> = {};
    for (const pc of priorityCounts) {
      byPriority[pc.priority] = pc._count.priority;
    }

    // For on-time rate, sample recent completed tasks (last 90 days) to avoid unbounded query
    let completedOnTime = 0;
    if (completed > 0) {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const recentCompleted = await this.prisma.task.findMany({
        where: {
          assignedToId: employeeId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { dueDate: true, updatedAt: true },
        take: 200, // Cap to prevent memory issues
      });
      completedOnTime = recentCompleted.filter(
        (t) => !t.dueDate || t.updatedAt <= t.dueDate,
      ).length;
    }

    return {
      total,
      completed,
      inProgress,
      assigned,
      completedOnTime,
      avgCompletionTimeMinutes: 0,
      byStatus,
      byPriority,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
      todayTotal: todayCount,
    };
  }

  private async getAttendanceStatsForEmployee(employeeId: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Batch both queries in parallel - month entries include week entries
    const monthEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: employeeId,
        clockInAt: { gte: monthStart },
      },
      select: {
        totalMinutes: true,
        clockInWithinGeofence: true,
        clockInAt: true,
      },
    });

    // Filter week entries from month entries to avoid a second query
    const weekEntries = monthEntries.filter(
      (e) => new Date(e.clockInAt) >= weekStart,
    );

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
      lateClockIns: 0,
    };
  }

  private async getRecentActivityForEmployee(employeeId: string) {
    const activities: any[] = [];

    // Get recent task events
    const taskEvents = await this.prisma.taskEvent.findMany({
      where: { userId: employeeId },
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
      where: { userId: employeeId },
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
