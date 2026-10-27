import { ABSENCE_WHERE, type PrismaService } from '@hbcfield/shared';

/** The day `now` falls on, as the leave table's DATE columns store it (UTC midnight). */
export function leaveDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
