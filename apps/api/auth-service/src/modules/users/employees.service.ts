import type { Prisma } from '@prisma/client';
import { SessionEvents } from '../../common/session-events/session-events.service';
import { memberScopeFilter, Role, TaskStatus, personSearchOr, memberOpenJobCount } from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { PrismaService, SERVICE_NAMES } from '@hbcfield/shared';
import type { ClientProxy } from '@nestjs/microservices';
import { ListEmployeesDto } from './dto';
import { announceDeactivated, isOnline } from './users-common';

/**
 * Employee records: the filtered list, and creating, editing and deactivating one.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
    // Optional for the same reason: task-service is told a member was switched off (announceDeactivated).
    @Optional() @Inject(SERVICE_NAMES.TASK) private readonly taskClient?: ClientProxy,
  ) {}

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
    const where: Prisma.UserWhereInput = {
      role: Role.EMPLOYEE,
      organizationId,
      /*
        "View all tasks" held by a SPACE role means that space's work — and its
        people. IN the query, never after it: this read is counted and paged, so
        a filter applied to the page would leave `total` describing a different
        set, and would still have read every row it meant to exclude.

        undefined = org-wide (adds nothing); [] = granted nowhere and matches
        nothing. One indexed lookup via @@index([spaceId]).
      */
      ...memberScopeFilter((dto as { scopeSpaceIds?: string[] }).scopeSpaceIds),
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
    const nameMatch = personSearchOr(search);
    if (nameMatch) where.OR = nameMatch;

    // Build orderBy
    let orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];
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
      isOnline: isOnline(emp.lastLocation?.updatedAt),
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
    const activeTasks = await memberOpenJobCount(this.prisma, id);

    if (activeTasks > 0) {
      throw new BadRequestException(
        `Cannot deactivate employee with ${activeTasks} active task(s). Please reassign tasks first.`,
      );
    }

    // Deactivated means signed out NOW: the refresh tokens go, and the cut-off
    // kills the access tokens already in their hands (validateToken also
    // refuses an inactive account, but only once the gateway's cache expires).
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false, tokensValidAfter: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ]);
    this.sessionEvents?.sessionsRevoked(id);
    announceDeactivated(this.taskClient, organizationId, id);

    return { success: true, message: 'Employee deactivated successfully' };
  }
}
