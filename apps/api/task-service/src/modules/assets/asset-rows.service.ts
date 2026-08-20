import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success, paginated, normalizeKindShape, findKindList, normalizeListRow, listRowIsEmpty,
} from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';

/**
 * Rows of the tables a kind declares — a parts catalogue, a set of keys.
 *
 * Keeps assetList(), which decides whether a table's rows belong to the record
 * or to its kind. That decision is this service's whole subject.
 */
@Injectable()
export class AssetRowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /**
   * The rows of one table on a record — a machine's parts, an apartment's keys.
   *
   * Paged, because a machine can have hundreds of parts and a record page must
   * not pay for all of them. Search runs in SQL over the row's JSON rather than
   * in JavaScript over a fetched page, or it would only ever find what happened
   * to be on screen.
   */
  async listRows(data: {
    id: string;
    list: string;
    search?: string;
    page?: number;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    const { list, owner } = await this.assetList(data.id, data.list, data.organizationId);

    const page = Math.max(1, data.page ?? 1);
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    const search = data.search?.trim();

    const where: Prisma.AssetListRowWhereInput = {
      ...owner,
      list: list.label,
      // string_contains over the whole row would need a column; matching any
      // declared column keeps it to the values people actually see.
      ...(search
        ? {
            OR: list.columns.map((c) => ({
              values: { path: [c.label], string_contains: search } as Prisma.JsonFilter,
            })),
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.assetListRow.findMany({
        where,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.assetListRow.count({ where }),
    ]);

    return paginated(rows, { page, limit, total });
  }

  /** Add a row. Values are cleaned against the columns the list declares. */
  async addRow(data: {
    id: string;
    list: string;
    values: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    const { list, owner } = await this.assetList(data.id, data.list, data.organizationId);

    const values = normalizeListRow(list, data.values);
    if (listRowIsEmpty(values)) {
      throw new BadRequestException('A row needs something in it');
    }

    // Appended, not inserted: a row lands where somebody expects it to.
    const last = await this.prisma.assetListRow.findFirst({
      where: { ...owner, list: list.label },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const row = await this.prisma.assetListRow.create({
      data: {
        organizationId: data.organizationId,
        ...owner,
        list: list.label,
        values: values as unknown as Prisma.InputJsonValue,
        position: (last?.position ?? 0) + 1,
      },
    });

    return success(row);
  }

  /** Change one row. */
  async updateRow(data: {
    id: string;
    rowId: string;
    values: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    // Scoped to the ORG, then re-checked against the resolved owner below: a
    // shared row belongs to the kind, so scoping the lookup to this asset would
    // make the catalogue read-only from every record that uses it.
    const existing = await this.prisma.assetListRow.findFirst({
      where: { id: data.rowId, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Row not found');

    const { list, owner } = await this.assetList(data.id, existing.list, data.organizationId);
    if (
      (owner.assetId && existing.assetId !== owner.assetId) ||
      (owner.categoryId && existing.categoryId !== owner.categoryId)
    ) {
      throw new NotFoundException('Row not found');
    }
    const values = normalizeListRow(list, data.values);
    if (listRowIsEmpty(values)) {
      throw new BadRequestException('A row needs something in it');
    }

    const row = await this.prisma.assetListRow.update({
      where: { id: data.rowId },
      data: { values: values as unknown as Prisma.InputJsonValue },
    });

    return success(row);
  }

  /** Remove one row, from this record or from the kind's shared catalogue. */
  async removeRow(data: {
    id: string;
    rowId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    const asset = await this.access.assetInOrg(data.id, data.organizationId);

    // Either this record's own row, or a row of a catalogue this record's kind
    // owns. Never another kind's, and never another record's.
    const { count } = await this.prisma.assetListRow.deleteMany({
      where: {
        id: data.rowId,
        organizationId: data.organizationId,
        OR: [{ assetId: data.id }, ...(asset.categoryId ? [{ categoryId: asset.categoryId }] : [])],
      },
    });
    if (!count) throw new NotFoundException('Row not found');

    return success({ id: data.rowId });
  }

  /**
   * Resolve an asset and one of the lists its KIND declares.
   *
   * The list must be declared, for the same reason a money category must be:
   * free-text names would split one table into "Parts" and "parts" and neither
   * would look wrong.
   */
  private async assetList(assetId: string, listLabel: string, organizationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      select: { id: true, categoryId: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    const list = findKindList(shape, listLabel ?? '');
    if (!list) throw new BadRequestException(`"${listLabel}" is not a list on this kind`);

    // A shared table's rows hang off the KIND, so every record of that kind
    // reads the same catalogue. Resolving the owner here means every caller
    // below is identical whichever sort of table it is.
    const owner = list.shared
      ? { categoryId: asset.categoryId, assetId: null }
      : { assetId: asset.id, categoryId: null };

    if (list.shared && !asset.categoryId) {
      throw new BadRequestException('This record has no kind, so it has no shared catalogue');
    }

    return { shape, list, owner };
  }
}
