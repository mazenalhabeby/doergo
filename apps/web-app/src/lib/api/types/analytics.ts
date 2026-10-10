

// ─────────────────────────────────────────────────────────────────────────────
// Analytics / Reports — dynamic report engine (semantic registry + query engine)
// ─────────────────────────────────────────────────────────────────────────────
export type ReportGranularity = "none" | "day" | "week" | "month" | "quarter" | "year";

export type ReportDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month" | "last_month" | "this_year" | "all";


export interface ReportDefinition {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  granularity?: ReportGranularity;
  dateRange?: { preset?: ReportDatePreset; from?: string; to?: string };
  filters?: Array<{ field: string; op: "eq" | "neq" | "in"; value: string | number | Array<string | number> }>;
  sort?: { key: string; dir: "asc" | "desc" };
  limit?: number;
}


/**
 * `labelKey` names the column in the catalogue every reader shares
 * (REPORT_LABELS in @hbcfield/shared); `label` is its English name, kept for a
 * column the catalogue does not know. Render with `localizeReportColumns`.
 */
export interface ReportColumn { key: string; labelKey?: string; label: string; kind: "dimension" | "measure" | "period"; format?: string }

export interface ReportResult { columns: ReportColumn[]; rows: Array<Record<string, unknown>> }


export interface ReportTemplate { key: string; name: string; description: string; def: ReportDefinition }

export interface DatasetMeta {
  key: string;
  labelKey?: string;
  label: string;
  dimensions: Array<{ key: string; labelKey?: string; label: string; type: string }>;
  measures: Array<{ key: string; labelKey?: string; label: string; format: string }>;
}


export interface SavedReport {
  id: string;
  name: string;
  description?: string | null;
  dataset: string;
  config: ReportDefinition;
  isShared: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}


export type ReportCadence = "daily" | "weekly" | "monthly";

export interface ReportSchedule {
  id: string;
  reportDefinitionId: string;
  cadence: ReportCadence;
  hour: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive: boolean;
  lastRunAt?: string | null;
  nextRunAt: string;
  createdAt: string;
}

export interface ScheduleInput {
  reportDefinitionId: string;
  cadence: ReportCadence;
  hour?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}
