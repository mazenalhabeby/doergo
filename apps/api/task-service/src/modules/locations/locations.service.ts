import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, DEFAULT_ORG_MODULES } from '@hbcfield/shared';

// tz-lookup: offline coords → IANA timezone (no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/** Derive a space's IANA timezone from its coordinates (null when unavailable). */
function tzFromCoords(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

// Valid schedule days
const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new company location
   */
  async create(data: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    geofenceRadius?: number;
    timezone?: string;
    kind?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    billableRateCents?: number;
    enabledModules?: string[];
    workflowId?: string;
    organizationId: string;
    userId: string;
  }) {
    this.logger.log(`Creating company location: ${data.name}`);

    // The org's first space becomes its default (holds otherwise-unassigned tasks).
    const existingDefault = await this.prisma.companyLocation.count({
      where: { organizationId: data.organizationId, isDefault: true },
    });

    const location = await this.prisma.companyLocation.create({
      data: {
        name: data.name,
        address: data.address,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        geofenceRadius: data.geofenceRadius ?? 15,
        // Space timezone: explicit value wins, else auto-derive from coords, else
        // the schema default. This is the fallback zone for clock-ins here.
        timezone: data.timezone || tzFromCoords(data.lat, data.lng) || undefined,
        // Each space owns its module set; new spaces start with the standard
        // default (the org-level Modules tab was removed — modules live on spaces).
        enabledModules: data.enabledModules ?? DEFAULT_ORG_MODULES,
        workflowId: data.workflowId ?? undefined,
        // Ownership kind + customer contact fields (only meaningful for CUSTOMER).
        kind: (data.kind as any) ?? undefined,
        contactName: data.contactName ?? undefined,
        contactEmail: data.contactEmail ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        billableRateCents:
          data.billableRateCents != null && data.billableRateCents > 0
            ? Math.round(data.billableRateCents)
            : undefined,
        organizationId: data.organizationId,
        isDefault: existingDefault === 0,
      },
    });

    this.logger.log(`Company location created: ${location.id}`);
    return success(location, 'Company location created successfully');
  }

  /**
   * Get all company locations for an organization
   */
  async findAll(data: {
    organizationId: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    search?: string;
    kind?: string;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
      // Never surface the org's internal "Remote" bucket (the geofence-exempt
      // WFH clock-in target). It's an attendance implementation detail, not a
      // real Space/work location — schema marks it "hidden from pickers".
      isRemote: false,
    };

    // Ownership-kind scope. DEFAULT excludes CUSTOMER so customer-company spaces
    // don't pollute the work pickers (task-assign / attendance / member / schedule).
    // `kind: 'all'` includes everything (the Spaces directory); a specific kind
    // narrows to it (e.g. a future customer directory). Served by
    // @@index([organizationId, kind, name]).
    if (data.kind && data.kind !== 'all') {
      where.kind = data.kind;
    } else if (!data.kind) {
      where.kind = { not: 'CUSTOMER' };
    }

    // By default, only show active locations
    if (!data.includeInactive) {
      where.isActive = true;
    }

    // Optional name/address search (used by global search).
    const search = data.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [locations, total] = await Promise.all([
      this.prisma.companyLocation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          workflow: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
          // Active member assignments — lets clients render each location's
          // roster without an extra request per location (avoids N+1).
          spaceAssignments: {
            where: {
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
            },
            select: { userId: true, isPrimary: true },
          },
        },
      }),
      this.prisma.companyLocation.count({ where }),
    ]);

    // Keep the legacy `assignments` key on each location for client compat
    // (storage moved to the unified space_assignments table in Phase 5b).
    // Strip customer contact PII from the LIST projection — it's least-privilege
    // sensitive and the list never needs it (the config/detail view uses the
    // canViewAllTasks-gated findOne, which keeps the contact fields) (M3).
    const shaped = locations.map(
      ({ spaceAssignments, contactName, contactEmail, contactPhone, ...l }) => ({
        ...l,
        assignments: spaceAssignments,
      }),
    );

    return paginated(shaped, { page, limit, total });
  }

  /**
   * Get a single company location by ID
   */
  async findOne(data: { id: string; organizationId: string }) {
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      include: {
        workflow: {
          include: {
            statuses: { orderBy: { position: 'asc' } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    return success(location);
  }

  /**
   * Update a company location
   */
  async update(data: {
    id: string;
    organizationId: string;
    userId: string;
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    geofenceRadius?: number;
    isActive?: boolean;
    enabledModules?: string[];
    workflowId?: string;
    workModel?: string;
    timezone?: string;
    kind?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    billableRateCents?: number;
    notifyRoleIds?: string[];
    contactRoleIds?: string[];
  }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    if (data.geofenceRadius !== undefined) updateData.geofenceRadius = data.geofenceRadius;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.enabledModules !== undefined) updateData.enabledModules = data.enabledModules;
    if (data.workflowId !== undefined) updateData.workflowId = data.workflowId || null;
    if (data.workModel !== undefined) updateData.workModel = data.workModel;
    // Ownership kind + customer contact fields.
    if (data.kind !== undefined) updateData.kind = data.kind;
    if (data.contactName !== undefined) updateData.contactName = data.contactName || null;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail || null;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone || null;
    if (data.billableRateCents !== undefined)
      updateData.billableRateCents =
        data.billableRateCents != null && data.billableRateCents > 0
          ? Math.round(data.billableRateCents)
          : null;
    // Space-driven routing (Phase 3): which roles are notified about / contactable
    // by members here. Whitelist to string arrays (fail closed).
    if (Array.isArray(data.notifyRoleIds)) {
      updateData.notifyRoleIds = data.notifyRoleIds.filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(data.contactRoleIds)) {
      updateData.contactRoleIds = data.contactRoleIds.filter((x): x is string => typeof x === 'string');
    }
    // Timezone: an explicit value wins; otherwise, when coordinates change,
    // re-derive the space's timezone from the new location.
    if (data.timezone !== undefined) {
      updateData.timezone = data.timezone;
    } else if (data.lat !== undefined || data.lng !== undefined) {
      const derived = tzFromCoords(data.lat ?? existing.lat, data.lng ?? existing.lng);
      if (derived) updateData.timezone = derived;
    }

    const location = await this.prisma.companyLocation.update({
      where: { id: data.id },
      data: updateData,
    });

    this.logger.log(`Company location updated: ${location.id}`);
    return success(location, 'Company location updated successfully');
  }

  /**
   * Soft delete a company location (set isActive to false)
   */
  async remove(data: { id: string; organizationId: string; userId: string }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      include: { _count: { select: { tasks: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    // Structural spaces are never deletable: the default bucket holds
    // otherwise-unassigned tasks, and the Remote bucket backs WFH clock-ins.
    if (existing.isDefault) {
      throw new BadRequestException(
        'The default space cannot be deleted. Make another space the default first.',
      );
    }
    if (existing.isRemote) {
      throw new BadRequestException(
        'The Remote space is required for remote clock-ins and cannot be deleted.',
      );
    }

    // Move this space's tasks to the org's default space so nothing is orphaned
    // in a deactivated space (falls back to null → unassigned if no default),
    // then deactivate — atomically, so a crash can't leave tasks stranded on a
    // still-active space or double-apply.
    const { location, tasksReassigned } = await this.prisma.$transaction(
      async (tx) => {
        let reassigned = 0;
        if (existing._count.tasks > 0) {
          const fallback = await tx.companyLocation.findFirst({
            where: {
              organizationId: data.organizationId,
              isDefault: true,
              isActive: true,
              id: { not: data.id },
            },
            select: { id: true },
          });
          const res = await tx.task.updateMany({
            where: { spaceId: data.id },
            data: { spaceId: fallback?.id ?? null },
          });
          reassigned = res.count;
        }
        const loc = await tx.companyLocation.update({
          where: { id: data.id },
          data: { isActive: false },
        });
        return { location: loc, tasksReassigned: reassigned };
      },
    );

    this.logger.log(
      `Company location deactivated: ${location.id} (tasks reassigned: ${tasksReassigned})`,
    );
    return success(
      { ...location, tasksReassigned },
      'Company location deleted successfully',
    );
  }

  /**
   * Get effective modules for a space.
   * Returns the space's enabledModules if set, otherwise falls back to the org's enabledModules.
   */
  async getEffectiveModules(data: { id: string; organizationId: string }) {
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      select: {
        id: true,
        name: true,
        enabledModules: true,
        workflowId: true,
        organization: {
          select: {
            enabledModules: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    // Space modules take priority over org modules
    const effectiveModules = (location.enabledModules as string[] | null) ??
      (location.organization.enabledModules as string[] | null) ??
      [];

    return success({
      spaceId: location.id,
      spaceName: location.name,
      modules: effectiveModules,
      // `enabledModules` is what the web hooks read (useSpaceModules); keep
      // `modules` too for any older caller. Both = the effective set.
      enabledModules: effectiveModules,
      // The space's OWN workflow (task type). null → the client falls back to the
      // org default workflow. Drives the space-aware task board columns + gating.
      workflowId: location.workflowId ?? null,
      source: location.enabledModules ? 'space' : 'organization',
    });
  }

  // ==================== MEMBER ASSIGNMENT METHODS ====================

  /**
   * Assign a member to a company location
   */
  async assignTechnician(data: {
    userId: string;
    locationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
    requestingUserId: string;
    organizationId: string;
  }) {
    this.logger.log(`Assigning member ${data.userId} to location ${data.locationId}`);

    // Verify user exists in organization with appropriate work mode
    const technician = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    // Verify location exists and belongs to organization
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    // Validate schedule days if provided
    if (data.schedule && data.schedule.length > 0) {
      const invalidDays = data.schedule.filter((day) => !VALID_DAYS.includes(day));
      if (invalidDays.length > 0) {
        throw new BadRequestException(
          `Invalid schedule days: ${invalidDays.join(', ')}. Valid days: ${VALID_DAYS.join(', ')}`,
        );
      }
    }

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.spaceAssignment.updateMany({
        where: {
          userId: data.userId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    // Create the assignment (upsert to handle existing assignment). Storage is the
    // unified space_assignments table (Phase 5b); `roleId`/routing overrides set
    // via the space-roles path are left untouched by this upsert.
    const assignment = await this.prisma.spaceAssignment.upsert({
      where: {
        userId_spaceId: {
          userId: data.userId,
          spaceId: data.locationId,
        },
      },
      update: {
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      create: {
        organizationId: data.organizationId,
        userId: data.userId,
        spaceId: data.locationId,
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      include: {
        space: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(`Member assignment created/updated: ${assignment.id}`);
    // Alias to the legacy shape (locationId/location) for client compat.
    const { space, spaceId, ...rest } = assignment;
    return success(
      { ...rest, locationId: spaceId, location: space },
      'Member assigned to location successfully',
    );
  }

  /**
   * Get all members assigned to a location
   */
  /**
   * Colleagues for the "Team" screen — the people who share the requester's
   * visible spaces, scoped by their Access Profile spaceScope. Deduplicated,
   * excludes the requester. 2-3 queries (no N+1).
   */
  async getColleagues(data: {
    userId: string;
    organizationId: string;
    spaceScope?: 'own' | 'tasks' | 'all';
  }) {
    // Determine which space ids the requester may see.
    let locationIds: string[];
    if (data.spaceScope === 'all') {
      const locs = await this.prisma.companyLocation.findMany({
        // Exclude customer-company spaces — they hold no members, so they add
        // nothing to a colleague scan (and shouldn't be treated as work areas).
        where: { organizationId: data.organizationId, isActive: true, kind: { not: 'CUSTOMER' } },
        select: { id: true },
      });
      locationIds = locs.map((l) => l.id);
    } else {
      const mine = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.userId, organizationId: data.organizationId },
        select: { spaceId: true },
      });
      locationIds = mine.map((a) => a.spaceId);
    }

    if (locationIds.length === 0) return success([]);

    const rosters = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: { in: locationIds },
        // Drop ghosts of users removed from the org (org nulled / deactivated).
        user: { is: { organizationId: data.organizationId, isActive: true } },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, role: true, presence: true, contactable: true } },
        space: { select: { id: true, name: true } },
      },
    });

    // Dedupe by user, keep first space name, drop the requester.
    const byUser = new Map<string, any>();
    for (const r of rosters) {
      if (!r.user || r.user.id === data.userId) continue;
      if (!byUser.has(r.user.id)) {
        byUser.set(r.user.id, { ...r.user, spaceName: r.space?.name || null });
      }
    }
    return success([...byUser.values()]);
  }

  async getLocationAssignments(data: {
    locationId: string;
    organizationId: string;
  }) {
    // Verify location exists and belongs to organization
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: data.locationId,
        // Only active members still in this org (drop removed-user ghosts)
        user: { is: { organizationId: data.organizationId, isActive: true } },
        // Only show active assignments (not expired)
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    // Attach each member's current active task at this location, computed
    // server-side. Employees can only read their OWN tasks, so this is how their
    // dashboard learns which colleagues are working (presence parity with admin).
    const ACTIVE_STATUSES = ['IN_PROGRESS', 'ARRIVED', 'EN_ROUTE', 'BLOCKED'];
    const TASK_PRIORITY: Record<string, number> = {
      IN_PROGRESS: 4,
      ARRIVED: 3,
      EN_ROUTE: 2,
      BLOCKED: 1,
    };
    const memberIds = assignments.map((a) => a.userId);
    const activeTasks = memberIds.length
      ? await this.prisma.task.findMany({
          where: {
            spaceId: data.locationId,
            assignedToId: { in: memberIds },
            status: { in: ACTIVE_STATUSES as any },
          },
          select: { assignedToId: true, title: true, status: true },
        })
      : [];

    const taskByUser = new Map<string, { title: string; status: string }>();
    for (const t of activeTasks) {
      if (!t.assignedToId) continue;
      const existing = taskByUser.get(t.assignedToId);
      if (!existing || (TASK_PRIORITY[t.status] || 0) > (TASK_PRIORITY[existing.status] || 0)) {
        taskByUser.set(t.assignedToId, { title: t.title, status: t.status });
      }
    }

    const enriched = assignments.map(({ spaceId, ...a }) => ({
      ...a,
      locationId: spaceId, // legacy alias
      currentTask: taskByUser.get(a.userId)?.title ?? null,
      currentTaskStatus: taskByUser.get(a.userId)?.status ?? null,
    }));

    return success(enriched);
  }

  /**
   * Rosters for MANY locations in 3 queries total (vs 3-per-location) — backs the
   * dashboard so it makes one request instead of one per space. Returns a flat
   * array of assignments (each carries locationId + currentTask); the client
   * groups by location.
   */
  async getLocationAssignmentsBatch(data: { locationIds: string[]; organizationId: string }) {
    const ids = (data.locationIds || []).filter(Boolean);
    if (!ids.length) return success([]);

    const locs = await this.prisma.companyLocation.findMany({
      where: { id: { in: ids }, organizationId: data.organizationId },
      select: { id: true },
    });
    const validIds = locs.map((l) => l.id);
    if (!validIds.length) return success([]);

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: { in: validIds },
        // Drop ghosts of users removed from the org (org nulled / deactivated).
        user: { is: { organizationId: data.organizationId, isActive: true } },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const ACTIVE_STATUSES = ['IN_PROGRESS', 'ARRIVED', 'EN_ROUTE', 'BLOCKED'];
    const TASK_PRIORITY: Record<string, number> = { IN_PROGRESS: 4, ARRIVED: 3, EN_ROUTE: 2, BLOCKED: 1 };
    const memberIds = [...new Set(assignments.map((a) => a.userId))];
    const activeTasks = memberIds.length
      ? await this.prisma.task.findMany({
          where: { spaceId: { in: validIds }, assignedToId: { in: memberIds }, status: { in: ACTIVE_STATUSES as any } },
          select: { assignedToId: true, spaceId: true, title: true, status: true },
        })
      : [];
    // Key by (user, location) so a member in multiple spaces gets the right task.
    const taskByKey = new Map<string, { title: string; status: string }>();
    for (const t of activeTasks) {
      if (!t.assignedToId || !t.spaceId) continue;
      const key = `${t.assignedToId}:${t.spaceId}`;
      const ex = taskByKey.get(key);
      if (!ex || (TASK_PRIORITY[t.status] || 0) > (TASK_PRIORITY[ex.status] || 0)) {
        taskByKey.set(key, { title: t.title, status: t.status });
      }
    }
    const enriched = assignments.map(({ spaceId, ...a }) => {
      const t = taskByKey.get(`${a.userId}:${spaceId}`);
      return { ...a, locationId: spaceId, currentTask: t?.title ?? null, currentTaskStatus: t?.status ?? null };
    });
    return success(enriched);
  }

  /**
   * Get all location assignments for an employee
   */
  async getTechnicianAssignments(data: {
    userId: string;
    organizationId: string;
  }) {
    // Verify user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in organization');
    }

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.userId,
        // Only show active assignments (not expired)
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        space: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    // Alias to the legacy shape (locationId/location) for client compat.
    const shaped = assignments.map(({ space, spaceId, ...a }) => ({
      ...a,
      locationId: spaceId,
      location: space,
    }));

    return success(shaped);
  }

  /**
   * Update an existing assignment
   */
  async updateAssignment(data: {
    assignmentId: string;
    organizationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
  }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.assignmentId },
    });

    if (!assignment || assignment.organizationId !== data.organizationId) {
      throw new NotFoundException('Assignment not found');
    }

    // Validate schedule days if provided
    if (data.schedule && data.schedule.length > 0) {
      const invalidDays = data.schedule.filter((day) => !VALID_DAYS.includes(day));
      if (invalidDays.length > 0) {
        throw new BadRequestException(
          `Invalid schedule days: ${invalidDays.join(', ')}. Valid days: ${VALID_DAYS.join(', ')}`,
        );
      }
    }

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.spaceAssignment.updateMany({
        where: {
          userId: assignment.userId,
          isPrimary: true,
          id: { not: data.assignmentId },
        },
        data: { isPrimary: false },
      });
    }

    const updateData: any = {};
    if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.effectiveFrom !== undefined)
      updateData.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined)
      updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;

    const updated = await this.prisma.spaceAssignment.update({
      where: { id: data.assignmentId },
      data: updateData,
      include: {
        space: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(`Assignment updated: ${updated.id}`);
    // Alias to the legacy shape (locationId/location) for client compat.
    const { space, spaceId, ...rest } = updated;
    return success(
      { ...rest, locationId: spaceId, location: space },
      'Assignment updated successfully',
    );
  }

  /**
   * Remove a member assignment
   */
  async removeAssignment(data: { assignmentId: string; organizationId: string }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.assignmentId },
    });

    if (!assignment || assignment.organizationId !== data.organizationId) {
      throw new NotFoundException('Assignment not found');
    }

    await this.prisma.spaceAssignment.delete({
      where: { id: data.assignmentId },
    });

    this.logger.log(`Assignment removed: ${data.assignmentId}`);
    return success(null, 'Assignment removed successfully');
  }
}
