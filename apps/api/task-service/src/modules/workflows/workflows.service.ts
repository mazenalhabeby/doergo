import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { success } from '@hbcfield/shared';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowCache: WorkflowConfigCache,
  ) {}

  /**
   * List all workflows for an organization
   */
  async findAll(data: { organizationId: string; limit?: number; offset?: number }) {
    const workflows = await this.prisma.statusWorkflow.findMany({
      where: { organizationId: data.organizationId },
      orderBy: { createdAt: 'asc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: {
        statuses: { orderBy: { position: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });

    return success(workflows);
  }

  /**
   * Get a single workflow with its statuses
   */
  async findOne(data: { id: string; organizationId: string }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    return success(workflow);
  }

  /**
   * Create a new workflow
   */
  async create(data: {
    name: string;
    isDefault?: boolean;
    organizationId: string;
    /** Optional initial statuses — e.g. when starting from a template. */
    statuses?: Array<{
      name: string;
      key: string;
      color?: string;
      icon?: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
    }>;
  }) {
    const name = data.name?.trim();
    if (!name) {
      throw new BadRequestException('Task type name is required');
    }

    // Friendly duplicate check (the DB also enforces @@unique(organizationId,
    // name)). Case-insensitive so "field service" and "Field Service" don't
    // near-collide. Without this the raw Prisma "Unique constraint failed" leaked
    // into the UI toast.
    const existing = await this.prisma.statusWorkflow.findFirst({
      where: {
        organizationId: data.organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`A task type named "${name}" already exists.`);
    }

    let workflow;
    try {
      workflow = await this.prisma.$transaction(async (tx) => {
      // If setting as default, unset previous default
      if (data.isDefault) {
        await tx.statusWorkflow.updateMany({
          where: { organizationId: data.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.statusWorkflow.create({
        data: {
          name,
          isDefault: data.isDefault || false,
          organizationId: data.organizationId,
          ...(data.statuses?.length
            ? {
                statuses: {
                  create: data.statuses.map((s, i) => ({
                    name: s.name,
                    key: s.key.toUpperCase(),
                    color: s.color || '#3b82f6',
                    icon: s.icon,
                    position: s.position ?? i,
                    isFinal: s.isFinal || false,
                    isCanceled: s.isCanceled || false,
                    transitions: s.transitions || [],
                    capabilities: s.capabilities || [],
                  })),
                },
              }
            : {}),
        },
        include: {
          statuses: { orderBy: { position: 'asc' } },
          _count: { select: { tasks: true } },
        },
      });

      return created;
      });
    } catch (err: any) {
      // Race: another request created the same name between the check and insert.
      if (err?.code === 'P2002') {
        throw new ConflictException(`A task type named "${name}" already exists.`);
      }
      throw err;
    }

    await this.workflowCache.invalidate(data.organizationId);
    return success(workflow);
  }

  /**
   * Update a workflow
   */
  async update(data: {
    id: string;
    organizationId: string;
    name?: string;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    const newName = data.name?.trim();
    // Friendly duplicate check on rename (skip if unchanged).
    if (newName && newName.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await this.prisma.statusWorkflow.findFirst({
        where: {
          organizationId: data.organizationId,
          name: { equals: newName, mode: 'insensitive' },
          id: { not: data.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`A task type named "${newName}" already exists.`);
      }
    }

    let workflow;
    try {
      workflow = await this.prisma.statusWorkflow.update({
        where: { id: data.id },
        data: {
          ...(newName ? { name: newName } : {}),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        include: {
          statuses: { orderBy: { position: 'asc' } },
          _count: { select: { tasks: true } },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`A task type named "${newName}" already exists.`);
      }
      throw err;
    }

    await this.workflowCache.invalidate(data.organizationId);
    return success(workflow);
  }

  /**
   * Delete a workflow (not allowed if it's the default)
   */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
      include: { _count: { select: { tasks: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    if (existing.isDefault) {
      throw new BadRequestException('Cannot delete the default workflow. Set another workflow as default first.');
    }

    if (existing._count.tasks > 0) {
      throw new BadRequestException(
        `Cannot delete workflow with ${existing._count.tasks} associated task(s). Reassign tasks first.`,
      );
    }

    await this.prisma.statusWorkflow.delete({ where: { id: data.id } });

    await this.workflowCache.invalidate(data.organizationId);
    return success(null, 'Workflow deleted successfully');
  }

  /**
   * Set a workflow as the organization default
   */
  async setDefault(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
    });

    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    // Unset previous default and set new one in a transaction
    await this.prisma.$transaction([
      this.prisma.statusWorkflow.updateMany({
        where: { organizationId: data.organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.statusWorkflow.update({
        where: { id: data.id },
        data: { isDefault: true },
      }),
    ]);

    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });

    await this.workflowCache.invalidate(data.organizationId);
    return success(workflow);
  }

  /**
   * Add a status to a workflow
   */
  async addStatus(data: {
    workflowId: string;
    organizationId: string;
    name: string;
    key: string;
    color?: string;
    icon?: string;
    position?: number;
    isFinal?: boolean;
    isCanceled?: boolean;
    transitions?: string[];
    capabilities?: string[];
  }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    // Determine position if not provided
    let position = data.position;
    if (position === undefined || position === null) {
      const lastStatus = await this.prisma.workflowStatus.findFirst({
        where: { workflowId: data.workflowId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastStatus?.position ?? -1) + 1;
    }

    const status = await this.prisma.workflowStatus.create({
      data: {
        workflowId: data.workflowId,
        name: data.name,
        key: data.key.toUpperCase(),
        color: data.color || '#3b82f6',
        icon: data.icon,
        position,
        isFinal: data.isFinal || false,
        isCanceled: data.isCanceled || false,
        transitions: data.transitions || [],
        capabilities: data.capabilities || [],
      },
    });

    await this.workflowCache.invalidate(data.organizationId);
    return success(status);
  }

  /**
   * Update a status in a workflow
   */
  async updateStatus(data: {
    workflowId: string;
    statusId: string;
    organizationId: string;
    name?: string;
    color?: string;
    icon?: string;
    position?: number;
    isFinal?: boolean;
    isCanceled?: boolean;
    transitions?: string[];
    capabilities?: string[];
  }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    const existing = await this.prisma.workflowStatus.findUnique({
      where: { id: data.statusId },
    });

    if (!existing || existing.workflowId !== data.workflowId) {
      throw new NotFoundException('Status not found in this workflow');
    }

    const status = await this.prisma.workflowStatus.update({
      where: { id: data.statusId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.isFinal !== undefined && { isFinal: data.isFinal }),
        ...(data.isCanceled !== undefined && { isCanceled: data.isCanceled }),
        ...(data.transitions !== undefined && { transitions: data.transitions }),
        ...(data.capabilities !== undefined && { capabilities: data.capabilities }),
      },
    });

    await this.workflowCache.invalidate(data.organizationId);
    return success(status);
  }

  /**
   * Reorder all statuses in a workflow in one shot — positions are assigned from
   * the given id order. Single transaction + single cache invalidation, so a
   * drag/move-up-down costs one round-trip regardless of how many statuses move.
   */
  async reorderStatuses(data: {
    workflowId: string;
    organizationId: string;
    statusIds: string[];
  }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
      include: { statuses: { select: { id: true } } },
    });

    if (!workflow || workflow.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    const existingIds = new Set(workflow.statuses.map((s) => s.id));
    if (
      data.statusIds.length !== existingIds.size ||
      !data.statusIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'statusIds must contain exactly the statuses of this workflow.',
      );
    }

    await this.prisma.$transaction(
      data.statusIds.map((id, index) =>
        this.prisma.workflowStatus.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );

    await this.workflowCache.invalidate(data.organizationId);

    const updated = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });

    return success(updated);
  }

  // ==================== Definition of Done ====================

  /**
   * Get active Definition of Done for an organization, optionally filtered by workflow
   */
  async getDefinitionOfDone(data: { organizationId: string; workflowId?: string }) {
    const where: any = {
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

      if (!existing) {
        throw new NotFoundException('Definition of Done not found');
      }

      if (existing.organizationId !== data.organizationId) {
        throw new NotFoundException('Definition of Done not found');
      }

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

    if (!existing) {
      throw new NotFoundException('Definition of Done not found');
    }

    if (existing.organizationId !== data.organizationId) {
      throw new NotFoundException('Definition of Done not found');
    }

    await this.prisma.definitionOfDone.delete({ where: { id: data.id } });

    return success(null, 'Definition of Done deleted successfully');
  }

  /**
   * Delete a status from a workflow
   */
  async removeStatus(data: {
    workflowId: string;
    statusId: string;
    organizationId: string;
  }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.organizationId !== data.organizationId) {
      throw new NotFoundException('Workflow not found');
    }

    const existing = await this.prisma.workflowStatus.findUnique({
      where: { id: data.statusId },
    });

    if (!existing || existing.workflowId !== data.workflowId) {
      throw new NotFoundException('Status not found in this workflow');
    }

    // Check if any tasks are using this status key in this workflow
    const tasksUsingStatus = await this.prisma.task.count({
      where: {
        workflowId: data.workflowId,
        status: existing.key,
      },
    });

    if (tasksUsingStatus > 0) {
      throw new BadRequestException(
        `Cannot delete status "${existing.name}" — ${tasksUsingStatus} task(s) are using it.`,
      );
    }

    await this.prisma.workflowStatus.delete({ where: { id: data.statusId } });

    await this.workflowCache.invalidate(data.organizationId);
    return success(null, 'Status deleted successfully');
  }
}
