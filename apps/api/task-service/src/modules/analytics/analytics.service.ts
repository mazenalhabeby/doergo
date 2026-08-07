import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { workerMonthlyCostCents } from '@hbcfield/shared';
import { compile, ReportDefinition } from './query-engine';
import { datasetCatalog } from './registry';
import { TEMPLATES } from './templates';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Report builder catalog: available datasets (dimensions/measures) + templates. */
  getCatalog() {
    return { data: { datasets: datasetCatalog(), templates: TEMPLATES } };
  }

  /** Run a report definition against the org's data. Always org-scoped. */
  async run(data: { organizationId: string; definition: ReportDefinition }) {
    const { sql, params, columns } = compile(data.definition, data.organizationId);
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);

    // Coerce measure values (Decimal/bigint/string from raw SQL) → JS numbers.
    const measureKeys = columns.filter((c) => c.kind === 'measure').map((c) => c.key);
    const normalized = rows.map((r) => {
      const o: Record<string, unknown> = { ...r };
      for (const k of measureKeys) o[k] = o[k] == null ? 0 : Number(o[k]);
      return o;
    });

    return { data: { columns, rows: normalized } };
  }

  /**
   * Worker labor cost for ONE month — the single source of truth reused by the
   * Costs view and (later) the invoice system. Per active worker with a cost
   * configured: HOURLY → hours worked that month × rate; FIXED → the flat monthly
   * rate. Hours come from attendance (time_entries); cost is computed via the
   * shared `workerMonthlyCostCents`. Always org-scoped.
   *
   * `month` = "YYYY-MM" (defaults to the current month, UTC).
   */
  async getWorkerCosts(data: { organizationId: string; month?: string }) {
    // Resolve the month window [start, nextMonth) in UTC.
    const now = new Date();
    let year = now.getUTCFullYear();
    let mon = now.getUTCMonth(); // 0-based
    if (data.month) {
      const m = /^(\d{4})-(\d{2})$/.exec(data.month.trim());
      if (!m) throw new BadRequestException('month must be YYYY-MM');
      year = Number(m[1]);
      mon = Number(m[2]) - 1;
      if (mon < 0 || mon > 11) throw new BadRequestException('Invalid month');
    }
    const start = new Date(Date.UTC(year, mon, 1));
    const end = new Date(Date.UTC(year, mon + 1, 1));
    const monthStr = `${year}-${String(mon + 1).padStart(2, '0')}`;

    // Active workers with a cost configured (uncosted members are excluded from
    // the money totals — nothing to bill for them yet).
    const workers = await this.prisma.user.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        costType: { in: ['HOURLY', 'FIXED'] },
      },
      select: { id: true, firstName: true, lastName: true, costType: true, costRateCents: true },
    });
    if (workers.length === 0) {
      return { data: { month: monthStr, workers: [], totalCents: 0 } };
    }

    // Hours worked that month, per worker (one grouped query, org-scoped).
    const grouped = await this.prisma.timeEntry.groupBy({
      by: ['userId'],
      where: {
        organizationId: data.organizationId,
        userId: { in: workers.map((w) => w.id) },
        clockInAt: { gte: start, lt: end },
      },
      _sum: { totalMinutes: true },
    });
    const minutesByUser = new Map<string, number>();
    for (const g of grouped) minutesByUser.set(g.userId, g._sum.totalMinutes ?? 0);

    let totalCents = 0;
    const rows = workers.map((w) => {
      const hours = (minutesByUser.get(w.id) ?? 0) / 60;
      const costCents = workerMonthlyCostCents(
        { costType: w.costType, costRateCents: w.costRateCents },
        hours,
      );
      totalCents += costCents;
      return {
        userId: w.id,
        name: `${w.firstName} ${w.lastName}`.trim(),
        costType: w.costType,
        costRateCents: w.costRateCents,
        hours: Math.round(hours * 100) / 100,
        costCents,
      };
    });
    // Highest cost first — most useful default for a costs view.
    rows.sort((a, b) => b.costCents - a.costCents);

    return { data: { month: monthStr, workers: rows, totalCents } };
  }

  /**
   * Detailed timesheet for ONE user: a calendar (one row per day) over the
   * period, overlaying clock-in/out + hours (time_entries), approved leave
   * (time_off), and the weekly schedule (technician_schedules) to derive a
   * per-day status: Worked · <leave reason> · Absent (scheduled, no clock-in) ·
   * Off (not scheduled). All values are bound parameters; org scope enforced.
   */
  async timesheetDetail(data: { organizationId: string; userId: string; from?: string; to?: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId },
      select: { firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Resolve + clamp the range (default last 30 days; hard-cap ~400 days).
    const toDate = data.to ? new Date(data.to) : new Date();
    let fromDate = data.from ? new Date(data.from) : new Date(toDate.getTime() - 29 * 864e5);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) throw new BadRequestException('Invalid date range');
    const maxSpan = 400 * 864e5;
    if (toDate.getTime() - fromDate.getTime() > maxSpan) fromDate = new Date(toDate.getTime() - maxSpan);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    const sql = `
      WITH days AS (
        SELECT gs::date AS day FROM generate_series($2::date, $3::date, interval '1 day') gs
      ),
      entries AS (
        SELECT (te."clockInAt")::date AS day,
               MIN(te."clockInAt") AS clock_in,
               MAX(te."clockOutAt") AS clock_out,
               SUM(COALESCE(te."totalMinutes", 0)) AS minutes,
               SUM(COALESCE(te."breakMinutes", 0)) AS break_minutes,
               SUM(CASE WHEN 'OVERTIME' = ANY(te."flagReasons") THEN COALESCE(te."totalMinutes", 0) ELSE 0 END) AS ot_minutes,
               bool_or(te."isRemote") AS remote,
               NULLIF(string_agg(DISTINCT COALESCE(cl.name, te."clockInPlace"), ', '), '') AS location,
               MIN(COALESCE(cl.timezone, 'UTC')) AS tz,
               NULLIF(string_agg(NULLIF(te.notes, ''), ' · '), '') AS note
        FROM "time_entries" te
        LEFT JOIN "company_locations" cl ON cl.id = te."locationId"
        WHERE te."userId" = $1 AND te."organizationId" = $4
          AND te."clockInAt" >= $2::date AND te."clockInAt" < ($3::date + 1)
        GROUP BY 1
      ),
      jobs AS (
        SELECT (sr."completedAt")::date AS day, COUNT(*) AS n
        FROM "service_reports" sr
        WHERE sr."completedById" = $1 AND sr."organizationId" = $4
          AND sr."completedAt" >= $2::date AND sr."completedAt" < ($3::date + 1)
        GROUP BY 1
      ),
      leave AS (
        SELECT gd::date AS day, MIN(COALESCE(NULLIF(t.reason, ''), 'Time off')) AS reason
        FROM "time_off_requests" t
        CROSS JOIN LATERAL generate_series(t."startDate", t."endDate", interval '1 day') gd
        WHERE t."technicianId" = $1 AND t.status = 'APPROVED'
          AND t."endDate" >= $2::date AND t."startDate" <= $3::date
        GROUP BY 1
      ),
      sched AS (
        SELECT DISTINCT s."dayOfWeek" AS dow
        FROM "technician_schedules" s
        WHERE s."technicianId" = $1 AND s."isActive" = TRUE
      )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS "date",
        trim(to_char(d.day, 'Dy')) AS "day",
        to_char((e.clock_in AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.tz, 'UTC'), 'HH24:MI') AS "clockIn",
        to_char((e.clock_out AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.tz, 'UTC'), 'HH24:MI') AS "clockOut",
        ROUND(COALESCE(e.minutes, 0) / 60.0, 2) AS "hours",
        ROUND(COALESCE(e.break_minutes, 0) / 60.0, 2) AS "break",
        ROUND(COALESCE(e.ot_minutes, 0) / 60.0, 2) AS "overtime",
        COALESCE(j.n, 0) AS "jobs",
        COALESCE(l.reason, '') AS "leaveReason",
        COALESCE(e.location, '') AS "location",
        CASE WHEN e.remote THEN 'Yes' WHEN e.day IS NOT NULL THEN 'No' ELSE '' END AS "remote",
        CASE WHEN e.day IS NOT NULL THEN COALESCE(e.note, '') ELSE 'Day off' END AS "note",
        CASE
          WHEN l.reason IS NOT NULL THEN l.reason
          WHEN e.day IS NOT NULL THEN 'Worked'
          WHEN sc.dow IS NOT NULL THEN 'Absent'
          ELSE 'Off'
        END AS "status"
      FROM days d
      LEFT JOIN entries e ON e.day = d.day
      LEFT JOIN jobs j ON j.day = d.day
      LEFT JOIN leave l ON l.day = d.day
      LEFT JOIN sched sc ON sc.dow = EXTRACT(DOW FROM d.day)
      ORDER BY d.day ASC
    `;

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, data.userId, fromStr, toStr, data.organizationId);
    const numKeys = ['hours', 'break', 'overtime', 'jobs'];
    const normalized = rows.map((r) => {
      const o = { ...r };
      for (const k of numKeys) o[k] = o[k] == null ? 0 : Number(o[k]);
      return o;
    });

    const columns = [
      { key: 'date', label: 'Date', kind: 'dimension' as const },
      { key: 'day', label: 'Day', kind: 'dimension' as const },
      { key: 'clockIn', label: 'Clock in', kind: 'dimension' as const },
      { key: 'clockOut', label: 'Clock out', kind: 'dimension' as const },
      { key: 'hours', label: 'Hours', kind: 'measure' as const, format: 'hours' },
      { key: 'break', label: 'Break', kind: 'measure' as const, format: 'hours' },
      { key: 'overtime', label: 'Overtime', kind: 'measure' as const, format: 'hours' },
      { key: 'jobs', label: 'Jobs', kind: 'measure' as const, format: 'number' },
      { key: 'leaveReason', label: 'Leave reason', kind: 'dimension' as const },
      { key: 'location', label: 'Location', kind: 'dimension' as const },
      { key: 'remote', label: 'Remote', kind: 'dimension' as const },
      { key: 'note', label: 'Note', kind: 'dimension' as const },
      { key: 'status', label: 'Status', kind: 'dimension' as const },
    ];
    const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return { data: { columns, rows: normalized, userName } };
  }

  // ── Saved reports (custom builder, Pro+) ────────────────────────────────────
  private savedSelect = {
    id: true, name: true, description: true, dataset: true, config: true,
    isShared: true, createdById: true, createdAt: true, updatedAt: true,
  } as const;

  /** List saved reports visible to the user: org-shared + own private. */
  async listSaved(data: { organizationId: string; userId: string }) {
    const items = await this.prisma.reportDefinition.findMany({
      where: {
        organizationId: data.organizationId,
        OR: [{ isShared: true }, { createdById: data.userId }],
      },
      orderBy: { createdAt: 'desc' },
      select: this.savedSelect,
    });
    return { data: items };
  }

  async createSaved(data: {
    organizationId: string; userId: string;
    name: string; description?: string; config: ReportDefinition; isShared?: boolean;
  }) {
    if (!data.name?.trim()) throw new BadRequestException('Report name is required');
    compile(data.config, data.organizationId); // validate the definition (throws on bad spec)
    const item = await this.prisma.reportDefinition.create({
      data: {
        organizationId: data.organizationId,
        name: data.name.trim(),
        description: data.description || null,
        dataset: data.config.dataset,
        config: data.config as unknown as object,
        isShared: data.isShared ?? true,
        createdById: data.userId,
      },
      select: this.savedSelect,
    });
    return { data: item };
  }

  async updateSaved(data: {
    id: string; organizationId: string; userId: string;
    name?: string; description?: string; config?: ReportDefinition; isShared?: boolean;
  }) {
    const existing = await this.prisma.reportDefinition.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, createdById: true },
    });
    if (!existing) throw new NotFoundException('Report not found');
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new BadRequestException('Report name is required');
      patch.name = data.name.trim();
    }
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.isShared !== undefined) patch.isShared = data.isShared;
    if (data.config !== undefined) {
      compile(data.config, data.organizationId);
      patch.config = data.config as unknown as object;
      patch.dataset = data.config.dataset;
    }
    const item = await this.prisma.reportDefinition.update({ where: { id: data.id }, data: patch, select: this.savedSelect });
    return { data: item };
  }

  async deleteSaved(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.reportDefinition.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Report not found');
    await this.prisma.reportDefinition.delete({ where: { id: data.id } });
    return { success: true };
  }

}
