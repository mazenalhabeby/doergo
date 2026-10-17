import { ConflictException } from '@nestjs/common';
import { TaskStatus, isWorkOver } from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ROLE_WAVE_CLOSED } from './role-pool.service';
import type { PreparedStepSubmission } from './step-submission';
import type { StatusTask } from './task-status.types';
import type { Prisma } from '@prisma/client';

/** The write of `TaskStatusService.updateStatus`: what changes on the row, and the guarded write itself. */

/** Build update data with route timestamps. */
export function statusUpdateData(
  task: StatusTask,
  /** Only the steps are read: is the target a finished (final or canceled) step? */
  wf: { statuses?: { key: string; isFinal?: boolean | null; isCanceled?: boolean | null }[] } | null,
  status: string,
  occurredAt: Date,
): Prisma.TaskUncheckedUpdateInput {
  const updateData: Prisma.TaskUncheckedUpdateInput = { status: status };
  // A role task reaching a FINISHED step (canonical or the workflow's own) asks its role for nobody more.
  if (task.openRoleId) {
    const target = wf?.statuses?.find((s) => s.key === status);
    if ((target && (target.isFinal || target.isCanceled)) || isWorkOver(String(status))) {
      updateData.openSpotsLeft = 0;
      updateData.openWave = ROLE_WAVE_CLOSED;
    }
  }
  // Any move of a paused job ends the pause — the job is being dealt with.
  if (task.pausedAt) {
    updateData.pausedAt = null;
    updateData.pausedById = null;
  }

  // Set routeStartedAt when transitioning to EN_ROUTE
  if (status === TaskStatus.EN_ROUTE) {
    updateData.routeStartedAt = occurredAt;
    // Reset route data for a fresh tracking session
    updateData.routeDistance = 0;
    updateData.routeEndedAt = null;
  }

  // Set routeEndedAt when transitioning to ARRIVED
  if (status === TaskStatus.ARRIVED) {
    updateData.routeEndedAt = occurredAt;
  }
  return updateData;
}

/**
 * Writes the move; answers the step submission's id (null without a form).
 *
 * Only if the task is STILL in the status every check was made against. Two
 * changes racing (a phone replaying while the office drags the card) used to
 * both pass their checks and the second silently won.
 *
 * With a form, the move and its answers are ONE write: either the job moved
 * and its report exists, or neither happened. The form is snapshotted with
 * the answers, so a definition edited later cannot change what was asked.
 */
export async function writeStatusMove(
  prisma: PrismaService,
  args: {
    task: StatusTask;
    taskId: string;
    updateData: Prisma.TaskUncheckedUpdateInput;
    submission: PreparedStepSubmission | null;
    userId: string;
    occurredAt: Date;
  },
): Promise<string | null> {
  const { task, taskId, updateData, submission } = args;
  let submissionId = null as string | null;
  const moved = submission
    ? await prisma.$transaction(async (tx) => {
        const m = await tx.task.updateMany({ where: { id: taskId, status: task.status }, data: updateData });
        if (m.count === 0) return m;
        const row = await tx.taskStepSubmission.create({
          data: {
            organizationId: task.organizationId,
            taskId: task.id,
            statusKey: submission.statusKey,
            formVersion: submission.form.version,
            form: submission.form as unknown as Prisma.InputJsonValue,
            answers: submission.answers,
            submittedById: args.userId,
            // When the member answered: the tap, not when the phone found signal.
            submittedAt: args.occurredAt,
          },
          select: { id: true },
        });
        submissionId = row.id;
        return m;
      })
    : await prisma.task.updateMany({
        where: { id: taskId, status: task.status },
        data: updateData,
      });
  if (moved.count === 0) {
    const now = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, assignedToId: true, updatedAt: true },
    });
    throw new ConflictException({
      message: `This task was moved to ${now?.status ?? 'another status'} at the same moment`,
      code: 'TASK_STATE_CONFLICT',
      params: { current: now },
    });
  }
  return submissionId;
}
