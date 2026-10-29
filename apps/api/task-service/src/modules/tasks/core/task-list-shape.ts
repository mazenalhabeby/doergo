import { Prisma } from '@prisma/client';
import { flowTracksLocation, type PrismaService } from '@hbcfield/shared';
import { effectiveWorkflowIds } from '../../workflows/effective-workflow';

/**
 * What one task looks like in a LIST.
 *
 * The task list endpoint and the offline pull both send exactly this, so a list
 * rendered from the phone's copy is the list the member sees online. Two shapes
 * would be two screens that slowly disagree.
 */
export const TASK_LIST_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  // "Open · Mechanic" on the row — a one-row lookup per open task, null for the rest.
  openRole: { select: { id: true, name: true } },
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
 * The flow is the one rule (effective-workflow.ts — the workspace's DEFAULT, as the
 * status code reads it), batched: two queries for the page, then one workflow
 * lookup per DISTINCT flow, read in the TASK's organization (a shared workspace's
 * job follows its owner's flow).
 */
export async function annotateTracksLocation<
  T extends { organizationId: string; workflowId?: string | null; spaceId?: string | null },
>(
  prisma: PrismaService,
  tasks: T[],
  getWorkflow: (orgId: string, id: string) => Promise<FlowSteps | null>,
): Promise<(T & { tracksLocation: boolean })[]> {
  const flowOf = await effectiveWorkflowIds(prisma, tasks);
  const keyOf = (t: T) => {
    const id = flowOf.get(t) ?? null;
    return id ? `${t.organizationId}:${id}` : null;
  };
  const tracksByFlow = new Map<string, boolean>();
  await Promise.all(
    [...new Set(tasks.map(keyOf).filter((k): k is string => !!k))].map(async (key) => {
      const [orgId, id] = key.split(':');
      const wf = await getWorkflow(orgId, id);
      tracksByFlow.set(key, flowTracksLocation(wf?.statuses, wf?.name));
    }),
  );
  return tasks.map((t) => {
    const key = keyOf(t);
    // No flow at all falls back to the shared default, exactly as the task detail does.
    return { ...t, tracksLocation: key ? (tracksByFlow.get(key) ?? false) : flowTracksLocation(null, null) };
  });
}

type FlowSteps = { statuses?: { capabilities?: string[] | null }[] | null; name?: string };
