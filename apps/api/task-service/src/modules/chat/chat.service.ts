import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { directConversationKey } from '@hbcfield/shared';
import { CHAT_TASK_SELECT, CHAT_USER_SELECT as userSelect, shapeConversation } from './chat-shape';
import { CONVERSATION_LIST_ORDER } from './chat-service-helpers';
import { ChatServiceBase } from './chat-service.base';

export { CONVERSATION_LIST_ORDER } from './chat-service-helpers';

@Injectable()
export class ChatService extends ChatServiceBase {

  // ── contacts directory (who the current user is allowed to message) ─────────
  listContacts(data: { userId: string; organizationId: string }) {
    return this.reach.listContacts(data);
  }

  // ── open (or create) a 1:1 conversation with another member ─────────────────
  async openDirect(data: { organizationId: string; userId: string; otherUserId: string }) {
    if (!data.otherUserId || typeof data.otherUserId !== 'string') {
      throw new NotFoundException('Member not found');
    }
    if (data.userId === data.otherUserId) throw new ForbiddenException('Cannot message yourself');
    // Server-side authorization — recomputed here, never trusted from the client.
    //
    // Two paths. Same org: the ordinary contact rules. Different orgs: a space
    // actively shared between them, which both people work. The cross-org path
    // is tried only when the in-org lookup finds nobody, so the common case
    // costs exactly what it did before.
    const sameOrg = await this.prisma.user.findFirst({
      where: { id: data.otherUserId, organizationId: data.organizationId },
      select: { id: true },
    });

    let originSpaceId: string | null = null;
    let conversationOrgId = data.organizationId;

    if (sameOrg) {
      await this.reach.assertMayContact(data.userId, data.otherUserId, data.organizationId);
    } else {
      // Opening is also where an anchor is chosen or renewed: a thread whose
      // share died can be re-anchored to a share that is still alive, but that
      // is a decision made here, never a side effect of sending.
      const existing = await this.prisma.conversation.findFirst({
        where: { dmKey: directConversationKey(data.userId, data.otherUserId) },
        select: { organizationId: true, originSpaceId: true },
      });
      const resolved = await this.crossOrg.resolveCrossOrgSpace(data.userId, data.otherUserId, existing?.originSpaceId);
      if (!resolved) throw new NotFoundException('Member not found');
      originSpaceId = resolved.spaceId;
      // Anchor the row to the space owner's org so BOTH sides upsert the same
      // conversation — (organizationId, dmKey) is unique, and letting each side
      // use its own org would give the pair two threads that never meet.
      const share = await this.prisma.spaceShare.findFirst({
        where: { spaceId: originSpaceId, status: 'ACTIVE' },
        select: { ownerOrgId: true },
      });
      if (!share) throw new NotFoundException('Member not found');
      conversationOrgId = existing?.organizationId ?? share.ownerOrgId;
    }

    const dmKey = directConversationKey(data.userId, data.otherUserId);
    // Upsert the DM: unique on (organizationId, dmKey) guarantees one thread.
    const conversation = await this.prisma.conversation.upsert({
      where: { organizationId_dmKey: { organizationId: conversationOrgId, dmKey } },
      create: {
        organizationId: conversationOrgId,
        type: 'DIRECT',
        dmKey,
        originSpaceId,
        createdById: data.userId,
        members: { create: [{ userId: data.userId }, { userId: data.otherUserId }] },
      },
      // Renew the anchor when it moved; never clear one that is still good.
      update: originSpaceId ? { originSpaceId } : {},
      include: { members: { include: { user: userSelect } } },
    });
    return { success: true, data: shapeConversation(conversation, data.userId) };
  }

  // ── list my conversations (with last message + unread) ──────────────────────
  // ONE query for the rows: the newest message and each member's unread count
  // are stored on send (chat-counters), so nothing is counted or joined here.
  async listConversations(data: { userId: string; organizationId: string }) {
    const rows = await this.prisma.conversation.findMany({
      where: {
        members: { some: { userId: data.userId } },
        // In-org threads stay org-scoped as defence in depth. Cross-org ones
        // are anchored to the space OWNER's org, so a guest would never see
        // their own conversations under that filter — for those, the
        // membership row IS the grant, and it is only ever created by an
        // authorized open. Listing and reading stay available after a share
        // ends: the thread freezes, it does not vanish.
        OR: [{ organizationId: data.organizationId }, { originSpaceId: { not: null } }],
      },
      orderBy: CONVERSATION_LIST_ORDER,
      take: 100,
      include: { members: { include: { user: userSelect } }, task: CHAT_TASK_SELECT },
    });
    const [closed, over, managesPeople] = await Promise.all([
      this.crossOrg.closedConversationIds(data.userId, rows as any),
      // A job's chat closes when the job is over.
      this.tasks.closedIds(rows),
      // "May rename this group" — asked only when the list holds a group.
      rows.some((r) => r.type === 'GROUP') ? this.reach.managesPeople(data.userId) : Promise.resolve(false),
    ]);
    return {
      data: rows.map((r) => shapeConversation(r, data.userId, closed.has(r.id) || over.has(r.id), { managesPeople })),
    };
  }

  /** The caller's unread total across every thread, for a badge. */
  async badge(data: { userId: string }) {
    return { success: true, data: { total: await this.counters.badge(data.userId) } };
  }
}
