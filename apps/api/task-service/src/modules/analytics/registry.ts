/**
 * Semantic registry — the ONLY source of truth for what a report can query.
 *
 * Every dimension/measure carries a trusted SQL fragment (authored here, never
 * from the client). The query engine interpolates ONLY these fragments; all
 * user-supplied values (date ranges, filter values) are bound as parameters.
 * That combination is what makes dynamic reporting injection-safe.
 */

export type Agg = 'sum' | 'count' | 'countDistinct' | 'avg';
export type FieldType = 'string' | 'number' | 'date' | 'boolean';
export type ValueFormat = 'number' | 'hours' | 'currency' | 'percent';

export interface Dimension {
  label: string;
  sql: string; // trusted SQL expression
  type: FieldType;
}

export interface Measure {
  label: string;
  agg: Agg;
  sql: string; // trusted SQL expression (the argument to the aggregate)
  format: ValueFormat;
}

export interface Dataset {
  key: string;
  label: string;
  from: string; // FROM + JOINs (trusted)
  orgColumn: string; // column to scope by organizationId (trusted)
  dateColumn: string; // default date column for granularity + range (trusted)
  dimensions: Record<string, Dimension>;
  measures: Record<string, Measure>;
}

export const DATASETS: Record<string, Dataset> = {
  attendance: {
    key: 'attendance',
    label: 'Attendance / Timesheets',
    from: `"time_entries" te
      JOIN "users" u ON u.id = te."userId"
      LEFT JOIN "company_locations" cl ON cl.id = te."locationId"`,
    orgColumn: 'te."organizationId"',
    dateColumn: 'te."clockInAt"',
    dimensions: {
      technician: { label: 'Technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      space: { label: 'Space', sql: `COALESCE(cl.name, '—')`, type: 'string' },
      status: { label: 'Status', sql: 'te.status', type: 'string' },
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
      hours: { label: 'Hours worked', agg: 'sum', sql: `GREATEST(COALESCE(te."totalMinutes", 0) - COALESCE(te."breakMinutes", 0), 0) / 60.0`, format: 'hours' },
      // Overtime is worked time too, so it nets the same way.
      overtimeHours: { label: 'Overtime hours', agg: 'sum', sql: `CASE WHEN 'OVERTIME' = ANY(te."flagReasons") THEN GREATEST(COALESCE(te."totalMinutes", 0) - COALESCE(te."breakMinutes", 0), 0) / 60.0 ELSE 0 END`, format: 'hours' },
      breakHours: { label: 'Break hours', agg: 'sum', sql: `te."breakMinutes" / 60.0`, format: 'hours' },
      shifts: { label: 'Shifts', agg: 'count', sql: 'te.id', format: 'number' },
      technicians: { label: 'People', agg: 'countDistinct', sql: 'te."userId"', format: 'number' },
    },
  },

  service_reports: {
    key: 'service_reports',
    label: 'Service Reports (jobs)',
    from: `"service_reports" sr
      JOIN "users" u ON u.id = sr."completedById"
      LEFT JOIN "customers" c ON c.id = sr."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      technician: { label: 'Technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      // Falls back to the legacy free-text name until customers are linked.
      customer: { label: 'Customer', sql: `COALESCE(c.name, sr."customerName", 'Unassigned')`, type: 'string' },
    },
    measures: {
      jobs: { label: 'Jobs completed', agg: 'count', sql: 'sr.id', format: 'number' },
      workHours: { label: 'Work hours', agg: 'sum', sql: 'sr."workDuration" / 3600.0', format: 'hours' },
      avgJobMinutes: { label: 'Avg job (min)', agg: 'avg', sql: 'sr."workDuration" / 60.0', format: 'number' },
      customers: { label: 'Customers', agg: 'countDistinct', sql: `COALESCE(c.name, sr."customerName")`, format: 'number' },
    },
  },

  tasks: {
    key: 'tasks',
    label: 'Tasks',
    from: `"tasks" t
      LEFT JOIN "users" u ON u.id = t."assignedToId"
      LEFT JOIN "company_locations" cl ON cl.id = t."spaceId"
      LEFT JOIN "customers" c ON c.id = t."customerId"`,
    orgColumn: 't."organizationId"',
    dateColumn: 't."createdAt"',
    dimensions: {
      status: { label: 'Status', sql: 't.status', type: 'string' },
      priority: { label: 'Priority', sql: 't.priority::text', type: 'string' },
      technician: { label: 'Assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      space: { label: 'Space', sql: `COALESCE(cl.name, '—')`, type: 'string' },
      customer: { label: 'Customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      count: { label: 'Tasks', agg: 'count', sql: 't.id', format: 'number' },
      completed: { label: 'Completed', agg: 'sum', sql: `CASE WHEN t.status IN ('COMPLETED', 'CLOSED') THEN 1 ELSE 0 END`, format: 'number' },
      distanceKm: { label: 'Route distance (km)', agg: 'sum', sql: 'COALESCE(t."routeDistance", 0) / 1000.0', format: 'number' },
    },
  },

  leave: {
    key: 'leave',
    label: 'Leave & absence',
    from: `"time_off_requests" t JOIN "users" u ON u.id = t."technicianId"`,
    orgColumn: 'u."organizationId"', // time_off has no org column; scope via the user
    dateColumn: 't."startDate"',
    dimensions: {
      technician: { label: 'Technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
      reason: { label: 'Reason', sql: `COALESCE(NULLIF(t.reason, ''), '—')`, type: 'string' },
      status: { label: 'Status', sql: 't.status', type: 'string' },
    },
    measures: {
      requests: { label: 'Requests', agg: 'count', sql: 't.id', format: 'number' },
      days: { label: 'Days off', agg: 'sum', sql: `(t."endDate" - t."startDate" + 1)`, format: 'number' },
      people: { label: 'People', agg: 'countDistinct', sql: 't."technicianId"', format: 'number' },
    },
  },

  parts: {
    key: 'parts',
    label: 'Parts & materials',
    from: `"parts_used" p
      JOIN "service_reports" sr ON sr.id = p."reportId"
      JOIN "users" u ON u.id = sr."completedById"
      LEFT JOIN "customers" c ON c.id = sr."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      part: { label: 'Part', sql: 'p.name', type: 'string' },
      customer: { label: 'Customer', sql: `COALESCE(c.name, sr."customerName", 'Unassigned')`, type: 'string' },
      technician: { label: 'Technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
    },
    measures: {
      quantity: { label: 'Quantity', agg: 'sum', sql: 'p.quantity', format: 'number' },
      cost: { label: 'Cost', agg: 'sum', sql: `p.quantity * COALESCE(p."unitCost", 0)`, format: 'currency' },
      lines: { label: 'Line items', agg: 'count', sql: 'p.id', format: 'number' },
    },
  },

  asset_maintenance: {
    key: 'asset_maintenance',
    label: 'Asset maintenance',
    from: `"service_reports" sr
      JOIN "assets" a ON a.id = sr."assetId"
      JOIN "users" u ON u.id = sr."completedById"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      asset: { label: 'Asset', sql: 'a.name', type: 'string' },
      technician: { label: 'Technician', sql: `(u."firstName" || ' ' || u."lastName")`, type: 'string' },
    },
    measures: {
      services: { label: 'Services', agg: 'count', sql: 'sr.id', format: 'number' },
      workHours: { label: 'Work hours', agg: 'sum', sql: 'sr."workDuration" / 3600.0', format: 'hours' },
      assets: { label: 'Assets', agg: 'countDistinct', sql: 'sr."assetId"', format: 'number' },
    },
  },

  task_cycle: {
    key: 'task_cycle',
    label: 'Task cycle time',
    // Cycle = completion (service report) minus task creation.
    from: `"service_reports" sr
      JOIN "tasks" t ON t.id = sr."taskId"
      LEFT JOIN "users" u ON u.id = t."assignedToId"
      LEFT JOIN "customers" c ON c.id = t."customerId"`,
    orgColumn: 'sr."organizationId"',
    dateColumn: 'sr."completedAt"',
    dimensions: {
      priority: { label: 'Priority', sql: 't.priority::text', type: 'string' },
      technician: { label: 'Assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      customer: { label: 'Customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      jobs: { label: 'Completed', agg: 'count', sql: 't.id', format: 'number' },
      avgHours: { label: 'Avg cycle (h)', agg: 'avg', sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 3600.0`, format: 'number' },
      avgDays: { label: 'Avg cycle (days)', agg: 'avg', sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 86400.0`, format: 'number' },
    },
  },
};

/** Client-safe catalog (no SQL) for the report builder UI. */
export function datasetCatalog() {
  return Object.values(DATASETS).map((d) => ({
    key: d.key,
    label: d.label,
    dimensions: Object.entries(d.dimensions).map(([key, v]) => ({ key, label: v.label, type: v.type })),
    measures: Object.entries(d.measures).map(([key, v]) => ({ key, label: v.label, format: v.format })),
  }));
}
