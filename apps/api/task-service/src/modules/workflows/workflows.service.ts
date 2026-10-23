import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { success, isTypeCapability, assertFoundInOrg, PrismaService } from '@hbcfield/shared';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import { stepFormForSave } from './step-form.util';
import { WorkflowConfigCache } from './config-cache/workflow-config-cache.service';

@Injectable()
export class WorkflowsService {
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

    assertFoundInOrg(workflow, data.organizationId, 'Workflow');

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
    /** What the TASK carries throughout — sprint, story points, subtasks… */
    capabilities?: string[];
    /** Optional initial statuses — e.g. when starting from a template. */
    statuses?: Array<{
      name: string;
      /** Set for a step from a shipped template — see workflow-status-label. */
      nameKey?: string | null;
      key: string;
      color?: string;
      icon?: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
      /** "Ask when a job moves here" — validated and versioned (starts at 1). */
      form?: unknown;
    }>;
  }) {
    const name = data.name?.trim();
    // Judged BEFORE anything is written: a bad form refuses the whole create.
    const statusForms = (data.statuses ?? []).map((s) => stepFormForSave(s.form, null));
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
            // Only TYPE capabilities here. A step capability on the type would
            // name a module nothing at this level can honour.
            capabilities: (data.capabilities ?? []).filter(isTypeCapability),
            ...(data.statuses?.length
              ? {
                  statuses: {
                    create: data.statuses.map((s, i) => ({
                      ...(statusForms[i] !== undefined ? { form: statusForms[i] } : {}),
                      name: s.name,
                      nameKey: s.nameKey ?? null,
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
    } catch (err) {
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
    capabilities?: string[];
  }) {
    const existing = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(existing, data.organizationId, 'Workflow');

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
          ...(data.capabilities !== undefined && {
            capabilities: data.capabilities.filter(isTypeCapability),
          }),
        },
        include: {
          statuses: { orderBy: { position: 'asc' } },
          _count: { select: { tasks: true } },
        },
      });
    } catch (err) {
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

    assertFoundInOrg(existing, data.organizationId, 'Workflow');

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
}
