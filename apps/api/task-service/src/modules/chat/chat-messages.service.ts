import { randomUUID } from 'node:crypto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { clampListLimit, parseHistoryCursor, messagePreview } from '@hbcfield/shared';
import { findPrior } from '../../common/create-once.util';
import { CHAT_USER_SELECT as userSelect, previewOf, visibleMessage } from './chat-shape';
import type { TaskAccessFacts } from '../../common/task-access/task-access.service';
import { ChatServiceBase } from './chat-service.base';
import { emitEvent, chatBadgeEvent, chatMessageEvent, chatReadEvent } from '@hbcfield/shared/microservices';

/** Inside one conversation: its history, sending (with an attachment), marking read, muting. */
@Injectable()
export class ChatMessagesService extends ChatServiceBase {
  // ── message history: a page OLDER than the cursor, newest first then reversed ─
  // The cursor is "createdAt|id" (shared historyCursor), so two messages written
  // in the same millisecond are never skipped or repeated between pages.
  async history(data: {
    conversationId: string;
    userId: string;
    before?: string;
    limit?: number;
    facts?: TaskAccessFacts;
  }) {
    const membership = await this.assertMember(data.conversationId, data.userId);
    // A job's chat: the office reads it only while the job gate still lets them in.
    await this.tasks.assertMayRead(membership, data.facts);
    const limit = clampListLimit(data.limit, 30, 100);
    const cursor = parseHistoryCursor(data.before);
    const older = cursor
      ? cursor.id
        ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }
        : { createdAt: { lt: cursor.at } }
      : {};
    const rows = await this.prisma.message.findMany({
      where: { conversationId: data.conversationId, ...older },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { sender: userSelect },
    });
    const page = await this.files.signMessages(membership.conversation, rows.reverse().map(visibleMessage));
    return { data: page, hasMore: rows.length === limit };
  }

  /** An upload link for one file — only into a thread the caller may still write to. */
  async presignAttachment(data: {
    conversationId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    facts?: TaskAccessFacts;
  }) {
    const membership = await this.assertMember(data.conversationId, data.userId);
    await this.reach.assertStillReachable(membership, data.userId);
    await this.tasks.assertMayWrite(membership, data.facts);
    return { success: true, data: await this.files.presign(membership.conversation, data.fileName, data.mimeType) };
  }

  /** Pushes for one thread off until a moment (or back on with null). Unread still counts. */
  async mute(data: { conversationId: string; userId: string; until: string | null }) {
    const membership = await this.assertMember(data.conversationId, data.userId);
    const until = data.until ? new Date(data.until) : null;
    if (until && (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()))
      throw new BadRequestException('The end of a mute must be in the future');
    await this.prisma.conversationMember.update({ where: { id: membership.id }, data: { mutedUntil: until } });
    return { success: true, data: { mutedUntil: until?.toISOString() ?? null } };
  }

  // ── send a message ──────────────────────────────────────────────────────────
  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    body: string;
    attachments?: unknown[];
    /** Made on the phone: the same message sent twice is one message. */
    id?: string;
    /** When the sender wrote it, for a message sent late from offline. */
    sentAt?: string;
    /** The caller's job-gate facts — asked only in a job's chat. */
    facts?: TaskAccessFacts;
  }) {
    const membership = await this.assertMember(data.conversationId, data.senderId);

    // Already delivered (the answer was lost, or the queue sent it again).
    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.message.findUnique({ where: { id }, include: { sender: userSelect } }),
      isSame: (m) => m.senderId === data.senderId && m.conversationId === data.conversationId,
    });
    if (prior) return { success: true, data: (await this.files.signMessages(membership.conversation, [prior]))[0] };

    // Membership is not permission. It says these two once had a reason to
    // talk; it says nothing about whether they still do. Ask again, every time.
    await this.reach.assertStillReachable(membership, data.senderId);
    // A job's chat: closed once the job is over; the office re-gated.
    await this.tasks.assertMayWrite(membership, data.facts);
    // Only this conversation's files that were really uploaded (chat-files).
    const attachments = await this.files.accept(membership.conversation, data.attachments);
    const body = (data.body ?? '').trim();
    if (!body && attachments.length === 0) throw new BadRequestException('A message needs words or a file');

    const now = new Date();
    // Kept only when it differs from now: the future is refused as a claim, not stored.
    const written = data.sentAt ? new Date(data.sentAt) : null;
    const sentAt =
      written && !Number.isNaN(written.getTime()) && written < now && now.getTime() - written.getTime() > 60_000
        ? written
        : null;
    // The id is known before the write, so the conversation row can name it in the same transaction.
    const messageId = data.id ?? randomUUID();
    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          id: messageId,
          conversationId: data.conversationId,
          senderId: data.senderId,
          body,
          attachments: attachments as any,
          sentAt,
          createdAt: now,
        },
        include: { sender: userSelect },
      }),
      // The list row's newest message, kept here so listing never joins messages.
      this.prisma.conversation.update({
        where: { id: data.conversationId },
        data: {
          lastMessageAt: now,
          lastMessagePreview: previewOf(messagePreview(body, attachments)),
          lastSenderId: data.senderId,
          lastMessageId: messageId,
        },
      }),
      // Sender has read their own message (and everything before it).
      this.prisma.conversationMember.update({
        where: { id: membership.id },
        data: { lastReadAt: now, unreadCount: 0 },
      }),
      // Everyone else has one more unread — one atomic UPDATE, safe under concurrent sends.
      this.prisma.conversationMember.updateMany({
        where: { conversationId: data.conversationId, userId: { not: data.senderId } },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    const [message] = await this.files.signMessages(membership.conversation, [created]);
    // Recipients = the other members. Each receives their OWN numbers, so no
    // screen reloads the list or counts anything to draw a badge.
    const recipients = membership.conversation.members.filter((m) => m.userId !== data.senderId).map((m) => m.userId);
    const { unread, badge } = await this.counters.afterSend(data.conversationId);
    // Members who switched this thread's pushes off: the socket still reaches them, the push does not.
    const muted = (membership.conversation.members as Array<{ userId: string; mutedUntil?: Date | null }>)
      .filter((m) => m.mutedUntil && m.mutedUntil > now)
      .map((m) => m.userId);
    emitEvent(this.notificationClient, chatMessageEvent, {
      muted,
      conversationId: data.conversationId,
      message,
      recipients,
      organizationId: membership.conversation.organizationId,
      unread,
      badge,
    });
    return { success: true, data: message };
  }

  async markRead(data: { conversationId: string; userId: string }) {
    const membership = await this.assertMember(data.conversationId, data.userId);
    const at = new Date();
    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: { lastReadAt: at, unreadCount: 0 },
    });
    /*
      ⚠️ THE ANSWER CARRIES THE TRUE TOTAL, ALWAYS. The read used to answer
      nothing and announce the total only when this thread still had unread
      messages — so a badge that had drifted on a screen (a missed socket event,
      a message removed on the server) was never corrected by reading: the count
      stayed until the app restarted. Now every read returns the caller's total
      and every screen sets its badge from it — the server is the one source.
    */
    const total = await this.counters.badge(data.userId);
    if (membership.unreadCount > 0) {
      // A real change: the reader's other screens drop their badge, the others see "Read".
      emitEvent(this.notificationClient, chatBadgeEvent, { userId: data.userId, total });
      emitEvent(this.notificationClient, chatReadEvent, {
        conversationId: data.conversationId,
        userId: data.userId,
        at: at.toISOString(),
        memberIds: membership.conversation.members.map((m) => m.userId),
      });
    }
    return { success: true, data: { total } };
  }
}
