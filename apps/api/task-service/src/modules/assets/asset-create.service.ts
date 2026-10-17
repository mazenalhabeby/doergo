import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { success, normalizeDetailRows } from '@hbcfield/shared';
import { type AssetActor } from './asset-access.service';
import { AssetHoldersService } from './asset-holders.service';
import { AssetsBase } from './assets.base';

/** Creating an asset record. */
@Injectable()
export class AssetCreateService extends AssetsBase {
  async create(data: {
    name: string;
    serialNumber?: string;
    model?: string;
    manufacturer?: string;
    status?: string;
    installDate?: string;
    warrantyExpiry?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    notes?: string;
    categoryId?: string;
    typeId?: string;
    holderUserId?: string | null;
    customerId?: string | null;
    details?: unknown;
  } & AssetActor) {
    this.access.assertMay(data, 'manage', 'create assets');
    this.assertStatus(data.status);
    this.assertDates(data);

    // Verify category if provided. Its config comes back with it: the kind is
    // what decides how many holders a record may have, and asking for it twice
    // would be a second round trip for something already in hand.
    let kindConfig: unknown = null;
    let kindSpaceId: string | null = null;
    if (data.categoryId) {
      const category = await this.prisma.assetCategory.findUnique({
        where: { id: data.categoryId },
        select: { organizationId: true, config: true, spaceId: true },
      });

      /*
        ⚠️ The KIND decides the workspace, so it is the kind a space-scoped
        manager must be allowed in. Same answer for another depot's kind as for
        another tenant's — "that kind exists, just not for you" names what
        another workspace runs.
      */
      if (!category || category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', category.spaceId)) {
        throw new BadRequestException('Invalid category');
      }
      kindConfig = category.config;
      kindSpaceId = category.spaceId;
    }
    /*
      A record with no kind lives in no workspace — reachable afterwards only by
      an org-wide grant. A space-scoped manager creating one would be creating a
      record they could never open again, in nobody's register.
    */
    if (!this.access.mayIn(data, 'manage', kindSpaceId)) {
      throw new BadRequestException('Choose a type in a workspace you manage');
    }

    // Verify type if provided
    if (data.typeId) {
      const type = await this.prisma.assetType.findUnique({
        where: { id: data.typeId },
        include: { category: true },
      });

      if (!type || type.category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', type.category.spaceId)) {
        throw new BadRequestException('Invalid type');
      }

      // Ensure type belongs to the specified category
      if (data.categoryId && type.categoryId !== data.categoryId) {
        throw new BadRequestException('Type does not belong to the specified category');
      }
    }

    // Resolved BEFORE the write: a holder that is not this organization's must
    // stop the create, not leave a record behind with nobody on it.
    const holderRows = await this.holderService.resolve(
      AssetHoldersService.fromLegacy(data),
      data.organizationId,
      kindConfig,
    );

    const asset = await this.prisma.asset.create({
      data: {
        name: data.name,
        serialNumber: data.serialNumber,
        model: data.model,
        manufacturer: data.manufacturer,
        status: (data.status as any) || 'ACTIVE',
        installDate: data.installDate ? new Date(data.installDate) : null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        locationAddress: data.locationAddress,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        notes: data.notes,
        categoryId: data.categoryId,
        typeId: data.typeId,
        organizationId: data.organizationId,
        details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
        // Written with the record: nested creates run inside Prisma's own
        // transaction, so a record never exists for an instant with the wrong
        // people on it.
        holders: holderRows.length ? { create: holderRows } : undefined,
        /*
          …and the custody that holder row is the open end of.

          A van created WITH a driver has been in that driver's hands since it
          was recorded, and saying so here is what makes the very first fuel
          receipt attributable. Opened at the same instant, in the same nested
          create, so the two can never exist apart.
        */
        custody: holderRows.length
          ? {
              create: holderRows.map((h) => ({
                organizationId: data.organizationId,
                userId: h.userId,
                customerId: h.customerId,
                startedAt: new Date(),
                openedById: data.userId,
              })),
            }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
      },
    });

    return success(await this.withHolders(asset));
  }
}
