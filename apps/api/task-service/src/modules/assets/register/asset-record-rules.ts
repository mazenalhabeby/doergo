import { BadRequestException } from '@nestjs/common';
import { PrismaService, peopleBriefWithEmail } from '@hbcfield/shared';
import { isAssetStatus, assetDateProblems, type AssetDateProblem } from '@hbcfield/shared';

/**
 * What creating, editing and listing records share: the status and date checks,
 * and holders shown with their names.
 */

type HolderRow = { id: string; userId: string | null; customerId: string | null; customer: unknown };

/**
 * The holders on records, with each member's name filled in.
 *
 * Members carry no foreign key (removing one must never be blocked by an
 * asset pointing at them), so they are looked up rather than joined — once
 * for the whole list, not once per holder. A member who has since been
 * removed resolves to null and simply drops out of the list rather than
 * leaving a row that renders as a blank name.
 */
export async function withHolderNamesMany<T extends { id: string; organizationId: string; holders?: HolderRow[] }>(
  prisma: PrismaService,
  assets: T[],
  organizationId: string,
) {
  const userIds = [
    ...new Set(assets.flatMap((a) => (a.holders ?? []).map((h) => h.userId).filter((id): id is string => !!id))),
  ];
  const members = userIds.length ? await peopleBriefWithEmail(prisma, userIds, { organizationId }) : [];
  const byId = new Map(members.map((m) => [m.id, m]));

  return assets.map((a) => ({
    ...a,
    holders: (a.holders ?? [])
      .map((h) => ({
        id: h.id,
        userId: h.userId,
        customerId: h.customerId,
        user: h.userId ? (byId.get(h.userId) ?? null) : null,
        customer: h.customer ?? null,
      }))
      .filter((h) => h.user || h.customer),
  }));
}

/** The holders on ONE record, with each member's name filled in. */
export async function withHolderNames<T extends { id: string; organizationId: string }>(
  prisma: PrismaService,
  asset: T & { holders?: HolderRow[] },
) {
  const rows = asset.holders ?? [];
  const userIds = rows.map((h) => h.userId).filter((id): id is string => !!id);

  const members = userIds.length
    ? await peopleBriefWithEmail(prisma, userIds, { organizationId: asset.organizationId })
    : [];
  const byId = new Map(members.map((m) => [m.id, m]));

  const holders = rows
    .map((h) => ({
      id: h.id,
      userId: h.userId,
      customerId: h.customerId,
      user: h.userId ? (byId.get(h.userId) ?? null) : null,
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
export function assertAssetStatus(status: unknown): void {
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
export function assertAssetDates(
  next: { installDate?: string | null; warrantyExpiry?: string | null },
  stored?: { installDate: Date | null; warrantyExpiry: Date | null },
): void {
  const problems = assetDateProblems({
    installDate: next.installDate !== undefined ? next.installDate : (stored?.installDate ?? null),
    warrantyExpiry: next.warrantyExpiry !== undefined ? next.warrantyExpiry : (stored?.warrantyExpiry ?? null),
  });
  if (!problems.length) return;
  const say: Record<AssetDateProblem, string> = {
    'install-invalid': 'That install date could not be read',
    'warranty-invalid': 'That warranty date could not be read',
    'warranty-before-install': 'The warranty cannot end before the date it was installed',
  };
  throw new BadRequestException(say[problems[0]!]);
}
