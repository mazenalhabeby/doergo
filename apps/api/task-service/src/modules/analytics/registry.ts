/**
 * Semantic registry — the ONLY source of truth for what a report can query.
 *
 * Every dimension/measure carries a trusted SQL fragment (authored here, never
 * from the client). The query engine interpolates ONLY these fragments; all
 * user-supplied values (date ranges, filter values) are bound as parameters.
 * That combination is what makes dynamic reporting injection-safe.
 *
 * ⚠️ A field names a `labelKey`, never a sentence. Its words, in all five
 * languages, live in `REPORT_LABELS` (@hbcfield/shared) — the web table, the
 * CSV/PDF and the scheduled email each render the column in their reader's
 * language from that one catalogue. The English `label` still sent alongside
 * is READ from the catalogue, so there is one English spelling as well.
 */
import { reportLabelEn, type ReportLabelKey } from '@hbcfield/shared';

export type Agg = 'sum' | 'count' | 'countDistinct' | 'avg';
export type FieldType = 'string' | 'number' | 'date' | 'boolean';
export type ValueFormat = 'number' | 'hours' | 'currency' | 'percent';

export interface Dimension {
  labelKey: ReportLabelKey;
  sql: string; // trusted SQL expression
  type: FieldType;
}

export interface Measure {
  labelKey: ReportLabelKey;
  agg: Agg;
  sql: string; // trusted SQL expression (the argument to the aggregate)
  format: ValueFormat;
}

export interface Dataset {
  key: string;
  labelKey: ReportLabelKey;
  from: string; // FROM + JOINs (trusted)
  orgColumn: string; // column to scope by organizationId (trusted)
  dateColumn: string; // default date column for granularity + range (trusted)
  dimensions: Record<string, Dimension>;
  measures: Record<string, Measure>;
}

export const DATASETS: Record<string, Dataset> = {
  attendance: {
    key: 'attendance',
    labelKey: 'dataset.attendance',
    from: `"time_entries" te
      JOIN "users" u ON u.id = te."userId"
      LEFT JOIN "company_locations" cl ON cl.id = te."locationId"`,
    orgColumn: 'te."organizationId"',
    dateColumn: 'te."clockInAt"',
    dimensions: {
      technician: { labelKey: 'col.technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      space: { labelKey: 'col.space', sql: `COALESCE(cl.name, '—')`, type: 'string' },
      status: { labelKey: 'col.status', sql: 'te.status', type: 'string' },
    },
    measures: {
      /*
        Hours WORKED — gross clock time minus breaks.

        `totalMinutes` is clock-in to clock-out with breaks included; this metric
        summed it directly, so a 13h05m shift with an hour's break was reported as
        13.1 hours worked instead of 12.1. It is the number people are paid
        against, which is why it is the one that had to be wrong quietly.

        GREATEST(...,0) because a break longer than its shift is a data error, and
        a negative contribution would net silently against other people's hours in
        the same sum — a wrong total that looks plausible is worse than one row
        that looks absurd.
      */
      /*
        Paid hours, which is not the same as hours present.

        `paidMinutes` is computed once at clock-out by the shared counted-time
        rule — early arrival clamped off, approved overtime included, unpaid
        rests subtracted. The COALESCE is the bridge for entries closed before
        that column existed: it falls back to exactly the expression this line
        used to be, so a historic row reports the number it always reported.
      */
      hours: { labelKey: 'col.hoursWorked', agg: 'sum', sql: `COALESCE(te."paidMinutes", GREATEST(COALESCE(te."totalMinutes", 0) - COALESCE(te."breakMinutes", 0), 0)) / 60.0`, format: 'hours' },
      // Overtime is worked time too, so it nets the same way.
      overtimeHours: { labelKey: 'col.overtimeHours', agg: 'sum', sql: `CASE WHEN 'OVERTIME' = ANY(te."flagReasons") THEN COALESCE(te."paidMinutes", GREATEST(COALESCE(te."totalMinutes", 0) - COALESCE(te."breakMinutes", 0), 0)) / 60.0 ELSE 0 END`, format: 'hours' },
      breakHours: { labelKey: 'col.breakHours', agg: 'sum', sql: `te."breakMinutes" / 60.0`, format: 'hours' },
      shifts: { labelKey: 'col.shifts', agg: 'count', sql: 'te.id', format: 'number' },
      technicians: { labelKey: 'col.people', agg: 'countDistinct', sql: 'te."userId"', format: 'number' },
    },
  },

  service_reports: {
    key: 'service_reports',
    labelKey: 'dataset.service_reports',
    from: `"service_reports" sr
      JOIN "users" u ON u.id = sr."completedById"
      LEFT JOIN "customers" c ON c.id = sr."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      technician: { labelKey: 'col.technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      // Falls back to the legacy free-text name until customers are linked.
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, sr."customerName", 'Unassigned')`, type: 'string' },
    },
    measures: {
      jobs: { labelKey: 'col.jobsCompleted', agg: 'count', sql: 'sr.id', format: 'number' },
      workHours: { labelKey: 'col.workHours', agg: 'sum', sql: 'sr."workDuration" / 3600.0', format: 'hours' },
      avgJobMinutes: { labelKey: 'col.avgJobMinutes', agg: 'avg', sql: 'sr."workDuration" / 60.0', format: 'number' },
      customers: { labelKey: 'col.customers', agg: 'countDistinct', sql: `COALESCE(c.name, sr."customerName")`, format: 'number' },
    },
  },

  tasks: {
    key: 'tasks',
    labelKey: 'dataset.tasks',
    from: `"tasks" t
      LEFT JOIN "users" u ON u.id = t."assignedToId"
      LEFT JOIN "company_locations" cl ON cl.id = t."spaceId"
      LEFT JOIN "customers" c ON c.id = t."customerId"`,
    orgColumn: 't."organizationId"',
    dateColumn: 't."createdAt"',
    dimensions: {
      status: { labelKey: 'col.status', sql: 't.status', type: 'string' },
      priority: { labelKey: 'col.priority', sql: 't.priority::text', type: 'string' },
      technician: { labelKey: 'col.assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      space: { labelKey: 'col.space', sql: `COALESCE(cl.name, '—')`, type: 'string' },
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      count: { labelKey: 'col.tasks', agg: 'count', sql: 't.id', format: 'number' },
      completed: { labelKey: 'col.completed', agg: 'sum', sql: `CASE WHEN t.status IN ('COMPLETED', 'CLOSED') THEN 1 ELSE 0 END`, format: 'number' },
      distanceKm: { labelKey: 'col.routeDistanceKm', agg: 'sum', sql: 'COALESCE(t."routeDistance", 0) / 1000.0', format: 'number' },
    },
  },

  leave: {
    key: 'leave',
    labelKey: 'dataset.leave',
    from: `"time_off_requests" t JOIN "users" u ON u.id = t."technicianId"`,
    orgColumn: 'u."organizationId"', // time_off has no org column; scope via the user
    dateColumn: 't."startDate"',
    dimensions: {
      technician: { labelKey: 'col.technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      reason: { labelKey: 'col.reason', sql: `COALESCE(NULLIF(t.reason, ''), '—')`, type: 'string' },
      status: { labelKey: 'col.status', sql: 't.status', type: 'string' },
    },
    measures: {
      requests: { labelKey: 'col.requests', agg: 'count', sql: 't.id', format: 'number' },
      days: { labelKey: 'col.daysOff', agg: 'sum', sql: `(t."endDate" - t."startDate" + 1)`, format: 'number' },
      people: { labelKey: 'col.people', agg: 'countDistinct', sql: 't."technicianId"', format: 'number' },
    },
  },

  parts: {
    key: 'parts',
    labelKey: 'dataset.parts',
    from: `"parts_used" p
      JOIN "service_reports" sr ON sr.id = p."reportId"
      JOIN "users" u ON u.id = sr."completedById"
      LEFT JOIN "customers" c ON c.id = sr."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      part: { labelKey: 'col.part', sql: 'p.name', type: 'string' },
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, sr."customerName", 'Unassigned')`, type: 'string' },
      technician: { labelKey: 'col.technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
    },
    measures: {
      quantity: { labelKey: 'col.quantity', agg: 'sum', sql: 'p.quantity', format: 'number' },
      cost: { labelKey: 'col.cost', agg: 'sum', sql: `p.quantity * COALESCE(p."unitCost", 0)`, format: 'currency' },
      lines: { labelKey: 'col.lineItems', agg: 'count', sql: 'p.id', format: 'number' },
    },
  },

  asset_maintenance: {
    key: 'asset_maintenance',
    labelKey: 'dataset.asset_maintenance',
    from: `"service_reports" sr
      JOIN "assets" a ON a.id = sr."assetId"
      JOIN "users" u ON u.id = sr."completedById"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      asset: { labelKey: 'col.asset', sql: 'a.name', type: 'string' },
      technician: { labelKey: 'col.technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
    },
    measures: {
      services: { labelKey: 'col.services', agg: 'count', sql: 'sr.id', format: 'number' },
      workHours: { labelKey: 'col.workHours', agg: 'sum', sql: 'sr."workDuration" / 3600.0', format: 'hours' },
      assets: { labelKey: 'col.assets', agg: 'countDistinct', sql: 'sr."assetId"', format: 'number' },
    },
  },

  task_cycle: {
    key: 'task_cycle',
    labelKey: 'dataset.task_cycle',
    // Cycle = completion (service report) minus task creation.
    from: `"service_reports" sr
      JOIN "tasks" t ON t.id = sr."taskId"
      LEFT JOIN "users" u ON u.id = t."assignedToId"
      LEFT JOIN "customers" c ON c.id = t."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      priority: { labelKey: 'col.priority', sql: 't.priority::text', type: 'string' },
      technician: { labelKey: 'col.assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      jobs: { labelKey: 'col.completed', agg: 'count', sql: 't.id', format: 'number' },
      avgHours: { labelKey: 'col.avgCycleHours', agg: 'avg', sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 3600.0`, format: 'number' },
      avgDays: { labelKey: 'col.avgCycleDays', agg: 'avg', sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 86400.0`, format: 'number' },
    },
  },
};

/**
 * Client-safe catalog (no SQL) for the report builder UI.
 *
 * Carries the key AND the English label: the web names each entry in its own
 * language from the key, and a reader that does not translate (a web build
 * from before the keys) still has words.
 */
export function datasetCatalog() {
  return Object.values(DATASETS).map((d) => ({
    key: d.key,
    labelKey: d.labelKey,
    label: reportLabelEn(d.labelKey),
    dimensions: Object.entries(d.dimensions).map(([key, v]) => ({ key, labelKey: v.labelKey, label: reportLabelEn(v.labelKey), type: v.type })),
    measures: Object.entries(d.measures).map(([key, v]) => ({ key, labelKey: v.labelKey, label: reportLabelEn(v.labelKey), format: v.format })),
  }));
}
