import { Injectable } from '@nestjs/common';
import {
  SYNC_PULL_MAX_ROWS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  clampListLimit,
  type SyncPullResponse,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { CHAT_USER_SELECT, visibleMessage } from '../chat/chat-shape';
import { decodeCursor, encodeCursor, pageResponse } from './sync-cursor';

/** How far back the phone keeps messages; older ones are read online, page by page. */
export const CHAT_DEVICE_DAYS = 30;

type Req = { userId: string; organizationId: string; cursor?: string | null; limit?: number };

/**
 * Chat for the phone's offline copy (docs/plans/chat-team.md §2.2).
 *
 * ⚠️ The SAME rule as the online screens: conversations are exactly what the
 * conversation list returns (it is called, not copied), and messages are only
 * those of conversations the member is IN — in-org, or held open by a shared
 * space, as the list allows.
 *
 * Files travel as keys only: a signed link lives an hour and a stored one is a
 * leaked one; the thread signs them when it is opened online.
 */
@Injectable()
export class ChatPullReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  /** Every conversation, whole — at most 100 rows, one query, the list's own shape. */
  async conversations(req: Req): Promise<SyncPullResponse> {
    const { data } = await this.chat.listConversations({ userId: req.userId, organizationId: req.organizationId });
    const now = new Date().toISOString();
    return {
      scope: 'chat_conversations',
      rows: data,
      deleted: [],
      cursor: encodeCursor({ t: now, i: '', d: '0', s: now }),
      hasMore: false,
      reset: true,
      serverTime: now,
    };
  }

  /** Messages changed since the cursor (sent, edited or removed), in the member's conversations, last 30 days. */
  async messages(req: Req): Promise<SyncPullResponse> {
    const limit = clampListLimit(req.limit, SYNC_PULL_MAX_ROWS, SYNC_PULL_MAX_ROWS);
    const cursor = decodeCursor(req.cursor);
    const reset = !cursor || Date.parse(cursor.s) < Date.now() - SYNC_TOMBSTONE_RETENTION_DAYS * 86_400_000;
    const from = reset ? null : cursor;
    const after = from
      ? { OR: [{ updatedAt: { gt: new Date(from.t) } }, { updatedAt: new Date(from.t), id: { gt: from.i } }] }
      : {};
    const rows = await this.prisma.message.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - CHAT_DEVICE_DAYS * 86_400_000) },
        conversation: {
          members: { some: { userId: req.userId } },
          OR: [{ organizationId: req.organizationId }, { originSpaceId: { not: null } }],
        },
        ...after,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { sender: CHAT_USER_SELECT },
    });
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows)
      .map((m) => visibleMessage(m))
      .map((m) => ({ ...m, attachments: keysOnly(m.attachments) }));
    // Messages are never hard-deleted (a removal is a row with deletedAt), so there are no tombstones to send.
    return pageResponse('chat_messages', page, [], { from, highestTombstone: from?.d ?? '0', hasMore, reset });
  }
}

/** A file as the phone stores it: everything but a link. */
function keysOnly(attachments: unknown) {
  return Array.isArray(attachments) ? attachments.map(({ url: _url, fileUrl: _f, ...a }: Record<string, unknown>) => a) : [];
}
