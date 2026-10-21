import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';

/** Each member's unread count for one thread, and their total across all threads. */
export interface UnreadAfterSend {
  unread: Record<string, number>;
  badge: Record<string, number>;
}

/**
 * The unread counters, read. They are WRITTEN inside the send and read
 * transactions (ChatService), so this only answers "what are they now" — two
 * indexed reads per message, whatever the history length, instead of counting
 * message rows on every list request.
 */
@Injectable()
export class ChatCountersService {
  constructor(private readonly prisma: PrismaService) {}

  /** One person's unread total — the badge. Sums at most one row per thread they are in. */
  async badge(userId: string): Promise<number> {
    const r = await this.prisma.conversationMember.aggregate({ where: { userId }, _sum: { unreadCount: true } });
    return r._sum.unreadCount ?? 0;
  }

  /** After a send: every member's count for this thread and their new total, for the socket. */
  async afterSend(conversationId: string): Promise<UnreadAfterSend> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, unreadCount: true },
    });
    const userIds = rows.map((r) => r.userId);
    const totals = userIds.length
      ? await this.prisma.conversationMember.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _sum: { unreadCount: true },
        })
      : [];
    const unread: Record<string, number> = {};
    for (const r of rows) unread[r.userId] = r.unreadCount;
    const badge: Record<string, number> = {};
    for (const t of totals) badge[t.userId] = t._sum.unreadCount ?? 0;
    return { unread, badge };
  }
}
