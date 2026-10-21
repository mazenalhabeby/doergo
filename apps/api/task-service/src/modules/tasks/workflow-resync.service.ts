import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';
import { TaskStatus, success } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';

/** Bringing a workspace's tasks onto its workflow's steps again — one workspace, or all. */
@Injectable()
export class WorkflowResyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Re-sync every task in a space onto that space's workflow.
   *
   * Legacy tasks may carry a workflowId/status from before the space's workflow
   * was set, so they no longer match the space-driven board columns. This points
   * all of the space's tasks at the space's workflow and remaps any status that
   * isn't valid in that workflow to a sensible target (keeping final/canceled
   * intent where we can, otherwise resetting to the workflow's first status).
   */
  async resyncSpaceWorkflow(data: { spaceId: string; organizationId: string }) {
    // 1. Load the space (org-scoped). No workflow → nothing to sync.
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { id: true, workflowId: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    const targetWorkflowId = await resolveSpaceDefaultWorkflowId(this.prisma, space.id);
    if (!targetWorkflowId) {
      return success({ updated: 0, remapped: 0, reason: 'space has no workflow' });
    }

    // 2. Load the target workflow's statuses (ordered by position).
    const statuses = await this.prisma.workflowStatus.findMany({
      where: { workflowId: targetWorkflowId },
      orderBy: { position: 'asc' },
      select: { key: true, position: true, isFinal: true, isCanceled: true },
    });
    if (statuses.length === 0) {
      return success({ updated: 0, remapped: 0, reason: 'workflow has no statuses' });
    }
    // First non-canceled status by position (fallback to the very first).
    const firstKey = (statuses.find((s) => !s.isCanceled) ?? statuses[0]).key;
    const finalKey = statuses.find((s) => s.isFinal)?.key ?? null;
    const canceledKey = statuses.find((s) => s.isCanceled)?.key ?? null;
    const validKeys = new Set(statuses.map((s) => s.key));

    // Canonical fallbacks so pre-workflow tasks (NEW/ASSIGNED/COMPLETED/CANCELED…)
    // are classified sanely even though those keys aren't in the target workflow.
    const CANONICAL_FINAL = new Set<string>([TaskStatus.COMPLETED, TaskStatus.CLOSED]);
    const CANONICAL_CANCELED = new Set<string>([TaskStatus.CANCELED]);

    // 3. Load every task in the space (org-scoped).
    const tasks = await this.prisma.task.findMany({
      where: { spaceId: space.id, organizationId: data.organizationId },
      select: { id: true, status: true, workflowId: true },
    });

    // Compute the target status for each task; group by resulting status so we
    // can updateMany per bucket instead of one write per task.
    const remapStatus = (oldStatus: string): string => {
      // Already valid in the target workflow → keep it.
      if (validKeys.has(oldStatus)) return oldStatus;
      // Was a final/canceled state → map to the target's final/canceled if any.
      if (CANONICAL_FINAL.has(oldStatus) && finalKey) return finalKey;
      if (CANONICAL_CANCELED.has(oldStatus) && canceledKey) return canceledKey;
      // Unknown/other → reset to the workflow's first status.
      return firstKey;
    };

    // taskIds grouped by the status they should end up with — but only tasks
    // that actually change (status or workflowId differs).
    const byTargetStatus = new Map<string, string[]>();
    let remapped = 0;
    for (const task of tasks) {
      const newStatus = remapStatus(task.status);
      const statusChanged = newStatus !== task.status;
      const workflowChanged = task.workflowId !== targetWorkflowId;
      if (!statusChanged && !workflowChanged) continue; // no-op
      if (statusChanged) remapped++;
      const bucket = byTargetStatus.get(newStatus);
      if (bucket) bucket.push(task.id);
      else byTargetStatus.set(newStatus, [task.id]);
    }

    let updated = 0;
    if (byTargetStatus.size > 0) {
      await this.prisma.$transaction(
        Array.from(byTargetStatus.entries()).map(([status, ids]) =>
          this.prisma.task.updateMany({
            where: { id: { in: ids } },
            data: { workflowId: targetWorkflowId, status },
          }),
        ),
      );
      for (const ids of byTargetStatus.values()) updated += ids.length;
    }

    this.support.invalidateStatusCountsCache(data.organizationId);

    return success({ updated, remapped });
  }

  /**
   * Re-sync EVERY space in the org onto its own workflow (one-click admin action).
   * Loops each space that has a workflow and reuses resyncSpaceWorkflow, then
   * aggregates the totals. Sequential to avoid DB contention (infrequent action).
   */
  async resyncAllSpaces(data: { organizationId: string }) {
    const spaces = await this.prisma.companyLocation.findMany({
      where: { organizationId: data.organizationId, workflowId: { not: null } },
      select: { id: true },
    });
    let updated = 0;
    let remapped = 0;
    let spacesProcessed = 0;
    for (const space of spaces) {
      const res = await this.resyncSpaceWorkflow({ spaceId: space.id, organizationId: data.organizationId });
      const d = (res as { data?: { updated?: number; remapped?: number } })?.data;
      updated += d?.updated ?? 0;
      remapped += d?.remapped ?? 0;
      spacesProcessed += 1;
    }
    return success({ spacesProcessed, updated, remapped });
  }
}
