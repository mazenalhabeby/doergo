import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Role, success, paginated, TaskStatus, normalizeDetailRows, keepFieldsForKind,
  isAssetStatus, assetDateProblems, SELECTABLE_ASSET_WHERE, type AssetDateProblem,
} from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetHoldersService, type HolderInput } from './asset-holders.service';
import { AssetCustodyService } from './asset-custody.service';
import { AssetActivityService } from './asset-activity.service';

/**
 * The records themselves: the things an organization owns and who has them.
 *
 * Tables, money and activity moved out to services of their own; this one asks
 * them for what it needs. It kept the name so every existing import and message
 * pattern still resolves.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly activity: AssetActivityService,
    private readonly holderService: AssetHoldersService,
    private readonly custody: AssetCustodyService,
  ) {}

  /**
   * Create a new asset
   */
  /**
   * Resolve who holds a record: a member, a client, or nobody.
   *
   * EITHER a member or a client, never both — the same rule an apartment's
   * resident follows. Picking one clears the other rather than rejecting the
   * request, because both arriving usually means the form sent a stale value,
   * and refusing would lose the edit the person actually made.
   *
   * The client is checked against THIS organization: a customer id is guessable,
   * and without this a record could be pinned to another tenant's customer.
   */
  /**
   * The holders on a record, with each member's name filled in.
   *
   * Members carry no foreign key (removing one must never be blocked by an
   * asset pointing at them), so they are looked up rather than joined — once
   * for the whole list, not once per holder. A member who has since been
   * removed resolves to null and simply drops out of the list rather than
   * leaving a row that renders as a blank name.
   */
  private async withHoldersMany<T extends { id: string; organizationId: string; holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }> }>(
    assets: T[],
    organizationId: string,
  ) {
    const userIds = [
      ...new Set(assets.flatMap((a) => (a.holders ?? []).map((h) => h.userId).filter((id): id is string => !!id))),
    ];
    const members = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    return assets.map((a) => ({
      ...a,
      holders: (a.holders ?? [])
        .map((h) => ({
          id: h.id,
          userId: h.userId,
          customerId: h.customerId,
          user: h.userId ? byId.get(h.userId) ?? null : null,
          customer: h.customer ?? null,
        }))
        .filter((h) => h.user || h.customer),
    }));
  }

  private async withHolders<T extends { id: string; organizationId: string }>(
    asset: T & { holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }> },
  ) {
    const rows = asset.holders ?? [];
    const userIds = rows.map((h) => h.userId).filter((id): id is string => !!id);

    const members = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, organizationId: asset.organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    const holders = rows
      .map((h) => ({
        id: h.id,
        userId: h.userId,
        customerId: h.customerId,
        user: h.userId ? byId.get(h.userId) ?? null : null,
        customer: h.customer ?? null,
      }))
      .filter((h) => h.user || h.customer);

    return { ...asset, holders };
  }

  /**
   * Refuse a status that is not one of the four.
   *
   * The DTO validates it at the gateway, but the queue reaches this method with
   * whatever was put on the job, and `status as any` straight into Prisma turns
   * a typo into a 500 with an enum error in the log instead of a sentence.
   */
  private assertStatus(status: unknown): void {
    if (status === undefined || status === null || status === '') return;
    if (!isAssetStatus(status)) throw new BadRequestException('That is not a status a record can have');
  }

  /**
   * Refuse dates that cannot both be true — asked of what the record WILL hold.
   *
   * A partial update may carry only the warranty; comparing it with nothing
   * would let a warranty ending before the install date through the second
   * time somebody edits the record.
   */
  private assertDates(
    next: { installDate?: string | null; warrantyExpiry?: string | null },
    stored?: { installDate: Date | null; warrantyExpiry: Date | null },
  ): void {
    const problems = assetDateProblems({
      installDate: next.installDate !== undefined ? next.installDate : stored?.installDate ?? null,
      warrantyExpiry: next.warrantyExpiry !== undefined ? next.warrantyExpiry : stored?.warrantyExpiry ?? null,
    });
    if (!problems.length) return;
    const say: Record<AssetDateProblem, string> = {
      'install-invalid': 'That install date could not be read',
      'warranty-invalid': 'That warranty date could not be read',
      'warranty-before-install': 'The warranty cannot end before the date it was installed',
    };
    throw new BadRequestException(say[problems[0]!]);
  }

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'create assets');
    this.assertStatus(data.status);
    this.assertDates(data);

    // Verify category if provided. Its config comes back with it: the kind is
    // what decides how many holders a record may have, and asking for it twice
    // would be a second round trip for something already in hand.
    let kindConfig: unknown = null;
    if (data.categoryId) {
      const category = await this.prisma.assetCategory.findUnique({
        where: { id: data.categoryId },
        select: { organizationId: true, config: true },
      });

      if (!category || category.organizationId !== data.organizationId) {
        throw new BadRequestException('Invalid category');
      }
      kindConfig = category.config;
    }

    // Verify type if provided
    if (data.typeId) {
      const type = await this.prisma.assetType.findUnique({
        where: { id: data.typeId },
        include: { category: true },
      });

      if (!type || type.category.organizationId !== data.organizationId) {
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

  /**
   * Get all assets with filters
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    categoryId?: string;
    typeId?: string;
    status?: string;
    /** Leave RETIRED out unless a status is asked for explicitly. */
    hideRetired?: boolean | string;
    search?: string;
    /** Narrow to one workspace — intersected with what the caller holds. */
    spaceId?: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    /** Workspaces where the caller holds canViewAllTasks by a SPACE role. */
    viewAllSpaceIds?: string[];
    organizationId: string;
  }) {
    this.access.assertMay(query as any, 'view assets');

    const page = Math.max(1, query.page || 1);
    const limit = this.access.pageSize(query.limit);
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: query.organizationId,
    };

    /*
      Which workspaces this list may show.

      Undefined for an org-wide caller with no workspace chosen, so their query
      is exactly what it was. A space-scoped one always gets a clause — see
      spaceFilter, which intersects rather than replaces.
    */
    const category = this.access.spaceFilter(query as any, query.spaceId);
    if (category) where.category = category;

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.typeId) where.typeId = query.typeId;
    if (query.status) where.status = query.status;
    /*
      Retired records stay on the books and out of the way.

      Opt-in rather than a new default: every existing caller of this list was
      written against "everything", and changing what an endpoint returns under
      a caller that did not ask is how a screen quietly loses rows. An explicit
      `status` wins — asking for RETIRED has to return them.
    */
    else if (query.hideRetired === true || query.hideRetired === 'true') {
      Object.assign(where, SELECTABLE_ASSET_WHERE);
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true, color: true, icon: true } },
          type: { select: { id: true, name: true } },
          holders: { select: AssetHoldersService.select },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    // One member lookup for the whole page, not one per row: a list is exactly
    // where an N+1 hides until the page it is on gets long.
    return paginated(await this.withHoldersMany(assets, query.organizationId), { page, limit, total });
  }

  /**
   * Assets that belong to no space, and so appear on no screen.
   *
   * A type carries the space; an asset reaches its space through its type. Rows
   * created before types were space-scoped — and any asset that lost its type
   * when one was deleted — therefore sit outside every space's Assets tab while
   * still being real records, still linked to tasks, and still counted on the
   * bill. Invisible and chargeable is the worst pair of properties a record can
   * have, so they are listed here to be moved into a space or deleted.
   *
   * Top-level only, exactly like the billing count: a part inside a machine is
   * reached through the machine, so moving the machine takes it with it.
   */
  async listOrphans(data: { userId: string; userRole: string; organizationId: string; canViewAllTasks?: boolean }) {
    this.access.assertMay(data as any, 'view assets');

    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId: data.organizationId,
        OR: [{ categoryId: null }, { category: { spaceId: null } }],
      },
      // Capped rather than paged: this is a cleanup list that should end at
      // zero, and a page control on a list nobody wants to have is noise.
      take: 200,
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        status: true,
        serialNumber: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    return success(assets);
  }

  /**
   * Get a single asset by ID
   */
  async findOne(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: {
        // config comes with the category: the record page is drawn from the
        // kind's shape, and a second round trip for it would be visible.
        category: { select: { id: true, name: true, color: true, icon: true, config: true, spaceId: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
        _count: { select: { tasks: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    return success(await this.withHolders(asset));
  }

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    this.assertStatus(data.status);

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

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

        if (!category || category.organizationId !== data.organizationId) {
          throw new BadRequestException('Invalid category');
        }
        // Only an actual change; re-saving the same kind is not a move and must
        // not quietly prune fields somebody added by hand.
        if (category.id !== asset.categoryId) movingToKind = { config: category.config };
      }
    }

    // Verify type if changing
    if (data.typeId !== undefined) {
      if (data.typeId) {
        const type = await this.prisma.assetType.findUnique({
          where: { id: data.typeId },
          include: { category: true },
        });

        if (!type || type.category.organizationId !== data.organizationId) {
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
          ? (
              await this.prisma.assetCategory.findFirst({
                where: { id: data.categoryId, organizationId: data.organizationId },
                select: { config: true },
              })
            )?.config ?? null
          : owner.category?.config ?? null;

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
        ...(!movingToKind && data.details !== undefined && {
          details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
        }),
      },
      select: { id: true },
    });

      if (holderRows) {
        await this.custody.apply(tx as any, {
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

    return success(await this.withHolders(full));
  }

  /**
   * Delete an asset
   */
  async delete(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'delete assets');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: { _count: { select: { tasks: true } } },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    // An asset's VALUE is its history — the maintenance record attached to that
    // machine, vehicle or flat. Deleting one with work against it destroyed that
    // permanently and silently detached the tasks (audit AS-B1), while the product
    // already has the right answer for "this is out of service": status RETIRED,
    // which is exactly what BILLABLE_ASSET_WHERE excludes, so retiring it also
    // stops the billing. Mirrors the space purge rule: hard delete for empty
    // records only, everything else is deactivated.
    if (asset._count.tasks > 0) {
      throw new BadRequestException(
        `This asset has ${asset._count.tasks} job(s) in its history and cannot be deleted. ` +
          'Set its status to Retired instead — the record and its history stay, and it stops being billed.',
      );
    }

    await this.prisma.asset.delete({ where: { id: data.id } });

    return success(null, 'Asset deleted successfully');
  }

  /**
   * Get maintenance history for an asset (completed tasks)
   */
  async getMaintenanceHistory(data: {
    id: string;
    page?: number;
    limit?: number;
    /**
     * 'done' — finished work only, which is what a maintenance history means.
     * 'all'  — everything, including work still open. The record page wants
     *          this: somebody standing at the machine needs to know a job is
     *          already raised before raising a second one.
     */
    scope?: 'done' | 'all';
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view maintenance history');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    const page = Math.max(1, data.page || 1);
    const limit = this.access.pageSize(data.limit);
    const skip = (page - 1) * limit;

    const finishedOnly = data.scope !== 'all';
    const where = {
      assetId: data.id,
      ...(finishedOnly ? { status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] } } : {}),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    // Transform to maintenance history format
    const history = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      completedAt: task.updatedAt,
      duration: task.routeStartedAt && task.routeEndedAt
        ? Math.floor((task.routeEndedAt.getTime() - task.routeStartedAt.getTime()) / 1000)
        : null,
      assignedTo: task.assignedTo,
    }));

    return paginated(history, { page, limit, total });
  }
}
