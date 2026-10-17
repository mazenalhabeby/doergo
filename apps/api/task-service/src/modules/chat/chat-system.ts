import type { ClientProxy } from '@nestjs/microservices';
import type { ChatSystemMeta } from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CHAT_USER_SELECT } from './chat-shape';
import type { ChatCountersService } from './chat-counters.service';
import { emitEvent, chatMembersChangedEvent, chatMessageEvent } from '@hbcfield/shared/microservices';

/** "First Last", for a system line's snapshot of who did what. */
export { personName } from '@hbcfield/shared';

/**
 * A line the system writes into a conversation ("Anna added Karim"). It is a
 * message (kind SYSTEM) so it sits in the history in order and travels the
 * same ways — the socket, the phone's pull — but it is nobody's words: it does
 * not count as unread, raises no push and can never be edited.
 */
export async function writeSystemLine(
  deps: { prisma: PrismaService; notificationClient: ClientProxy; counters: ChatCountersService },
  conversationId: string,
  meta: ChatSystemMeta,
  /** Also told: people who just left the conversation see the line that took them out. */
  alsoTell: string[] = [],
) {
  const message = await deps.prisma.message.create({
    data: { conversationId, senderId: meta.actor.id, kind: 'SYSTEM', meta: meta as any, body: '' },
    include: { sender: CHAT_USER_SELECT },
  });
  const members = await deps.prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const { unread, badge } = await deps.counters.afterSend(conversationId);
  emitEvent(deps.notificationClient, chatMessageEvent, {
    conversationId,
    message,
    recipients: [...new Set([...members.map((m) => m.userId), ...alsoTell])],
    unread,
    badge,
    // Nobody's words: the socket draws it, no push is sent.
    silent: true,
  });
  return message;
}

/**
 * Who is in a conversation changed: the notification service forgets its cached
 * member list (typing, "viewing") and every affected person's list re-reads.
 */
export function announceMembersChanged(
  notificationClient: ClientProxy,
  conversationId: string,
  userIds: string[],
  removedIds: string[] = [],
) {
  emitEvent(notificationClient, chatMembersChangedEvent, {
    conversationId,
    userIds: [...new Set([...userIds, ...removedIds])],
    removedIds,
  });
}
