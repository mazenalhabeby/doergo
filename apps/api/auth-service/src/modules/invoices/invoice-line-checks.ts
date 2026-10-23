import { HttpStatus } from '@nestjs/common';
import { countReportsInOrg, countJobsInOrg, parseDayKey, isHoursBasis, type PrismaService } from '@hbcfield/shared';
import { LINE_KINDS } from './invoice-helpers';

/*
  The checks on an incoming invoice line: its day-line fields cleaned, and every
  job, report and worker it names kept inside this organization.
*/

/**
 * The day-line fields of one incoming item, cleaned.
 *
 * ⚠️ NOT TRUSTED: these arrive from a browser. A kind outside the three is
 * dropped; days are bounded; the run's days must be real calendar days in
 * order. Only a DAYS line keeps the worker and the run — on any other line
 * they would mark days as billed that nobody billed.
 */
export function dayLineFields(item: {
  lineKind?: string | null;
  billedDays?: number | null;
  taskIds?: unknown[] | null;
  workerId?: string | null;
  dayFrom?: string | null;
  dayTo?: string | null;
  hoursBasis?: string | null;
}) {
  const lineKind =
    item.lineKind && LINE_KINDS.has(item.lineKind) ? (item.lineKind as 'HOURS' | 'DAYS' | 'HEADING') : null;
  const isDays = lineKind === 'DAYS';
  // A run of time on site — hours or days — names whose time and which days.
  const isRun = isDays || (lineKind === 'HOURS' && typeof item.workerId === 'string' && !!item.dayFrom);
  const from = isRun ? parseDayKey(item.dayFrom) : null;
  const to = isRun ? parseDayKey(item.dayTo) : null;
  return {
    lineKind,
    billedDays:
      isDays && typeof item.billedDays === 'number' && Number.isFinite(item.billedDays) && item.billedDays >= 0
        ? Math.min(item.billedDays, 3_660)
        : null,
    workerId: isRun && typeof item.workerId === 'string' ? item.workerId : null,
    taskIds:
      lineKind === 'HOURS' && Array.isArray(item.taskIds)
        ? [...new Set(item.taskIds.filter((x): x is string => typeof x === 'string' && x.length <= 64))].slice(0, 2000)
        : [],
    // Which hours an hours run billed — kept with the line; anything else is no basis.
    hoursBasis: lineKind === 'HOURS' && isRun && isHoursBasis(item.hoursBasis) ? item.hoursBasis : null,
    dayFrom: from ? new Date(`${from}T00:00:00Z`) : null,
    dayTo: from && to && to >= from ? new Date(`${to}T00:00:00Z`) : from ? new Date(`${from}T00:00:00Z`) : null,
  };
}

/**
 * Every job and service report a line points at must be this organization's.
 * The ids arrive from a browser; a foreign one would link this invoice to —
 * and read through it — another tenant's work.
 */
export async function unknownWorkRef(
  prisma: PrismaService,
  organizationId: string,
  items: Array<{ taskId?: string | null; reportId?: string | null }>,
) {
  const taskIds = [...new Set(items.map((i) => i.taskId).filter((x): x is string => !!x))];
  const reportIds = [...new Set(items.map((i) => i.reportId).filter((x): x is string => !!x))];
  const [tasks, reports] = await Promise.all([
    taskIds.length ? countJobsInOrg(prisma, taskIds, organizationId) : 0,
    reportIds.length ? countReportsInOrg(prisma, reportIds, organizationId) : 0,
  ]);
  return tasks === taskIds.length && reports === reportIds.length
    ? null
    : {
        success: false as const,
        message: 'A line names a job or report outside this organization',
        statusCode: HttpStatus.BAD_REQUEST,
      };
}

/**
 * A DAYS line may only name somebody in THIS organization — otherwise a
 * crafted request could mark another tenant's days as billed. One query.
 */
export async function unknownWorker(
  prisma: PrismaService,
  organizationId: string,
  items: Array<{ workerId: string | null }>,
) {
  const ids = [...new Set(items.map((i) => i.workerId).filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const found = await prisma.user.count({ where: { id: { in: ids }, organizationId } });
  return found === ids.length
    ? null
    : {
        success: false as const,
        message: 'A day line names somebody outside this organization',
        statusCode: HttpStatus.BAD_REQUEST,
      };
}
