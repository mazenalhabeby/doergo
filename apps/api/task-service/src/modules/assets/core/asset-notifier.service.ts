import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personName, type HandoverPlan, peopleIds, personBrief } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { AssetAudienceService } from './asset-audience.service';
import {
  emitEvent,
  assetExpenseDecidedEvent,
  assetExpenseSubmittedEvent,
  assetHandedOverEvent,
} from '@hbcfield/shared/microservices';

/**
 * Who is told about the organization's things, and with what.
 *
 * This service DECIDES WHO; the notification service only delivers. That split
 * is the one every other routed notification here already follows (leave,
 * shift issues, proposals), and it is why the rules below can be tested against
 * a database shape rather than a socket.
 *
 * ⚠️ EVERY EMIT IS BEST EFFORT. An expense that failed to announce is still in
 * the queue, and a handover that failed to announce is still written. Failing
 * the member's filing — at a petrol pump, on one bar of signal — because a
 * notification could not be routed would lose the only copy of what they typed.
 *
 * ⚠️ A BODY CARRIES AN ASSET'S NAME, SO EVERY RECIPIENT MUST BE ABLE TO SEE IT.
 * Watchers and space routing are chosen "about a member", not "about the
 * register": a shift leader watching a driver is a perfectly good person to
 * hear about their late clock-out and not somebody entitled to the fleet list.
 * Routed people are therefore filtered by `whoCanSee` (AssetAudienceService) before anything is sent.
 */
@Injectable()
export class AssetNotifier {
  private readonly logger = new Logger(AssetNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    private readonly audience: AssetAudienceService,
  ) {}

  /** Everyone who could actually decide — see AssetAudienceService.approvers. */
  approvers(organizationId: string, exceptUserId: string, spaceId?: string | null): Promise<string[]> {
    return this.audience.approvers(organizationId, exceptUserId, spaceId);
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  /**
   * A member sent in what they spent — tell the people who will confirm it.
   *
   * Only ever called for a SUBMITTED entry. An entry the office typed itself is
   * RECORDED on arrival and there is nobody to ask: announcing it would put the
   * office's own bookkeeping in the office's own bell.
   *
   * Routed like a proposal — watchers ∪ the space's routing, with a FALLBACK —
   * and for the same reason: an expense nobody is told about is money a driver
   * is waiting to get back, and the queue it sits in is only read by people who
   * already know to look.
   *
   * Not coalesced here. A phone coming back online replays its queue as a burst
   * of separate filings, and folding those into one push per approver is the
   * notification service's job, because it is the one that knows what it has
   * already sent to whom.
   */
  async expenseSubmitted(entry: {
    id: string;
    organizationId: string;
    assetId: string;
    authorId: string | null;
    category: string;
    amountCents: number;
    occurredAt: Date;
  }): Promise<void> {
    if (!entry.authorId) return;
    try {
      const [asset, author] = await Promise.all([
        this.prisma.asset.findFirst({
          where: { id: entry.assetId, organizationId: entry.organizationId },
          select: { name: true, category: { select: { spaceId: true } } },
        }),
        personBrief(this.prisma, entry.authorId, { organizationId: entry.organizationId }),
      ]);
      if (!asset) return;
      const spaceId = asset.category?.spaceId ?? null;

      const { ids } = await this.routing.resolveWatchers(entry.authorId, entry.organizationId, 'tasks', false);
      let recipientIds = await this.audience.whoCanSee(entry.organizationId, ids, spaceId, entry.authorId);
      if (recipientIds.length === 0) {
        recipientIds = await this.audience.approvers(entry.organizationId, entry.authorId, spaceId);
      }
      if (recipientIds.length === 0) return;

      emitEvent(this.notifications, assetExpenseSubmittedEvent, {
        organizationId: entry.organizationId,
        entryId: entry.id,
        assetId: entry.assetId,
        assetName: asset.name,
        spaceId,
        authorId: entry.authorId,
        authorName: personName(author),
        category: entry.category,
        amountCents: entry.amountCents,
        occurredAt: entry.occurredAt,
        recipientIds,
      });
    } catch (e) {
      this.logger.warn(`asset expense announce failed: ${(e as Error).message}`);
    }
  }

  /**
   * The office answered — tell the one person who sent it in.
   *
   * Nobody else: the office already knows, it is the office. And not the author
   * either when they decided it themselves (somebody filed as a driver and was
   * later given the register), because a push about your own click is noise.
   */
  async expenseDecided(input: {
    entryId: string;
    organizationId: string;
    decision: 'accept' | 'reject';
    note: string | null;
    reviewerId: string;
  }): Promise<void> {
    try {
      const entry = await this.prisma.assetMoney.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId },
        select: {
          authorId: true,
          assetId: true,
          category: true,
          amountCents: true,
          asset: { select: { name: true } },
        },
      });
      if (!entry?.authorId || entry.authorId === input.reviewerId) return;

      emitEvent(this.notifications, assetExpenseDecidedEvent, {
        organizationId: input.organizationId,
        entryId: input.entryId,
        assetId: entry.assetId,
        assetName: entry.asset?.name ?? '',
        authorId: entry.authorId,
        decision: input.decision,
        note: input.note,
        amountCents: entry.amountCents,
        category: entry.category,
      });
    } catch (e) {
      this.logger.warn(`asset expense decision announce failed: ${(e as Error).message}`);
    }
  }

  // ── Custody ────────────────────────────────────────────────────────────────

  /**
   * Somebody was given a thing, or had it taken back.
   *
   * Called AFTER the transaction that wrote it has committed — never from inside
   * `AssetCustodyService.apply`, which runs in the caller's transaction: a push
   * sent from there would announce a handover that a later step can still roll
   * back, and "the van is now with you" is not a sentence to take back.
   *
   * A plan with problems wrote nothing and says nothing. Clients are never told
   * — a custody period naming a client is a flat's resident, reached through
   * the portal, not a member with this app — and neither is whoever made the
   * change, who is looking at the screen that did it.
   */
  async handedOver(input: {
    organizationId: string;
    assetId: string;
    actorId: string;
    plan: HandoverPlan;
  }): Promise<void> {
    const { plan } = input;
    if (plan.problems.length) return;
    try {
      const opened = new Set(plan.opening.map((p) => p.userId).filter((v): v is string => !!v));
      // Somebody re-given the thing they had is a receiver, not a loser.
      const closed = new Set(plan.closing.map((p) => p.userId).filter((v): v is string => !!v && !opened.has(v)));
      opened.delete(input.actorId);
      closed.delete(input.actorId);
      if (opened.size === 0 && closed.size === 0) return;

      const [asset, people] = await Promise.all([
        this.prisma.asset.findFirst({
          where: { id: input.assetId, organizationId: input.organizationId },
          select: { name: true },
        }),
        // Members of THIS organization, still here. A portal account is a
        // client, whatever a custody row happens to hold.
        peopleIds(this.prisma, [...opened, ...closed], {
          organizationId: input.organizationId,
          active: true,
          notClients: true,
        }),
      ]);
      if (!asset) return;
      const members = new Set(people.map((p) => p.id));
      const openedUserIds = [...opened].filter((id) => members.has(id));
      const closedUserIds = [...closed].filter((id) => members.has(id));
      if (openedUserIds.length === 0 && closedUserIds.length === 0) return;

      emitEvent(this.notifications, assetHandedOverEvent, {
        organizationId: input.organizationId,
        assetId: input.assetId,
        assetName: asset.name,
        openedUserIds,
        closedUserIds,
        byUserId: input.actorId,
        at: plan.at,
      });
    } catch (e) {
      this.logger.warn(`asset handover announce failed: ${(e as Error).message}`);
    }
  }
}
