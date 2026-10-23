import { Injectable } from '@nestjs/common';
import {
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  SYNC_MEDIA_LINKS_MAX,
  type SyncMediaLink,
  type SyncPullResponse,
  clampListLimit,
  PrismaService,
} from '@hbcfield/shared';
import { type TaskVisibilityFacts } from '../tasks/core/task-visibility';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { decodeCursor, pageResponse } from './sync-cursor';
import { PullRequest, tasksInScope } from './sync-pull-helpers';

/** What hangs under the tasks a member keeps offline: notes, photo records, and fresh links to the photos. */
@Injectable()
export class TaskChildrenReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaSigner,
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
        task: tasksInScope(req),
        OR: [{ mimeType: { startsWith: 'image/' } }, { fileType: 'IMAGE' }],
      },
      select: { id: true, fileKey: true, fileUrl: true, fileName: true, mimeType: true },
    });
    const signed = await this.media.signAll(rows);
    return signed.filter((r) => r.url).map((r) => ({ id: r.id, url: r.url!, mimeType: r.mimeType ?? null }));
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
  async pull(req: PullRequest, scope: 'comments' | 'attachments'): Promise<SyncPullResponse> {
    const limit = clampListLimit(req.limit, SYNC_PULL_MAX_ROWS, SYNC_PULL_MAX_ROWS);
    const cursor = decodeCursor(req.cursor);
    const retentionEdge = Date.now() - SYNC_TOMBSTONE_RETENTION_DAYS * 86_400_000;
    const reset = !cursor || Date.parse(cursor.s) < retentionEdge;
    const from = reset ? null : cursor;
    const taskScope = tasksInScope(req);
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
}
