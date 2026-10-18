import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  personName,
  reportLabelEn,
  assertMemberInScope,
  type ReportLabelKey,
  type SpaceScopeIds,
  toISODateString,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  /**
   * Run a report definition against the org's data. Always org-scoped, and
   * narrowed to `scopeSpaceIds` when the reader was granted reports in some
   * workspaces only (undefined/null = org-wide, [] = nothing).
   */
  async run(data: { organizationId: string; definition: ReportDefinition; scopeSpaceIds?: SpaceScopeIds }) {
    const { sql, params, columns } = compile(data.definition, data.organizationId, data.scopeSpaceIds);
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
   * Detailed timesheet for ONE user: a calendar (one row per day) over the
   * period, overlaying clock-in/out + hours (time_entries), approved leave
   * (time_off), and the weekly schedule (technician_schedules) to derive a
   * per-day status: Worked · <leave reason> · Absent (scheduled, no clock-in) ·
   * Off (not scheduled). All values are bound parameters; org scope enforced.
   */
  async timesheetDetail(data: {
    organizationId: string;
    userId: string;
    from?: string;
    to?: string;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    /*
      ⚠️ A day-by-day sheet of ONE person — their hours, leave reasons and notes.
      It was org-scoped only, so anybody admitted to reports, in any one
      workspace, read anybody's. A space-scoped reader may open it for somebody
      in their crew (an assignment in a granted space, still running), and then
      sees only the shifts and jobs in THOSE spaces — a person working two
      sites does not bring the other site's day along.
    */
    const scope = data.scopeSpaceIds ?? undefined;
    await assertMemberInScope(this.prisma, {
      userId: data.userId,
      organizationId: data.organizationId,
      scopeSpaceIds: scope,
    });
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
    const fromStr = toISODateString(fromDate);
    const toStr = toISODateString(toDate);

    const sql = `
      WITH days AS (
        SELECT gs::date AS day FROM generate_series($2::date, $3::date, interval '1 day') gs
      ),
      -- A shift belongs to the day it STARTS on, in its own time zone. The UTC
      -- date put a US evening shift (18:00 New York = 22:00 UTC… or later) on
      -- the next day's row. Read a day either side, then keep the range.
      te_base AS (
        SELECT te.*, COALESCE(te.timezone, cl.timezone, 'UTC') AS zone, cl.name AS space_name,
               ((te."clockInAt" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(te.timezone, cl.timezone, 'UTC'))::date AS local_day,
               sh."startLocal" AS rota_start_local, sh."endLocal" AS rota_end_local
        FROM "time_entries" te
        LEFT JOIN "company_locations" cl ON cl.id = te."locationId"
        LEFT JOIN "shifts" sh ON sh.id = te."shiftId"
        WHERE te."userId" = $1 AND te."organizationId" = $4
          AND ($5::text[] IS NULL OR te."locationId" = ANY($5::text[]))
          AND te."clockInAt" >= ($2::date - 1) AND te."clockInAt" < ($3::date + 2)
      ),
      -- The ROTA window, as UTC instants: the stored start, else the shift's
      -- start on the day; the end is start + the shift's length. Never the
      -- expected END — approving overtime moves that one, and the rota must not.
      te_rota AS (
        SELECT b.*,
               COALESCE(b."expectedClockInAt",
                 ((b.local_day + b.rota_start_local::time) AT TIME ZONE b.zone) AT TIME ZONE 'UTC') AS rota_start
        FROM te_base b
      ),
      te_local AS (
        SELECT r.*,
               -- Label rules (new entries only): a later entry of the same shift is never late and its
               -- planned time starts at its own clock-in; within the shift's grace is not late.
               r."labelRules" IS NOT NULL AS judged,
               (r."labelRules" IS NOT NULL AND (r."labelFacts"->>'firstOfShift')::boolean IS FALSE) AS later_entry,
               COALESCE((r."labelFacts"->'shift'->>'toleranceMin')::int, 0) AS grace_min,
               r.rota_start + ((r.rota_end_local::time - r.rota_start_local::time)
                 + CASE WHEN r.rota_end_local::time <= r.rota_start_local::time THEN interval '24 hours' ELSE interval '0' END) AS rota_end,
               -- Unpaid rest, from the break ROWS (the source of truth: each
               -- says whether it is paid); an entry with no rows falls back to
               -- its stored totals. The stored unpaid total alone was 0 on
               -- hand-added shifts and counted their lunch as work.
               COALESCE(
                 (SELECT SUM(COALESCE(b."durationMinutes", 0)) FROM "breaks" b
                   WHERE b."timeEntryId" = r.id AND b."endedAt" IS NOT NULL AND b."isPaid" = FALSE),
                 NULLIF(r."unpaidBreakMinutes", 0), r."breakMinutes", 0) AS unpaid_break
        FROM te_rota r
      ),
      entries AS (
        SELECT te.local_day AS day,
               MIN(te."clockInAt") AS clock_in,
               MAX(te."clockOutAt") AS clock_out,
               -- The shift they clocked in to: the time stored on the entry,
               -- else the shift's own start/end ("18:00" local).
               MIN(to_char((te.rota_start AT TIME ZONE 'UTC') AT TIME ZONE te.zone, 'HH24:MI')) AS shift_start,
               MAX(to_char((te.rota_end AT TIME ZONE 'UTC') AT TIME ZONE te.zone, 'HH24:MI')) AS shift_end,
               SUM(COALESCE(te."totalMinutes", 0)) AS minutes,
               /*
                 Three parts, so the page can add them by what is selected:
                   planned — inside the rota as if on time: rota start to the
                             earlier of clock-out and rota end, minus rests;
                   late    — clock-in after rota start;
                   extra   — APPROVED overtime: past the rota end up to the
                             approved end (approval moves expectedClockOutAt),
                             never past the real clock-out.
                 An entry with no shift has no rota: all of it is planned.
               */
               SUM(CASE WHEN te.rota_start IS NULL OR te.rota_end IS NULL
                        THEN GREATEST(COALESCE(te."totalMinutes", 0) - te.unpaid_break, 0)
                        ELSE GREATEST(EXTRACT(EPOCH FROM (LEAST(COALESCE(te."clockOutAt", (now() AT TIME ZONE 'UTC')), te.rota_end)
                               - CASE WHEN te.later_entry THEN GREATEST(te."clockInAt", te.rota_start) ELSE te.rota_start END)) / 60
                               - te.unpaid_break, 0)
                   END) AS planned_minutes,
               SUM(CASE WHEN te.rota_start IS NULL OR te.rota_end IS NULL OR te.later_entry THEN 0
                        WHEN te.judged AND EXTRACT(EPOCH FROM (te."clockInAt" - te.rota_start)) / 60 <= te.grace_min THEN 0
                        ELSE GREATEST(EXTRACT(EPOCH FROM (LEAST(te."clockInAt", te.rota_end) - te.rota_start)) / 60, 0)
                   END) AS late_minutes,
               SUM(CASE WHEN te.rota_end IS NULL OR te."expectedClockOutAt" IS NULL OR te."clockOutAt" IS NULL THEN 0
                        ELSE GREATEST(EXTRACT(EPOCH FROM (LEAST(te."clockOutAt", te."expectedClockOutAt") - te.rota_end)) / 60, 0)
                   END) AS extra_minutes,
               SUM(COALESCE(te."breakMinutes", 0)) AS break_minutes,
               bool_or(te."isRemote") AS remote,
               NULLIF(string_agg(DISTINCT COALESCE(te.space_name, te."clockInPlace"), ', '), '') AS location,
               MIN(te.zone) AS tz,
               NULLIF(string_agg(NULLIF(te.notes, ''), ' · '), '') AS note
        FROM te_local te
        WHERE te.local_day >= $2::date AND te.local_day <= $3::date
        GROUP BY 1
      ),
      jobs AS (
        SELECT (sr."completedAt")::date AS day, COUNT(*) AS n
        FROM "service_reports" sr
        WHERE sr."completedById" = $1 AND sr."organizationId" = $4
          AND ($5::text[] IS NULL OR EXISTS (SELECT 1 FROM "tasks" st WHERE st.id = sr."taskId" AND st."spaceId" = ANY($5::text[])))
          AND sr."completedAt" >= $2::date AND sr."completedAt" < ($3::date + 1)
        GROUP BY 1
      ),
      leave AS (
        SELECT gd::date AS day, MIN(COALESCE(NULLIF(t.reason, ''), 'Time off')) AS reason
        FROM "time_off_requests" t
        CROSS JOIN LATERAL generate_series(t."startDate", t."endDate", interval '1 day') gd
        WHERE t."technicianId" = $1 AND t.status = 'APPROVED' AND t.kind = 'LEAVE'
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
        COALESCE(e.shift_start, '') AS "shiftStart",
        COALESCE(e.shift_end, '') AS "shiftEnd",
        to_char((e.clock_in AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.tz, 'UTC'), 'HH24:MI') AS "clockIn",
        to_char((e.clock_out AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(e.tz, 'UTC'), 'HH24:MI') AS "clockOut",
        -- Hours WORKED: gross clock time minus breaks. The minutes column is
        -- clock-in to clock-out with breaks included, so this reported a 13h05m
        -- shift with an hour's break as 13.1 hours worked instead of 12.1 - and
        -- the break was shown in its own column beside it, so the two together
        -- implied 14h on site. GREATEST guards a break longer than its shift,
        -- which is a data error and must not net against other rows.
        ROUND(GREATEST(COALESCE(e.minutes, 0) - COALESCE(e.break_minutes, 0), 0) / 60.0, 2) AS "hours",
        -- Hours in shift as planned; the page takes off Late and adds Overtime
        -- when those columns are chosen (planned − late + overtime).
        ROUND(COALESCE(e.planned_minutes, 0) / 60.0, 2) AS "hoursInShift",
        ROUND(COALESCE(e.planned_minutes, 0) / 60.0, 2) AS "plannedInShift",
        ROUND(COALESCE(e.late_minutes, 0) / 60.0, 2) AS "late",
        ROUND(COALESCE(e.break_minutes, 0) / 60.0, 2) AS "break",
        ROUND(COALESCE(e.extra_minutes, 0) / 60.0, 2) AS "overtime",
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

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
      data.userId,
      fromStr,
      toStr,
      data.organizationId,
      scope ?? null,
    );
    const numKeys = ['hours', 'hoursInShift', 'plannedInShift', 'late', 'break', 'overtime', 'jobs'];
    const normalized = rows.map((r) => {
      const o = { ...r };
      for (const k of numKeys) o[k] = o[k] == null ? 0 : Number(o[k]);
      return o;
    });

    // Named by key like every other report column (REPORT_LABELS), so the
    // day-by-day sheet reads in the viewer's language too.
    const column = (key: string, labelKey: ReportLabelKey, kind: 'dimension' | 'measure', format?: string) => ({
      key,
      labelKey,
      label: reportLabelEn(labelKey),
      kind,
      ...(format ? { format } : {}),
    });
    const columns = [
      column('date', 'col.date', 'dimension'),
      column('day', 'col.day', 'dimension'),
      column('shiftStart', 'col.shiftStart', 'dimension'),
      column('shiftEnd', 'col.shiftEnd', 'dimension'),
      column('clockIn', 'col.clockIn', 'dimension'),
      column('clockOut', 'col.clockOut', 'dimension'),
      // Key kept as `hours` so saved column choices still find it.
      column('hours', 'col.hoursWorked', 'measure', 'hours'),
      column('hoursInShift', 'col.hoursInShift', 'measure', 'hours'),
      column('late', 'col.late', 'measure', 'hours'),
      column('break', 'col.break', 'measure', 'hours'),
      column('overtime', 'col.overtime', 'measure', 'hours'),
      column('jobs', 'col.jobs', 'measure', 'number'),
      column('leaveReason', 'col.leaveReason', 'dimension'),
      column('location', 'col.location', 'dimension'),
      column('remote', 'col.remote', 'dimension'),
      column('note', 'col.note', 'dimension'),
      column('status', 'col.status', 'dimension'),
    ];
    const userName = personName(user);
    return { data: { columns, rows: normalized, userName } };
  }
}
