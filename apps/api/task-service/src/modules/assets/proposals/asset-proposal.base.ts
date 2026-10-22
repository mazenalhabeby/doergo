import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService, personNameOf } from '@hbcfield/shared';
import {
  personName,
  activeAssignmentWhere,
  mayReviewProposal,
  proposalReviewSpaces,
  type ProposalPlace,
} from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { AssetContractService, type ContractActor, type ContractFields } from './asset-contract.service';
import { assetScope } from '../core/asset-access.service';
import { AssetNotifier } from '../core/asset-notifier.service';
import { AssetResponsibleService } from '../core/asset-responsible.service';
import { Placeable, PROPOSAL_STATUS } from './asset-proposal-helpers';
import { emitEvent, assetProposalDecidedEvent, assetProposalRaisedEvent } from '@hbcfield/shared/microservices';

/**
 * What both sides of a proposal share: the storage prefix, the fields kept, where
 * a member works, who may review, telling the reviewers, claiming a row, telling
 * the member, forgetting the page.
 */
@Injectable()
export abstract class AssetProposalBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly contracts: AssetContractService,
    protected readonly routing: NotificationRoutingService,
    protected readonly notifier: AssetNotifier,
    protected readonly responsible: AssetResponsibleService,
    @Inject('NOTIFICATION_SERVICE') protected readonly notifications: ClientProxy,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
  ) {}

  /**
   * Where a member's pages live.
   *
   * ⚠️ Per MEMBER, not per organization. The prefix used to be the organization's,
   * so the submit check accepted any page uploaded by anyone in it: a member who
   * obtained a colleague's key could raise a proposal on it and then open the
   * colleague's rental agreement — home address, licence number, bank details —
   * through their own proposal's link.
   */
  protected prefix(organizationId: string, userId: string): string {
    return `${organizationId}/asset-proposals/${userId}/`;
  }

  /**
   * Tell the people responsible for that member.
   *
   * ⚠️ WITH A FALLBACK, unlike every other use of this routing.
   *
   * Attendance deliberately notifies NOBODY when an organization has configured
   * nobody: not being told about a late clock-out is a choice somebody made. A
   * proposal is different in kind — it is WORK THAT STOPS. The member is
   * waiting for an answer, and silence means they wait forever and stop sending
   * pages in. So where the routing is empty, it goes to whoever can actually
   * act on it.
   */
  protected async announce(
    proposalId: string,
    organizationId: string,
    raisedById: string,
    fields: ContractFields,
  ): Promise<void> {
    try {
      const { ids } = await this.routing.resolveWatchers(raisedById, organizationId, 'tasks', false);
      let recipientIds = ids;

      if (recipientIds.length === 0) {
        /*
          The managers of the workspace it belongs to, before the whole office.

          Read through the SAME place the queue narrows by — the kind's
          workspace, or else the member's — so the people told are the people
          who will find it in their queue. Telling a depot manager about a van
          another depot has to create is a push they can do nothing with.
        */
        const proposal = await this.prisma.assetProposal.findUnique({
          where: { id: proposalId },
          select: { id: true, categoryId: true, holderUserId: true, raisedById: true },
        });
        if (proposal) {
          const place = (await this.placesOf([proposal], organizationId)).get(proposal.id)!;
          const local = await Promise.all(
            proposalReviewSpaces(place).map((spaceId) => this.responsible.spaceManagers(organizationId, spaceId)),
          );
          recipientIds = [...new Set(local.flat())].filter((id) => id !== raisedById);
        }
      }
      if (recipientIds.length === 0) {
        // The same approvers an expense falls back to, from the one place that
        // decides who can act on the register.
        recipientIds = await this.notifier.approvers(organizationId, raisedById);
      }
      if (recipientIds.length === 0) return;

      const raiser = await personNameOf(this.prisma, raisedById);

      emitEvent(this.notifications, assetProposalRaisedEvent, {
        proposalId,
        organizationId,
        raisedById,
        raiserName: personName(raiser),
        name: fields.name || fields.registration || fields.vin || fields.serial || '',
        recipientIds,
      });
    } catch (e) {
      // Best effort: a proposal that failed to announce is still IN the queue,
      // and failing the member's upload because a socket was down would lose
      // the only copy of what they read off the page.
      this.logger.warn(`asset proposal announce failed: ${(e as Error).message}`);
    }
  }

  protected cleanFields(raw: ContractFields | undefined): ContractFields {
    const out: ContractFields = {};
    for (const key of [
      'name',
      'registration',
      'vin',
      'serial',
      'manufacturer',
      'model',
      'startsOn',
      'endsOn',
    ] as const) {
      const v = raw?.[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 120);
    }
    return out;
  }

  // ── Where one belongs ──────────────────────────────────────────────────────

  /**
   * The place of each proposal: its kind's real workspace, and the member's
   * current assignments. Two queries however many rows.
   *
   * A `categoryId` that no longer resolves is read as "not chosen" — the kind
   * was deleted, and the reviewer is left exactly where a proposal without one
   * leaves them: they must choose.
   */
  protected async placesOf(rows: Placeable[], organizationId: string): Promise<Map<string, ProposalPlace>> {
    const kindIds = [...new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))];
    const holderIds = [...new Set(rows.map((r) => r.holderUserId ?? r.raisedById))];
    const { userId: _any, ...window } = activeAssignmentWhere('');

    const [kinds, assignments] = await Promise.all([
      kindIds.length
        ? this.prisma.assetCategory.findMany({
            where: { id: { in: kindIds }, organizationId },
            select: { id: true, spaceId: true },
          })
        : Promise.resolve([] as Array<{ id: string; spaceId: string | null }>),
      this.prisma.spaceAssignment.findMany({
        where: { ...window, organizationId, userId: { in: holderIds } },
        select: { userId: true, spaceId: true },
      }),
    ]);
    const kindSpace = new Map(kinds.map((k) => [k.id, k.spaceId]));
    const spacesOf = new Map<string, string[]>();
    for (const a of assignments) spacesOf.set(a.userId, [...(spacesOf.get(a.userId) ?? []), a.spaceId]);

    return new Map(
      rows.map((r) => [
        r.id,
        {
          kindSpaceId: r.categoryId && kindSpace.has(r.categoryId) ? kindSpace.get(r.categoryId) : undefined,
          holderSpaceIds: spacesOf.get(r.holderUserId ?? r.raisedById) ?? [],
        },
      ]),
    );
  }

  protected async reviewable(
    row: Placeable,
    organizationId: string,
    manageSpaceIds: string[] | null,
  ): Promise<boolean> {
    if (manageSpaceIds === null) return true;
    const place = (await this.placesOf([row], organizationId)).get(row.id)!;
    return mayReviewProposal(place, manageSpaceIds);
  }

  /**
   * Refuse a space-scoped reviewer a proposal outside their workspaces.
   *
   * ⚠️ 404, and the same sentence as one already decided. "That is waiting, you
   * just may not decide it" tells a depot manager what another depot is taking
   * on. Org-wide callers are not read here at all — the claim answers for them.
   */
  protected async assertReviewable(id: string, actor: ContractActor): Promise<void> {
    const manage = assetScope(actor, 'manage');
    if (manage === null) return;
    const row = await this.prisma.assetProposal.findFirst({
      where: { id, organizationId: actor.organizationId, status: PROPOSAL_STATUS.PENDING },
      select: { id: true, categoryId: true, holderUserId: true, raisedById: true },
    });
    if (!row || !(await this.reviewable(row, actor.organizationId, manage))) {
      throw new NotFoundException('That is not waiting for a decision');
    }
  }

  /**
   * Take it out of the queue before acting on it.
   *
   * A conditional update rather than a read-then-write: two reviewers opening
   * the queue at once would otherwise both see it pending, and the second would
   * create a SECOND vehicle from the same page.
   */
  protected async claim(id: string, organizationId: string) {
    const { count } = await this.prisma.assetProposal.updateMany({
      where: { id, organizationId, status: PROPOSAL_STATUS.PENDING },
      data: { status: PROPOSAL_STATUS.ACCEPTED },
    });
    if (!count) throw new NotFoundException('That is not waiting for a decision');
    const row = await this.prisma.assetProposal.findUniqueOrThrow({ where: { id } });
    return row;
  }

  protected tell(userId: string, proposalId: string, organizationId: string, outcome: string, detail: string) {
    try {
      emitEvent(this.notifications, assetProposalDecidedEvent, {
        proposalId,
        organizationId,
        userId,
        outcome,
        detail,
      });
    } catch (e) {
      this.logger.warn(`asset proposal decision emit failed: ${(e as Error).message}`);
    }
  }

  /** Remove the page behind a proposal nobody needs any more. Best effort. */
  async forgetDocument(key: string | null | undefined): Promise<void> {
    if (!key || !this.store) return;
    if (!(await this.store.delete(key))) this.logger.warn(`Could not remove proposal document ${key}`);
  }
}
