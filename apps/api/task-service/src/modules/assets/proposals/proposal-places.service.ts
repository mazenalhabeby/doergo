import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, activeAssignmentWhere, mayReviewProposal, type ProposalPlace } from '@hbcfield/shared';
import { type ContractActor } from './asset-contract.service';
import { assetScope } from '../core/asset-access.service';
import { Placeable, PROPOSAL_STATUS } from './asset-proposal-helpers';

/**
 * Where a proposal belongs — its kind's workspace, or the member's — and so who
 * may review it. The queue, accept/reject, the page link and the routing all
 * read this one place.
 */
@Injectable()
export class ProposalPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The place of each proposal: its kind's real workspace, and the member's
   * current assignments. Two queries however many rows.
   *
   * A `categoryId` that no longer resolves is read as "not chosen" — the kind
   * was deleted, and the reviewer is left exactly where a proposal without one
   * leaves them: they must choose.
   */
  async placesOf(rows: Placeable[], organizationId: string): Promise<Map<string, ProposalPlace>> {
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

  async reviewable(row: Placeable, organizationId: string, manageSpaceIds: string[] | null): Promise<boolean> {
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
  async assertReviewable(id: string, actor: ContractActor): Promise<void> {
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
}
