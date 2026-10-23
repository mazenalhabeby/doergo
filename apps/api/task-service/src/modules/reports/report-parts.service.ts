import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { success, PrismaService } from '@hbcfield/shared';

/** Parts used on a service report: add, change, remove. */
@Injectable()
export class ReportPartsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a part to the report
   */
  async addPart(data: {
    reportId: string;
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: data.reportId },
    });

    if (!report) {
      throw new NotFoundException('Service report not found');
    }

    // Only the technician who completed can add parts
    if (report.completedById !== data.userId) {
      throw new ForbiddenException('You can only add parts to reports you created');
    }

    const part = await this.prisma.partUsed.create({
      data: {
        reportId: data.reportId,
        name: data.name,
        partNumber: data.partNumber,
        quantity: data.quantity || 1,
        unitCost: data.unitCost,
        notes: data.notes,
      },
    });

    return success(part);
  }

  /**
   * Update a part on the report
   */
  async updatePart(data: {
    partId: string;
    name?: string;
    partNumber?: string;
    quantity?: number;
    unitCost?: number;
    notes?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const part = await this.prisma.partUsed.findUnique({
      where: { id: data.partId },
      include: {
        report: true,
      },
    });

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    // Only the technician who completed can update parts
    if (part.report.completedById !== data.userId) {
      throw new ForbiddenException('You can only update parts on reports you created');
    }

    const updatedPart = await this.prisma.partUsed.update({
      where: { id: data.partId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.partNumber !== undefined && { partNumber: data.partNumber }),
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    return success(updatedPart);
  }

  /**
   * Delete a part from the report
   */
  async deletePart(data: { partId: string; userId: string; userRole: string; organizationId: string }) {
    const part = await this.prisma.partUsed.findUnique({
      where: { id: data.partId },
      include: {
        report: true,
      },
    });

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    // Only the technician who completed can delete parts
    if (part.report.completedById !== data.userId) {
      throw new ForbiddenException('You can only delete parts from reports you created');
    }

    await this.prisma.partUsed.delete({
      where: { id: data.partId },
    });

    return success(null, 'Part deleted successfully');
  }
}
