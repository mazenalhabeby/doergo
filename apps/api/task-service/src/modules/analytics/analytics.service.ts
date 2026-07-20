import { Injectable, Logger } from '@nestjs/common';
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
}
