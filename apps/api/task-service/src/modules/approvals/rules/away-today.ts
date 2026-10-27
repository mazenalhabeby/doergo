import { ABSENCE_WHERE, delegationDay, type PrismaService } from '@hbcfield/shared';

/**
 * The day `now` falls on in the ORGANIZATION's zone, as the leave table's DATE columns store it (UTC midnight of
 * that local day) — the same day the stand-ins are read for. UTC's own day put HBC USA's evening on tomorrow.
 */
export function leaveDay(now: Date, timeZone: string | null | undefined): Date {
  return delegationDay(now, timeZone);
}

/**
 * Which of these people are away on approved leave on `day` — one query. Nobody is reminded or asked about an
 * item while on holiday (the "who else can decide" list and the reminder sweep read the same answer).
 */
export async function awayOn(prisma: PrismaService, ids: string[], day: Date): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const away = await prisma.timeOff.findMany({
    where: {
      technicianId: { in: ids },
      status: 'APPROVED',
      ...ABSENCE_WHERE,
      startDate: { lte: day },
      endDate: { gte: day },
    },
    select: { technicianId: true },
  });
  return new Set(away.map((a) => a.technicianId));
}
