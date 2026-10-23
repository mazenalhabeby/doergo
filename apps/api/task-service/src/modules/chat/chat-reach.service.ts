import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  CHAT_CODES,
  personContactFacts,
  personModules,
  chatPerson,
  personContactRules,
  chatDirectory,
  chatPeople,
  personChatGate,
} from '@hbcfield/shared';
import {
  canContactColleagues,
  isCrossOrgConversationLive,
  SPACE_LEADER_PERMISSION,
  orgAllows,
  type OrgAccessRow,
} from '@hbcfield/shared';
import { PrismaService, personOrgAccess } from '@hbcfield/shared';
import { ChatCrossOrgService } from './chat-cross-org.service';
import { ChatContactTargets } from './chat-contact-targets.service';
import { canReach } from './chat-reach-rule';
import type { ChatMemberContact } from './chat-membership';

/**
 * WHO MAY TALK TO WHOM — the one place chat answers it.
 *
 * Asked when a conversation is opened, again on every message sent, for the
 * contacts directory, and for whether a cross-company thread is still open.
 * Kept apart from ChatService (threads and messages) so the rule reads as one
 * unit and the two never drift.
 */
@Injectable()
export class ChatReachService {
  constructor(
    private readonly prisma: PrismaService,
    readonly crossOrg: ChatCrossOrgService,
    private readonly contactTargets: ChatContactTargets,
  ) {}

  /** Does this person manage people org-wide (resolved access, not the legacy column)? */
  async managesPeople(userId: string): Promise<boolean> {
    const me = await personOrgAccess(this.prisma, userId);
    return !!me && orgAllows(me as OrgAccessRow, 'canManageUsers');
  }

  /**
   * May this person START a group? Managers and leaders (D3): org-wide
   * `canManageUsers`, or the space-leader permission in a workspace — the same
   * marker that lets a leader message the people they lead. Their Messaging
   * switch must be on: somebody taken out of chat starts nothing in it.
   */
  async mayCreateGroup(userId: string): Promise<boolean> {
    const me = await personChatGate(this.prisma, userId);
    // An external member works for a client; their leader permission in one site
    // is about that site's hours, not about starting rooms in this company's chat.
    if (!me || me.role === 'CUSTOMER' || me.isExternal || !canContactColleagues({ enabledModules: me.enabledModules }))
      return false;
    if (orgAllows(me as OrgAccessRow, 'canManageUsers')) return true;
    const leads = await this.prisma.spaceAssignment.findFirst({
      where: { userId, role: { isActive: true, permissions: { path: [SPACE_LEADER_PERMISSION], equals: true } } },
      select: { id: true },
    });
    return !!leads;
  }

  /**
   * Everybody in `userIds` must be somebody `actorId` may message RIGHT NOW —
   * the same rule as opening a direct conversation, asked of each. A group is
   * never a way round the contact rules: you cannot put two people in a room
   * you could not have written to yourself. Same organization only; another
   * company's people are reached through a shared space, one to one.
   * Returns the people, for the system line's names.
   */
  async assertMayAddToGroup(actorId: string, organizationId: string, userIds: string[]) {
    const me = await personContactRules(this.prisma, actorId);
    if (!me) throw new NotFoundException('User not found');
    const people = await chatPeople(this.prisma, userIds, organizationId);
    const targets = this.contactTargets.resolver(actorId, organizationId);
    const verdicts = await Promise.all(people.map((u) => canReach(me, u, targets)));
    if (people.length !== new Set(userIds).size || verdicts.some((ok) => !ok)) {
      throw new ForbiddenException({
        message: 'You can only add people you are allowed to message',
        code: CHAT_CODES.GROUP_UNREACHABLE,
      });
    }
    return people;
  }

  // ── contacts directory (who the current user is allowed to message) ─────────
  /** Just the ids of `listContacts` — what a Message button on a people list asks. */
  async reachableIds(data: { userId: string; organizationId: string }) {
    const { data: people } = await this.listContacts(data);
    return { success: true, data: people.map((p: { id: string }) => p.id) };
  }

  async listContacts(data: { userId: string; organizationId: string }) {
    const me = await personContactRules(this.prisma, data.userId);
    if (!me) throw new NotFoundException('User not found');
    const all = await chatDirectory(this.prisma, data.organizationId, data.userId);
    // One resolver shared by every candidate below: resolved server-side (so it
    // can't be spoofed) and at most once, however many people we test.
    const spaceTargets = this.contactTargets.resolver(data.userId, data.organizationId);
    const verdicts = await Promise.all(all.map((u) => canReach(me, u, spaceTargets)));
    const reachable: unknown[] = all.filter((_, i) => verdicts[i]);

    // Colleagues at other companies, reachable through an actively shared space
    // both of us work. Marked external so the directory never blurs the line
    // between a coworker and someone at another business.
    const external = await this.crossOrg.crossOrgContacts(data.userId);
    return { data: [...reachable, ...external] };
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
  async assertMayContact(
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
      personContactRules(this.prisma, senderId),
      knownOther ? Promise.resolve(knownOther) : chatPerson(this.prisma, otherUserId, organizationId),
    ]);
    // `other.id` must match exactly — findFirst with a bad id could otherwise
    // fall through to an unintended row. Also re-check self by resolved id.
    if (!me || !other || other.id !== otherUserId) throw new NotFoundException('Member not found');
    if (other.id === senderId) throw new ForbiddenException('Cannot message yourself');
    const reachable = await canReach(me, other, this.contactTargets.resolver(senderId, organizationId));
    if (!reachable) throw new ForbiddenException(deniedMessage);
    return other;
  }

  /**
   * May the sender still write into this conversation?
   *
   * Reading is deliberately untouched — history stays readable. Losing contact
   * permission ends the conversation; it doesn't retract what was already said,
   * and hiding a record someone has already read is theatre, not security.
   *
   * GROUP and TASK threads keep membership as the rule: there is no pair to
   * evaluate, and belonging IS the grant (a job's chat adds its own checks —
   * closed when the job is over, the office re-gated — in ChatTasksService).
   */
  async assertStillReachable(
    membership: {
      conversation: {
        id: string;
        type: string;
        organizationId: string;
        originSpaceId?: string | null;
        // findMembership (chat-membership.ts) reads each member's contact fields with it.
        members: { userId: string; user?: ChatMemberContact | null }[];
      };
    },
    senderId: string,
  ) {
    const conversation = membership.conversation;
    if (conversation.type !== 'DIRECT') {
      // A group or a job's chat: belonging is the grant, but "off means off" —
      // somebody taken out of chat, or no longer active, writes nowhere.
      const me = conversation.members.find((m) => m.userId === senderId)?.user;
      if (!me || !me.isActive) throw new ForbiddenException('This conversation is no longer available');
      const sender = await personModules(this.prisma, senderId);
      if (!sender || !canContactColleagues({ enabledModules: sender.enabledModules })) {
        throw new ForbiddenException('Messaging is switched off for you');
      }
      return;
    }

    const otherId = conversation.members.find((m) => m.userId !== senderId)?.userId;
    // A direct thread with no counterpart is malformed — deny rather than guess.
    if (!otherId) throw new ForbiddenException('This conversation is no longer available');

    // ── Cross-org: the share that authorized this thread must still be alive ──
    if (conversation.originSpaceId) {
      const parties = await this.crossOrg.chatParties([senderId, otherId]);
      const me = parties[senderId];
      const other = parties[otherId];
      if (!me || !other) {
        throw new ForbiddenException('You can no longer message this member');
      }
      const shares = await this.crossOrg.sharesBetween(me.organizationId, other.organizationId);
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
    const other = conversation.members.find((m) => m.userId === otherId)?.user;
    if (!other || !other.isActive || other.organizationId !== conversation.organizationId) {
      throw new ForbiddenException('You can no longer message this member');
    }
    try {
      await this.assertMayContact(
        senderId,
        otherId,
        conversation.organizationId,
        'You can no longer message this member',
        other,
      );
    } catch (err) {
      // Only a contact-rule refusal can be answered by the reply right; a missing member stays missing.
      if (!(err instanceof ForbiddenException)) throw err;
      if (!(await this.mayReply(conversation.id, conversation.organizationId, senderId, otherId))) throw err;
    }
  }

  /**
   * The reply right: somebody who was WRITTEN TO in a direct thread may answer in it.
   *
   * `canReach` is directional on purpose — a manager reaches anyone, a member at
   * `contactScope: SELECTED` reaches only their list and the leads of their spaces —
   * and that is right for STARTING a conversation. It was also being asked of every
   * reply, so a member restricted to their own leads received a manager's message
   * and was refused ("You can no longer message this member") answering it. Being
   * contacted is the reason to talk; refusing the answer protects nobody, since the
   * person who wrote chose to be reached.
   *
   * Narrow, and re-asked live on every send, not granted by history:
   *  - the counterpart must have SENT a message into this very thread;
   *  - the counterpart must STILL be allowed to reach the sender (`canReach` run
   *    their way round: their Messaging switch, the sender being contactable,
   *    their manager access or reach) — demote them, take them out of chat, and
   *    the reply right goes with it;
   *  - the sender must still be in chat themselves (their own Messaging switch),
   *    and the counterpart contactable — "off means off" holds both ways.
   * Same-org only: cross-org threads are decided by the share, above, and an
   * inactive / moved counterpart was already refused before this is asked.
   */
  private async mayReply(
    conversationId: string,
    organizationId: string,
    senderId: string,
    otherId: string,
  ): Promise<boolean> {
    const wroteHere = await this.prisma.message.findFirst({
      where: { conversationId, senderId: otherId },
      select: { id: true },
    });
    if (!wroteHere) return false;

    const [sender, other] = await Promise.all([
      personContactFacts(this.prisma, senderId, organizationId),
      personContactFacts(this.prisma, otherId, organizationId),
    ]);
    if (!sender || !other || sender.id !== senderId || other.id !== otherId) return false;
    if (!sender.isActive || !other.isActive) return false;
    // The sender's own side of "off means off".
    if (!canContactColleagues({ enabledModules: sender.enabledModules })) return false;
    if (!other.contactable) return false;
    // And the counterpart's, asked their way round: may THEY still reach the sender?
    return canReach(other, sender, this.contactTargets.resolver(otherId, organizationId));
  }
}
