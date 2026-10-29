import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  type SyncPullResponse,
  clampListLimit,
  activeAssignmentWhere,
  type SyncMediaLink,
  PrismaService,
} from '@hbcfield/shared';
import { type TaskVisibilityFacts } from '../tasks/core/task-visibility';
import { TASK_LIST_INCLUDE, annotateTracksLocation } from '../tasks/core/task-list-shape';
import { decodeCursor, encodeCursor, pageResponse } from './sync-cursor';
import { MAX_SCOPE_IDS, PullRequest, tasksInScope } from './sync-pull-helpers';
import { WorkflowConfigCache } from '../workflows/config-cache/workflow-config-cache.service';
import { ChatPullReader } from './chat-pull.reader';
import { TaskChildrenReader } from './task-children.reader';

export { decodeCursor, encodeCursor } from './sync-cursor';

export { type PullRequest } from './sync-pull-helpers';

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
    private readonly chat: ChatPullReader,
    private readonly children: TaskChildrenReader,
  ) {}

  /** Short-lived links to task photos for offline viewing — see TaskChildrenReader.mediaLinks. */
  mediaLinks(req: TaskVisibilityFacts & { ids: string[] }): Promise<SyncMediaLink[]> {
    return this.children.mediaLinks(req);
  }

  async pull(req: PullRequest): Promise<SyncPullResponse> {
    switch (req.scope) {
      case 'spaces':
        return this.spaces(req);
      case 'tasks':
        return this.tasks(req);
      case 'workflows':
        return this.workflowScope(req);
      case 'comments':
        return this.children.pull(req, 'comments');
      case 'attachments':
        return this.children.pull(req, 'attachments');
      case 'chat_conversations':
        return this.chat.conversations(req);
      case 'chat_messages':
        return this.chat.messages(req);
      default:
        throw new BadRequestException('Unknown sync scope');
    }
  }

  private async tasks(req: PullRequest): Promise<SyncPullResponse> {
    const limit = clampListLimit(req.limit, SYNC_PULL_MAX_ROWS, SYNC_PULL_MAX_ROWS);
    const cursor = decodeCursor(req.cursor);
    const retentionEdge = Date.now() - SYNC_TOMBSTONE_RETENTION_DAYS * 86_400_000;
    // A cursor from before the tombstone window may have missed a deletion.
    const reset = !cursor || Date.parse(cursor.s) < retentionEdge;
    const from = reset ? null : cursor;

    const inScope = tasksInScope(req);

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
    const page = await annotateTracksLocation(this.prisma, hasMore ? rows.slice(0, limit) : rows, (orgId, id) =>
      this.workflows.getWorkflow(orgId, id),
    );

    // Deletions since the last pull. A reset sends none: the phone is replacing
    // the scope wholesale, and `scopeIds` below settles membership.
    const tombstoneFrom = from ? BigInt(from.d) : null;
    const tombstones =
      tombstoneFrom === null
        ? []
        : await this.prisma.syncTombstone.findMany({
            where: { id: { gt: tombstoneFrom }, entity: 'tasks', organizationId: req.organizationId },
            orderBy: { id: 'asc' },
            take: 5000,
            select: { id: true, entityId: true },
          });
    const highestTombstone =
      tombstoneFrom === null
        ? ((await this.prisma.syncTombstone.aggregate({ _max: { id: true } }))._max.id ?? BigInt(0))
        : (tombstones.at(-1)?.id ?? tombstoneFrom);

    // On the last page, the complete membership of the scope.
    let scopeIds: string[] | undefined;
    if (!hasMore) {
      const ids = await this.prisma.task.findMany({ where: inScope, select: { id: true }, take: MAX_SCOPE_IDS });
      scopeIds = ids.map((r) => r.id);
    }

    return {
      ...pageResponse(
        'tasks',
        page,
        tombstones.map((t) => t.entityId),
        { from, highestTombstone, hasMore, reset },
      ),
      scopeIds,
    };
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
            id: true,
            name: true,
            address: true,
            lat: true,
            lng: true,
            geofenceRadius: true,
            geofencePolygon: true,
            geofencePolicy: true,
            timezone: true,
            workModel: true,
            kind: true,
            isRemote: true,
            updatedAt: true,
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
