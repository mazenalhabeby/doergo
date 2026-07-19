import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, directConversationKey, canContactColleagues } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

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
      where: { organizationId: data.organizationId, isActive: true, id: { not: data.userId } },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, position: true,
        role: true, contactable: true, canManageUsers: true, presence: true,
      },
      orderBy: [{ firstName: 'asc' }],
    });
    const reachable = all.filter((u) => this.canReach(me as any, u as any));
    return { data: reachable };
  }

  /**
   * Contact-permission rule: may `me` message `target`? Open within the org by
   * default (defaults are contactable:true / contactScope:ALL / canContact:≠false),
   * so anyone can message anyone. Admins restrict via the Access Builder:
   * `canContact:false` blocks a member from messaging at all, `contactable:false`
   * hides a member from being reached, and `contactScope: NONE | SELECTED` limits
   * who a member may reach. Admins are always reachable and may reach anyone.
   */
  private canReach(
    me: { role: string; enabledModules: unknown; contactScope: string; contactAllowedIds: string[]; canManageUsers?: boolean },
    target: { id: string; role: string; contactable: boolean; canManageUsers?: boolean },
  ): boolean {
    // Admins and managers (canManageUsers) may contact anyone and are always reachable.
    const meIsManager = me.role === 'ADMIN' || me.canManageUsers === true;
    const targetIsManager = target.role === 'ADMIN' || target.canManageUsers === true;
    if (meIsManager) return true;
    if (!canContactColleagues({ enabledModules: me.enabledModules })) return false; // admin disabled messaging
    if (!(target.contactable || targetIsManager)) return false;
    if (me.contactScope === 'NONE') return false;
    if (me.contactScope === 'SELECTED') return (me.contactAllowedIds ?? []).includes(target.id);
    return true; // ALL
  }

  // ── open (or create) a 1:1 conversation with another member ─────────────────
  async openDirect(data: { organizationId: string; userId: string; otherUserId: string }) {
    if (!data.otherUserId || typeof data.otherUserId !== 'string') {
      throw new NotFoundException('Member not found');
    }
    if (data.userId === data.otherUserId) throw new ForbiddenException('Cannot message yourself');
    const [me, other] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { role: true, enabledModules: true, contactScope: true, contactAllowedIds: true, canManageUsers: true },
      }),
      this.prisma.user.findFirst({
        where: { id: data.otherUserId, organizationId: data.organizationId },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, role: true, contactable: true, canManageUsers: true },
      }),
    ]);
    // `other.id` must match exactly — findFirst with a bad id could otherwise fall
    // through to an unintended row. Also re-check self by resolved id.
    if (!me || !other || other.id !== data.otherUserId) throw new NotFoundException('Member not found');
    if (other.id === data.userId) throw new ForbiddenException('Cannot message yourself');
    if (!this.canReach(me as any, other as any)) {
      throw new ForbiddenException('You are not allowed to contact this member');
    }

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

    // Unread per conversation = messages after my lastReadAt, not mine. One query.
    const myMemberships = await this.prisma.conversationMember.findMany({
      where: { userId: data.userId, conversationId: { in: rows.map((r) => r.id) } },
      select: { conversationId: true, lastReadAt: true },
    });
    const readMap = new Map(myMemberships.map((m) => [m.conversationId, m.lastReadAt]));
    const unread = await Promise.all(
      rows.map((r) =>
        this.prisma.message.count({
          where: {
            conversationId: r.id,
            senderId: { not: data.userId },
            ...(readMap.get(r.id) ? { createdAt: { gt: readMap.get(r.id)! } } : {}),
          },
        }),
      ),
    );

    const data2 = rows.map((r, i) => ({ ...this.shape(r, data.userId), unread: unread[i] }));
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
