import { ConflictException } from '@nestjs/common';
import { TaskStatus, type PrismaService } from '@hbcfield/shared';
import type { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../workflows/space-workflow.util';

/** The refusal a screen translates: the job's step does not exist in the new workspace's flow. */
export const TASK_STEP_NOT_IN_DESTINATION_FLOW = 'TASK_STEP_NOT_IN_DESTINATION_FLOW';

/**
 * Moving a job to another workspace must leave it on a flow that has its step.
 *
 * A job with no flow of its own follows its workspace's DEFAULT, so moving it
 * silently switched it onto the destination's flow — where its step (DOING,
 * PICKED_UP…) may not exist: a card in no column, with no move the status code
 * allows. A job with its OWN flow keeps it, so nothing changes for it here.
 *
 * Refused, not mapped: no rule says which step of another flow is "the same" as
 * this one, and dropping a job half-way through back to the first step would
 * lose where it stands. The office can move it AND choose its flow in one edit
 * (the workflow branch of update(), which places it on the chosen flow).
 */
export async function assertStepSurvivesMove(
  prisma: PrismaService,
  workflows: Pick<WorkflowConfigCache, 'getWorkflow'>,
  task: { status: string; organizationId: string; workflowId: string | null },
  destinationSpaceId: string | null,
): Promise<void> {
  if (task.workflowId) return;
  const flowId = await resolveSpaceDefaultWorkflowId(prisma, destinationSpaceId);
  const flow = flowId ? await workflows.getWorkflow(task.organizationId, flowId) : null;
  const keys = flow?.statuses?.length ? flow.statuses.map((s) => s.key) : (Object.values(TaskStatus) as string[]);
  if (keys.includes(task.status)) return;
  throw new ConflictException({
    message: "The job's current step does not exist in that workspace's flow. Choose a flow for it as you move it.",
    code: TASK_STEP_NOT_IN_DESTINATION_FLOW,
    params: { status: task.status },
  });
}
