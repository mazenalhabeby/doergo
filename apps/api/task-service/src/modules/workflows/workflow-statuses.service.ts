import { Injectable, BadRequestException } from '@nestjs/common';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import { stepFormForSave } from '../../common/step-form.util';
import { WorkflowServiceBase } from './workflow-service.base';

/** A workflow's steps: adding, changing, reordering, removing. */
@Injectable()
export class WorkflowStatusesService extends WorkflowServiceBase {
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
    form?: unknown;
  }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
    });

    assertFoundInOrg(workflow, data.organizationId, 'Workflow');

    const form = stepFormForSave(data.form, null);

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
        ...(form !== undefined ? { form } : {}),
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
    /** The step's form; null clears it (back to "not set"). */
    form?: unknown;
  }) {
    const existing = await this.stepOf(data);

    // Versioned against what the step holds: an identical save keeps the version.
    const form = stepFormForSave(data.form, existing.form);

    const status = await this.prisma.workflowStatus.update({
      where: { id: data.statusId },
      data: {
        ...(data.name !== undefined && {
          name: data.name,
          /*
            A RENAME makes it their name — an identical save does not.

            The key exists so a step from a shipped template reads in the
            member's language. Keeping it through a rename would show ours and
            silently discard theirs, with no way to tell why the rename did
            nothing. But clearing it whenever `name` is merely PRESENT would
            wipe every key the first time somebody pressed Save without editing
            anything, because the editor sends every field each time. So the
            trigger is a difference, not a field.
          */
          ...(data.name !== existing.name ? { nameKey: null } : {}),
        }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.isFinal !== undefined && { isFinal: data.isFinal }),
        ...(data.isCanceled !== undefined && { isCanceled: data.isCanceled }),
        ...(data.transitions !== undefined && { transitions: data.transitions }),
        ...(data.capabilities !== undefined && { capabilities: data.capabilities }),
        ...(form !== undefined && { form }),
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
  async reorderStatuses(data: { workflowId: string; organizationId: string; statusIds: string[] }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
      include: { statuses: { select: { id: true } } },
    });

    assertFoundInOrg(workflow, data.organizationId, 'Workflow');

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

  /**
   * Delete a status from a workflow
   */
  async removeStatus(data: { workflowId: string; statusId: string; organizationId: string }) {
    const existing = await this.stepOf(data);

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

    /*
      Deleting a step also deletes every route TO it.

      It used to delete only the row, leaving its siblings pointing at a key
      that no longer existed. That was invisible until the validator arrived,
      and then it was fatal: a dangling target is an unknown_transition, so one
      deletion refused the whole task type the next time anyone tried to offer
      it. One of the seeded flows in a real database was already broken this
      way — a Cancelled step removed, and every route to it left behind.

      In a transaction, because a half-done version of this is exactly the state
      it is meant to prevent.
    */
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowStatus.delete({ where: { id: data.statusId } });

      const pointingAtIt = await tx.workflowStatus.findMany({
        where: { workflowId: data.workflowId, transitions: { has: existing.key } },
        select: { id: true, transitions: true },
      });
      for (const sibling of pointingAtIt) {
        await tx.workflowStatus.update({
          where: { id: sibling.id },
          data: { transitions: sibling.transitions.filter((k) => k !== existing.key) },
        });
      }
    });

    await this.workflowCache.invalidate(data.organizationId);
    return success(null, 'Status deleted successfully');
  }
}
