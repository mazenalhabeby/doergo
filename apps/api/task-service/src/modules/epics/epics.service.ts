import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

const VALID_EPIC_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'];

@Injectable()
export class EpicsService {
  private readonly logger = new Logger(EpicsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all epics for an organization
   */
  /**
   * One epic by id, scoped to its organization.
   *
   * Added for the gateway's module guard, which has to know which SPACE a
   * mutation happens in — a epic carries that now. Kept lean: the guard needs
   * the space, not the whole record, and it runs in front of every mutation.
   */
  async findOne(data: { id: string; organizationId: string }) {
    const row = await this.prisma.epic.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, spaceId: true, organizationId: true },
    });
    // Not found and not yours answer alike — saying which would confirm that
    // another tenant's row exists.
    if (!row) throw new NotFoundException('Not found');
    return success(row);
  }

  async findAll(data: { organizationId: string; spaceId?: string; limit?: number; offset?: number }) {
    const epics = await this.prisma.epic.findMany({
      where: {
        organizationId: data.organizationId,
      // A space sees its own plus the organization-wide ones. Null spaceId
      // means organization-wide — what every pre-existing row is, so without
      // the null arm this would have emptied every board.
        ...(data.spaceId ? { OR: [{ spaceId: data.spaceId }, { spaceId: null }] } : {}),
      },
      orderBy: { position: 'asc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(epics);
  }

  /**
   * Create a new epic
   */
  async create(data: {
    name: string;
    /** Created inside a space → it belongs there. Omitted → organization-wide. */
    spaceId?: string | null;
    description?: string;
    color?: string;
    startDate?: string;
    targetDate?: string;
    position?: number;
    organizationId: string;
  }) {
    // Determine position if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastEpic = await this.prisma.epic.findFirst({
        where: { organizationId: data.organizationId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastEpic?.position ?? -1) + 1;
    }

    const epic = await this.prisma.epic.create({
      data: {
        spaceId: data.spaceId ?? null,
        name: data.name,
        description: data.description,
        color: data.color || '#8b5cf6',
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        position,
        organizationId: data.organizationId,
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(epic);
  }

  /**
   * Update an epic
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    description?: string;
    color?: string;
    status?: string;
    startDate?: string;
    targetDate?: string;
    position?: number;
  }) {
    const existing = await this.prisma.epic.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Epic not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Epic not found');
    }

    if (data.status && !VALID_EPIC_STATUSES.includes(data.status)) {
      throw new BadRequestException(`Status must be one of: ${VALID_EPIC_STATUSES.join(', ')}`);
    }

    const epic = await this.prisma.epic.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.targetDate !== undefined && { targetDate: data.targetDate ? new Date(data.targetDate) : null }),
        ...(data.position !== undefined && { position: data.position }),
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return success(epic);
  }

  /**
   * Delete an epic (unlinks tasks, does not delete them)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.epic.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Epic not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Epic not found');
    }

    // Unlink tasks from this epic before deleting
    await this.prisma.task.updateMany({
      where: { epicId: data.id },
      data: { epicId: null },
    });

    await this.prisma.epic.delete({ where: { id: data.id } });

    return success(null, 'Epic deleted successfully');
  }
}
