import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  notEndedWhere,
  normalizeKindShape,
  maxHolders,
  proposeFromContract,
  type ParsedContract,
  type ContractProposal,
  type KindShape,
} from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetCustodyService } from './asset-custody.service';
import { ContractFields, ContractActor } from './asset-contract-helpers';

/**
 * What reading, previewing and applying a contract share: the kinds in the
 * caller's reach, the permission, the reading as sent, and resolving it into a
 * plan from what the member holds now.
 */
@Injectable()
export abstract class AssetContractBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly access: AssetAccessService,
    protected readonly custody: AssetCustodyService,
  ) {}

  /**
   * Is a kind in a workspace this caller may manage?
   *
   * A kind in NO workspace is refused to a space-scoped caller: it belongs to
   * nobody's space, so no space grant can reach it — only an org-wide one.
   */
  static kindInScope(kindSpaceId: string | null | undefined, manageSpaceIds: string[] | null | undefined): boolean {
    if (manageSpaceIds === null) return true;
    return !!kindSpaceId && Array.isArray(manageSpaceIds) && manageSpaceIds.includes(kindSpaceId);
  }

  /**
   * May they use the contract flow at all?
   *
   * Managing assets SOMEWHERE opens the door — org-wide or in a workspace.
   * Which kinds they then reach is decided in `resolve`, by each kind's own
   * workspace. It used to fall back to `canViewAllTasks` for the org-wide
   * caller: a READ permission deciding who may create, hand over and retire.
   *
   * Public because deciding a proposal is the same door: accepting one IS
   * `apply`, and refusing or listing them must not ask a different question.
   */
  assertMay(actor: ContractActor, doing: string): void {
    this.access.assertMay(actor, 'manage', doing);
  }

  /**
   * A person's corrections → the shape the shared rules read.
   *
   * Everything here is `certain`, and that is not a claim about the OCR: it is
   * a statement that a human has looked at these values and pressed a button.
   * The confidence the reader assigned did its job on the screen before this.
   */
  protected asParsed(fields: ContractFields): ParsedContract {
    const v = (value?: string) =>
      value && value.trim()
        ? { value: value.trim().slice(0, 120), confidence: 'certain' as const, raw: value.trim() }
        : undefined;
    return {
      registration: v(fields.registration),
      vin: v(fields.vin),
      serial: v(fields.serial),
      manufacturer: v(fields.manufacturer),
      model: v(fields.model),
      startsOn: v(fields.startsOn),
      endsOn: v(fields.endsOn),
      lines: [],
    };
  }

  /**
   * Everything the plan needs, checked.
   *
   * One method for both entry points, so the preview cannot be permissive about
   * something the apply refuses — which would show somebody a plan and then
   * decline to carry it out.
   */
  protected async resolve(
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
    const member = await this.prisma.user.findFirst({
      where: {
        id: data.holderUserId,
        organizationId: data.organizationId,
        ...(narrow ? { spaceAssignments: { some: { spaceId: kind.spaceId ?? '__none__', ...notEndedWhere() } } } : {}),
      },
      select: { id: true },
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

    const parsed = this.asParsed(data.fields);
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
    const startClamped = asked.getTime() > now.getTime();
    const startsAt = startClamped ? now : asked;

    return { proposal, shape, holding, startsAt, startClamped };
  }
}
