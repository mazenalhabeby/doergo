import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { compile, ReportDefinition } from './query-engine';

/** Reports a member saved: listing, saving, editing and deleting their own. */
@Injectable()
export class SavedReportsService {

  constructor(
    private readonly prisma: PrismaService,
  ) {}

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

  /**
   * A saved report is changed or removed by the person who made it, or by an
   * administrator. A SHARED report is readable by everybody with reports — and
   * was therefore editable and deletable by all of them: anybody could rewrite
   * the "Payroll hours" report the office runs every month, under its name.
   * Somebody else's report reads as not found, private or shared alike.
   */
  private async ownedSaved(data: { id: string; organizationId: string; userId?: string; isAdmin?: boolean }) {
    const existing = await this.prisma.reportDefinition.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, createdById: true },
    });
    if (!existing || (!data.isAdmin && existing.createdById !== data.userId)) throw new NotFoundException('Report not found');
    return existing;
  }

  async updateSaved(data: {
    id: string; organizationId: string; userId: string; isAdmin?: boolean;
    name?: string; description?: string; config?: ReportDefinition; isShared?: boolean;
  }) {
    await this.ownedSaved(data);
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

  async deleteSaved(data: { id: string; organizationId: string; userId?: string; isAdmin?: boolean }) {
    await this.ownedSaved(data);
    await this.prisma.reportDefinition.delete({ where: { id: data.id } });
    return { success: true };
  }
}
