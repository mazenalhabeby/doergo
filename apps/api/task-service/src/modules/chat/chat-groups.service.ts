import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CHAT_CODES,
  CHAT_GROUP_MAX_MEMBERS,
  SERVICE_NAMES,
  mayManageGroup,
  parseGroupTitle,
  personNameOf,
  personBrief,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { CHAT_USER_SELECT, shapeConversation } from './chat-shape';
import { findMembership } from './chat-membership';
import { ChatReachService } from './chat-reach.service';
import { ChatCountersService } from './chat-counters.service';
import { announceMembersChanged, personName, writeSystemLine } from './chat-system';
import type { ChatActorMessage } from '@hbcfield/shared/microservices';

type Actor = ChatActorMessage;

/**
 * Groups (docs/plans/chat-team.md phase 3, D3).
 *
 * ⚠️ A group is never a way round the contact rules: the person starting it,
 * or adding to it, must be allowed to message EVERY person they put in it
 * (ChatReachService.assertMayAddToGroup), asked at that moment. Who may start
 * one: managers and leaders. Who may rename, add or remove: its creator, or
 * somebody who manages people org-wide. Anybody may leave.
 *
 * Every change writes a SYSTEM line into the history and tells the
 * notification service the member list moved (typing, "viewing", each
 * person's list). Same organization only.
 */
@Injectable()
export class ChatGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly reach: ChatReachService,
    private readonly counters: ChatCountersService,
  ) {}

  private get deps() {
    return { prisma: this.prisma, notificationClient: this.notificationClient, counters: this.counters };
  }

  async create(data: Actor & { title: unknown; memberIds: unknown }) {
    const title = parseGroupTitle(data.title);
    if (!title) throw new BadRequestException({ message: 'A group needs a name', code: CHAT_CODES.GROUP_TITLE });
    const ids = uniqueIds(data.memberIds).filter((id) => id !== data.userId);
    if (ids.length === 0)
      throw new BadRequestException({ message: 'Choose at least one person', code: CHAT_CODES.GROUP_TOO_BIG });
    if (ids.length + 1 > CHAT_GROUP_MAX_MEMBERS) {
      throw new BadRequestException({
        message: `A group holds at most ${CHAT_GROUP_MAX_MEMBERS} people`,
        code: CHAT_CODES.GROUP_TOO_BIG,
      });
    }
    if (!(await this.reach.mayCreateGroup(data.userId))) {
      throw new ForbiddenException({
        message: 'Only managers and leaders can start a group',
        code: CHAT_CODES.GROUP_NOT_ALLOWED,
      });
    }
    const people = await this.reach.assertMayAddToGroup(data.userId, data.organizationId, ids);
    const me = await personBrief(this.prisma, data.userId);

    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId: data.organizationId,
        type: 'GROUP',
        title,
        createdById: data.userId,
        // Sorted with the newest threads, not under every thread with a message.
        lastMessageAt: new Date(),
        members: {
          create: [
            { userId: data.userId, joinedVia: 'OPENED' },
            ...ids.map((userId) => ({ userId, joinedVia: 'ADDED' as const })),
          ],
        },
      },
      select: { id: true },
    });
    await writeSystemLine(this.deps, conversation.id, {
      event: 'CREATED',
      actor: { id: data.userId, name: personName(me) },
      users: people.map((p) => ({ id: p.id, name: personName(p) })),
      title,
    });
    announceMembersChanged(this.notificationClient, conversation.id, [data.userId, ...ids]);
    return { success: true, data: await this.shaped(conversation.id, data.userId) };
  }

  async rename(data: Actor & { conversationId: string; title: unknown }) {
    const { membership, me } = await this.mayManage(data);
    const title = parseGroupTitle(data.title);
    if (!title) throw new BadRequestException({ message: 'A group needs a name', code: CHAT_CODES.GROUP_TITLE });
    if (title === membership.conversation.title)
      return { success: true, data: await this.shaped(data.conversationId, data.userId) };
    await this.prisma.conversation.update({ where: { id: data.conversationId }, data: { title } });
    await writeSystemLine(this.deps, data.conversationId, { event: 'RENAMED', actor: me, title });
    announceMembersChanged(this.notificationClient, data.conversationId, memberIds(membership));
    return { success: true, data: await this.shaped(data.conversationId, data.userId) };
  }

  async addMembers(data: Actor & { conversationId: string; userIds: unknown }) {
    const { membership, me } = await this.mayManage(data);
    const present = new Set(memberIds(membership));
    const ids = uniqueIds(data.userIds).filter((id) => !present.has(id));
    if (ids.length === 0) return { success: true, data: await this.shaped(data.conversationId, data.userId) };
    if (present.size + ids.length > CHAT_GROUP_MAX_MEMBERS) {
      throw new BadRequestException({
        message: `A group holds at most ${CHAT_GROUP_MAX_MEMBERS} people`,
        code: CHAT_CODES.GROUP_TOO_BIG,
      });
    }
    const people = await this.reach.assertMayAddToGroup(data.userId, membership.conversation.organizationId, ids);
    await this.prisma.conversationMember.createMany({
      data: ids.map((userId) => ({ conversationId: data.conversationId, userId, joinedVia: 'ADDED' as const })),
      skipDuplicates: true,
    });
    await writeSystemLine(this.deps, data.conversationId, {
      event: 'ADDED',
      actor: me,
      users: people.map((p) => ({ id: p.id, name: personName(p) })),
    });
    announceMembersChanged(this.notificationClient, data.conversationId, [...present, ...ids]);
    return { success: true, data: await this.shaped(data.conversationId, data.userId) };
  }

  async removeMember(data: Actor & { conversationId: string; targetId: string }) {
    if (data.targetId === data.userId) return this.leave(data);
    const { membership, me } = await this.mayManage(data);
    const target = membership.conversation.members.find((m) => m.userId === data.targetId);
    if (!target) throw new NotFoundException('Member not found');
    const person = await personNameOf(this.prisma, data.targetId);
    await this.prisma.conversationMember.delete({ where: { id: target.id } });
    await this.handOverIfCreatorLeft(membership.conversation, data.targetId);
    await writeSystemLine(
      this.deps,
      data.conversationId,
      { event: 'REMOVED', actor: me, users: [{ id: data.targetId, name: personName(person) }] },
      [data.targetId],
    );
    announceMembersChanged(this.notificationClient, data.conversationId, memberIds(membership), [data.targetId]);
    return { success: true, data: await this.shaped(data.conversationId, data.userId) };
  }

  /** Anybody may leave a group. Their words stay; the group goes from their list. */
  async leave(data: Actor & { conversationId: string }) {
    const membership = await this.groupMembership(data.conversationId, data.userId);
    const me = await personBrief(this.prisma, data.userId);
    await this.prisma.conversationMember.delete({ where: { id: membership.id } });
    await this.handOverIfCreatorLeft(membership.conversation, data.userId);
    await writeSystemLine(
      this.deps,
      data.conversationId,
      { event: 'LEFT', actor: { id: data.userId, name: personName(me) } },
      [data.userId],
    );
    announceMembersChanged(this.notificationClient, data.conversationId, memberIds(membership), [data.userId]);
    return { success: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  /**
   * The creator left: the person who has been in it longest manages it now, so
   * a group never ends up with nobody but an org manager able to rename it.
   */
  private async handOverIfCreatorLeft(conversation: { id: string; createdById: string }, leftId: string) {
    if (conversation.createdById !== leftId) return;
    const next = await this.prisma.conversationMember.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (next)
      await this.prisma.conversation.update({ where: { id: conversation.id }, data: { createdById: next.userId } });
  }

  /** The caller's membership of a GROUP. Not a member, or not a group: 404 — a refusal confirms nothing. */
  private async groupMembership(conversationId: string, userId: string) {
    const membership = await findMembership(this.prisma, conversationId, userId).catch(() => null);
    if (!membership || membership.conversation.type !== 'GROUP') throw new NotFoundException('Conversation not found');
    return membership;
  }

  /** A member of the group who may manage it, and still writes in chat. 403 inside the group, 404 outside. */
  private async mayManage(data: Actor & { conversationId: string }) {
    const membership = await this.groupMembership(data.conversationId, data.userId);
    const managesPeople = await this.reach.managesPeople(data.userId);
    if (!mayManageGroup(membership.conversation, data.userId, managesPeople)) {
      throw new ForbiddenException({
        message: 'Only the person who started this group, or a manager, can change it',
        code: CHAT_CODES.GROUP_NOT_ALLOWED,
      });
    }
    // Changing a group is writing in it: "off means off" holds here too.
    await this.reach.assertStillReachable(membership, data.userId);
    const me = await personNameOf(this.prisma, data.userId);
    return { membership, me: { id: data.userId, name: personName(me) } };
  }

  private async shaped(conversationId: string, viewerId: string) {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { user: CHAT_USER_SELECT } } },
    });
    const managesPeople = await this.reach.managesPeople(viewerId);
    // The conversation was just written by this request, so the row exists.
    return shapeConversation(row!, viewerId, false, { managesPeople });
  }
}

function uniqueIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))]
    : [];
}

function memberIds(membership: { conversation: { members: { userId: string }[] } }): string[] {
  return membership.conversation.members.map((m) => m.userId);
}
