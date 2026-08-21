import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KIND_SHAPE_LIMITS, normalizeKindShape, maxHolders } from '@hbcfield/shared';

/** One holder as a request describes it: a member OR a client, never both. */
export interface HolderInput {
  userId?: string | null;
  customerId?: string | null;
}

/**
 * Who holds an asset.
 *
 * A kind decides whether that is one person or several, and this is where that
 * decision is ENFORCED — not in the picker. A screen that only offers one
 * choice is a convenience; a request that skips the screen is the case that
 * matters, and a kind saying "one resident" has to mean one resident to
 * anything that can reach the API.
 *
 * Everything here costs a fixed number of queries however many holders arrive:
 * one lookup for the members, one for the clients, and one transaction to
 * write. Validating in a loop would turn a shift of twenty operators into
 * forty round trips, and the loop is what people write first.
 */
@Injectable()
export class AssetHoldersService {
  constructor(private readonly prisma: PrismaService) {}

  /** The shape of the rows this service reads, for the callers that include them. */
  static readonly select = {
    id: true,
    userId: true,
    customerId: true,
    customer: { select: { id: true, name: true, email: true, phone: true } },
  } as const;

  /**
   * Clean, cap and authorize a requested set of holders.
   *
   * Returns rows ready to write, or throws. Three rules, in this order, because
   * each protects the next: shape (one side per entry), size (before any
   * database work), then ownership (are these people ours).
   */
  async resolve(
    holders: HolderInput[] | undefined,
    organizationId: string,
    kindConfig: unknown,
  ): Promise<Array<{ userId: string | null; customerId: string | null }>> {
    const shape = normalizeKindShape(kindConfig);
    const limit = maxHolders(shape);

    // A kind with no holder cannot be given one, whatever the request says.
    if (limit === 0 || !holders?.length) return [];

    const userIds = new Set<string>();
    const customerIds = new Set<string>();

    for (const raw of holders) {
      const userId = typeof raw?.userId === 'string' ? raw.userId.trim() : '';
      const customerId = typeof raw?.customerId === 'string' ? raw.customerId.trim() : '';
      if (userId && customerId) {
        throw new BadRequestException('A holder is either a member or a client, not both');
      }
      // Deduplicated by the sets: the same person listed twice is a slip, not a
      // reason to fail a save, and the unique index would reject it anyway.
      if (userId) userIds.add(userId);
      else if (customerId) customerIds.add(customerId);
    }

    const total = userIds.size + customerIds.size;
    if (total === 0) return [];
    if (total > limit) {
      throw new BadRequestException(
        limit === 1
          ? 'This type holds one at a time. Change the type to allow several.'
          : `At most ${limit} at a time.`,
      );
    }

    // Which of them the kind actually allows. Checked here rather than trusted
    // from the picker: a kind whose holders are staff must not accept a client
    // id that arrived from somewhere else.
    if (userIds.size && !shape.holder.members) {
      throw new BadRequestException('This type is held by clients, not members');
    }
    if (customerIds.size && !shape.holder.clients) {
      throw new BadRequestException('This type is held by members, not clients');
    }

    // Two queries, whatever the count. Both scoped to the organization, so an
    // id guessed from another tenant comes back missing rather than accepted.
    const [members, clients] = await Promise.all([
      userIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] }, organizationId },
            select: { id: true },
          })
        : Promise.resolve([]),
      customerIds.size
        ? this.prisma.customer.findMany({
            where: { id: { in: [...customerIds] }, organizationId },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (members.length !== userIds.size) {
      throw new BadRequestException('Someone on that list is not in this organization');
    }
    if (clients.length !== customerIds.size) {
      throw new BadRequestException('A client on that list is not in this organization');
    }

    return [
      ...[...userIds].map((userId) => ({ userId, customerId: null })),
      ...[...customerIds].map((customerId) => ({ userId: null, customerId })),
    ];
  }

  /**
   * Replace an asset's holders with exactly this set.
   *
   * Delete-then-insert in one transaction rather than a diff: the set is small
   * and bounded, the write is atomic either way, and a diff here would be three
   * queries and a class of bug in exchange for saving one.
   */
  async set(
    assetId: string,
    rows: Array<{ userId: string | null; customerId: string | null }>,
    tx?: Pick<PrismaService, 'assetHolder'>,
  ): Promise<void> {
    const run = async (db: Pick<PrismaService, 'assetHolder'>) => {
      await db.assetHolder.deleteMany({ where: { assetId } });
      if (rows.length) {
        await db.assetHolder.createMany({
          data: rows.map((r) => ({ assetId, userId: r.userId, customerId: r.customerId })),
          skipDuplicates: true,
        });
      }
    };
    if (tx) return run(tx);
    await this.prisma.$transaction(async (t) => run(t as unknown as Pick<PrismaService, 'assetHolder'>));
  }

  /**
   * A request may still speak the old single-holder language.
   *
   * The web sends `holders`; anything older sends `holderUserId`/`customerId`.
   * Folded together here so the rest of the service knows only one shape —
   * `holders` wins when both arrive, because it is the one that can say "none".
   */
  static fromLegacy(input: {
    holders?: HolderInput[];
    holderUserId?: string | null;
    customerId?: string | null;
  }): HolderInput[] | undefined {
    if (input.holders) return input.holders;
    if (input.holderUserId) return [{ userId: input.holderUserId }];
    if (input.customerId) return [{ customerId: input.customerId }];
    // Neither key present at all means "leave it alone"; an explicit null means
    // "clear it", and those must not collapse into each other.
    return input.holderUserId === undefined && input.customerId === undefined ? undefined : [];
  }

  /** How many a kind allows — for callers that only need the number. */
  limitFor(kindConfig: unknown): number {
    return maxHolders(normalizeKindShape(kindConfig));
  }

  /** Guard for anything that wants the cap without a kind to hand. */
  static readonly hardCap = KIND_SHAPE_LIMITS.maxHolders;
}
