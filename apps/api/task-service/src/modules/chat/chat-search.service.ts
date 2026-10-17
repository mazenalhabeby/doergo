import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHAT_CODES, chatSearchQuery, clampListLimit, parseHistoryCursor } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CHAT_TASK_SELECT, CHAT_USER_SELECT, shapeConversation } from './chat-shape';

/**
 * Words in the caller's OWN conversations (docs/plans/chat-team.md phase 3).
 *
 * ⚠️ Membership is joined in the query itself — a conversation the caller is
 * not in can never contribute a row, so there is nothing to filter afterwards
 * and nothing to leak through a count. Removed messages and system lines are
 * never found. The same org rule as the list: in-org, or held open by a
 * shared space.
 *
 * The index is a generated `tsvector` ('simple', no stemming — one behaviour
 * in every language) with a GIN index; every typed word must appear, each as a
 * prefix (`chatSearchQuery`). Paged newest first by (createdAt, id).
 */
@Injectable()
export class ChatSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(data: { userId: string; organizationId: string; q: unknown; before?: string; limit?: unknown }) {
    const query = chatSearchQuery(data.q);
    if (!query) throw new BadRequestException({ message: 'Type a word to search for', code: CHAT_CODES.SEARCH_EMPTY });
    const limit = clampListLimit(data.limit, 30, 50);
    const cursor = parseHistoryCursor(data.before);
    const older = cursor
      ? cursor.id
        ? Prisma.sql`AND (m."createdAt" < ${cursor.at} OR (m."createdAt" = ${cursor.at} AND m.id < ${cursor.id}))`
        : Prisma.sql`AND m."createdAt" < ${cursor.at}`
      : Prisma.empty;

    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT m.id
      FROM messages m
      JOIN conversation_members cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${data.userId}
      JOIN conversations c ON c.id = m."conversationId"
      WHERE m.search @@ to_tsquery('simple', ${query})
        AND m."deletedAt" IS NULL
        AND m.kind = 'TEXT'
        AND (c."organizationId" = ${data.organizationId} OR c."originSpaceId" IS NOT NULL)
        ${older}
      ORDER BY m."createdAt" DESC, m.id DESC
      LIMIT ${limit}
    `);
    if (ids.length === 0) return { data: [], hasMore: false };

    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: {
        sender: CHAT_USER_SELECT,
        conversation: { include: { members: { include: { user: CHAT_USER_SELECT } }, task: CHAT_TASK_SELECT } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const hits = ids
      .map((r) => byId.get(r.id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map(({ conversation, ...message }) => {
        const c = shapeConversation(conversation, data.userId);
        return {
          // Words only: a file's link is signed when its thread is opened.
          message: { ...message, attachments: [] },
          conversation: {
            id: c.id,
            type: c.type,
            title: c.title,
            otherMember: c.otherMember,
            task: c.task,
            isExternal: c.isExternal,
          },
        };
      });
    return { data: hits, hasMore: ids.length === limit };
  }
}
