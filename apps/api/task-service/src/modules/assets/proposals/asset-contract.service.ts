import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  success,
  maxHolders,
  parseContract,
  canApply,
  fieldsForKind,
  nameFromContract,
  type HandoverPlan,
  PrismaService,
} from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';
import { AssetCustodyService } from '../custody/asset-custody.service';
import { ContractFields, Db, ContractActor, asParsedContract, kindInScope } from './asset-contract-helpers';
import { ContractPlanService } from './contract-plan.service';

export { type ContractFields, type ContractActor } from './asset-contract-helpers';

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
    private readonly plans: ContractPlanService,
  ) {}

  /** Is a kind in a workspace this caller may manage? (see `kindInScope` in the helpers) */
  static kindInScope(kindSpaceId: string | null | undefined, manageSpaceIds: string[] | null | undefined): boolean {
    return kindInScope(kindSpaceId, manageSpaceIds);
  }

  /**
   * May they use the contract flow at all?
   *
   * Managing assets SOMEWHERE opens the door — org-wide or in a workspace.
   * Which kinds they then reach is decided in `ContractPlanService.resolve`, by
   * each kind's own workspace. It used to fall back to `canViewAllTasks` for the
   * org-wide caller: a READ permission deciding who may create, hand over and retire.
   *
   * Public because deciding a proposal is the same door: accepting one IS
   * `apply`, and refusing or listing them must not ask a different question.
   */
  assertMay(actor: ContractActor, doing: string): void {
    this.access.assertMay(actor, 'manage', doing);
  }

  /** What accepting it would do — nothing is written. */
  async preview(
    data: {
      categoryId: string;
      typeId?: string;
      holderUserId: string;
      fields: ContractFields;
      retireReplaced?: boolean;
    } & ContractActor,
  ) {
    this.assertMay(data, 'use the contract flow');
    const { proposal, startsAt, startClamped, startRaised } = await this.plans.resolve(data);
    return success({
      ...proposal,
      startsAt,
      startClamped,
      startRaised,
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
  async apply(
    data: {
      categoryId: string;
      typeId?: string;
      holderUserId: string;
      fields: ContractFields;
      retireReplaced?: boolean;
    } & ContractActor,
    options: {
      /**
       * Tell the people who received or lost something. Off only for a caller
       * that announces the same event in its own words — a proposal accepted.
       * A second ARGUMENT, not a field on `data`, because `data` arrives from a
       * request body and a client must not be able to switch notifications off.
       */
      announceHandover?: boolean;
    } = {},
  ) {
    this.assertMay(data, 'manage assets');

    // Recomputed from scratch, on the server, exactly as the preview was.
    const { proposal, shape, startsAt, startClamped, startRaised } = await this.plans.resolve(data);
    if (!canApply(proposal)) {
      const first = proposal.problems[0]!;
      throw new BadRequestException(
        first.kind === 'no-name'
          ? 'Nothing on that contract identifies the thing — give it a name.'
          : 'Nobody is named to receive it.',
      );
    }

    const parsed = asParsedContract(data.fields);
    const details = fieldsForKind(shape, parsed);
    const limit = maxHolders(shape);

    // Filled inside the transaction, announced only once it has committed.
    const handovers: Array<{ assetId: string; plan: HandoverPlan }> = [];
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
      const given = await this.custody.apply(tx as unknown as Db, {
        assetId: asset.id,
        organizationId: data.organizationId,
        actorId: data.userId,
        to: [{ userId: data.holderUserId }],
        at: startsAt,
        reason: 'From a contract',
        limit,
        strict: true,
      });
      handovers.push({ assetId: asset.id, plan: given });

      /*
        Only THIS member's custody of what is replaced ends: a co-holder of the
        old one (a shared machine, a client on the same van) keeps their period,
        and an asset somebody still holds is never retired from under them.
      */
      const replaced: string[] = [];
      const retirable: string[] = [];
      for (const step of proposal.steps) {
        if (step.kind !== 'close') continue;
        const others = await this.custody.othersHolding(tx as unknown as Db, step.assetId, data.holderUserId);
        const takenBack = await this.custody.apply(tx as unknown as Db, {
          assetId: step.assetId,
          organizationId: data.organizationId,
          actorId: data.userId,
          to: others,
          at: startsAt,
          reason: `Replaced by ${asset.name}`,
          limit: Math.max(limit, others.length),
          strict: true,
        });
        handovers.push({ assetId: step.assetId, plan: takenBack });
        replaced.push(step.assetId);
        if (others.length === 0) retirable.push(step.assetId);
      }

      /*
        RETIRED, never deleted. It is what `BILLABLE_ASSET_WHERE` excludes, so
        this also stops the old vehicle being billed — which is the whole reason
        the option is offered — while its history, its jobs and its ledger stay
        exactly where they are.
      */
      if (data.retireReplaced && retirable.length) {
        await tx.asset.updateMany({
          where: { id: { in: retirable }, organizationId: data.organizationId },
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
            retired: !!data.retireReplaced && retirable.length > 0,
            termStartsOn: data.fields.startsOn ?? null,
            termEndsOn: data.fields.endsOn ?? null,
            startClamped,
            startRaised,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { asset, replaced, retirable };
    });

    if (options.announceHandover !== false) {
      for (const h of handovers) {
        await this.custody.announce({
          organizationId: data.organizationId,
          assetId: h.assetId,
          actorId: data.userId,
          plan: h.plan,
        });
      }
    }

    return success({
      assetId: created.asset.id,
      name: created.asset.name,
      replaced: created.replaced,
      retired: !!data.retireReplaced && created.retirable.length > 0,
      startedAt: startsAt,
      startClamped,
      startRaised,
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
    this.assertMay(data, 'use the contract flow');
    const text = (data.text ?? '').slice(0, 20_000);
    if (!text.trim()) throw new BadRequestException('There is nothing to read');
    return success(parseContract(text.split(/\r?\n/)));
  }
}
