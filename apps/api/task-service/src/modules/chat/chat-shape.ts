import { mayManageGroup } from '@hbcfield/shared';
/**
 * How a conversation leaves the server, from one viewer's side. Pure, so the
 * list, open and send paths shape a thread the same way.
 */

export const CHAT_USER_SELECT = {
  select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, presence: true },
};

/** A job's chat names its job — read live, so a renamed job renames its chat. */
export const CHAT_TASK_SELECT = { select: { id: true, title: true, status: true } };

/** A list row's preview: the first 140 characters, stored when the message is sent. */
export const CHAT_PREVIEW_CHARS = 140;
export function previewOf(body: string | null | undefined): string {
  return (body ?? '').slice(0, CHAT_PREVIEW_CHARS);
}

/** The stored newest message as the list row's `lastMessage` (no join to messages). */
function storedLastMessage(c: any) {
  if (!c.lastMessageId) return null;
  return {
    id: c.lastMessageId,
    conversationId: c.id,
    senderId: c.lastSenderId,
    body: c.lastMessagePreview ?? '',
    attachments: [],
    createdAt: c.lastMessageAt,
  };
}

/** Shape a conversation from the viewer's perspective (adds otherMember for DMs). */
export function shapeConversation(c: any, viewerId: string, isClosed = false, opts: { managesPeople?: boolean } = {}) {
  const isExternal = !!c.originSpaceId;
  // Across an organization boundary, presence does not travel — the same rule
  // the contacts directory and the typing relay apply. Being reachable for work
  // is not the same as being observable. Marked as well as stripped: the avatar
  // needs to know not to draw a status dot, and "no presence" alone reads as offline.
  const hide = (u: any) => (u && isExternal ? { ...u, presence: null, isExternal: true } : u);
  const members = (c.members ?? []).map((m: any) => hide(m.user)).filter(Boolean);
  const otherMember = c.type === 'DIRECT' ? (members.find((u: any) => u.id !== viewerId) ?? null) : null;
  const mine = (c.members ?? []).find((m: any) => m.userId === viewerId);
  return {
    id: c.id,
    organizationId: c.organizationId,
    type: c.type,
    title: c.title ?? null,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    members,
    otherMember,
    // Tell the reader they are talking to another company. People share
    // different things when they know the person is outside the business —
    // this is a control, not decoration.
    isExternal,
    // The space that held this conversation open is no longer shared, so it
    // accepts no new messages. History stays readable — closed, not deleted.
    isClosed,
    lastMessage: storedLastMessage(c),
    unread: mine?.unreadCount ?? 0,
    mutedUntil: mine?.mutedUntil ?? null,
    createdById: c.createdById,
    task: c.task ? { id: c.task.id, title: c.task.title, status: c.task.status } : null,
    canManage: mayManageGroup(c, viewerId, !!opts.managesPeople),
    // Each member's last read, for "✓✓ Read" / "Seen by N". Across companies a
    // read time is presence by another name, so it does not travel there.
    readAt: isExternal ? {} : Object.fromEntries((c.members ?? []).map((m: any) => [m.userId, m.lastReadAt ?? null])),
  };
}

/** A removed message keeps its place in the thread and loses what it said. */
export function visibleMessage<M extends { deletedAt?: Date | string | null; body?: string; attachments?: unknown }>(
  m: M,
): M {
  return m.deletedAt ? { ...m, body: '', attachments: [] } : m;
}
