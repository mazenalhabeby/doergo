import { Injectable, BadRequestException } from '@nestjs/common';
import { success, assertFoundInOrg, PrismaService } from '@hbcfield/shared';
import type { Prisma } from '@prisma/client';

/** A step's definition of done: reading, setting, removing it. */
@Injectable()
export class DefinitionOfDoneService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Definition of Done ====================

  /**
   * Get active Definition of Done for an organization, optionally filtered by workflow
   */
  async getDefinitionOfDone(data: { organizationId: string; workflowId?: string }) {
    const where: Prisma.DefinitionOfDoneWhereInput = {
      organizationId: data.organizationId,
      isActive: true,
    };

    if (data.workflowId) {
      where.workflowId = data.workflowId;
    }

    const dods = await this.prisma.definitionOfDone.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return success(dods);
  }

  /**
   * Create or update a Definition of Done
   */
  async upsertDefinitionOfDone(data: {
    id?: string;
    organizationId: string;
    workflowId?: string;
    items: { text: string; isRequired: boolean }[];
    isActive?: boolean;
  }) {
    // Validate items
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('At least one DoD item is required');
    }

    if (data.id) {
      // Update existing
      const existing = await this.prisma.definitionOfDone.findUnique({
        where: { id: data.id },
      });

      assertFoundInOrg(existing, data.organizationId, 'Definition of Done');

      const dod = await this.prisma.definitionOfDone.update({
        where: { id: data.id },
        data: {
          items: data.items,
          ...(data.workflowId !== undefined && { workflowId: data.workflowId || null }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });

      return success(dod);
    } else {
      // Create new
      const dod = await this.prisma.definitionOfDone.create({
        data: {
          organizationId: data.organizationId,
          workflowId: data.workflowId || null,
          items: data.items,
          isActive: data.isActive ?? true,
        },
      });

      return success(dod);
    }
  }

  /**
   * Delete a Definition of Done
   */
  async removeDefinitionOfDone(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.definitionOfDone.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(existing, data.organizationId, 'Definition of Done');

    await this.prisma.definitionOfDone.delete({ where: { id: data.id } });

    return success(null, 'Definition of Done deleted successfully');
  }
}
