import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface SearchInput {
  organizationId: string;
  userId: string;
  userRole?: string;
  canViewAllTasks?: boolean;
  query: string;
  limit?: number;
}

/**
 * Lightweight, org-scoped search for the global command palette. Selects ONLY
 * the fields the palette renders (no joins/counts), always filtered to the
 * caller's own organization. Tasks are additionally limited to a non-privileged
 * user's own assignments (defense in depth). Everything is capped and index-
 * friendly so it can run on every keystroke.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(data: SearchInput) {
    const q = (data.query || '').trim();
    if (!data.organizationId || q.length < 2) return { tasks: [], spaces: [] };
    const take = Math.min(Math.max(1, data.limit ?? 6), 10);
    const contains = { contains: q, mode: 'insensitive' as const };

    // Tasks — ALWAYS org-scoped. Privileged users (ADMIN / canViewAllTasks) see
    // the whole org; everyone else is confined to tasks they're assigned to.
    const taskWhere: any = {
      organizationId: data.organizationId,
      OR: [{ title: contains }, { description: contains }],
    };
    if (!(data.userRole === 'ADMIN' || data.canViewAllTasks)) {
      taskWhere.AND = [
        { OR: [{ assignedToId: data.userId }, { assignees: { some: { userId: data.userId } } }] },
      ];
    }

    const [tasks, spaces] = await Promise.all([
      this.prisma.task.findMany({
        where: taskWhere,
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      // Spaces only for users who can view all tasks (org-wide config).
      data.canViewAllTasks || data.userRole === 'ADMIN'
        ? this.prisma.companyLocation.findMany({
            where: {
              organizationId: data.organizationId,
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
