import { Injectable } from '@nestjs/common';
import {
  activeAssignmentWhere,
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  SYNC_MEDIA_LINKS_MAX,
  type SyncMediaLink,
  type SyncPullResponse,
  clampListLimit,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildTaskVisibilityWhere, type TaskVisibilityFacts } from '../tasks/task-visibility';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { decodeCursor, encodeCursor, pageResponse } from './sync-cursor';
import { ChatPullReader } from './chat-pull.reader';
import { CLOSED_TASK_WINDOW_DAYS, FINISHED, PullRequest } from './sync-pull-helpers';

/** Reading the rows a phone pulls — moved here unchanged from sync-pull.service.ts. */
@Injectable()
export abstract class SyncPullBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflows: WorkflowConfigCache,
    protected readonly media: MediaSigner,
    protected readonly chat: ChatPullReader,
  ) {}

  /**
   * Short-lived links to task photos, for the phone to keep for offline viewing.
   *
   * Pulled attachments carry no URL on purpose — a link lives an hour and a
   * stored one is a leaked one. The phone asks here for the images it does not
   * have yet, on Wi-Fi, and downloads them. Only images, and only on tasks this
   * member can see: the ids come from the phone and are filtered by the same
   * visibility the pull uses, so asking for somebody else's photo returns
   * nothing rather than an error that confirms it exists.
   */
  async mediaLinks(req: TaskVisibilityFacts & { ids: string[] }): Promise<SyncMediaLink[]> {
    const ids = [...new Set((req.ids ?? []).filter((id) => typeof id === 'string'))].slice(0, SYNC_MEDIA_LINKS_MAX);
    if (!ids.length) return [];
    const rows = await this.prisma.attachment.findMany({
      where: {
        id: { in: ids },
        task: this.tasksInScope(req),
        OR: [{ mimeType: { startsWith: 'image/' } }, { fileType: 'IMAGE' }],
      },
      select: { id: true, fileKey: true, fileUrl: true, fileName: true, mimeType: true },
    });
    const signed = await this.media.signAll(rows);
    return signed.filter((r) => r.url).map((r) => ({ id: r.id, url: r.url!, mimeType: r.mimeType ?? null }));
  }

  /**
   * Workspaces the member is assigned to right now, with everything the phone
   * needs to decide a clock-in offline: coordinates, radius, drawn boundary,
   * policy, timezone. Small, so always sent whole.
   */
  protected async spaces(req: PullRequest): Promise<SyncPullResponse> {
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

  /** The tasks a member keeps offline: visible to them, open or recently closed. */
  protected tasksInScope(req: TaskVisibilityFacts) {
    const visibility = buildTaskVisibilityWhere(req);
    const windowStart = new Date(Date.now() - CLOSED_TASK_WINDOW_DAYS * 86_400_000);
    return {
      organizationId: visibility.organizationId,
      AND: [...(visibility.AND ?? []), { OR: [{ status: { notIn: FINISHED } }, { updatedAt: { gte: windowStart } }] }],
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
  protected async taskChildren(req: PullRequest, scope: 'comments' | 'attachments'): Promise<SyncPullResponse> {
    const limit = clampListLimit(req.limit, SYNC_PULL_MAX_ROWS, SYNC_PULL_MAX_ROWS);
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
              id: true,
              taskId: true,
              content: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            },
          })
        : await this.prisma.attachment.findMany({
            where: { task: taskScope, ...after },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
            select: {
              id: true,
              taskId: true,
              fileName: true,
              fileType: true,
              mimeType: true,
              fileSize: true,
              uploadedById: true,
              createdAt: true,
              updatedAt: true,
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
        ? new Set(
            (
              await this.prisma.task.findMany({ where: { id: { in: parents }, ...taskScope }, select: { id: true } })
            ).map((t) => t.id),
          )
        : new Set<string>();
      deleted = tombstones.filter((t) => t.parentId && visible.has(t.parentId)).map((t) => t.entityId);
      highestTombstone = tombstones.at(-1)?.id ?? tombstoneFrom;
    }

    return pageResponse(scope, page, deleted, { from, highestTombstone, hasMore, reset });
  }

  /**
   * The organization's task flows with their statuses and transitions — what
   * the task screen needs to offer the right next step with no connection.
   * Read from the same cache the server's own transition check uses. Small,
   * always sent whole.
   */
  protected async workflowScope(req: PullRequest): Promise<SyncPullResponse> {
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
