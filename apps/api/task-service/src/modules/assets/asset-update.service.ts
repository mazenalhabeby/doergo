import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { success, normalizeDetailRows, keepFieldsForKind, type HandoverPlan, assertFoundInOrg } from '@hbcfield/shared';
import { type AssetActor } from './asset-access.service';
import { AssetHoldersService, type HolderInput } from './asset-holders.service';
import { AssetsBase } from './assets.base';

/**
 * Changing an asset record — its fields, its kind (a move between workspaces), its
 * holders through custody.
 */
@Injectable()
export class AssetUpdateService extends AssetsBase {
  /**
   * Update an asset
   */
  async update(data: {
    id: string;
    holderUserId?: string | null;
    customerId?: string | null;
    details?: unknown;
    name?: string;
    serialNumber?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    status?: string;
    installDate?: string | null;
    warrantyExpiry?: string | null;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    notes?: string | null;
    categoryId?: string;
    typeId?: string;
  } & AssetActor) {
    this.assertStatus(data.status);
    // The record as it is NOW must be in a workspace they manage, or 404.
    await this.access.assetInScope(data.id, data, 'manage');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(asset, data.organizationId, 'Asset');

    this.assertDates(data, asset);

    // Verify category if changing
    /*
      Changing an asset's KIND is how it changes workspace.

      An asset has no space of its own — it inherits its kind's — so moving one
      to another workspace means moving it to a kind that lives there. The
      category is kept here rather than only validated, because its field list
      decides which of the record's details survive the move.
    */
    let movingToKind: { config: unknown } | null = null;
    if (data.categoryId !== undefined) {
      if (data.categoryId) {
        const category = await this.prisma.assetCategory.findUnique({
          where: { id: data.categoryId },
        });

        /*
          ⚠️ Moving a record to a kind IS moving it to that kind's workspace, so
          the DESTINATION must be one they manage too — otherwise a depot
          manager could post their van into another depot's register (or into
          no workspace at all, where only an org-wide grant reaches it).
        */
        if (!category || category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', category.spaceId)) {
          throw new BadRequestException('Invalid category');
        }
        // Only an actual change; re-saving the same kind is not a move and must
        // not quietly prune fields somebody added by hand.
        if (category.id !== asset.categoryId) movingToKind = { config: category.config };
      } else if (!this.access.mayIn(data, 'manage', null)) {
        // Clearing the kind takes the record out of every workspace.
        throw new BadRequestException('Choose a type in a workspace you manage');
      }
    }

    // Verify type if changing
    if (data.typeId !== undefined) {
      if (data.typeId) {
        const type = await this.prisma.assetType.findUnique({
          where: { id: data.typeId },
          include: { category: true },
        });

        // A subtype of another workspace's kind is that workspace's vocabulary.
        if (!type || type.category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', type.category.spaceId)) {
          throw new BadRequestException('Invalid type');
        }
      }
    }

    /*
      Holders, resolved before the write.

      `fromLegacy` returns undefined when the request said nothing about them —
      which has to stay distinct from an empty list, or every partial update
      (renaming a flat, say) would silently clear its residents.

      The OLD set is read first so the timeline entry can say what changed from
      what. The kind that decides how many are allowed is the one the record
      will end up in, so a move into a single-holder type is checked against
      that type and not the one it is leaving.
    */
    const wanted: HolderInput[] | undefined = AssetHoldersService.fromLegacy(data);
    let holderRows: Array<{ userId: string | null; customerId: string | null }> | null = null;
    let before: Array<{ userId: string | null; customerId: string | null }> | null = null;
    /** How many the DESTINATION kind allows — the custody write is capped by it too. */
    let holderLimit = 1;

    if (wanted !== undefined) {
      const owner = await this.prisma.asset.findFirst({
        where: { id: data.id, organizationId: data.organizationId },
        select: {
          category: { select: { config: true } },
          holders: { select: { userId: true, customerId: true } },
        },
      });
      if (!owner) throw new NotFoundException('Asset not found in this organization');

      const kindConfig =
        data.categoryId !== undefined && data.categoryId
          ? ((
              await this.prisma.assetCategory.findFirst({
                where: { id: data.categoryId, organizationId: data.organizationId },
                select: { config: true },
              })
            )?.config ?? null)
          : (owner.category?.config ?? null);

      holderRows = await this.holderService.resolve(wanted, data.organizationId, kindConfig);
      holderLimit = this.holderService.limitFor(kindConfig);
      before = owner.holders;
    }

    /*
      The write, and the custody it implies, in ONE transaction.

      Changing who holds a record here is exactly the same event as pressing
      "hand it over", so it goes through the same service and writes the same
      period. Left out, an edit would move the holder without a timeline entry
      and every cost after it would be attributed to the person who no longer
      has it — silently, and with nothing on any screen to suggest why.

      Atomic because the two halves are one fact: an asset whose holder row says
      one thing and whose open period says another cannot be repaired by
      looking at it.
    */
    // Captured inside the transaction, announced only once it has committed.
    let handover: HandoverPlan | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
    const row = await tx.asset.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.manufacturer !== undefined && { manufacturer: data.manufacturer }),
        ...(data.status && { status: data.status as any }),
        ...(data.installDate !== undefined && { installDate: data.installDate ? new Date(data.installDate) : null }),
        ...(data.warrantyExpiry !== undefined && { warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null }),
        ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
        ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
        ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.typeId !== undefined && { typeId: data.typeId }),
        /*
          ⚠️ Holders are NOT written here any more.

          They are the open end of a custody period, and the custody service
          writes both — in this same transaction, just below. Writing them here
          as well would be a second author for one fact, and the two would
          disagree the first time either changed alone.
        */
          /*
          A move drops the fields the destination kind does not ask for.

          "Vehicles" asks for Plate, Mileage and Next service; "Fleet" asks for
          Plate and Insurer. Without this, Mileage survives the move as an ad-hoc
          row — carried from a kind the record has left, shown to everybody who
          opens it afterwards, and explicable to nobody.

          Applied whether or not the caller sent `details`: the move is what
          orphans them, so it is the move that has to clear them, and a client
          that only sent a categoryId must not leave them behind.
        */
          ...(movingToKind && {
            details: keepFieldsForKind(
              data.details !== undefined ? data.details : asset.details,
              movingToKind.config,
            ) as unknown as Prisma.InputJsonValue,
          }),
          ...(!movingToKind &&
            data.details !== undefined && {
              details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
            }),
        },
        select: { id: true },
      });

      if (holderRows) {
        handover = await this.custody.apply(tx as any, {
          assetId: data.id,
          organizationId: data.organizationId,
          actorId: data.userId,
          to: holderRows.map((h) => (h.userId ? { userId: h.userId } : { customerId: h.customerId })),
          limit: holderLimit,
          /*
            Strict, and safely so: `resolve` above has already refused anything
            the kind forbids, and the one remaining "problem" — the same people
            keeping it — is handled as a no-op before this can throw. What
            strict buys is that a real refusal surfaces instead of the holder
            change silently not happening.
          */
          strict: true,
        });
      }
      return row;
    });

    // Re-read with everything the caller expects. Outside the transaction on
    // purpose: it is a read, and holding a connection open for it under
    // PgBouncer's transaction pooling is exactly the wrong trade.
    const full = await this.prisma.asset.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
      },
    });

    if (holderRows && before) {
      await this.activity.logHolderChange(data.id, data.organizationId, data.userId, before, holderRows);
    }
    // An edit that changes the driver is a handover, and is told as one.
    if (handover) {
      await this.custody.announce({ organizationId: data.organizationId, assetId: data.id, actorId: data.userId, plan: handover });
    }

    return success(await this.withHolders(full));
  }
}
