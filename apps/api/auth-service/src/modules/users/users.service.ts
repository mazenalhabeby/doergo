import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SERVICE_NAMES, Role, TaskStatus, getDefaultModules, BUILTIN_ROLES, PERMISSION_KEYS, permissionsFromUserFlags, permissionsFromOrgRole, mergePermissions, permissionsExceed, type PermissionSet } from '@hbcfield/shared';
import * as bcrypt from 'bcryptjs';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
  GetEmployeeDetailDto,
  GetEmployeePerformanceDto,
  ListOrgMembersDto,
  UpdateMemberProfileDto,
  RemoveMemberDto,
} from './dto';

const BCRYPT_COST_FACTOR = 12;

// Single source of truth for the fields the Members list + a single member share,
// so a member detail page can fetch ONE row in the same shape as a list row
// (instead of pulling the whole org and finding it client-side).
/**
 * The directory projection: who a person is, not what they may do.
 *
 * The dashboard pages through EVERY member on a 60-second interval to refresh
 * presence, and was pulling the full member row to do it — the Access Profile
 * JSON, the contact allow-list array, the role join and a dozen permission
 * columns, none of which it reads. For a few hundred staff that is the heaviest
 * repeating query in the product, and all but a handful of fields were dropped
 * on arrival.
 */
const DIRECTORY_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  position: true,
  isActive: true,
  presence: true,
  lastActiveAt: true,
  specialty: true,
  canManageUsers: true,
  canViewAllTasks: true,
} as const;

/** Just enough to draw one row of a manager picker. */
const MANAGER_CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  position: true,
  isActive: true,
  canManageUsers: true,
  // The role is what the UI labels the row with. A permission written directly
  // on the user row is why someone can appear here while their role is not a
  // managing one — showing the role keeps the label honest about that.
  memberRole: { select: { name: true, permissions: true } },
} as const;

const ORG_MEMBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  position: true,
  presence: true,
  scheduleType: true,
  monthlyHourBudget: true,
  enabledModules: true,
  specialty: true,
  employmentType: true,
  maxDailyJobs: true,
  leaveAllowance: true,
  employmentStartDate: true,
  canCreateTasks: true,
  taskCreationScope: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canManageUsers: true,
  canViewReports: true,
  allowRemote: true,
  contactable: true,
  contactScope: true,
  contactAllowedIds: true,
  showInManagement: true,
  lastActiveAt: true,
  memberRoleId: true,
  memberRole: { select: { id: true, name: true, color: true } },
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  async findOne(id: string, organizationId?: string) {
    // Tenant isolation (S1): when the caller's org is supplied, scope the lookup
    // to it so a user in another org can never be read by id — defense-in-depth
    // behind the gateway's own org check.
    const user = await this.prisma.user.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
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
    // Tenant floor (S3): never list users without an org scope. A missing org id
    // must fail closed, not fall through to every active user in every tenant.
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    const where: any = { isActive: true, organizationId };

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
        // Access Profile — lets the UI tell whether a worker can receive tasks.
        enabledModules: true,
      },
    });

    return { success: true, data: workers };
  }

  async getWorkerTasks(workerId: string, organizationId?: string) {
    const tasks = await this.prisma.task.findMany({
      // Org-scoped when the caller's org is supplied (defense-in-depth): a foreign
      // workerId can't surface another tenant's tasks.
      where: { assignedToId: workerId, ...(organizationId ? { organizationId } : {}) },
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
        employmentType: true,
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
      employmentType: employee.employmentType ?? 'EXTERNAL',
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
    const providedModules = enabledModules || getDefaultModules(position);
    const moduleList = Array.isArray(providedModules)
      ? providedModules
      : ((providedModules as { modules?: string[] })?.modules ?? getDefaultModules(position));

    // Create employee
    const employee = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        role: Role.EMPLOYEE,
        position,
        // New members start LEAST-PRIVILEGE: their own assigned spaces only
        // (admins widen via the Access tab). Stored as an Access Profile.
        enabledModules: { modules: moduleList, spaceScope: 'own' },
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
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.maxDailyJobs !== undefined && { maxDailyJobs: dto.maxDailyJobs }),
        // Vacation entitlement. Null is meaningful — "use the organization's
        // default" — and is NOT the same as 0, which is no paid leave at all,
        // so an explicit null has to reach the database rather than be treated
        // as "field omitted".
        ...((dto as any).leaveAllowance !== undefined && {
          leaveAllowance:
            (dto as any).leaveAllowance === null || (dto as any).leaveAllowance === ''
              ? null
              : Number((dto as any).leaveAllowance),
        }),
        ...((dto as any).employmentStartDate !== undefined && {
          employmentStartDate: (dto as any).employmentStartDate
            ? new Date((dto as any).employmentStartDate)
            : null,
        }),
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
        employmentType: true,
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

    // Default to last 30 days if no date range provided, and clamp the span to a
    // year so a far-back startDate can't load a member's entire history into an
    // O(days × tasks) trend build (P5/P6).
    const end = endDate ? new Date(endDate) : new Date();
    let start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const MAX_SPAN_MS = 366 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > MAX_SPAN_MS) {
      start = new Date(end.getTime() - MAX_SPAN_MS);
    }
    const ROW_CAP = 5000;

    // Get tasks in date range (capped)
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: id,
        organizationId,
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
      take: ROW_CAP,
    });

    // Get time entries in date range — org-scoped (defense-in-depth) + capped.
    const timeEntries = await this.prisma.timeEntry.findMany({
      where: {
        userId: id,
        organizationId,
        clockInAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        totalMinutes: true,
        clockInAt: true,
      },
      take: ROW_CAP,
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
   * Contacts directory — ANY org member can see the org's admins/managers to
   * reach out to. Safe fields only (no email/permissions); includes presence so
   * teammates know availability. Independent of member-management permission.
   */
  async listOrgContacts(organizationId: string, userId: string) {
    // The requesting member's contact policy (secure by default: NONE).
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { contactScope: true, contactAllowedIds: true },
    });
    if (!me || me.contactScope === 'NONE') {
      return { success: true, data: [] };
    }

    // Directory = admins + managers ONLY. "Manager" = holds an elevated permission
    // (view-all / assign tasks / manage users). NOT merely "has a named role":
    // in the unified role system every member has a role, so `memberRoleId != null`
    // matched plain employees (Technician, Maintenance Worker) too.
    const candidates = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { not: userId },
        OR: [
          { role: Role.ADMIN },
          { canViewAllTasks: true },
          { canAssignTasks: true },
          { canManageUsers: true },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        presence: true,
        position: true,
        lastActiveAt: true,
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      // Capped (audit M-C2): this is a contact directory, not an export. Bounded in
      // practice by admins+managers per org, but an uncapped list endpoint is one
      // bad org away from a slow query.
      take: 500,
    });

    // SELECTED → only the explicitly allowed contacts; ALL → everyone in the directory.
    const data =
      me.contactScope === 'SELECTED'
        ? candidates.filter((c) => me.contactAllowedIds.includes(c.id))
        : candidates;

    return { success: true, data };
  }

  /**
   * List all members of an organization with filtering and pagination
   */
  async listOrgMembers(dto: ListOrgMembersDto & { managersOnly?: boolean; includeIds?: string[]; excludeId?: string; lite?: boolean }) {
    const { organizationId, search, role } = dto;
    // Clamp pagination server-side so a client can't request an unbounded page (M6).
    const page = Math.max(1, Number(dto.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(dto.limit) || 10));

    // Members = staff only. Portal customers (they carry a customerId) live in
    // Clients Portals, not here — excluding them keeps admins from accidentally
    // re-roling a customer into a staff account (which breaks their portal login).
    const where: any = { organizationId, customerId: null };

    /*
      One filter, two kinds of thing.

      The screen's Role column shows a member's ASSIGNED ROLE where they have one
      ("Manager", "Sales") and falls back to the account type otherwise. The
      filter beside it only ever offered the account types, so a role an
      organization created could be visible in every row and selectable in none.

      An access-role id is a cuid; the account types are a closed set of
      upper-case words. Matching the words first means a role can never be
      mistaken for a type, whatever it is called — and anything else is treated
      as a role id, which simply matches nobody if it is nonsense.
    */
    if (role) {
      if (role === 'ADMIN' || role === 'EMPLOYEE' || role === 'CUSTOMER') {
        where.role = role;
      } else if (role === 'none') {
        // "No role" is a real thing to look for: these members hold no org-wide
        // permissions at all, which the Employee badge hides rather than shows.
        where.memberRoleId = null;
      } else {
        where.memberRoleId = role;
      }
    }

    /*
      Admins and managers only — the leadership set.

      Shared by every picker that offers "an admin or a manager": the contact
      allow-list and the notification watchers both need exactly this, and each
      had grown its own client-side approximation of it. The watchers list
      matched `!!memberRole`, which in the unified role system is every member
      who has any role at all — technicians included.

      The picker used to ask for 200 members and filter them in the browser, so
      an organization's whole staff list — Access Profiles, contact allow-lists,
      role joins — was read, serialised and thrown away to render a handful of
      rows. Same defect the spaces list had: the filter belongs in the query.

      `includeIds` keeps anyone already on the member's allow-list in the
      result even if they no longer qualify. Leaving them out would not remove
      the grant, only hide it.
    */
    if (dto.excludeId) {
      where.id = { not: dto.excludeId };
    }

    if (dto.managersOnly) {
      where.isActive = true;
      /*
        Candidates are defined by ROLE: the ADMIN system role, or an assigned
        role whose permission set grants canManageUsers.

        Deliberately NOT the canManageUsers column on the user row. That column
        is legacy — buildResolvedAccess still merges it, so it does still grant
        the capability, but it is drift rather than a position anyone was given.
        Including it listed people the organization does not consider managers
        (a technician carrying a stale flag) as if they were, which is the whole
        confusion this picker should not add to. Clean that drift up on the
        member's Access tab, where it is shown as a direct grant.
      */
      const or: any[] = [
        { role: 'ADMIN' },
        { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
      ];
      const keep = (dto.includeIds ?? []).filter(Boolean);
      if (keep.length) or.push({ id: { in: keep } });
      // Combined with a search's own OR via AND so neither clause swallows the other.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: or }];
        delete where.OR;
      } else {
        where.OR = or;
      }
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
      // The picker renders a name, an avatar and a label — it has no use for
      // Access Profiles or allow-lists, and those are the expensive columns.
      select: dto.managersOnly
        ? MANAGER_CANDIDATE_SELECT
        : dto.lite
        ? DIRECTORY_MEMBER_SELECT
        : ORG_MEMBER_SELECT,
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
   * Fetch a SINGLE org member by id, in the same shape as a list row. Org-scoped;
   * excludes portal customers. Lets the member detail page fetch one row instead
   * of pulling the whole org and finding it client-side (P1).
   */
  async getOrgMemberById(memberId: string, organizationId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId, customerId: null },
      select: ORG_MEMBER_SELECT,
    });
    if (!member) throw new NotFoundException('Member not found');
    return { success: true, data: member };
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

  /**
   * Resolve the requester's OWN effective org-wide permission set (legacy user
   * flags ∪ their active memberRole). Returns `isAdmin` so callers can short-circuit
   * the ceiling check for true admins. Mirrors buildResolvedAccess's org branch.
   */
  private async resolveRequesterOrgPerms(
    requesterId: string,
    organizationId: string,
  ): Promise<{ isAdmin: boolean; perms: PermissionSet }> {
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, organizationId },
      select: {
        role: true,
        canCreateTasks: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
        canViewReports: true,
        memberRole: { select: { permissions: true, isActive: true } },
      },
    });
    if (!requester) {
      throw new ForbiddenException('Requester not found in organization');
    }
    const perms = mergePermissions(
      permissionsFromUserFlags(requester),
      requester.memberRole?.isActive
        ? permissionsFromOrgRole(requester.memberRole.permissions)
        : undefined,
    );
    return { isAdmin: requester.role === Role.ADMIN, perms };
  }

  /**
   * Ceiling guard for pointing a member (or invitation) at a permission-bearing
   * AccessRole. A true ADMIN may assign any role. Anyone else — including a
   * non-admin custom role that merely holds `canManageUsers` — may only assign a
   * role whose permission set is a SUBSET of their own; otherwise they could
   * escalate past their ceiling by selecting the built-in admin role.
   */
  private async assertCanAssignMemberRole(
    requesterId: string,
    organizationId: string,
    roleId: string,
  ) {
    const { isAdmin, perms } = await this.resolveRequesterOrgPerms(
      requesterId,
      organizationId,
    );
    if (isAdmin) return;
    const targetRole = await this.prisma.accessRole.findFirst({
      where: { id: roleId, organizationId },
      select: { permissions: true },
    });
    if (!targetRole) return; // invalid id → caller's own tenancy check throws
    if (permissionsExceed(perms, permissionsFromOrgRole(targetRole.permissions))) {
      throw new ForbiddenException(
        'You cannot assign a role with permissions beyond your own',
      );
    }
  }

  // updateMemberRole removed (dead code): it was never wired to a gateway route
  // and skipped the memberRoleId ceiling guard. All member role/permission changes
  // go through updateMemberProfile, which carries the full guard stack.

  /**
   * Remove a member from the organization
   */
  /**
   * Refuse an action that would leave the organization without its owner.
   *
   * One query, and only when the action is actually one of the dangerous ones —
   * an ordinary profile edit never reaches it. `ownerId` is a unique column on
   * the organization, so this is a primary-key lookup returning one short row.
   */
  private async assertNotOwner(organizationId: string, memberId: string, verb: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId && org.ownerId === memberId) {
      throw new BadRequestException(
        `The organization owner cannot be ${verb}. Transfer ownership to another admin first.`,
      );
    }
  }

  /**
   * Hand the organization to somebody else.
   *
   * The only way an owner stops being the owner, which is what makes "the owner
   * cannot be removed" a rule rather than a trap.
   *
   * ONLY THE OWNER MAY DO THIS. Not any admin — otherwise the protection is
   * theatre: an admin who cannot delete the founder could simply take ownership
   * from them and then delete them. Ownership is the one thing in the product
   * that is not delegable by holding a permission.
   *
   * The new owner is made an ADMIN in the same transaction, because an owner who
   * cannot administer the organization is the lockout this whole feature exists
   * to prevent. The previous owner stays an admin — losing ownership is not a
   * demotion, and stripping their access as a side effect of a handover is the
   * kind of surprise that makes people avoid the button.
   */
  async transferOwnership(data: { organizationId: string; requesterId: string; newOwnerId: string }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { ownerId: true },
    });
    if (!org) return refuse(HttpStatus.NOT_FOUND, 'Organization not found');

    /*
      An organization with no owner recorded yet — possible only for one created
      before ownership existed and never backfilled — is claimable by an admin, so
      it cannot become permanently ownerless. Once owned, only the owner moves it.
    */
    if (org.ownerId && org.ownerId !== data.requesterId) {
      return refuse(HttpStatus.FORBIDDEN, 'Only the organization owner can transfer ownership.');
    }
    if (org.ownerId === data.newOwnerId) {
      return refuse(HttpStatus.BAD_REQUEST, 'That member already owns this organization.');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: data.newOwnerId, organizationId: data.organizationId, isActive: true },
      select: { id: true, role: true, firstName: true, lastName: true },
    });
    // Scoped to the organization: an id from another tenant must read as "not a
    // member here", never as a transfer.
    if (!target) return refuse(HttpStatus.NOT_FOUND, 'That member is not part of this organization.');

    if (!org.ownerId) {
      const requester = await this.prisma.user.findFirst({
        where: { id: data.requesterId, organizationId: data.organizationId, role: Role.ADMIN, isActive: true },
        select: { id: true },
      });
      if (!requester) return refuse(HttpStatus.FORBIDDEN, 'Only an admin can claim an unowned organization.');
    }

    /*
      Both writes or neither. An owner recorded against somebody who is not an
      admin is exactly the broken state this guards against, and a half-applied
      transfer is how you get there.
    */
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: target.id }, data: { role: Role.ADMIN } }),
      this.prisma.organization.update({ where: { id: data.organizationId }, data: { ownerId: target.id } }),
    ]);

    this.logger.warn(
      `[OWNERSHIP] org ${data.organizationId} transferred to ${target.id} by ${data.requesterId}`,
    );

    return {
      success: true,
      data: { ownerId: target.id, ownerName: `${target.firstName} ${target.lastName}`.trim() },
      message: 'Ownership transferred',
    };
  }

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

    /*
      The owner cannot be removed.

      Before this, any admin could delete any other admin — the founder of the
      organization included, by whoever they had invited that morning. The
      last-admin check below was the only floor, and it only fires when a single
      admin is left; with two admins each could delete the other.

      Ownership has to move first. That is not an obstacle for its own sake: it
      forces the question "who owns this organization now?" to be answered
      deliberately, by the one person entitled to answer it, instead of being
      settled by whoever clicked first.
    */
    await this.assertNotOwner(organizationId, memberId, 'removed');

    // Privilege ceiling (audit M-B2). updateMemberProfile already refuses to let a
    // non-admin holding canManageUsers touch an ADMIN; removal is the same act with a
    // stronger effect and was not enforcing it, so a manager could delete every admin
    // but one. Same guard, reused — an empty dto means "no grant", leaving only the
    // targetIsAdmin branch to fire.
    await this.assertCanGrantRoleAndPerms(requesterId, organizationId, member, {});

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

    // Hard-delete when the member has NO work history, so their email is freed
    // for re-invitation; otherwise soft-delete (detach + deactivate) so their
    // tasks/attendance/reports keep a valid author. (Product decision 2026-08-11.)
    // The probe spans real-work tables AND the Restrict-blocking author FKs, so a
    // "no history" result can be deleted without tripping a foreign key. Cascade/
    // SetNull relations (tokens, push, schedules, assignments, time entries, etc.)
    // clear automatically; the only ephemeral Restrict blocker is invitations this
    // user created, cleared explicitly below.
    const [
      tasksCreated, tasksAssigned, comments, attachments, taskEvents,
      serviceReports, reportDefs, reportSchedules, recurringTemplates,
      invoices, supportTickets, messages, timeEntries, overtime,
    ] = await this.prisma.$transaction([
      this.prisma.task.count({ where: { createdById: memberId } }),
      this.prisma.task.count({ where: { assignedToId: memberId } }),
      this.prisma.comment.count({ where: { userId: memberId } }),
      this.prisma.attachment.count({ where: { uploadedById: memberId } }),
      this.prisma.taskEvent.count({ where: { userId: memberId } }),
      this.prisma.serviceReport.count({ where: { completedById: memberId } }),
      this.prisma.reportDefinition.count({ where: { createdById: memberId } }),
      this.prisma.reportSchedule.count({ where: { createdById: memberId } }),
      this.prisma.recurringTaskTemplate.count({ where: { createdById: memberId } }),
      this.prisma.invoice.count({ where: { createdById: memberId } }),
      this.prisma.supportTicket.count({ where: { createdById: memberId } }),
      this.prisma.message.count({ where: { senderId: memberId } }),
      this.prisma.timeEntry.count({ where: { userId: memberId } }),
      this.prisma.overtimeRequest.count({ where: { technicianId: memberId } }),
    ]);
    const hasHistory = [
      tasksCreated, tasksAssigned, comments, attachments, taskEvents,
      serviceReports, reportDefs, reportSchedules, recurringTemplates,
      invoices, supportTickets, messages, timeEntries, overtime,
    ].some((n) => n > 0);

    if (!hasHistory) {
      try {
        await this.prisma.$transaction([
          // Invitations this user created (Restrict FK) — the one ephemeral blocker.
          this.prisma.invitation.deleteMany({ where: { createdById: memberId } }),
          this.prisma.user.delete({ where: { id: memberId } }),
        ]);
        return { success: true, message: 'Member removed successfully' };
      } catch (err) {
        // A residual reference we didn't probe still blocks the delete — never
        // fail the removal; fall through to the soft-delete path instead.
        this.logger.warn(
          `Hard delete of member ${memberId} blocked; falling back to soft-delete. ${
            err instanceof Error ? err.message : ''
          }`,
        );
      }
    }

    // Soft delete: detach from org + deactivate, keeping the row so historical
    // FKs stay valid. Clean up org-scoped associations so the user no longer
    // appears in space rosters, schedules, or dashboards.
    await this.prisma.$transaction([
      this.prisma.spaceAssignment.deleteMany({ where: { userId: memberId } }),
      this.prisma.technicianSchedule.deleteMany({ where: { technicianId: memberId } }),
      // Unassign their still-active tasks so they stop showing in activity/pending;
      // completed/closed/canceled tasks keep the assignee for history.
      this.prisma.task.updateMany({
        where: {
          assignedToId: memberId,
          status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELED'] },
        },
        data: { assignedToId: null },
      }),
      this.prisma.user.update({
        where: { id: memberId },
        data: {
          organizationId: null,
          isActive: false,
          onboardingCompleted: false,
        },
      }),
    ]);

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

    // Self-mutation guard: a member can never change their OWN role, permissions,
    // or assigned role via this admin endpoint (their own profile edits go through
    // updateOwnProfile). memberRoleId is included — it points at a permission-bearing
    // role, so a self { memberRoleId: adminRoleId } would be an escalation.
    // enabledModules is included for the SAME reason (audit M-B1): the Access
    // Profile's `spaceScope` is a server-enforced READ control — 'all' returns every
    // space in the org (task-service locations.service) — and `platforms`
    // decide what the member can reach. Leaving it out let a non-admin holding
    // canManageUsers PATCH their own id with { enabledModules: { spaceScope: 'all' } }
    // and widen their own visibility.
    const touchesPrivilege =
      dto.role !== undefined ||
      dto.canManageUsers !== undefined ||
      dto.canCreateTasks !== undefined ||
      dto.canViewAllTasks !== undefined ||
      dto.canAssignTasks !== undefined ||
      (dto as any).taskCreationScope !== undefined ||
      (dto as any).canViewReports !== undefined ||
      (dto as any).memberRoleId !== undefined ||
      (dto as any).enabledModules !== undefined;
    if (touchesPrivilege && memberId === requesterId) {
      throw new BadRequestException(
        'You cannot change your own role, permissions, or access profile',
      );
    }

    // Block privilege escalation when role/permissions are being changed.
    // enabledModules is guarded too (M-B1): re-scoping an ADMIN's access profile is
    // a downgrade of a superior, which a non-admin must not be able to perform.
    if (
      dto.role !== undefined ||
      dto.canManageUsers !== undefined ||
      (dto as any).enabledModules !== undefined
    ) {
      await this.assertCanGrantRoleAndPerms(requesterId, organizationId, member, dto);
    }

    const data: any = {};

    // Login email. Normalized, uniqueness-checked across ALL users (it is the
    // login identifier), and a no-op when unchanged so re-saving the dialog
    // never trips the uniqueness guard.
    if ((dto as any).email !== undefined) {
      const email = String((dto as any).email).trim().toLowerCase();
      if (!email) throw new BadRequestException('Email is required');
      if (email !== member.email) {
        const taken = await this.prisma.user.findFirst({
          where: { email, id: { not: memberId } },
          select: { id: true },
        });
        if (taken) throw new BadRequestException('That email is already in use');
        data.email = email;
        this.logger.warn(
          `[MEMBER] email changed ${member.email} → ${email} (member ${memberId}) by ${requesterId}`,
        );
      }
    }

    // Profile fields
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.scheduleType !== undefined) data.scheduleType = dto.scheduleType;
    if (dto.monthlyHourBudget !== undefined) data.monthlyHourBudget = dto.monthlyHourBudget;
    // Per-user Access Profile (modules / spaceScope / platforms / canContact)
    if ((dto as any).enabledModules !== undefined) data.enabledModules = (dto as any).enabledModules;
    // Contact directory + access control
    if ((dto as any).contactable !== undefined) data.contactable = (dto as any).contactable;
    if ((dto as any).contactScope !== undefined) data.contactScope = (dto as any).contactScope;
    if ((dto as any).contactAllowedIds !== undefined) data.contactAllowedIds = (dto as any).contactAllowedIds;
    if ((dto as any).canViewReports !== undefined) data.canViewReports = (dto as any).canViewReports;
    if ((dto as any).allowRemote !== undefined) data.allowRemote = (dto as any).allowRemote;
    // Unified org-wide role (Phase 4). Validated against the org + ORG scope so a
    // member can never be pointed at another org's role or a space-only role.
    if ((dto as any).memberRoleId !== undefined) {
      const roleId = (dto as any).memberRoleId as string | null;
      if (roleId === null || roleId === '') {
        data.memberRoleId = null;
      } else {
        const role = await this.prisma.accessRole.findFirst({
          where: { id: roleId, organizationId, isActive: true, scope: { in: ['ORG', 'BOTH'] } },
          select: { id: true },
        });
        if (!role) throw new BadRequestException('Invalid role');
        // Ceiling guard: a non-admin can't point a member at a role that grants
        // more than the requester holds (privilege escalation via memberRoleId).
        await this.assertCanAssignMemberRole(requesterId, organizationId, role.id);
        data.memberRoleId = role.id;
      }
    }

    // Role/permission fields — only if role is provided
    if (dto.role !== undefined) {
      /*
        The owner is an admin, always.

        Demoting them would leave the organization owned by somebody who cannot
        administer it — the same lockout as an emptied role, reached by a
        different door. Transfer ownership first, then demote.
      */
      if (dto.role !== Role.ADMIN) {
        await this.assertNotOwner(organizationId, memberId, 'demoted');
      }

      /*
        The value has to BE a role.

        `Role` is ADMIN | EMPLOYEE | CUSTOMER — MANAGER was retired in July, when
        managing became the canViewAllTasks / canAssignTasks flags rather than a
        role of its own. Anything else fell straight through to Prisma, which
        rejected the enum, and an unrecognised database error is reported as a
        500: the caller was told the server broke when they had simply named a
        role that does not exist.
      */
      if (!Object.values(Role).includes(dto.role as Role)) {
        throw new BadRequestException(
          `Unknown role "${dto.role}". Valid roles are ${Object.values(Role).join(', ')}.`,
        );
      }
      // Self-role change already blocked by the privilege self-mutation guard above.

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
      const defaultScope = dto.role === Role.ADMIN ? 'ORG' : 'SELF';
      data.taskCreationScope = dto.taskCreationScope ?? defaultScope;
      data.canViewAllTasks =
        dto.canViewAllTasks ??
        dto.role === Role.ADMIN;
      data.canAssignTasks =
        dto.canAssignTasks ??
        dto.role === Role.ADMIN;
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
        memberRoleId: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * List assignable roles, lazily seeding ALL built-ins so a fresh org always has
   * them. `scope='space'` → space roles (Space Manager / Shift Leader / …) for the
   * space pickers; default → org roles (Admin / Manager / custom) for the Access
   * panel. Org-scoped: id always from the caller's token.
   */
  async listAccessRoles(data: { organizationId: string; scope?: 'org' | 'space' }) {
    for (const p of BUILTIN_ROLES) {
      await this.prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId: data.organizationId, slug: p.slug } },
        update: {},
        create: {
          organizationId: data.organizationId,
          name: p.name,
          slug: p.slug,
          description: p.description,
          color: p.color,
          scope: p.scope as any,
          isSystem: true,
          permissions: p.permissions as any,
        },
      });
    }
    const scopes = data.scope === 'space' ? ['SPACE', 'BOTH'] : ['ORG', 'BOTH'];
    const [roles, holders] = await Promise.all([
      this.prisma.accessRole.findMany({
        where: { organizationId: data.organizationId, isActive: true, scope: { in: scopes as any } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
      }),
      /*
        How many people hold each role, in ONE query.

        The screen listed "13 permissions" and never said who had them, so a role
        looked equally deletable whether nobody held it or half the company did —
        and the refusal only arrived after clicking Delete.

        A groupBy rather than a count per role: this list is short today, but a
        count inside the map is an N+1 that grows with exactly the thing an
        organization adds more of over time.

        Active members only. Somebody deactivated is not occupying a role in any
        sense the reader cares about, and counting them would explain a delete
        refusal by pointing at people who are no longer there.
      */
      this.prisma.user.groupBy({
        by: ['memberRoleId'],
        where: { organizationId: data.organizationId, isActive: true, memberRoleId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const held = new Map(holders.map((h) => [h.memberRoleId as string, h._count._all]));
    return {
      success: true,
      data: roles.map((r) => ({ ...r, memberCount: held.get(r.id) ?? 0 })),
    };
  }

  /** Whitelist an incoming permissions object to the known keys (fail-closed). */
  private sanitizeRolePermissions(input: unknown): PermissionSet {
    const out: PermissionSet = {};
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const r = input as Record<string, unknown>;
      for (const key of PERMISSION_KEYS) if (r[key] === true) out[key] = true;
    }
    return out;
  }

  private async uniqueRoleSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';
    let slug = base;
    let n = 1;
    while (true) {
      const clash = await this.prisma.accessRole.findFirst({
        where: { organizationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${++n}`;
    }
  }

  /**
   * Whitelist incoming permissions AND cap them at the requester's own ceiling.
   * A true ADMIN may author any permission; anyone else can only grant what they
   * already hold — so a non-admin `canManageUsers` holder can't mint a super-role.
   */
  private async sanitizeRolePermissionsForRequester(
    input: unknown,
    requesterId: string | undefined,
    organizationId: string,
  ): Promise<PermissionSet> {
    const requested = this.sanitizeRolePermissions(input);
    if (!requesterId) return requested; // no requester context → whitelist only
    const { isAdmin, perms } = await this.resolveRequesterOrgPerms(requesterId, organizationId);
    if (isAdmin) return requested;
    const capped: PermissionSet = {};
    for (const key of PERMISSION_KEYS) {
      if (requested[key] === true && perms[key] === true) capped[key] = true;
    }
    return capped;
  }

  /** Create a custom ORG-wide role. Permissions are whitelisted to known keys. */
  async createAccessRole(data: {
    organizationId: string;
    requesterId?: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: unknown;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Role name is required');
    const slug = await this.uniqueRoleSlug(data.organizationId, name);
    const max = await this.prisma.accessRole.aggregate({
      where: { organizationId: data.organizationId },
      _max: { position: true },
    });
    const permissions = await this.sanitizeRolePermissionsForRequester(
      data.permissions,
      data.requesterId,
      data.organizationId,
    );
    const role = await this.prisma.accessRole.create({
      data: {
        organizationId: data.organizationId,
        name,
        slug,
        description: data.description?.trim() || null,
        color: data.color || '#6b7280',
        scope: 'ORG',
        isSystem: false,
        permissions: permissions as any,
        position: (max._max.position ?? -1) + 1,
      },
      select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
    });
    return { success: true, data: role, message: 'Role created' };
  }

  /** Update a role. Built-in roles: name/permissions editable, slug kept stable. */
  async updateAccessRole(data: {
    organizationId: string;
    requesterId?: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: unknown;
  }) {
    const role = await this.prisma.accessRole.findFirst({
      where: { id: data.roleId, organizationId: data.organizationId },
    });
    if (!role) throw new NotFoundException('Role not found');
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Role name cannot be empty');
      patch.name = name;
      if (!role.isSystem) patch.slug = await this.uniqueRoleSlug(data.organizationId, name, role.id);
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.permissions !== undefined)
      patch.permissions = (await this.sanitizeRolePermissionsForRequester(
        data.permissions,
        data.requesterId,
        data.organizationId,
      )) as any;
    const updated = await this.prisma.accessRole.update({
      where: { id: role.id },
      data: patch,
      select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
    });
    return { success: true, data: updated, message: 'Role updated' };
  }

  /**
   * Delete a custom role. System roles are protected; in-use roles are blocked.
   *
   * Refusals are RETURNED, not thrown.
   *
   * A `BadRequestException` raised inside a @MessagePattern handler does not
   * survive the trip to the gateway: Nest serialises it across Redis as
   * `{ status: 'error', message }`, the HTTP status is gone, and what arrives is
   * no longer an HttpException — so the gateway's filter falls through to its
   * default and answers **500 Internal server error**. The caller then sees a
   * crash where the server actually made a correct, explainable decision.
   *
   * The gateway already reads this shape (`if (result.success === false) throw
   * new HttpException(...)`), so returning is the convention here; throwing was
   * the anomaly. Every refusal below carries the status the caller should see.
   */
  async deleteAccessRole(data: { organizationId: string; requesterId?: string; roleId: string }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const role = await this.prisma.accessRole.findFirst({
      where: { id: data.roleId, organizationId: data.organizationId },
    });
    if (!role) return refuse(HttpStatus.NOT_FOUND, 'Role not found');
    if (role.isSystem) return refuse(HttpStatus.BAD_REQUEST, 'Built-in roles cannot be deleted');
    // Ceiling guard (S4): a non-admin may only delete a role whose permissions are
    // within their own — consistent with create/update authoring.
    if (data.requesterId) {
      const { isAdmin, perms } = await this.resolveRequesterOrgPerms(data.requesterId, data.organizationId);
      if (!isAdmin && permissionsExceed(perms, permissionsFromOrgRole(role.permissions))) {
        return refuse(HttpStatus.FORBIDDEN, 'You cannot delete a role with permissions beyond your own');
      }
    }
    const inUse = await this.prisma.user.count({ where: { memberRoleId: role.id } });
    if (inUse > 0) {
      // The sentence somebody can act on: it says how many, and what to do.
      return refuse(
        HttpStatus.CONFLICT,
        `This role is still assigned to ${inUse} member${inUse === 1 ? '' : 's'}. Move them to another role first, then delete it.`,
      );
    }
    await this.prisma.accessRole.delete({ where: { id: role.id } });
    return { success: true, data: { id: role.id }, message: 'Role deleted' };
  }

  /**
   * Self-service profile update — a user updating their OWN record. Scoped to
   * `userId` (the authenticated caller), so it needs no permission: unlike
   * `updateMemberProfile` (admin managing others), anyone can edit themselves.
   */
  async updateOwnProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; presence?: string | null; timeFormat?: string; guidesSeen?: boolean },
  ) {
    const data: { firstName?: string; lastName?: string; presence?: string | null; timeFormat?: string; guidesSeen?: boolean } = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    // presence: a value sets the manual override; null clears it back to auto.
    if (dto.presence !== undefined) data.presence = dto.presence;
    // timeFormat: per-user clock display ("12h" | "24h"); ignore anything else.
    if (dto.timeFormat === '12h' || dto.timeFormat === '24h') data.timeFormat = dto.timeFormat;
    // guidesSeen: one-time welcome-tour flag (only ever set to true by the client).
    if (dto.guidesSeen === true) data.guidesSeen = true;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        presence: true,
        timeFormat: true,
        guidesSeen: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Self-service email change — requires the current password (email is the
   * login identity, so we confirm it's really them) and enforces uniqueness.
   * Everything internal keys off userId, so only login is affected.
   */
  async updateOwnEmail(
    userId: string,
    data: { newEmail: string; currentPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!validPassword) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newEmail = data.newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new BadRequestException('Invalid email address');
    }
    if (newEmail === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your email');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('That email is already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
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

    // On-time rate: a single filtered count (field-ref updatedAt <= dueDate) over
    // the SAME all-time set as `completed`, so numerator and denominator share a
    // window (D7 — was a 90-day numerator over an all-time denominator, which
    // understated on-time for anyone with older completions). Replaces the old
    // take:200 findMany+JS filter (M5).
    let completedOnTime = 0;
    if (completed > 0) {
      completedOnTime = await this.prisma.task.count({
        where: {
          assignedToId: employeeId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
          OR: [
            { dueDate: null },
            { updatedAt: { lte: this.prisma.task.fields.dueDate } },
          ],
        },
      });
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

  // ===========================================================================
  // NOTIFICATION ROUTING — per-employee watchers + per-recipient preferences
  // ===========================================================================

  /** List the managers/admins watching a specific employee (notifications about them). */
  async getWatchers(subjectUserId: string, organizationId: string) {
    const subject = await this.prisma.user.findFirst({
      where: { id: subjectUserId, organizationId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('Member not found');

    const watches = await this.prisma.notificationWatch.findMany({
      where: { subjectUserId, organizationId },
      select: {
        watcher: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
        },
      },
    });
    return { data: watches.map((w) => w.watcher) };
  }

  /**
   * Replace the full set of watchers for an employee. `watcherIds` must be
   * admins or managers (canViewAllTasks) in the same org. Empty = clear (falls
   * back to default space/admin routing).
   */
  async setWatchers(subjectUserId: string, organizationId: string, watcherIds: string[]) {
    const subject = await this.prisma.user.findFirst({
      where: { id: subjectUserId, organizationId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('Member not found');

    const unique = [...new Set(watcherIds)].filter((id) => id && id !== subjectUserId);

    // Only admins + "Show in Management" members may be watchers
    // (mirrors the eligible-watchers list in the web UI).
    const valid = unique.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: unique },
            organizationId,
            isActive: true,
            // Same definition the picker offers: the ADMIN system role, or an
            // assigned role granting canManageUsers. This previously accepted
            // `memberRoleId: { not: null }` — every member has a role in the
            // unified system, so the check passed for anyone and the server
            // enforced nothing the UI was promising.
            OR: [
              { role: Role.ADMIN },
              { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
            ],
          },
          select: { id: true },
        })
      : [];
    const validIds = valid.map((v) => v.id);

    await this.prisma.$transaction([
      this.prisma.notificationWatch.deleteMany({ where: { subjectUserId, organizationId } }),
      ...(validIds.length
        ? [
            this.prisma.notificationWatch.createMany({
              data: validIds.map((watcherUserId) => ({ subjectUserId, organizationId, watcherUserId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    // Tell task-service to drop its cached recipients for this member. Without
    // it the change took up to the cache TTL to show, so an admin would save,
    // watch the next event go to the old list, and reasonably think it had not
    // worked. Fire-and-forget: if it is lost, the TTL still expires.
    this.taskClient.emit('notification_routing_changed', { organizationId, subjectUserId });

    return this.getWatchers(subjectUserId, organizationId);
  }

  /** In-app notification inbox — recent persisted notifications + unread count. */
  async listNotifications(userId: string, limit?: number) {
    const take = Math.min(Math.max(limit || 30, 1), 100);
    const [items, unread] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where: { recipientId: userId, channel: 'SOCKET' },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, eventType: true, payload: true, readAt: true, createdAt: true },
      }),
      this.prisma.notificationDelivery.count({
        where: { recipientId: userId, channel: 'SOCKET', readAt: null },
      }),
    ]);
    return { data: { items, unread } };
  }

  /** Mark inbox notifications read (all unread, or the given ids). */
  async markNotificationsRead(userId: string, ids?: string[]) {
    const where: { recipientId: string; readAt: null; id?: { in: string[] } } = {
      recipientId: userId,
      readAt: null,
    };
    if (ids && ids.length) where.id = { in: ids };
    await this.prisma.notificationDelivery.updateMany({ where, data: { readAt: new Date() } });
    return { success: true };
  }

  /** Get a user's own notification opt-out preferences (category → boolean). */
  async getNotificationPrefs(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return { data: (user.notificationPrefs as Record<string, boolean> | null) ?? {} };
  }

  /** Merge-update a user's own notification preferences. */
  async updateNotificationPrefs(userId: string, prefs: Record<string, boolean>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const merged = { ...((user.notificationPrefs as Record<string, boolean> | null) ?? {}), ...prefs };
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: merged } });
    return { data: merged };
  }
}
