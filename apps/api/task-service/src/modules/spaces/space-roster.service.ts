import { Injectable, NotFoundException } from '@nestjs/common';
import { notEndedWhere, success, WORKING_NOW_STATUSES } from '@hbcfield/shared';
import { SpaceServiceBase } from './space-service.base';

/** Who is in a workspace: one roster, or many at once — read only where the caller may. */
@Injectable()
export class SpaceRosterService extends SpaceServiceBase {
  /**
   * Which of these spaces' rosters the caller may read — ONE rule for the
   * single roster and the dashboard batch.
   *
   * Space-scope enforcement. The ids arrive from the client, so an org check
   * alone let any member read the roster of ANY space in the org by passing its
   * id — including members whose Access Profile grants them no spaces at all.
   * Mirrors the scoping GET /locations already applies to the list.
   * `canViewAll` is decided at the gateway (admin, or a viewing grant for the
   * space); without it, Access-Profile scope 'tasks' reads none, 'own' only the
   * spaces the caller is assigned to right now, 'all' every one.
   */
  private async rosterSpacesFor(
    ids: string[],
    data: { requesterId?: string; spaceScope?: string; canViewAll?: boolean; viewAllIds?: string[] },
  ): Promise<string[]> {
    if (data.canViewAll || !data.requesterId) return ids;
    /*
      `viewAllIds` = the spaces the gateway found a viewing grant for
      (`mayViewSpaceRoster`, per space). The batch carries one list because a
      grant is per workspace — a single boolean either over- or under-reads.
    */
    const granted = new Set(data.viewAllIds ?? []);
    const rest = ids.filter((id) => !granted.has(id));
    const viaGrant = ids.filter((id) => granted.has(id));
    if (!rest.length || data.spaceScope === 'tasks') return viaGrant;
    if (data.spaceScope === 'all') return ids;
    const mine = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.requesterId,
        spaceId: { in: rest },
        ...notEndedWhere(),
      },
      select: { spaceId: true },
    });
    const allowed = new Set(mine.map((a) => a.spaceId));
    return ids.filter((id) => granted.has(id) || allowed.has(id));
  }

  async getLocationAssignments(data: {
    locationId: string;
    organizationId: string;
    sharedSpaceIds?: string[]; // shared spaces (with showWorkers) the caller may view
    /** Caller, for space-scope enforcement (same rule as the batch). */
    requesterId?: string;
    spaceScope?: string;
    canViewAll?: boolean;
  }) {
    // A guest may view the roster of a space shared with them (showWorkers gated
    // at the gateway → only such spaces reach here in sharedSpaceIds). Otherwise
    // strict org scoping.
    const isShared = Array.isArray(data.sharedSpaceIds) && data.sharedSpaceIds.includes(data.locationId);
    /*
      ⚠️ This read had no scope at all: unknown member of the organization — an
      external one included — read any workspace's roster by id, with emails
      and what each person is working on right now. Same rule as the batch now;
      a space the caller may not read is not found. (A shared space is
      authorised by its share, decided above.)
    */
    if (!isShared && (await this.rosterSpacesFor([data.locationId], data)).length === 0) {
      throw new NotFoundException('Company location not found');
    }
    const location = await this.prisma.companyLocation.findFirst({
      where: isShared ? { id: data.locationId } : { id: data.locationId, organizationId: data.organizationId },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: data.locationId,
        // Space-scoped roster: everyone assigned to THIS space (native owner-org
        // members AND cross-org guest members a CONTROL guest added). No user-org
        // filter — spaceId is the boundary, and for a native space every member is
        // already owner-org so behavior is unchanged. Drop removed-user ghosts.
        user: { is: { isActive: true } },
        // Only show active assignments (not expired)
        ...notEndedWhere(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            // Badged in the roster, and the flag the attendance and rota views
            // filter on — an external supervisor never clocks in here.
            isExternal: true,
            // Whether they consented to the automatic clock — the office needs to see why it is not arming.
            // Stripped at the gateway for anybody who does not manage this workspace's people.
            autoClockConsentAt: true,
            /*
              Whether this person can be GIVEN work.

              The assignee picker asks `canReceiveTasks`, which reads the
              `tasks` module out of the access profile. Without it here the
              helper falls back to "no profile stored → full access" and offers
              somebody who would never see the task on their phone.

              Cheap: one JSON column already on the row being read.
            */
            enabledModules: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    // Attach each member's current active task at this location, computed
    // server-side. Employees can only read their OWN tasks, so this is how their
    // dashboard learns which colleagues are working (presence parity with admin).
    // Working on it now (shared tasks/working-statuses.ts) — not "not finished".
    const WORKING = WORKING_NOW_STATUSES;
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
            status: { in: [...WORKING] },
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
  async getLocationAssignmentsBatch(data: {
    locationIds: string[];
    organizationId: string;
    /** Caller, for space-scope enforcement. */
    requesterId?: string;
    /** Access-Profile space scope: 'all' | 'own' | 'tasks'. */
    spaceScope?: string;
    /** Admins/managers bypass scoping. */
    canViewAll?: boolean;
    /** Spaces the caller holds a roster-viewing grant in (decided at the gateway). */
    viewAllIds?: string[];
  }) {
    const ids = (data.locationIds || []).filter(Boolean);
    if (!ids.length) return success([]);

    const scoped = await this.rosterSpacesFor(ids, data);
    if (!scoped.length) return success([]);

    const locs = await this.prisma.companyLocation.findMany({
      where: { id: { in: scoped }, organizationId: data.organizationId },
      select: { id: true },
    });
    const validIds = locs.map((l) => l.id);
    if (!validIds.length) return success([]);

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: { in: validIds },
        // Drop ghosts of users removed from the org (org nulled / deactivated).
        user: { is: { organizationId: data.organizationId, isActive: true } },
        ...notEndedWhere(),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const WORKING = WORKING_NOW_STATUSES;
    const TASK_PRIORITY: Record<string, number> = { IN_PROGRESS: 4, ARRIVED: 3, EN_ROUTE: 2, BLOCKED: 1 };
    const memberIds = [...new Set(assignments.map((a) => a.userId))];
    const activeTasks = memberIds.length
      ? await this.prisma.task.findMany({
          where: {
            spaceId: { in: validIds },
            status: { in: [...WORKING] },
            // Lead OR co-assignee: matching only assignedToId left every
            // multi-assigned member looking idle on the roster.
            OR: [{ assignedToId: { in: memberIds } }, { assignees: { some: { userId: { in: memberIds } } } }],
          },
          select: {
            assignedToId: true,
            spaceId: true,
            title: true,
            status: true,
            assignees: { select: { userId: true } },
          },
        })
      : [];
    // Key by (user, location) so a member in multiple spaces gets the right task.
    const taskByKey = new Map<string, { title: string; status: string }>();
    for (const t of activeTasks) {
      if (!t.spaceId) continue;
      const holders = new Set<string>();
      if (t.assignedToId) holders.add(t.assignedToId);
      for (const a of t.assignees ?? []) holders.add(a.userId);
      for (const userId of holders) {
        const key = `${userId}:${t.spaceId}`;
        const ex = taskByKey.get(key);
        if (!ex || (TASK_PRIORITY[t.status] || 0) > (TASK_PRIORITY[ex.status] || 0)) {
          taskByKey.set(key, { title: t.title, status: t.status });
        }
      }
    }
    const enriched = assignments.map(({ spaceId, ...a }) => {
      const t = taskByKey.get(`${a.userId}:${spaceId}`);
      return { ...a, locationId: spaceId, currentTask: t?.title ?? null, currentTaskStatus: t?.status ?? null };
    });
    return success(enriched);
  }
}
