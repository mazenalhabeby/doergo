import { Injectable } from '@nestjs/common';
import {
  notEndedWhere,
  resolveCrossOrgChatSpace,
  isCrossOrgConversationLive,
  type ChatParty,
  type ChatShareFacts,
  workerSharesBetween,
  peopleOrgAndRole,
  crossOrgCandidates,
  workerSharesOf,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';

/**
 * Chat ACROSS companies: who at another organization is reachable through a
 * space shared with them, and whether a thread such a share opened is still
 * open. Every answer is read from the database when asked — a share that ends
 * freezes its threads with nothing to update.
 */
@Injectable()
export class ChatCrossOrgService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * People at other organizations this user may message.
   *
   * Only from spaces they are actually assigned to, and only where an ACTIVE
   * share exposes workers — so the directory can never widen beyond what the
   * space owner agreed to. Costs nothing for the overwhelming majority of
   * users, who work no shared space at all and exit on the first query.
   */
  async crossOrgContacts(userId: string) {
    const me = await this.chatParty(userId);
    if (!me || me.spaceIds.length === 0) return [];

    const shares = await workerSharesOf(this.prisma, me.organizationId, me.spaceIds);
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
        ...notEndedWhere(),
      },
      select: { userId: true, spaceId: true },
    });
    if (assignments.length === 0) return [];

    const candidates = await crossOrgCandidates(
      this.prisma,
      [...new Set(assignments.map((a) => a.userId))],
      [...new Set(otherOrgBySpace.values())],
    );

    // Keep only people whose org is the counterpart of a space we BOTH work.
    const spacesByUser = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!spacesByUser.has(a.userId)) spacesByUser.set(a.userId, new Set());
      spacesByUser.get(a.userId)!.add(a.spaceId);
    }
    return (
      candidates
        .filter((u) => [...(spacesByUser.get(u.id) ?? [])].some((sp) => otherOrgBySpace.get(sp) === u.organizationId))
        // Presence is stripped on the way out. A shared space is agreement to
        // exchange messages about the work, not to publish when another
        // company's staff are at their desks. See shape() for the same rule on
        // conversations, and the websocket gateway for typing.
        .map(({ presence: _presence, ...u }) => ({ ...u, presence: null, isExternal: true }))
    );
  }

  /**
   * The facts the cross-org rule needs about one person.
   *
   * Read live, never from the session. `access.sharedSpaces` on the token is a
   * snapshot refreshed roughly once a minute — fine for deciding what to render,
   * far too loose to decide whether a message may be sent to another company.
   */
  async chatParty(userId: string): Promise<ChatParty | null> {
    return (await this.chatParties([userId]))[userId] ?? null;
  }

  /**
   * Both sides of a conversation in two queries rather than four.
   *
   * Sending is a hot path and this runs on every cross-org message, so the two
   * people are fetched together and their space assignments in one pass — the
   * per-user helper above is the same work for a single id.
   */
  async chatParties(userIds: string[]): Promise<Record<string, ChatParty>> {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return {};

    const now = new Date();
    const [users, assignments] = await Promise.all([
      peopleOrgAndRole(this.prisma, ids),
      this.prisma.spaceAssignment.findMany({
        where: { userId: { in: ids }, ...notEndedWhere(now) },
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
  sharesBetween(orgA: string, orgB: string): Promise<ChatShareFacts[]> {
    return this.sharesWith(orgA, [orgB]);
  }

  /**
   * Shares joining `myOrg` to any of `otherOrgIds`, in either direction.
   *
   * One query however many counterpart organizations are involved — the
   * conversation list needs the lot at once to say which threads are still
   * open, and asking per thread would be a fan-out.
   */
  sharesWith(myOrg: string, otherOrgIds: string[]): Promise<ChatShareFacts[]> {
    const others = [...new Set(otherOrgIds)].filter((id) => id && id !== myOrg);
    if (others.length === 0) return Promise.resolve([]);
    return workerSharesBetween(this.prisma, myOrg, others);
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
  async closedConversationIds(
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
  async resolveCrossOrgSpace(
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
}
