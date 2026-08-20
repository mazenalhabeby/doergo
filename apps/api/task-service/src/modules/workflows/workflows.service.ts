import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { success, missingModulesForWorkflow, statusesRequiringModule, validateWorkflow, spaceMayOffer } from '@hbcfield/shared';
import { assertSpaceInOrg, assertWorkflowInOrg } from '../../common/tenant-scope.util';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';

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
        // Scope travels with the row so the organization screen can GROUP a
        // space's own task types under that space, rather than hiding them and
        // leaving someone hunting for one they know they made.
        ownerSpace: { select: { id: true, name: true } },
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
    /**
     * Scope. Set → this space's own task type; unset → the organization's,
     * offerable by any of its spaces. See `workflow-scope` in shared.
     */
    ownerSpaceId?: string | null;
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

    /*
      A name has to be unique where it is SEEN, not organization-wide.

      Five spaces each forking "Field Service" from the library all want to call
      it that, and they are five different rows in five different lists. So a
      local type competes only with that space's other local types, and a shared
      one only with the organization's other shared ones. Case-insensitive, so
      "field service" and "Field Service" do not near-collide.
    */
    if (data.ownerSpaceId) {
      await assertSpaceInOrg(this.prisma, data.ownerSpaceId, data.organizationId);
    }
    const existing = await this.prisma.statusWorkflow.findFirst({
      where: {
        organizationId: data.organizationId,
        ownerSpaceId: data.ownerSpaceId ?? null,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        data.ownerSpaceId
          ? `This space already has a task type named "${name}".`
          : `A task type named "${name}" already exists.`,
      );
    }

    let workflow;
    try {
      workflow = await this.prisma.$transaction(async (tx) => {
      // The organization default is what an org-wide fallback resolves to, so a
      // type only one space can offer must never become it.
      if (data.isDefault && !data.ownerSpaceId) {
        await tx.statusWorkflow.updateMany({
          where: { organizationId: data.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.statusWorkflow.create({
        data: {
          name,
          isDefault: (data.isDefault && !data.ownerSpaceId) || false,
          organizationId: data.organizationId,
          ownerSpaceId: data.ownerSpaceId ?? null,
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

    /*
      A space's default must not vanish by deleting the type behind it.

      SpaceWorkflow cascades on delete, so the offering row goes with it and the
      space is left with no default at all — new tasks there would silently fall
      back to whatever the legacy column still says. Detaching already refuses
      this; deleting has to refuse it too, or the guard is one someone routes
      around without meaning to.
    */
    const defaultFor = await this.prisma.spaceWorkflow.findFirst({
      where: { workflowId: data.id, isDefault: true },
      select: { space: { select: { name: true } } },
    });
    if (defaultFor) {
      throw new BadRequestException(
        `This is the default task type in "${defaultFor.space.name}". Make another one the default there first.`,
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

    // The organization default is the fallback for anything with no other
    // answer, so it has to be a type every space could actually use.
    if (existing.ownerSpaceId) {
      throw new BadRequestException(
        'This task type belongs to one space, so it cannot be the organization default. Share it with the organization first.',
      );
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
  // ─── Which workflows a space offers ─────────────────────────────────────────

  /**
   * The workflows this space offers, default first.
   *
   * Falls back to describing CompanyLocation.workflowId as a single offering,
   * so a space with no rows yet answers exactly as it did before the join
   * existed.
   */
  async listSpaceWorkflows(data: { spaceId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const rows = await this.prisma.spaceWorkflow.findMany({
      where: { spaceId: data.spaceId },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      include: { workflow: { include: { statuses: { orderBy: { position: 'asc' } } } } },
    });
    if (rows.length > 0) {
      return success(rows.map((r) => ({ ...r.workflow, isDefault: r.isDefault, position: r.position })));
    }

    const fallbackId = await resolveSpaceDefaultWorkflowId(this.prisma, data.spaceId);
    if (!fallbackId) return success([]);
    const wf = await this.prisma.statusWorkflow.findFirst({
      where: { id: fallbackId, organizationId: data.organizationId },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
    return success(wf ? [{ ...wf, isDefault: true, position: 0 }] : []);
  }

  /**
   * Offer a workflow in a space.
   *
   * Refused when the space has not enabled what the workflow's steps need — a
   * step that asks for a route recording is decoration where route tracking is
   * off, and a task would reach it and be unable to do the thing it asks for.
   * The refusal names the modules AND the steps that need them, because "not
   * allowed" sends someone hunting.
   */
  async attachSpaceWorkflow(data: {
    spaceId: string;
    workflowId: string;
    organizationId: string;
    makeDefault?: boolean;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    await assertWorkflowInOrg(this.prisma, data.workflowId, data.organizationId);

    const [space, workflow] = await Promise.all([
      this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { enabledModules: true, organizationId: true },
      }),
      this.prisma.statusWorkflow.findUnique({
        where: { id: data.workflowId },
        select: {
          ownerSpaceId: true,
          statuses: {
            select: { key: true, name: true, position: true, isFinal: true, isCanceled: true, transitions: true, capabilities: true },
          },
        },
      }),
    ]);
    if (!space || !workflow) throw new NotFoundException('Space or task type not found');

    /*
      A task type scoped to one space belongs to that space alone.

      Offering it elsewhere would make "local" mean nothing, and would quietly
      hand a second space edit rights over a flow the first believes is private
      — the edit would land on both. Widening is a deliberate act ("share with
      the organization"), not a side effect of adding it somewhere.
    */
    if (!spaceMayOffer(workflow, data.spaceId)) {
      throw new BadRequestException(
        'That task type belongs to another space. Share it with the organization, or fork your own copy.',
      );
    }

    /*
      Is it sound enough to run work through?

      Checked HERE rather than on every edit. A workflow with one step is
      legitimately unfinished, not wrong, and refusing each save would make the
      builder hostile to the act of building. It becomes a problem the moment
      someone tries to USE it — which is this call, and task creation.

      Every problem at once, so whoever fixes it sees the whole list instead of
      discovering the next fault after each attempt.
    */
    const problems = validateWorkflow(workflow.statuses);
    if (problems.length > 0) {
      throw new BadRequestException(
        `This task type is not finished: ${problems.map((p) => p.message).join(' ')}`,
      );
    }

    // A space with no override inherits its organization's modules.
    let enabled = (space.enabledModules as string[] | null) ?? null;
    if (!enabled) {
      const org = await this.prisma.organization.findUnique({
        where: { id: space.organizationId },
        select: { enabledModules: true },
      });
      enabled = (org?.enabledModules as string[] | null) ?? [];
    }

    const missing = missingModulesForWorkflow(workflow.statuses, enabled);
    if (missing.length > 0) {
      const detail = missing
        .map((m) => `${m} (${statusesRequiringModule(workflow.statuses, m).join(', ')})`)
        .join('; ');
      throw new BadRequestException(
        `This task type needs modules this space has not enabled: ${detail}`,
      );
    }

    const position = await this.prisma.spaceWorkflow.count({ where: { spaceId: data.spaceId } });
    const row = await this.prisma.spaceWorkflow.upsert({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
      create: { spaceId: data.spaceId, workflowId: data.workflowId, position, isDefault: false },
      update: {},
    });

    // First offering, or asked for — become the default. Cleared elsewhere first
    // because at most one row per space may claim it (a partial unique index
    // makes two an impossible state rather than a merely discouraged one).
    if (data.makeDefault || position === 0) {
      await this.setSpaceDefaultWorkflow({ ...data, workflowId: data.workflowId });
    }
    return success(row);
  }

  /**
   * Widen a space's own task type to the whole organization.
   *
   * Safe in a way narrowing is not: nothing that could offer it before stops
   * being able to, and no task's state machine changes. Only the set of spaces
   * ALLOWED to offer it grows.
   *
   * The name has to be free at the new level, because it is about to compete
   * with the organization's other shared types rather than this space's.
   */
  async shareWithOrganization(data: { workflowId: string; organizationId: string }) {
    const wf = await this.prisma.statusWorkflow.findFirst({
      where: { id: data.workflowId, organizationId: data.organizationId },
      select: { id: true, name: true, ownerSpaceId: true },
    });
    if (!wf) throw new NotFoundException('Task type not found');
    if (!wf.ownerSpaceId) return success({ workflowId: wf.id, alreadyShared: true });

    const clash = await this.prisma.statusWorkflow.findFirst({
      where: {
        organizationId: data.organizationId,
        ownerSpaceId: null,
        name: { equals: wf.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `The organization already has a task type named "${wf.name}". Rename this one before sharing it.`,
      );
    }

    await this.prisma.statusWorkflow.update({ where: { id: wf.id }, data: { ownerSpaceId: null } });
    await this.workflowCache.invalidate(data.organizationId);
    return success({ workflowId: wf.id, alreadyShared: false });
  }

  /**
   * Take a space's own copy of a shared task type, so it can diverge.
   *
   * The original is left offered here deliberately. Tasks already moving
   * through it still point at it, and pulling it out from under them would
   * leave them on a flow the space no longer presents. So the space shows both
   * until the old work finishes, and removing the original is a decision
   * somebody makes when they can see it is empty.
   */
  async forkForSpace(data: { workflowId: string; spaceId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const source = await this.prisma.statusWorkflow.findFirst({
      where: { id: data.workflowId, organizationId: data.organizationId },
      select: {
        name: true,
        ownerSpaceId: true,
        statuses: {
          orderBy: { position: 'asc' },
          select: {
            name: true, key: true, color: true, icon: true, position: true,
            isFinal: true, isCanceled: true, transitions: true, capabilities: true,
          },
        },
      },
    });
    if (!source) throw new NotFoundException('Task type not found');
    if (source.ownerSpaceId === data.spaceId) {
      throw new BadRequestException('This task type already belongs to this space.');
    }

    // A name free among THIS space's own types. The shared original keeps its
    // name; the copy takes the first free variant so both can be told apart.
    const name = await this.freeLocalName(source.name, data.spaceId, data.organizationId);

    const created: any = await this.create({
      name,
      organizationId: data.organizationId,
      ownerSpaceId: data.spaceId,
      statuses: source.statuses.map((st) => ({
        ...st,
        icon: st.icon ?? undefined,
      })),
    });
    const forkId = created?.data?.id;
    if (forkId) {
      await this.attachSpaceWorkflow({
        spaceId: data.spaceId,
        workflowId: forkId,
        organizationId: data.organizationId,
      });
    }
    return success({ workflowId: forkId, name });
  }

  /** The first name this space does not already use for one of its own types. */
  private async freeLocalName(base: string, spaceId: string, organizationId: string): Promise<string> {
    const rows = await this.prisma.statusWorkflow.findMany({
      where: { organizationId, ownerSpaceId: spaceId },
      select: { name: true },
    });
    const used = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    for (let i = 2; i < 200; i++) {
      const candidate = `${base} (${i})`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    throw new ConflictException('Could not find a free name for the copy.');
  }

  /** Stop offering a workflow here. The default may not be removed while others remain. */
  async detachSpaceWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const row = await this.prisma.spaceWorkflow.findUnique({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
      select: { isDefault: true },
    });
    if (!row) return success({ removed: 0 });

    const total = await this.prisma.spaceWorkflow.count({ where: { spaceId: data.spaceId } });
    if (row.isDefault && total > 1) {
      throw new BadRequestException('Make another task type the default before removing this one');
    }

    await this.prisma.spaceWorkflow.delete({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
    });
    return success({ removed: 1 });
  }

  /** Which offering new tasks inherit. Exactly one, enforced by the database. */
  async setSpaceDefaultWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    await this.prisma.$transaction([
      // Cleared first: the partial unique index refuses two defaults, so setting
      // before clearing would fail rather than replace.
      this.prisma.spaceWorkflow.updateMany({
        where: { spaceId: data.spaceId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.spaceWorkflow.updateMany({
        where: { spaceId: data.spaceId, workflowId: data.workflowId },
        data: { isDefault: true },
      }),
    ]);
    return success({ spaceId: data.spaceId, workflowId: data.workflowId });
  }
}
