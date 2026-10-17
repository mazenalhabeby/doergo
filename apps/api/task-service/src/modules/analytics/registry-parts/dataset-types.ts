/** Moved here unchanged from registry.ts. */
import type { ReportLabelKey } from '@hbcfield/shared';

type Agg = 'sum' | 'count' | 'countDistinct' | 'avg';

type FieldType = 'string' | 'number' | 'date' | 'boolean';

type ValueFormat = 'number' | 'hours' | 'currency' | 'percent';

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
  /**
   * The rows a SPACE-SCOPED reader may see, as a trusted SQL predicate over the
   * bound parameter `p` (a text[] of granted space ids).
   *
   * ⚠️ Every dataset must say. Reports used to be org-scoped only, so a member
   * granted reports — or canViewAllTasks — in ONE workspace read every hour,
   * leave day and job in the organization. Work is narrowed by the space it was
   * done in; a person's leave (which belongs to no space) by whether that
   * person is in the reader's crew RIGHT NOW (an assignment with no end, or one
   * ending in the future — the same window as `memberScopeFilter`).
   */
  spaceFilter: (p: string) => string;
}
