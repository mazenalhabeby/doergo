import type { PrismaService } from '@hbcfield/shared';
import type { CachedWorkflow, WorkflowConfigCache } from './config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId, resolveSpaceDefaultWorkflowIds } from './space-workflow.util';

/**
 * Which workflow a JOB follows: its own, else its workspace's default.
 *
 * ONE rule for every reader. The status code asked the workspace through
 * `resolveSpaceDefaultWorkflowId` (the SpaceWorkflow default, then the column)
 * while the report, the job page, the list and the chat read the bare column
 * (`task.space.workflowId`). In a workspace whose column had drifted from its
 * default, the report answered "not finished" for a CLOSED job the status code
 * called final. The status code's answer is the truth; everybody asks it here.
 */
export type FlowTask = { workflowId?: string | null; spaceId?: string | null };

export async function effectiveWorkflowId(prisma: PrismaService, task: FlowTask): Promise<string | null> {
  if (task.workflowId) return task.workflowId;
  return resolveSpaceDefaultWorkflowId(prisma, task.spaceId);
}

/** The same answer for many jobs: two queries whatever the count (only for jobs without their own flow). */
export async function effectiveWorkflowIds<T extends FlowTask>(
  prisma: PrismaService,
  tasks: T[],
): Promise<Map<T, string | null>> {
  const spaceFlow = await resolveSpaceDefaultWorkflowIds(
    prisma,
    tasks.filter((t) => !t.workflowId).map((t) => t.spaceId),
  );
  return new Map(tasks.map((t) => [t, t.workflowId ?? (t.spaceId ? (spaceFlow.get(t.spaceId) ?? null) : null)]));
}

/**
 * The job's workflow, with its steps, read in the JOB's organization — a guest
 * from another organization reads the owner's flow, never their own.
 */
export async function effectiveWorkflowOf(
  prisma: PrismaService,
  cache: Pick<WorkflowConfigCache, 'getWorkflow'>,
  task: FlowTask & { organizationId: string },
): Promise<CachedWorkflow | null> {
  return cache.getWorkflow(task.organizationId, await effectiveWorkflowId(prisma, task));
}
