import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  normalizeKindShape,
  maxHolders,
  parseContract,
  proposeFromContract,
  canApply,
  fieldsForKind,
  nameFromContract,
  type ParsedContract,
  type ContractProposal,
  type KindShape,
} from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetCustodyService } from './asset-custody.service';

/** What a client sends: the reading, after a person has corrected it. */
export interface ContractFields {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

type Db = Parameters<AssetCustodyService['apply']>[0];

/**
 * Who is acting, and where they may.
 *
 * `manageSpaceIds` follows the three states the rest of the codebase uses:
 * undefined = org-wide (the caller already passed `@RequirePermission`-strength
 * checks, or is an internal caller such as accepting a proposal), an array =
 * only kinds in those workspaces, and an EMPTY array = nowhere.
 */
interface ContractActor {
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  manageSpaceIds?: string[];
  organizationId: string;
}

/**
 * A contract → a record, a handover, and the retirement of what it replaces.
 *
 * The situation: somebody is handed a rental agreement. The office then has to
 * create the vehicle, type its plate and model, assign it, find the old one and
 * retire it — four screens, in an order nobody remembers, days later if at all.
 * Meanwhile every fuel receipt lands against the car they stopped driving.
 *
 * ⚠️ THE PROPOSAL IS COMPUTED HERE, NOT ACCEPTED FROM THE CLIENT.
 *
 * The request carries the READING — a plate, a VIN, a make — which is ordinary
 * user input and is validated as such. It does NOT carry "and close custody
 * c-123 and retire asset a-456"; those are derived from the kind and from what
 * the member actually holds, on the server, on both the preview and the apply.
 * A client that could name the record to retire could retire any record.
 *
 * ⚠️ AND THE PREVIEW AND THE APPLY ARE THE SAME FUNCTION. A preview computed
 * one way and executed another is a confirmation dialog that describes
 * something else — on a screen where somebody is agreeing to take a vehicle off
 * the books.
 */
@Injectable()
export class AssetContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly custody: AssetCustodyService,
  ) {}

  /**
   * Is a kind in a workspace this caller may manage?
   *
   * A kind in NO workspace is refused to a space-scoped caller: it belongs to
   * nobody's space, so no space grant can reach it — only an org-wide one.
   */
  static kindInScope(kindSpaceId: string | null | undefined, manageSpaceIds?: string[]): boolean {
    if (manageSpaceIds === undefined) return true;
    return !!kindSpaceId && manageSpaceIds.includes(kindSpaceId);
  }

  /**
   * May they use the contract flow at all?
   *
   * Org-wide callers keep the check they always had. A space-scoped manager is
   * let through when they manage assets SOMEWHERE — which kinds they then reach
   * is decided in `resolve`, by each kind's own workspace.
   */
  private assertMay(actor: ContractActor, doing: string): void {
    if (actor.manageSpaceIds === undefined) {
      this.access.assertMay(actor, doing);
      return;
    }
    if (actor.manageSpaceIds.length === 0) {
      throw new ForbiddenException(`You do not have permission to ${doing}`);
    }
  }

  /**
   * A person's corrections → the shape the shared rules read.
   *
   * Everything here is `certain`, and that is not a claim about the OCR: it is
   * a statement that a human has looked at these values and pressed a button.
   * The confidence the reader assigned did its job on the screen before this.
   */
  private asParsed(fields: ContractFields): ParsedContract {
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
  private async resolve(data: {
    categoryId: string;
    typeId?: string;
    holderUserId: string;
    fields: ContractFields;
    retireReplaced?: boolean;
    manageSpaceIds?: string[];
    organizationId: string;
  }): Promise<{
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
    if (!kind || !AssetContractService.kindInScope(kind.spaceId, data.manageSpaceIds)) {
      throw new NotFoundException('That type is not in this organization');
    }

    const shape = normalizeKindShape(kind.config);
    if (maxHolders(shape) === 0) throw new BadRequestException('This type is not held by anybody');
    if (!shape.holder.members) throw new BadRequestException('This type is held by clients, not members');

    const member = await this.prisma.user.findFirst({
      where: { id: data.holderUserId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!member) throw new BadRequestException('That person is not in this organization');

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
        id: true, assetId: true, userId: true, customerId: true, startedAt: true, endedAt: true,
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

  /** What accepting it would do — nothing is written. */
  async preview(data: {
    categoryId: string;
    typeId?: string;
    holderUserId: string;
    fields: ContractFields;
    retireReplaced?: boolean;
  } & ContractActor) {
    this.assertMay(data, 'view assets');
    const { proposal, startsAt, startClamped } = await this.resolve(data);
    return success({
      ...proposal,
      startsAt,
      startClamped,
      canApply: canApply(proposal),
    });
  }

  /**
   * Carry it out — all of it, or none of it.
   *
   * One transaction, because the three writes are one event: an asset created
   * and handed over while the old custody stays open is worse than nothing
   * happening, since every later cost then lands against both vehicles and
   * nothing on screen says why.
   */
  async apply(data: {
    categoryId: string;
    typeId?: string;
    holderUserId: string;
    fields: ContractFields;
    retireReplaced?: boolean;
  } & ContractActor) {
    this.assertMay(data, 'update assets');

    // Recomputed from scratch, on the server, exactly as the preview was.
    const { proposal, shape, startsAt, startClamped } = await this.resolve(data);
    if (!canApply(proposal)) {
      const first = proposal.problems[0]!;
      throw new BadRequestException(
        first.kind === 'no-name'
          ? 'Nothing on that contract identifies the thing — give it a name.'
          : 'Nobody is named to receive it.',
      );
    }

    const parsed = this.asParsed(data.fields);
    const details = fieldsForKind(shape, parsed);
    const limit = maxHolders(shape);

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          organizationId: data.organizationId,
          categoryId: data.categoryId,
          typeId: data.typeId ?? null,
          name: proposal.asset.name,
          serialNumber: proposal.asset.serialNumber ?? null,
          model: proposal.asset.model ?? null,
          manufacturer: proposal.asset.manufacturer ?? null,
          status: 'ACTIVE',
          details: details as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, name: true },
      });

      /*
        Both halves go through the custody service, which is the ONLY writer of
        these two tables. Reimplementing "close the old one" here would be a
        second author for one fact, and the two would disagree the first time
        either changed alone.
      */
      await this.custody.apply(tx as unknown as Db, {
        assetId: asset.id,
        organizationId: data.organizationId,
        actorId: data.userId,
        to: [{ userId: data.holderUserId }],
        at: startsAt,
        reason: 'From a contract',
        limit,
        strict: true,
      });

      const replaced: string[] = [];
      for (const step of proposal.steps) {
        if (step.kind !== 'close') continue;
        await this.custody.apply(tx as unknown as Db, {
          assetId: step.assetId,
          organizationId: data.organizationId,
          actorId: data.userId,
          to: [],
          at: startsAt,
          reason: `Replaced by ${asset.name}`,
          limit,
          strict: true,
        });
        replaced.push(step.assetId);
      }

      /*
        RETIRED, never deleted. It is what `BILLABLE_ASSET_WHERE` excludes, so
        this also stops the old vehicle being billed — which is the whole reason
        the option is offered — while its history, its jobs and its ledger stay
        exactly where they are.
      */
      if (data.retireReplaced && replaced.length) {
        await tx.asset.updateMany({
          where: { id: { in: replaced }, organizationId: data.organizationId },
          data: { status: 'RETIRED' },
        });
      }

      await tx.assetActivity.create({
        data: {
          organizationId: data.organizationId,
          assetId: asset.id,
          type: 'CREATED_FROM_CONTRACT',
          authorId: data.userId,
          body: nameFromContract(parsed) || asset.name,
          metadata: {
            replaced,
            retired: !!data.retireReplaced && replaced.length > 0,
            termStartsOn: data.fields.startsOn ?? null,
            termEndsOn: data.fields.endsOn ?? null,
            startClamped,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { asset, replaced };
    });

    return success({
      assetId: created.asset.id,
      name: created.asset.name,
      replaced: created.replaced,
      retired: !!data.retireReplaced && created.replaced.length > 0,
      startedAt: startsAt,
      startClamped,
    });
  }

  /**
   * Read a contract's text, without deciding anything.
   *
   * The phone reads on the device and never sends the text anywhere; the web
   * has no reader, so it posts what somebody pasted. Both end up in the same
   * rules — this is only the door for the second.
   */
  async read(data: { text?: string } & ContractActor) {
    this.assertMay(data, 'view assets');
    const text = (data.text ?? '').slice(0, 20_000);
    if (!text.trim()) throw new BadRequestException('There is nothing to read');
    return success(parseContract(text.split(/\r?\n/)));
  }
}
