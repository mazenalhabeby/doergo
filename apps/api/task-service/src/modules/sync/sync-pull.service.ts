import { BadRequestException, Injectable } from '@nestjs/common';
import {
  activeAssignmentWhere,
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  TaskStatus,
  type SyncPullResponse,
  type SyncPullScope,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildTaskVisibilityWhere, type TaskVisibilityFacts } from '../tasks/task-visibility';

/** Closed work stays on the phone this long, so yesterday's job can still be looked up in a basement. */
const CLOSED_TASK_WINDOW_DAYS = 30;
/** Never send more ids than this in `scopeIds`; a member who sees more is not offline-scoped. */
const MAX_SCOPE_IDS = 5000;
const FINISHED = [TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED];

export interface PullRequest extends TaskVisibilityFacts {
  scope: SyncPullScope;
  cursor?: string | null;
  limit?: number;
}

/** The position a pull reached: last change seen, and last tombstone seen. */
interface Cursor {
  v: 1;
  /** updatedAt of the last row sent (ISO). */
  t: string;
  /** id of the last row sent, to break updatedAt ties. */
  i: string;
  /** Highest tombstone id seen. */
  d: string;
  /**
   * When this cursor was issued (server time). ⚠️ The age check reads THIS, not
   * `t`: a scope whose newest change is months old is perfectly current, and
   * judging staleness by the row's date reset every page of an old scope back
   * to the start — the pull never advanced.
   */
  s: string;
}

export function encodeCursor(c: Omit<Cursor, 'v'>): string {
  return Buffer.from(JSON.stringify({ v: 1, ...c })).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      c?.v !== 1 || typeof c.t !== 'string' || typeof c.i !== 'string' || !/^\d+$/.test(String(c.d)) ||
      Number.isNaN(Date.parse(c.t)) || typeof c.s !== 'string' || Number.isNaN(Date.parse(c.s))
    ) {
      return null;
    }
    return c as Cursor;
  } catch {
    return null;
  }
}

/**
 * What changed in a member's world since their phone last asked.
 *
 * ⚠️ Every scope is filtered by the SAME rule its online screen uses — the
 * task list's visibility, the clock-in picker's assignment window. An offline
 * copy wider than the online view is a data leak with a delay; narrower is a
 * job the worker cannot open in the basement.
 */
@Injectable()
export class SyncPullService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(req: PullRequest): Promise<SyncPullResponse> {
    switch (req.scope) {
      case 'spaces':
        return this.spaces(req);
      case 'tasks':
        return this.tasks(req);
      default:
        throw new BadRequestException('Unknown sync scope');
    }
  }

  /**
   * Workspaces the member is assigned to right now, with everything the phone
   * needs to decide a clock-in offline: coordinates, radius, drawn boundary,
   * policy, timezone. Small, so always sent whole.
   */
  private async spaces(req: PullRequest): Promise<SyncPullResponse> {
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: { ...activeAssignmentWhere(req.userId), organizationId: req.organizationId, space: { isActive: true } },
      select: {
        id: true,
        roleId: true,
        isPrimary: true,
        schedule: true,
        allowRemote: true,
        effectiveFrom: true,
        effectiveTo: true,
        space: {
          select: {
            id: true, name: true, address: true, lat: true, lng: true,
            geofenceRadius: true, geofencePolygon: true, geofencePolicy: true,
            timezone: true, workModel: true, kind: true, isRemote: true, updatedAt: true,
          },
        },
      },
    });
    const now = new Date().toISOString();
    return {
      scope: 'spaces',
      rows: assignments.map(({ space, ...assignment }) => ({ ...space, assignment })),
      deleted: [],
      cursor: encodeCursor({ t: now, i: '', d: '0', s: now }),
      hasMore: false,
      reset: true,
      serverTime: now,
    };
  }

  private async tasks(req: PullRequest): Promise<SyncPullResponse> {
    const limit = Math.min(Math.max(Number(req.limit) || SYNC_PULL_MAX_ROWS, 1), SYNC_PULL_MAX_ROWS);
    const cursor = decodeCursor(req.cursor);
    const retentionEdge = Date.now() - SYNC_TOMBSTONE_RETENTION_DAYS * 86_400_000;
    // A cursor from before the tombstone window may have missed a deletion.
    const reset = !cursor || Date.parse(cursor.s) < retentionEdge;
    const from = reset ? null : cursor;

    const visibility = buildTaskVisibilityWhere(req);
    const windowStart = new Date(Date.now() - CLOSED_TASK_WINDOW_DAYS * 86_400_000);
    const inScope = {
      organizationId: visibility.organizationId,
      AND: [
        ...(visibility.AND ?? []),
        { OR: [{ status: { notIn: FINISHED } }, { updatedAt: { gte: windowStart } }] },
      ],
    };

    const rows = await this.prisma.task.findMany({
      where: {
        ...inScope,
        ...(from
          ? {
              AND: [
                ...inScope.AND,
                { OR: [{ updatedAt: { gt: new Date(from.t) } }, { updatedAt: new Date(from.t), id: { gt: from.i } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true, title: true, description: true, status: true, priority: true,
        dueDate: true, locationLat: true, locationLng: true, locationAddress: true,
        spaceId: true, workflowId: true, assetId: true, customerId: true, unitId: true,
        assignedToId: true, createdById: true, parentId: true,
        routeStartedAt: true, routeEndedAt: true,
        createdAt: true, updatedAt: true,
        assignees: { select: { userId: true, role: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Deletions since the last pull. A reset sends none: the phone is replacing
    // the scope wholesale, and `scopeIds` below settles membership.
    const tombstoneFrom = from ? BigInt(from.d) : null;
    const tombstones = tombstoneFrom === null
      ? []
      : await this.prisma.syncTombstone.findMany({
          where: { id: { gt: tombstoneFrom }, entity: 'tasks', organizationId: req.organizationId },
          orderBy: { id: 'asc' },
          take: 5000,
          select: { id: true, entityId: true },
        });
    const highestTombstone = tombstoneFrom === null
      ? (await this.prisma.syncTombstone.aggregate({ _max: { id: true } }))._max.id ?? BigInt(0)
      : tombstones.at(-1)?.id ?? tombstoneFrom;

    // On the last page, the complete membership of the scope.
    let scopeIds: string[] | undefined;
    if (!hasMore) {
      const ids = await this.prisma.task.findMany({ where: inScope, select: { id: true }, take: MAX_SCOPE_IDS });
      scopeIds = ids.map((r) => r.id);
    }

    const last = page.at(-1);
    return {
      scope: 'tasks',
      rows: page,
      deleted: tombstones.map((t) => t.entityId),
      scopeIds,
      cursor: encodeCursor({
        t: last ? last.updatedAt.toISOString() : from?.t ?? new Date(0).toISOString(),
        i: last ? last.id : from?.i ?? '',
        d: String(highestTombstone),
        s: new Date().toISOString(),
      }),
      hasMore,
      reset,
      serverTime: new Date().toISOString(),
    };
  }
}
