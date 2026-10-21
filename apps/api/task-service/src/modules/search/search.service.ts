import { Injectable } from '@nestjs/common';
import { Role, clampListLimit } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { buildTaskVisibilityWhere } from '../tasks/task-visibility';
import type { TaskSearchInput } from '@hbcfield/shared/microservices';

type SearchInput = TaskSearchInput;

/**
 * Lightweight, org-scoped search for the global command palette. Selects ONLY
 * the fields the palette renders (no joins/counts). Tasks follow the task
 * list's visibility rule exactly (org, space-scoped view, assignments, shared
 * spaces). Everything is capped and index-friendly so it can run on every
 * keystroke.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(data: SearchInput) {
    const q = (data.query || '').trim().slice(0, 100);
    if (!data.organizationId || q.length < 2) return { tasks: [], spaces: [] };
    const take = clampListLimit(data.limit, 6, 10);
    const contains = { contains: q, mode: 'insensitive' as const };

    /*
      Tasks — the task list's own visibility rule (task-visibility.ts), not a
      copy of it. This used to ask only "admin, org-wide view, or assigned to
      me", so a supervisor holding "view all tasks" through a SPACE role found
      nothing of their workspace in the palette while the list showed it all,
      and a task in a space shared with the organization was never found.
    */
    const visibility = buildTaskVisibilityWhere({
      userId: data.userId,
      userRole: data.userRole ?? '',
      canViewAllTasks: data.canViewAllTasks,
      viewAllSpaceIds: data.viewAllSpaceIds,
      organizationId: data.organizationId,
    });
    const shared = Array.isArray(data.sharedSpaceIds)
      ? data.sharedSpaceIds.filter((x) => typeof x === 'string' && x)
      : [];
    // A shared space confers view-all INSIDE that space (as on the list), and the space itself is the boundary.
    const visible = shared.length ? { OR: [visibility, { spaceId: { in: shared } }] } : visibility;
    const taskWhere = { AND: [visible, { OR: [{ title: contains }, { description: contains }] }] };

    const orgWide = data.userRole === Role.ADMIN || !!data.canViewAllTasks;
    const spaceIds = orgWide ? undefined : (data.viewAllSpaceIds ?? []);

    const [tasks, spaces] = await Promise.all([
      this.prisma.task.findMany({
        where: taskWhere,
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      // Spaces: the whole directory for org-wide viewers, the caller's own for a space-scoped one.
      orgWide || spaceIds!.length
        ? this.prisma.companyLocation.findMany({
            where: {
              organizationId: data.organizationId,
              ...(spaceIds ? { id: { in: spaceIds } } : {}),
              isRemote: false,
              isActive: true,
              OR: [{ name: contains }, { address: contains }],
            },
            select: { id: true, name: true, address: true },
            orderBy: { name: 'asc' },
            take,
          })
        : Promise.resolve([]),
    ]);

    return { tasks, spaces };
  }
}
