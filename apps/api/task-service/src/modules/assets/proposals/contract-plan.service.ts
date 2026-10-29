import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, personPasses } from '@hbcfield/shared';
import {
  normalizeKindShape,
  maxHolders,
  proposeFromContract,
  type ContractProposal,
  type KindShape,
} from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';
import { ContractFields, ContractActor, asParsedContract, contractCustodyStart } from './asset-contract-helpers';

/**
 * A contract reading → the plan accepting it would carry out, computed from what
 * the member holds NOW. ONE method for preview and apply, so the preview cannot
 * be permissive about something the apply refuses.
 */
@Injectable()
export class ContractPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /**
   * Everything the plan needs, checked.
   *
   * One method for both entry points, so the preview cannot be permissive about
   * something the apply refuses — which would show somebody a plan and then
   * decline to carry it out.
   */
  async resolve(
    data: {
      categoryId: string;
      typeId?: string;
      holderUserId: string;
      fields: ContractFields;
      retireReplaced?: boolean;
    } & ContractActor,
  ): Promise<{
    proposal: ContractProposal;
    shape: KindShape;
    holding: Array<{ assetId: string; assetName: string }>;
    startsAt: Date;
    /** True when the term begins later than today and custody starts now instead. */
    startClamped: boolean;
    /** True when the term began too early and custody starts later (contractCustodyStart). */
    startRaised: boolean;
  }> {
    const kind = await this.prisma.assetCategory.findFirst({
      where: { id: data.categoryId, organizationId: data.organizationId },
      select: { id: true, config: true, spaceId: true },
    });
    /*
      ⚠️ A space-scoped manager reaches only the kinds of THEIR workspaces.

      The gateway lets a grant held in any space through the door, because the
      request names a kind, not a space. This is where it narrows — by the
      kind's real workspace, read here, never by anything the client sent.

      404 rather than 403, and the same sentence as a kind in another tenant:
      "that type exists, you just may not use it" tells somebody what another
      depot runs.
    */
    if (!kind || !this.access.mayIn(data, 'manage', kind.spaceId)) {
      throw new NotFoundException('That type is not in this organization');
    }

    const shape = normalizeKindShape(kind.config);
    if (maxHolders(shape) === 0) throw new BadRequestException('This type is not held by anybody');
    if (!shape.holder.members) throw new BadRequestException('This type is held by clients, not members');

    // A workspace-scoped manager hands the thing only to somebody who works in that workspace (same rule as a handover).
    const narrow = Array.isArray(data.manageSpaceIds);
    const member = await personPasses(this.prisma, data.holderUserId, {
      organizationId: data.organizationId,
      ...(narrow ? { inWorkspace: kind.spaceId ?? null } : {}),
    });
    if (!member)
      throw new BadRequestException(
        narrow ? 'That person does not work in this workspace' : 'That person is not in this organization',
      );

    if (data.typeId) {
      const type = await this.prisma.assetType.findFirst({
        where: { id: data.typeId, categoryId: kind.id },
        select: { id: true },
      });
      if (!type) throw new BadRequestException('That subtype does not belong to this type');
    }

    /*
      What they hold OF THIS KIND, and nothing else.

      Somebody can hold a van and a laptop at once, and a vehicle contract says
      nothing about the laptop. Scoping the replacement to the kind is what
      keeps "and retire the old one" from quietly taking away their tools.
    */
    const open = await this.prisma.assetCustody.findMany({
      where: {
        organizationId: data.organizationId,
        userId: data.holderUserId,
        endedAt: null,
        asset: { categoryId: kind.id },
      },
      select: {
        id: true,
        assetId: true,
        userId: true,
        customerId: true,
        startedAt: true,
        endedAt: true,
        asset: { select: { id: true, name: true } },
      },
    });

    const holding = open.map((p) => ({
      ...p,
      assetId: p.assetId,
      assetName: p.asset?.name ?? '',
    }));

    const parsed = asParsedContract(data.fields);
    const proposal = proposeFromContract({
      parsed,
      shape,
      holderUserId: data.holderUserId,
      holding,
      retireReplaced: !!data.retireReplaced,
    });

    // A name typed by a person always wins over one the reader assembled.
    const typed = data.fields.name?.trim().slice(0, 120);
    if (typed) {
      proposal.asset.name = typed;
      proposal.problems = proposal.problems.filter((p) => p.kind !== 'no-name');
      const create = proposal.steps.find((s) => s.kind === 'create');
      if (create && create.kind === 'create') create.asset.name = typed;
    }

    /*
      ⚠️ A custody cannot START in the future.

      A rental beginning next Monday, recorded today, would leave the vehicle
      held by NOBODY until then — so every receipt in the gap falls out of both
      custodies and the totals stop adding up. The same rule the handover
      button enforces. The term's own start date is not lost: it goes onto the
      record as one of the kind's fields, where it belongs as a fact about the
      agreement rather than about who is driving.
    */
    const now = new Date();
    const asked = data.fields.startsOn ? new Date(data.fields.startsOn) : now;
    if (Number.isNaN(asked.getTime())) throw new BadRequestException('That start date could not be read');
    // …nor before what it replaces was given to them, nor older than any asset entry may be (contractCustodyStart).
    const start = contractCustodyStart(asked, {
      now,
      holdingSince: open.map((p) => p.startedAt),
      canManageAssets: data.canManageAssets,
    });

    return { proposal, shape, holding, ...start };
  }
}
