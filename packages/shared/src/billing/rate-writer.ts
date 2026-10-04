/**
 * The ONE writer of rates, for every service.
 *
 * ⚠️ Every path that changes a rate — the organization default, a workspace, a
 * member, a member at one client, a work role's day rate — goes through
 * `writeRateChange`. Four copies of "insert a history row, then fix the column"
 * is how one of them forgets the history, and a rate edited down that path
 * silently re-prices the past again. `rate-writer-guard.spec.ts` fails if a
 * rate column is written anywhere else.
 *
 * Server-only (it talks to the database through whatever Prisma client or
 * transaction it is handed), so it is exported from the package root and never
 * from the browser entry.
 */

import {
  RateBook,
  dayKeyOfDate,
  planRateChange,
  utcTodayKey,
  type RateHistoryKind,
  type RateHistoryRow,
  type RateTargetKind,
} from './rate-history';

/**
 * The slice of a Prisma client this needs — a transaction client fits.
 * Typed loosely on purpose: Prisma's generated generics are not assignable to a
 * narrow structural type, and the rows are re-shaped by `toRateRow` anyway.
 */
export interface RateHistoryStore {
  rateHistory: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>;
  };
}

type RawRateRow = {
  target: string;
  targetId: string;
  spaceId: string | null;
  kind: string;
  cents: number | null;
  effectiveFrom: Date;
  createdAt: Date;
};

export const toRateRow = (r: RawRateRow): RateHistoryRow => ({
  target: r.target as RateTargetKind,
  targetId: r.targetId,
  spaceId: r.spaceId,
  kind: r.kind as RateHistoryKind,
  cents: r.cents,
  effectiveFrom: dayKeyOfDate(r.effectiveFrom),
  createdAt: r.createdAt,
});

/** The columns a history query needs — and nothing else, so the read stays narrow. */
export const RATE_ROW_SELECT = {
  target: true,
  targetId: true,
  spaceId: true,
  kind: true,
  cents: true,
  effectiveFrom: true,
  createdAt: true,
} as const;

/**
 * Record a rate change, then answer what the rate IS today.
 *
 * The caller writes that answer onto the record's own column (the "rate now"
 * mirror the screens read). Today's rate is computed from the WHOLE series,
 * never taken from the value just written: a back-dated change can sit behind a
 * later one, and a change scheduled for next month leaves today alone.
 *
 * @throws RateChangeError for an impossible or out-of-range start day.
 */
export async function writeRateChange(
  store: RateHistoryStore,
  input: {
    organizationId: string;
    target: RateTargetKind;
    targetId: string;
    kind: RateHistoryKind;
    spaceId?: string | null;
    cents: unknown;
    effectiveFrom?: unknown;
    createdById?: string | null;
    today?: string;
  },
): Promise<{ effectiveFrom: string; cents: number | null; nowCents: number | null }> {
  const today = input.today ?? utcTodayKey();
  const series = {
    organizationId: input.organizationId,
    target: input.target,
    targetId: input.targetId,
    kind: input.kind,
    spaceId: input.spaceId ?? null,
  };
  const before = (await store.rateHistory.findMany({ where: series, select: RATE_ROW_SELECT })) as RawRateRow[];
  // The first rate this record ever had, with no start day given, applies since always.
  const plan = planRateChange({ ...input, today, sinceAlways: before.length === 0 });
  await store.rateHistory.create({ data: plan.row });
  const book = new RateBook([...before.map(toRateRow), toRateRow({ ...plan.row, spaceId: plan.row.spaceId, createdAt: new Date() })]);
  return {
    effectiveFrom: plan.effectiveFrom,
    cents: plan.cents,
    nowCents: book.on(today, input.target, input.targetId, input.kind, null, input.spaceId ?? null),
  };
}

/**
 * Load every dated rate an invoice (or a screen) could need, in ONE query.
 *
 * `targets` names the records; ROLE rows are limited to `spaceId`.
 */
export async function loadRateBook(
  store: RateHistoryStore,
  organizationId: string,
  targets: {
    organizationIds?: string[];
    spaceIds?: string[];
    memberIds?: string[];
    assignmentIds?: string[];
    roleIds?: string[];
    roleSpaceId?: string | null;
  },
): Promise<RateBook> {
  const or: Record<string, unknown>[] = [];
  const add = (target: RateTargetKind, ids?: string[], extra: Record<string, unknown> = {}) => {
    const list = [...new Set((ids ?? []).filter(Boolean))];
    if (list.length) or.push({ target, targetId: { in: list }, ...extra });
  };
  add('ORGANIZATION', targets.organizationIds);
  add('SPACE', targets.spaceIds);
  add('MEMBER', targets.memberIds);
  add('ASSIGNMENT', targets.assignmentIds);
  if (targets.roleSpaceId) add('ROLE', targets.roleIds, { spaceId: targets.roleSpaceId });
  if (or.length === 0) return new RateBook([]);
  const rows = await store.rateHistory.findMany({
    where: { organizationId, OR: or },
    select: RATE_ROW_SELECT,
  });
  return new RateBook((rows as RawRateRow[]).map(toRateRow));
}
