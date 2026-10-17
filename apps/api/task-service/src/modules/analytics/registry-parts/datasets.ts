/** Moved here unchanged from registry.ts. */
import type { Dataset } from './dataset-types';

/** A service report's space is its task's. */
const reportInSpaces = (p: string) =>
  `EXISTS (SELECT 1 FROM "tasks" st WHERE st.id = sr."taskId" AND st."spaceId" = ANY(${p}))`;

export const DATASETS: Record<string, Dataset> = {
  attendance: {
    key: 'attendance',
    labelKey: 'dataset.attendance',
    from: `"time_entries" te
      JOIN "users" u ON u.id = te."userId"
      LEFT JOIN "company_locations" cl ON cl.id = te."locationId"`,
    orgColumn: 'te."organizationId"',
    dateColumn: 'te."clockInAt"',
    spaceFilter: (p) => `te."locationId" = ANY(${p})`,
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
      hours: {
        labelKey: 'col.hoursWorked',
        agg: 'sum',
        sql:
          `COALESCE(te."paidMinutes", GREATEST(COALESCE(te."totalMinutes", 0) - ` +
          `COALESCE(te."breakMinutes", 0), 0)) / 60.0`,
        format: 'hours',
      },
      // Overtime is worked time too, so it nets the same way.
      overtimeHours: {
        labelKey: 'col.overtimeHours',
        agg: 'sum',
        sql:
          `CASE WHEN 'OVERTIME' = ANY(te."flagReasons") THEN ` +
          `COALESCE(te."paidMinutes", GREATEST(COALESCE(te."totalMinutes", 0) - ` +
          `COALESCE(te."breakMinutes", 0), 0)) / 60.0 ELSE 0 END`,
        format: 'hours',
      },
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
    spaceFilter: reportInSpaces,
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
    spaceFilter: (p) => `t."spaceId" = ANY(${p})`,
    dimensions: {
      status: { labelKey: 'col.status', sql: 't.status', type: 'string' },
      priority: { labelKey: 'col.priority', sql: 't.priority::text', type: 'string' },
      technician: { labelKey: 'col.assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      space: { labelKey: 'col.space', sql: `COALESCE(cl.name, '—')`, type: 'string' },
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      count: { labelKey: 'col.tasks', agg: 'count', sql: 't.id', format: 'number' },
      completed: {
        labelKey: 'col.completed',
        agg: 'sum',
        sql: `CASE WHEN t.status IN ('COMPLETED', 'CLOSED') THEN 1 ELSE 0 END`,
        format: 'number',
      },
      distanceKm: {
        labelKey: 'col.routeDistanceKm',
        agg: 'sum',
        sql: 'COALESCE(t."routeDistance", 0) / 1000.0',
        format: 'number',
      },
    },
  },

  leave: {
    key: 'leave',
    labelKey: 'dataset.leave',
    // Leave only (requests/request-kinds.ts ABSENCE_WHERE) — a remote day or changed hours is not a day off.
    from: `"time_off_requests" t JOIN "users" u ON u.id = t."technicianId" AND t.kind = 'LEAVE'`,
    orgColumn: 'u."organizationId"', // time_off has no org column; scope via the user
    dateColumn: 't."startDate"',
    spaceFilter: (p) =>
      `EXISTS (SELECT 1 FROM "space_assignments" sa WHERE sa."userId" = u.id AND sa."spaceId" = ANY(${p})
         AND sa."effectiveFrom" <= now() AND (sa."effectiveTo" IS NULL OR sa."effectiveTo" >= now()))`,
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
    spaceFilter: reportInSpaces,
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
    spaceFilter: reportInSpaces,
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
    spaceFilter: (p) => `t."spaceId" = ANY(${p})`,
    dimensions: {
      priority: { labelKey: 'col.priority', sql: 't.priority::text', type: 'string' },
      technician: { labelKey: 'col.assignee', sql: `COALESCE(u."firstName" || ' ' || u."lastName", 'Unassigned')`, type: 'string' },
      customer: { labelKey: 'col.customer', sql: `COALESCE(c.name, '—')`, type: 'string' },
    },
    measures: {
      jobs: { labelKey: 'col.completed', agg: 'count', sql: 't.id', format: 'number' },
      avgHours: {
        labelKey: 'col.avgCycleHours',
        agg: 'avg',
        sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 3600.0`,
        format: 'number',
      },
      avgDays: {
        labelKey: 'col.avgCycleDays',
        agg: 'avg',
        sql: `EXTRACT(EPOCH FROM (sr."completedAt" - t."createdAt")) / 86400.0`,
        format: 'number',
      },
    },
  },
};
