import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { SERVICE_NAMES, directConversationKey, canContactColleagues } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveMemberRouting } from '../../common/space-access.util';

type Attachment = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

const userSelect = { select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, presence: true } };

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  // ── contacts directory (who the current user is allowed to message) ─────────
  async listContacts(data: { userId: string; organizationId: string }) {
    const me = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { role: true, enabledModules: true, contactScope: true, contactAllowedIds: true, canManageUsers: true },
    });
    if (!me) throw new NotFoundException('User not found');
    const all = await this.prisma.user.findMany({
      // Exclude external CUSTOMER accounts — member chat is staff-only.
      where: { organizationId: data.organizationId, isActive: true, id: { not: data.userId }, role: { not: 'CUSTOMER' } },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, position: true,
        role: true, contactable: true, canManageUsers: true, presence: true,
      },
      orderBy: [{ firstName: 'asc' }],
    });
    // One resolver shared by every candidate below: resolved server-side (so it
    // can't be spoofed) and at most once, however many people we test.
    const spaceTargets = this.contactTargetsResolver(data.userId, data.organizationId);
    const verdicts = await Promise.all(all.map((u) => this.canReach(me as any, u as any, spaceTargets)));
    return { data: all.filter((_, i) => verdicts[i]) };
  }

  /** User ids `me` may contact via their space(s) — per-member override, else the
   *  space default (holders of a contact role). */
  private myContactTargets(userId: string, organizationId: string): Promise<Set<string>> {
    return resolveMemberRouting(this.prisma, organizationId, userId, 'contact');
  }

  /**
   * Contact-permission rule: may `me` message `target`? Admins/managers reach
   * anyone and are always reachable. Otherwise a member reaches: their
   * space-driven targets (leader roles in a shared space — the new default),
   * plus whatever their `contactScope` allows (ALL = everyone, SELECTED = their
   * allow-list). `contactScope: NONE` (the default) means space targets only.
   * `spaceTargets` is resolved server-side from the caller's OWN spaces, so it
   * can't be spoofed.
   */
  private async canReach(
    me: { role: string; enabledModules: unknown; contactScope: string; contactAllowedIds: string[]; canManageUsers?: boolean },
    target: { id: string; role: string; contactable: boolean; canManageUsers?: boolean },
    // A thunk, not a Set: resolving space targets costs several queries, and
    // most calls are settled by the cheap checks above without ever needing it.
    // See contactTargetsResolver — it resolves at most once, on demand.
    spaceTargets: () => Promise<Set<string>>,
  ): Promise<boolean> {
    // External customers are never part of member chat (neither direction).
    if (me.role === 'CUSTOMER' || target.role === 'CUSTOMER') return false;
    // Admins and managers (canManageUsers) may contact anyone and are always reachable.
    const meIsManager = me.role === 'ADMIN' || me.canManageUsers === true;
    const targetIsManager = target.role === 'ADMIN' || target.canManageUsers === true;
    if (meIsManager) return true;
    if (!canContactColleagues({ enabledModules: me.enabledModules })) return false; // admin disabled messaging
    if (!(target.contactable || targetIsManager)) return false;
    if (me.contactScope === 'ALL') return true;
    // Space-driven: a leader in a space we share is always reachable. Only this
    // branch and SELECTED need the space lookup.
    if ((await spaceTargets()).has(target.id)) return true;
    if (me.contactScope === 'SELECTED') return (me.contactAllowedIds ?? []).includes(target.id);
    return false; // NONE and not a space target
  }

  /**
   * Lazy, memoized space-target resolver for one caller.
   *
   * Resolves at most once and only if the contact rule actually reaches the
   * branch that needs it — so an admin sending a message, or a member whose
   * contactScope is ALL, pays nothing for it.
   */
  private contactTargetsResolver(userId: string, organizationId: string): () => Promise<Set<string>> {
    let cached: Promise<Set<string>> | null = null;
    return () => (cached ??= this.myContactTargets(userId, organizationId));
  }

  /**
   * May `senderId` message `otherUserId` RIGHT NOW? Throws if not.
   *
   * The one place this question is answered, because it has to be asked in two
   * places: when a conversation is opened, and again on every message sent into
   * it. Opening used to be the only check, which meant permission was granted
   * permanently at creation — revoke someone's contact access, or take them out
   * of the space that connected them, and every conversation they already had
   * kept working forever.
   */
  private async assertMayContact(
    senderId: string,
    otherUserId: string,
    organizationId: string,
    deniedMessage = 'You are not allowed to contact this member',
  ) {
    const [me, other] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { role: true, enabledModules: true, contactScope: true, contactAllowedIds: true, canManageUsers: true },
      }),
      this.prisma.user.findFirst({
        where: { id: otherUserId, organizationId },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, role: true, contactable: true, canManageUsers: true },
      }),
    ]);
    // `other.id` must match exactly — findFirst with a bad id could otherwise
    // fall through to an unintended row. Also re-check self by resolved id.
    if (!me || !other || other.id !== otherUserId) throw new NotFoundException('Member not found');
    if (other.id === senderId) throw new ForbiddenException('Cannot message yourself');
    const reachable = await this.canReach(
      me as any,
      other as any,
      this.contactTargetsResolver(senderId, organizationId),
    );
    if (!reachable) throw new ForbiddenException(deniedMessage);
    return other;
  }

  // ── open (or create) a 1:1 conversation with another member ─────────────────
  async openDirect(data: { organizationId: string; userId: string; otherUserId: string }) {
    if (!data.otherUserId || typeof data.otherUserId !== 'string') {
      throw new NotFoundException('Member not found');
    }
    if (data.userId === data.otherUserId) throw new ForbiddenException('Cannot message yourself');
    // Server-side authorization — recomputed here, never trusted from the client.
    await this.assertMayContact(data.userId, data.otherUserId, data.organizationId);

    const dmKey = directConversationKey(data.userId, data.otherUserId);
    // Upsert the DM: unique on (organizationId, dmKey) guarantees one thread.
    const conversation = await this.prisma.conversation.upsert({
      where: { organizationId_dmKey: { organizationId: data.organizationId, dmKey } },
      create: {
        organizationId: data.organizationId,
        type: 'DIRECT',
        dmKey,
        createdById: data.userId,
        members: { create: [{ userId: data.userId }, { userId: data.otherUserId }] },
      },
      update: {},
      include: { members: { include: { user: userSelect } } },
    });
    return { success: true, data: this.shape(conversation, data.userId) };
  }

  // ── list my conversations (with last message + unread) ──────────────────────
  async listConversations(data: { userId: string; organizationId: string }) {
    const rows = await this.prisma.conversation.findMany({
      where: { organizationId: data.organizationId, members: { some: { userId: data.userId } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        members: { include: { user: userSelect } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: userSelect } },
      },
    });

    // Unread per conversation = messages after my lastReadAt, not mine. ONE grouped
    // query (was a per-conversation count fan-out): join messages to my membership
    // row and count those past my lastReadAt (M4). Skipped when I have no threads.
    const convIds = rows.map((r) => r.id);
    const unreadMap = new Map<string, number>();
    if (convIds.length > 0) {
      const unreadRows = await this.prisma.$queryRaw<Array<{ conversationId: string; unread: bigint }>>(Prisma.sql`
        SELECT m."conversationId" AS "conversationId", COUNT(*)::bigint AS unread
        FROM "messages" m
        JOIN "conversation_members" cm
          ON cm."conversationId" = m."conversationId" AND cm."userId" = ${data.userId}
        WHERE m."conversationId" IN (${Prisma.join(convIds)})
          AND m."senderId" <> ${data.userId}
          AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
        GROUP BY m."conversationId"
      `);
      for (const u of unreadRows) unreadMap.set(u.conversationId, Number(u.unread));
    }

    const data2 = rows.map((r) => ({ ...this.shape(r, data.userId), unread: unreadMap.get(r.id) ?? 0 }));
    return { data: data2 };
  }

  // ── message history (paginated, newest first then reversed) ─────────────────
  async history(data: { conversationId: string; userId: string; before?: string; limit?: number }) {
    await this.assertMember(data.conversationId, data.userId);
    const limit = Math.min(Math.max(1, Number(data.limit) || 30), 100);
    const rows = await this.prisma.message.findMany({
      where: { conversationId: data.conversationId, ...(data.before ? { createdAt: { lt: new Date(data.before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: userSelect },
    });
    return { data: rows.reverse(), hasMore: rows.length === limit };
  }

  // ── send a message ──────────────────────────────────────────────────────────
  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    body: string;
    attachments?: Attachment[];
  }) {
    const membership = await this.assertMember(data.conversationId, data.senderId);

    // Membership is not permission. It says these two once had a reason to
    // talk; it says nothing about whether they still do. Ask again, every time.
    await this.assertStillReachable(membership, data.senderId);

    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: data.conversationId,
          senderId: data.senderId,
          body: data.body,
          attachments: (data.attachments ?? []) as any,
        },
        include: { sender: userSelect },
      }),
      this.prisma.conversation.update({ where: { id: data.conversationId }, data: { lastMessageAt: now } }),
      // Sender has read their own message.
      this.prisma.conversationMember.update({ where: { id: membership.id }, data: { lastReadAt: now } }),
    ]);

    // Recipients = the other members. Emit for real-time + push.
    const recipients = membership.conversation.members
      .filter((m) => m.userId !== data.senderId)
      .map((m) => m.userId);
    this.notificationClient.emit('chat_message', {
      conversationId: data.conversationId,
      message,
      recipients,
      organizationId: membership.conversation.organizationId,
    });
    return { success: true, data: message };
  }

  async markRead(data: { conversationId: string; userId: string }) {
    const membership = await this.assertMember(data.conversationId, data.userId);
    await this.prisma.conversationMember.update({ where: { id: membership.id }, data: { lastReadAt: new Date() } });
    return { success: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  /**
   * May the sender still write into this conversation?
   *
   * Reading is deliberately untouched — history stays readable. Losing contact
   * permission ends the conversation; it doesn't retract what was already said,
   * and hiding a record someone has already read is theatre, not security.
   *
   * GROUP threads keep membership as the rule: there is no pair to evaluate,
   * and belonging to the group IS the grant.
   */
  private async assertStillReachable(
    membership: { conversation: { id: string; type: string; organizationId: string; members: { userId: string }[] } },
    senderId: string,
  ) {
    const conversation = membership.conversation;
    if (conversation.type !== 'DIRECT') return;

    const otherId = conversation.members.find((m) => m.userId !== senderId)?.userId;
    // A direct thread with no counterpart is malformed — deny rather than guess.
    if (!otherId) throw new ForbiddenException('This conversation is no longer available');

    await this.assertMayContact(
      senderId,
      otherId,
      conversation.organizationId,
      'You can no longer message this member',
    );
  }

  private async assertMember(conversationId: string, userId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: { include: { members: true } } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this conversation');
    return membership;
  }

  /** Shape a conversation from the viewer's perspective (adds otherMember for DMs). */
  private shape(c: any, viewerId: string) {
    const members = (c.members ?? []).map((m: any) => m.user).filter(Boolean);
    const otherMember = c.type === 'DIRECT' ? members.find((u: any) => u.id !== viewerId) ?? null : null;
    return {
      id: c.id,
      organizationId: c.organizationId,
      type: c.type,
      title: c.title ?? null,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      members,
      otherMember,
      lastMessage: c.messages?.[0] ?? null,
    };
  }
}
