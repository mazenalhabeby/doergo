import { BadRequestException } from '@nestjs/common';
import { DATASETS, Dataset } from './registry';

export type Granularity = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type DatePreset = 'last_7d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'this_year' | 'all';

export interface ReportFilter {
  field: string; // dimension key
  op: 'eq' | 'neq' | 'in';
  value: string | number | Array<string | number>;
}

export interface ReportDefinition {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  granularity?: Granularity;
  dateRange?: { preset?: DatePreset; from?: string; to?: string };
  filters?: ReportFilter[];
  sort?: { key: string; dir: 'asc' | 'desc' };
  limit?: number;
}

const GRANULARITIES = new Set<Granularity>(['none', 'day', 'week', 'month', 'quarter', 'year']);

function resolveRange(dr?: ReportDefinition['dateRange']): { from: Date | null; to: Date | null } {
  if (!dr) return { from: null, to: null };
  if (dr.from || dr.to) {
    return { from: dr.from ? new Date(dr.from) : null, to: dr.to ? new Date(dr.to) : null };
  }
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (dr.preset) {
    case 'last_7d': return { from: startOfDay(new Date(now.getTime() - 6 * 864e5)), to: null };
    case 'last_30d': return { from: startOfDay(new Date(now.getTime() - 29 * 864e5)), to: null };
    case 'last_90d': return { from: startOfDay(new Date(now.getTime() - 89 * 864e5)), to: null };
    case 'this_month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
    case 'last_month': return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'this_year': return { from: new Date(now.getFullYear(), 0, 1), to: null };
    case 'all':
    default: return { from: null, to: null };
  }
}

function aggregate(agg: string, sql: string): string {
  switch (agg) {
    case 'sum': return `ROUND(SUM(${sql})::numeric, 2)`;
    case 'avg': return `ROUND(AVG(${sql})::numeric, 2)`;
    case 'count': return `COUNT(${sql})`;
    case 'countDistinct': return `COUNT(DISTINCT ${sql})`;
    default: throw new BadRequestException(`Unknown aggregate: ${agg}`);
  }
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  columns: Array<{ key: string; label: string; kind: 'dimension' | 'measure' | 'period'; format?: string }>;
}

/** Compile a report definition into safe parameterized SQL against a dataset. */
export function compile(def: ReportDefinition, organizationId: string): CompiledQuery {
  const ds: Dataset | undefined = DATASETS[def.dataset];
  if (!ds) throw new BadRequestException(`Unknown dataset: ${def.dataset}`);

  const measures = def.measures || [];
  if (!measures.length) throw new BadRequestException('At least one measure is required');
  const dimensions = def.dimensions || [];
  const granularity: Granularity = def.granularity && GRANULARITIES.has(def.granularity) ? def.granularity : 'none';

  const selects: string[] = [];
  const groupBy: string[] = [];
  const columns: CompiledQuery['columns'] = [];

  // Time bucket (safe: granularity is allow-listed).
  if (granularity !== 'none') {
    const expr = `date_trunc('${granularity}', ${ds.dateColumn})`;
    selects.push(`${expr} AS "period"`);
    groupBy.push(expr);
    columns.push({ key: 'period', label: 'Period', kind: 'period' });
  }

  // Dimensions.
  for (const key of dimensions) {
    const dim = ds.dimensions[key];
    if (!dim) throw new BadRequestException(`Unknown dimension '${key}' for dataset '${def.dataset}'`);
    selects.push(`${dim.sql} AS "${key}"`);
    groupBy.push(dim.sql);
    columns.push({ key, label: dim.label, kind: 'dimension' });
  }

  // Measures.
  for (const key of measures) {
    const m = ds.measures[key];
    if (!m) throw new BadRequestException(`Unknown measure '${key}' for dataset '${def.dataset}'`);
    selects.push(`${aggregate(m.agg, m.sql)} AS "${key}"`);
    columns.push({ key, label: m.label, kind: 'measure', format: m.format });
  }

  // WHERE — org scope is ALWAYS applied.
  const params: unknown[] = [organizationId];
  const where: string[] = [`${ds.orgColumn} = $1`];

  const { from, to } = resolveRange(def.dateRange);
  if (from) { params.push(from); where.push(`${ds.dateColumn} >= $${params.length}`); }
  if (to) { params.push(to); where.push(`${ds.dateColumn} < $${params.length}`); }

  for (const f of def.filters || []) {
    const dim = ds.dimensions[f.field];
    if (!dim) throw new BadRequestException(`Unknown filter field '${f.field}'`);
    if (f.op === 'in') {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      params.push(arr);
      where.push(`${dim.sql} = ANY($${params.length})`);
    } else {
      params.push(f.value);
      where.push(`${dim.sql} ${f.op === 'neq' ? '<>' : '='} $${params.length}`);
    }
  }

  // ORDER BY — validated against selected columns; default to first measure desc.
  let orderBy = `"${measures[0]}" DESC`;
  if (def.sort) {
    const valid = columns.some((c) => c.key === def.sort!.key);
    if (valid) orderBy = `"${def.sort.key}" ${def.sort.dir === 'asc' ? 'ASC' : 'DESC'}`;
  } else if (granularity !== 'none') {
    orderBy = `"period" ASC`;
  }

  const limit = Math.min(Math.max(def.limit || 500, 1), 5000);

  const sql = `
    SELECT ${selects.join(', ')}
    FROM ${ds.from}
    WHERE ${where.join(' AND ')}
    ${groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `.trim();

  return { sql, params, columns };
}
