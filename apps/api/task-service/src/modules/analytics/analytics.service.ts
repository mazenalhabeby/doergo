import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
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
