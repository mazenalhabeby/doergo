import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

@Injectable()
export class PhasesService {
  private readonly logger = new Logger(PhasesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all phases for an organization
   */
  async findAll(data: { organizationId: string; limit?: number; offset?: number }) {
    const phases = await this.prisma.phase.findMany({
      where: { organizationId: data.organizationId },
      orderBy: { position: 'asc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(phases);
  }

  /**
   * Create a new phase
   */
  async create(data: {
    name: string;
    description?: string;
    color?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    position?: number;
    organizationId: string;
  }) {
    // Validate type
    if (data.type && !['phase', 'milestone'].includes(data.type)) {
      throw new BadRequestException('Type must be "phase" or "milestone"');
    }

    // Determine position if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastPhase = await this.prisma.phase.findFirst({
        where: { organizationId: data.organizationId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastPhase?.position ?? -1) + 1;
    }

    const phase = await this.prisma.phase.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#3b82f6',
        type: data.type || 'phase',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        position,
        organizationId: data.organizationId,
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(phase);
  }

  /**
   * Update a phase
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    description?: string;
    color?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    position?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.phase.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Phase not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Phase not found');
    }

    if (data.type && !['phase', 'milestone'].includes(data.type)) {
      throw new BadRequestException('Type must be "phase" or "milestone"');
    }

    const phase = await this.prisma.phase.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(phase);
  }

  /**
   * Delete a phase (unlinks tasks, does not delete them)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.phase.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Phase not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Phase not found');
    }

    // Unlink tasks from this phase before deleting
    await this.prisma.task.updateMany({
      where: { phaseId: data.id },
      data: { phaseId: null },
    });

    await this.prisma.phase.delete({ where: { id: data.id } });

    return success(null, 'Phase deleted successfully');
  }
}
