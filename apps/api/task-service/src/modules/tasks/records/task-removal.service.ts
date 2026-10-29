import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService, success, assertFoundInOrg, TASK_JOBS, type JobData } from '@hbcfield/shared';
import { emitEvent, taskDeletedEvent } from '@hbcfield/shared/microservices';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { TaskSupportService } from '../core/task-support.service';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { effectiveWorkflowOf } from '../../workflows/effective-workflow';
import { stepState } from './task-step-state';

/** The refusal a screen translates: a sub-job under this one was already done. */
export const TASK_HAS_FINISHED_SUBTASKS = 'TASK_HAS_FINISHED_SUBTASKS';

/** How deep a tree of sub-jobs is walked — far past anything a person builds by hand. */
const MAX_DEPTH = 20;

type Node = { id: string; status: string; organizationId: string; workflowId: string | null; spaceId: string | null };
const NODE = { id: true, status: true, organizationId: true, workflowId: true, spaceId: true } as const;

/**
 * Deleting a job — and, with it, the sub-jobs the database removes on cascade.
 *
 * ⚠️ `tasks.parentId` is ON DELETE CASCADE, so deleting a parent silently took
 * every sub-job with it: a FINISHED one (its report, signatures and time) went
 * too, nobody watching a sub-job was told it was gone, and its files stayed in
 * storage with nothing pointing at them. Decided 2026-10-29:
 *   • a job with a finished sub-job (its flow's final, non-canceled step) is NOT
 *     deleted — 409 TASK_HAS_FINISHED_SUBTASKS;
 *   • otherwise every job removed — the parent and each sub-job — is announced
 *     exactly as a single delete is, its client-request approvals end, and its
 *     attachments' stored objects are removed the way an attachment delete does.
 */
@Injectable()
export class TaskRemovalService {
  private readonly logger = new Logger(TaskRemovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    // A client request deleted half-way through an office rule: its approvals end with it.
    private readonly rules: ApprovalRulesService,
    private readonly workflows: WorkflowConfigCache,
    private readonly media: MediaSigner,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {}

  async remove(data: JobData<typeof TASK_JOBS.remove>) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });

    // Authorization: an ADMIN may delete any task in their organization.
    assertFoundInOrg(task, data.organizationId, 'Task');

    // Never a job somebody is working on or that was finished — by ITS flow (task-step-state.ts).
    const at = stepState(task.status, await effectiveWorkflowOf(this.prisma, this.workflows, task));
    if (at.working || at.finished) {
      throw new BadRequestException('Cannot delete a task that is in progress or completed');
    }

    const below = await this.subtasksOf(task.id);
    let finished = 0;
    for (const sub of below) {
      if (stepState(sub.status, await effectiveWorkflowOf(this.prisma, this.workflows, sub)).finished) finished++;
    }
    if (finished) {
      throw new ConflictException({
        message: 'This job has finished sub-jobs. Their record stays — the job cannot be deleted.',
        code: TASK_HAS_FINISHED_SUBTASKS,
        params: { count: finished },
      });
    }

    const removed = [task, ...below];
    const ids = removed.map((t) => t.id);
    // Read BEFORE the cascade takes the rows; the objects go only once the delete has happened.
    const files = await this.prisma.attachment.findMany({
      where: { taskId: { in: ids } },
      select: { id: true, fileKey: true, fileUrl: true },
    });

    await this.prisma.task.delete({ where: { id: data.id } });

    for (const t of removed) {
      await this.rules.clearItem('clientRequest', t.id);
      // spaceId lets cross-org shared guests receive the delete on the space room too.
      emitEvent(this.notificationClient, taskDeletedEvent, {
        taskId: t.id,
        organizationId: t.organizationId,
        spaceId: t.spaceId ?? null,
      });
    }
    await this.removeStoredFiles(files);

    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(null, 'Task deleted successfully');
  }

  /** Every job below this one, level by level (one query per level). */
  private async subtasksOf(rootId: string): Promise<Node[]> {
    const out: Node[] = [];
    const seen = new Set([rootId]);
    let level = [rootId];
    for (let depth = 0; level.length && depth < MAX_DEPTH; depth++) {
      const rows: Node[] = (await this.prisma.task.findMany({ where: { parentId: { in: level } }, select: NODE })) ?? [];
      const fresh = rows.filter((r) => !seen.has(r.id));
      fresh.forEach((r) => seen.add(r.id));
      out.push(...fresh);
      level = fresh.map((r) => r.id);
    }
    return out;
  }

  /** As an attachment delete does it: a failed cleanup is logged, never fatal — an orphan costs a fraction of a cent. */
  private async removeStoredFiles(files: Array<{ fileKey: string | null; fileUrl: string | null }>) {
    if (!this.store) return;
    for (const file of files) {
      const key = this.media.keyOf(file);
      if (!key) continue;
      const gone = await this.store.delete(key).catch(() => false);
      if (!gone) this.logger.warn(`Failed to delete stored object ${key}`);
    }
  }
}
