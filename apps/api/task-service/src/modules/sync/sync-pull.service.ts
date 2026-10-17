import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  type SyncPullResponse,
  clampListLimit,
} from '@hbcfield/shared';
import { TASK_LIST_INCLUDE, annotateTracksLocation } from '../tasks/task-list-shape';
import { decodeCursor, pageResponse } from './sync-cursor';
import { MAX_SCOPE_IDS, PullRequest } from './sync-pull-helpers';
import { SyncPullBase } from './sync-pull.base';

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
export class SyncPullService extends SyncPullBase {

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
}
