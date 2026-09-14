import { Prisma } from '@prisma/client';
import { flowTracksLocation } from '@hbcfield/shared';

/**
 * What one task looks like in a LIST.
 *
 * The task list endpoint and the offline pull both send exactly this, so a list
 * rendered from the phone's copy is the list the member sees online. Two shapes
 * would be two screens that slowly disagree.
 */
export const TASK_LIST_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  assignees: {
    take: 4, // List view only needs a few for stacked avatars
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  },
  // workflowId too: a task with no explicit type inherits its space's, and
  // that is what decides whether it is a job somebody drives to.
  space: { select: { id: true, name: true, workflowId: true } },
  phase: { select: { id: true, name: true, color: true, type: true } },
  sprint: { select: { id: true, name: true, status: true } },
  epic: { select: { id: true, name: true, color: true, status: true } },
  parent: { select: { id: true, title: true } },
  _count: {
    select: { checklistItems: true, subtasks: true, assignees: true },
  },
} satisfies Prisma.TaskInclude;

/**
 * Mark the jobs somebody actually drives to.
 *
 * "Plan my route" is offered on the strength of this, and the honest test is the
 * task's FLOW, not its coordinates: a support ticket carrying the customer's
 * address has a pin and no travel step.
 *
 * One workflow lookup per DISTINCT flow rather than per task — a page of a
 * hundred jobs with eight task types costs eight cache reads.
 */
export async function annotateTracksLocation<T extends { workflowId?: string | null; space?: { workflowId?: string | null } | null }>(
  tasks: T[],
  getWorkflow: (id: string) => Promise<{ statuses?: unknown; name?: string } | null>,
): Promise<(T & { tracksLocation: boolean })[]> {
  const flowIds = [...new Set(tasks.map((t) => t.workflowId ?? t.space?.workflowId ?? null).filter(Boolean))] as string[];
  const tracksByFlow = new Map<string, boolean>();
  await Promise.all(
    flowIds.map(async (id) => {
      const wf = await getWorkflow(id);
      tracksByFlow.set(id, flowTracksLocation(wf?.statuses as any, wf?.name));
    }),
  );
  return tasks.map((t) => {
    const flowId = t.workflowId ?? t.space?.workflowId ?? null;
    // No flow at all falls back to the shared default, exactly as the task detail does.
    return { ...t, tracksLocation: flowId ? (tracksByFlow.get(flowId) ?? false) : flowTracksLocation(null, null) };
  });
}
