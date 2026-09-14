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
import { TASK_LIST_INCLUDE, annotateTracksLocation } from '../tasks/task-list-shape';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
  ) {}

  async pull(req: PullRequest): Promise<SyncPullResponse> {
    switch (req.scope) {
      case 'spaces':
        return this.spaces(req);
      case 'tasks':
        return this.tasks(req);
      case 'workflows':
        return this.workflowScope(req);
      case 'comments':
        return this.taskChildren(req, 'comments');
      case 'attachments':
        return this.taskChildren(req, 'attachments');
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

    const inScope = this.tasksInScope(req);

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
      // The list endpoint's own shape — see task-list-shape.ts.
      include: TASK_LIST_INCLUDE,
    });
    const hasMore = rows.length > limit;
    const page = await annotateTracksLocation(hasMore ? rows.slice(0, limit) : rows, (id) =>
      this.workflows.getWorkflow(req.organizationId, id),
    );

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

  /** The tasks a member keeps offline: visible to them, open or recently closed. */
  private tasksInScope(req: TaskVisibilityFacts) {
    const visibility = buildTaskVisibilityWhere(req);
    const windowStart = new Date(Date.now() - CLOSED_TASK_WINDOW_DAYS * 86_400_000);
    return {
      organizationId: visibility.organizationId,
      AND: [
        ...(visibility.AND ?? []),
        { OR: [{ status: { notIn: FINISHED } }, { updatedAt: { gte: windowStart } }] },
      ],
    };
  }

  /**
   * Notes and photo records for the tasks in scope — what a task opened in a
   * basement shows under its title.
   *
   * ⚠️ Scoped by a JOIN to the same task scope, never by a list of ids sent
   * back and forth: a member's copy of a comment is exactly as wide as their
   * copy of its task.
   *
   * Photos come WITHOUT a link. Signed links expire within the hour, so a stored
   * one would be dead by the time it is needed; the phone asks for fresh links
   * when online and shows cached images by attachment id when not.
   */
  private async taskChildren(req: PullRequest, scope: 'comments' | 'attachments'): Promise<SyncPullResponse> {
    const limit = Math.min(Math.max(Number(req.limit) || SYNC_PULL_MAX_ROWS, 1), SYNC_PULL_MAX_ROWS);
    const cursor = decodeCursor(req.cursor);
    const retentionEdge = Date.now() - SYNC_TOMBSTONE_RETENTION_DAYS * 86_400_000;
    const reset = !cursor || Date.parse(cursor.s) < retentionEdge;
    const from = reset ? null : cursor;
    const taskScope = this.tasksInScope(req);
    const after = from
      ? { OR: [{ updatedAt: { gt: new Date(from.t) } }, { updatedAt: new Date(from.t), id: { gt: from.i } }] }
      : {};

    const rows: { id: string; updatedAt: Date; taskId: string }[] =
      scope === 'comments'
        ? await this.prisma.comment.findMany({
            where: { task: taskScope, ...after },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
            select: {
              id: true, taskId: true, content: true, createdAt: true, updatedAt: true,
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            },
          })
        : await this.prisma.attachment.findMany({
            where: { task: taskScope, ...after },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
            select: {
              id: true, taskId: true, fileName: true, fileType: true, mimeType: true, fileSize: true,
              uploadedById: true, createdAt: true, updatedAt: true,
            },
          });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const tombstoneFrom = from ? BigInt(from.d) : null;
    let deleted: string[] = [];
    let highestTombstone: bigint;
    if (tombstoneFrom === null) {
      highestTombstone = (await this.prisma.syncTombstone.aggregate({ _max: { id: true } }))._max.id ?? BigInt(0);
    } else {
      const tombstones = await this.prisma.syncTombstone.findMany({
        where: { id: { gt: tombstoneFrom }, entity: scope },
        orderBy: { id: 'asc' },
        take: 5000,
        select: { id: true, entityId: true, parentId: true },
      });
      // Only deletions under a task this member keeps; ids alone, never content.
      const parents = [...new Set(tombstones.map((t) => t.parentId).filter((p): p is string => !!p))];
      const visible = parents.length
        ? new Set((await this.prisma.task.findMany({ where: { id: { in: parents }, ...taskScope }, select: { id: true } })).map((t) => t.id))
        : new Set<string>();
      deleted = tombstones.filter((t) => t.parentId && visible.has(t.parentId)).map((t) => t.entityId);
      highestTombstone = tombstones.at(-1)?.id ?? tombstoneFrom;
    }

    const last = page.at(-1);
    return {
      scope,
      rows: page,
      deleted,
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

  /**
   * The organization's task flows with their statuses and transitions — what
   * the task screen needs to offer the right next step with no connection.
   * Read from the same cache the server's own transition check uses. Small,
   * always sent whole.
   */
  private async workflowScope(req: PullRequest): Promise<SyncPullResponse> {
    const rows = (await this.workflows.getOrgWorkflows(req.organizationId)) as { id: string }[];
    const now = new Date().toISOString();
    return {
      scope: 'workflows',
      rows,
      deleted: [],
      cursor: encodeCursor({ t: now, i: '', d: '0', s: now }),
      hasMore: false,
      reset: true,
      serverTime: now,
    };
  }
}
