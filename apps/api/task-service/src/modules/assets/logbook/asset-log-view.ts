import {
  findLogType,
  dueStatus,
  COST_LOG_KEY,
  type AssetLogState,
  type KindShape,
  peopleFaces,
  PrismaService,
} from '@hbcfield/shared';

/** How a logbook entry and its asset's due rules are shown — the same for every screen. */

/** The keys never leave the server — only whether there is a photo. */
export function presentLogEntry<T extends { receiptKey?: string | null; logType?: string | null }>(row: T) {
  const { receiptKey, ...rest } = row;
  return { ...rest, logType: row.logType ?? COST_LOG_KEY, hasReceipt: !!receiptKey };
}

/** Where each type stands NOW, from the stored state — for any screen. */
export function dueFor(state: AssetLogState, shape: KindShape, now: Date) {
  return state.due
    .map((s) => {
      const type = findLogType(shape, s.key);
      // A rule removed from the kind since the last write says nothing.
      if (!type?.due) return null;
      const reading = s.meterKey ? (state.readings[s.meterKey]?.value ?? null) : null;
      const unit = s.meterKey ? (type.fields.find((f) => f.key === s.meterKey)?.unit ?? null) : null;
      return { ...s, label: type.label, color: type.color, unit, reading, ...dueStatus(s, reading, now) };
    })
    .filter(<T>(v: T | null): v is T => v !== null);
}

/** The people behind these ids, by id — one query. */
export async function facesById(prisma: PrismaService, ids: Array<string | null | undefined>, organizationId: string) {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  const users = unique.length ? await peopleFaces(prisma, unique, { organizationId }) : [];
  return new Map(users.map((u) => [u.id, u]));
}
