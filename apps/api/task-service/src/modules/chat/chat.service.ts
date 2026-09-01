import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  SERVICE_NAMES,
  directConversationKey,
  canContactColleagues,
  resolveCrossOrgChatSpace,
  isCrossOrgConversationLive,
  type ChatParty,
  type ChatShareFacts,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveMemberRouting } from '@hbcfield/shared';

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
    const reachable: any[] = all.filter((_, i) => verdicts[i]);

    // Colleagues at other companies, reachable through an actively shared space
    // both of us work. Marked external so the directory never blurs the line
    // between a coworker and someone at another business.
    const external = await this.crossOrgContacts(data.userId);
    return { data: [...reachable, ...external] };
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

    /*
      The Messaging switch is absolute, and is tested BEFORE the manager bypass.

      It used to come after, which made "remove this member from chat entirely"
      untrue in both directions: an admin or any canManageUsers holder still
      reached a member who had been switched off, and a manager who switched
      their own messaging off stayed reachable regardless (the `targetIsManager`
      escape). The control muted a member toward their peers and nothing more —
      an admin who used it to take someone out of chat had not done that.

      Off now means off. It is the admin's own setting, defaults to on, and they
      can turn it back on; a switch that half works is worse than either answer.
    */
    if (!canContactColleagues({ enabledModules: me.enabledModules })) return false;
    if (!target.contactable) return false;

    // Admins and managers (canManageUsers) reach anyone who is IN chat, with no
    // shared space or allow-list entry needed.
    if (me.role === 'ADMIN' || me.canManageUsers === true) return true;
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
   * People at other organizations this user may message.
   *
   * Only from spaces they are actually assigned to, and only where an ACTIVE
   * share exposes workers — so the directory can never widen beyond what the
   * space owner agreed to. Costs nothing for the overwhelming majority of
   * users, who work no shared space at all and exit on the first query.
   */
  private async crossOrgContacts(userId: string) {
    const me = await this.chatParty(userId);
    if (!me || me.spaceIds.length === 0) return [];

    const shares = await this.prisma.spaceShare.findMany({
      where: {
        status: 'ACTIVE',
        showWorkers: true,
        spaceId: { in: me.spaceIds },
        OR: [{ ownerOrgId: me.organizationId }, { guestOrgId: me.organizationId }],
      },
      select: { spaceId: true, ownerOrgId: true, guestOrgId: true, expiresAt: true },
    });
    const now = Date.now();
    const live = shares.filter((s) => !s.expiresAt || new Date(s.expiresAt).getTime() > now);
    if (live.length === 0) return [];

    // The other side of each share, per space.
    const otherOrgBySpace = new Map<string, string>();
    for (const s of live) {
      otherOrgBySpace.set(s.spaceId, s.ownerOrgId === me.organizationId ? s.guestOrgId : s.ownerOrgId);
    }

    // Everyone assigned to those spaces who belongs to the other side.
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: { in: [...otherOrgBySpace.keys()] },
        userId: { not: userId },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      select: { userId: true, spaceId: true },
    });
    if (assignments.length === 0) return [];

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(assignments.map((a) => a.userId))] },
        isActive: true,
        role: { not: 'CUSTOMER' },
        organizationId: { in: [...new Set(otherOrgBySpace.values())] },
      },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, position: true,
        role: true, contactable: true, canManageUsers: true, presence: true, organizationId: true,
      },
      orderBy: [{ firstName: 'asc' }],
    });

    // Keep only people whose org is the counterpart of a space we BOTH work.
    const spacesByUser = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!spacesByUser.has(a.userId)) spacesByUser.set(a.userId, new Set());
      spacesByUser.get(a.userId)!.add(a.spaceId);
    }
    return candidates
      .filter((u) =>
        [...(spacesByUser.get(u.id) ?? [])].some((sp) => otherOrgBySpace.get(sp) === u.organizationId),
      )
      // Presence is stripped on the way out. A shared space is agreement to
      // exchange messages about the work, not to publish when another
      // company's staff are at their desks. See shape() for the same rule on
      // conversations, and the websocket gateway for typing.
      .map(({ presence: _presence, ...u }) => ({ ...u, presence: null, isExternal: true }));
  }

  /**
   * The facts the cross-org rule needs about one person.
   *
   * Read live, never from the session. `access.sharedSpaces` on the token is a
   * snapshot refreshed roughly once a minute — fine for deciding what to render,
   * far too loose to decide whether a message may be sent to another company.
   */
  private async chatParty(userId: string): Promise<ChatParty | null> {
    return (await this.chatParties([userId]))[userId] ?? null;
  }

  /**
   * Both sides of a conversation in two queries rather than four.
   *
   * Sending is a hot path and this runs on every cross-org message, so the two
   * people are fetched together and their space assignments in one pass — the
   * per-user helper above is the same work for a single id.
   */
  private async chatParties(userIds: string[]): Promise<Record<string, ChatParty>> {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return {};

    const now = new Date();
    const [users, assignments] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, organizationId: true, role: true },
      }),
      this.prisma.spaceAssignment.findMany({
        where: { userId: { in: ids }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
        select: { userId: true, spaceId: true },
      }),
    ]);

    const spacesByUser = new Map<string, string[]>();
    for (const a of assignments) {
      const list = spacesByUser.get(a.userId);
      if (list) list.push(a.spaceId);
      else spacesByUser.set(a.userId, [a.spaceId]);
    }

    const out: Record<string, ChatParty> = {};
    for (const u of users) {
      // No organization means nothing to share a space through.
      if (!u.organizationId) continue;
      out[u.id] = {
        userId: u.id,
        organizationId: u.organizationId,
        role: u.role,
        spaceIds: [...new Set(spacesByUser.get(u.id) ?? [])],
      };
    }
    return out;
  }

  /** Shares that could join these two orgs, in either direction. */
  private sharesBetween(orgA: string, orgB: string): Promise<ChatShareFacts[]> {
    return this.sharesWith(orgA, [orgB]);
  }

  /**
   * Shares joining `myOrg` to any of `otherOrgIds`, in either direction.
   *
   * One query however many counterpart organizations are involved — the
   * conversation list needs the lot at once to say which threads are still
   * open, and asking per thread would be a fan-out.
   */
  private sharesWith(myOrg: string, otherOrgIds: string[]): Promise<ChatShareFacts[]> {
    const others = [...new Set(otherOrgIds)].filter((id) => id && id !== myOrg);
    if (others.length === 0) return Promise.resolve([]);
    return this.prisma.spaceShare.findMany({
      where: {
        status: 'ACTIVE',
        showWorkers: true,
        OR: [
          { ownerOrgId: myOrg, guestOrgId: { in: others } },
          { guestOrgId: myOrg, ownerOrgId: { in: others } },
        ],
      },
      select: { spaceId: true, ownerOrgId: true, guestOrgId: true, status: true, showWorkers: true, expiresAt: true },
    });
  }

  /**
   * Which of these cross-org conversations have stopped accepting messages.
   *
   * The server has always known this at send time; the list did not, so a
   * closed thread looked ordinary until you typed into it and got an error.
   * Resolved in two queries for the whole list, and skipped entirely — no
   * queries at all — for the overwhelming majority of people, who have no
   * cross-org threads.
   */
  private async closedConversationIds(
    viewerId: string,
    rows: Array<{ id: string; originSpaceId?: string | null; members: Array<{ userId: string }> }>,
  ): Promise<Set<string>> {
    const closed = new Set<string>();
    const crossOrg = rows.filter((r) => r.originSpaceId);
    if (crossOrg.length === 0) return closed;

    const otherIds = crossOrg
      .map((r) => r.members.find((m) => m.userId !== viewerId)?.userId)
      .filter((id): id is string => !!id);

    const parties = await this.chatParties([viewerId, ...otherIds]);
    const me = parties[viewerId];
    // No resolvable viewer means nothing cross-org can still be open.
    if (!me) {
      for (const r of crossOrg) closed.add(r.id);
      return closed;
    }

    const shares = await this.sharesWith(
      me.organizationId,
      otherIds.map((id) => parties[id]?.organizationId).filter((o): o is string => !!o),
    );

    for (const r of crossOrg) {
      const otherId = r.members.find((m) => m.userId !== viewerId)?.userId;
      const other = otherId ? parties[otherId] : undefined;
      if (!other || !isCrossOrgConversationLive(r.originSpaceId!, me, other, shares)) {
        closed.add(r.id);
      }
    }
    return closed;
  }

  /**
   * The space authorizing a conversation between two people in different orgs,
   * or null. Resolved from the database every time it is asked.
   */
  private async resolveCrossOrgSpace(
    userId: string,
    otherUserId: string,
    preferSpaceId?: string | null,
  ): Promise<{ spaceId: string; other: ChatParty } | null> {
    const parties = await this.chatParties([userId, otherUserId]);
    const me = parties[userId];
    const other = parties[otherUserId];
    if (!me || !other) return null;
    if (me.organizationId === other.organizationId) return null; // in-org rules apply
    const shares = await this.sharesBetween(me.organizationId, other.organizationId);
    const spaceId = resolveCrossOrgChatSpace(me, other, shares, { preferSpaceId });
    return spaceId ? { spaceId, other } : null;
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
    // Supplied when the caller already holds the counterpart — sending does,
    // because the membership read returns them. Must still be org-verified by
    // the caller; this only avoids fetching the same row twice.
    knownOther?: { id: string; role: string; contactable: boolean; canManageUsers?: boolean } | null,
  ) {
    const [me, other] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { role: true, enabledModules: true, contactScope: true, contactAllowedIds: true, canManageUsers: true },
      }),
      knownOther
        ? Promise.resolve(knownOther)
        : this.prisma.user.findFirst({
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
      await this.assertMayContact(data.userId, data.otherUserId, data.organizationId);
    } else {
      // Opening is also where an anchor is chosen or renewed: a thread whose
      // share died can be re-anchored to a share that is still alive, but that
      // is a decision made here, never a side effect of sending.
      const existing = await this.prisma.conversation.findFirst({
        where: { dmKey: directConversationKey(data.userId, data.otherUserId) },
        select: { organizationId: true, originSpaceId: true },
      });
      const resolved = await this.resolveCrossOrgSpace(
        data.userId,
        data.otherUserId,
        existing?.originSpaceId,
      );
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
    return { success: true, data: this.shape(conversation, data.userId) };
  }

  // ── list my conversations (with last message + unread) ──────────────────────
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

    const closed = await this.closedConversationIds(data.userId, rows as any);
    const data2 = rows.map((r) => ({
      ...this.shape(r, data.userId, closed.has(r.id)),
      unread: unreadMap.get(r.id) ?? 0,
    }));
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
    membership: {
      conversation: {
        id: string;
        type: string;
        organizationId: string;
        originSpaceId?: string | null;
        members: { userId: string }[];
      };
    },
    senderId: string,
  ) {
    const conversation = membership.conversation;
    if (conversation.type !== 'DIRECT') return;

    const otherId = conversation.members.find((m) => m.userId !== senderId)?.userId;
    // A direct thread with no counterpart is malformed — deny rather than guess.
    if (!otherId) throw new ForbiddenException('This conversation is no longer available');

    // ── Cross-org: the share that authorized this thread must still be alive ──
    if (conversation.originSpaceId) {
      const parties = await this.chatParties([senderId, otherId]);
      const me = parties[senderId];
      const other = parties[otherId];
      if (!me || !other) {
        throw new ForbiddenException('You can no longer message this member');
      }
      const shares = await this.sharesBetween(me.organizationId, other.organizationId);
      if (!isCrossOrgConversationLive(conversation.originSpaceId, me, other, shares)) {
        // The space stopped being shared, the owner hid its workers, the share
        // expired, or one of them was taken off the space. History stays
        // readable; this thread carries nothing new.
        throw new ForbiddenException(
          'This space is no longer shared with your organization, so this conversation is closed',
        );
      }
      return;
    }

    // ── Same org: the ordinary contact rules ─────────────────────────────────
    // The counterpart came back with the membership read, so this costs one
    // query (the sender's own permissions) instead of two.
    const other = (conversation.members as any[]).find((m) => m.userId === otherId)?.user;
    if (!other || !other.isActive || other.organizationId !== conversation.organizationId) {
      throw new ForbiddenException('You can no longer message this member');
    }
    await this.assertMayContact(
      senderId,
      otherId,
      conversation.organizationId,
      'You can no longer message this member',
      other,
    );
  }

  private async assertMember(conversationId: string, userId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: {
        conversation: {
          include: {
            // The counterpart's contact fields come back with the membership
            // read rather than in a query of their own — the row is already
            // being fetched, and the send-time check needs exactly these. The
            // conversation also carries its own authorization anchor
            // (originSpaceId), so nothing else has to be looked up to decide.
            members: {
              include: {
                user: {
                  select: {
                    id: true, organizationId: true, role: true, isActive: true,
                    contactable: true, canManageUsers: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!membership) throw new ForbiddenException('Not a member of this conversation');
    return membership;
  }

  /** Shape a conversation from the viewer's perspective (adds otherMember for DMs). */
  private shape(c: any, viewerId: string, isClosed = false) {
    const isExternal = !!c.originSpaceId;
    // Across an organization boundary, presence does not travel — the same rule
    // the contacts directory and the typing relay apply. Being reachable for
    // work is not the same as being observable.
    // Marked as well as stripped: the avatar needs to know not to draw a
    // status dot, and "no presence" alone reads as offline.
    const hide = (u: any) => (u && isExternal ? { ...u, presence: null, isExternal: true } : u);
    const members = (c.members ?? []).map((m: any) => hide(m.user)).filter(Boolean);
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
      // Tell the reader they are talking to another company. People share
      // different things when they know the person is outside the business —
      // this is a control, not decoration.
      isExternal,
      /**
       * The space that held this conversation open is no longer shared, so it
       * accepts no new messages. History stays readable — the thread is closed,
       * not deleted. Told to the client so it can say so up front instead of
       * letting someone write a message and then refusing it.
       */
      isClosed,
      lastMessage: c.messages?.[0] ?? null,
    };
  }
}
