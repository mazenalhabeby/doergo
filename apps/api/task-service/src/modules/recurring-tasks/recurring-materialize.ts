import { PrismaService, activeAssignmentWhere, peopleWhoPass } from '@hbcfield/shared';
import {
  assertSpaceInOrg,
  assertWorkflowInOrg,
  assertUsersInOrg,
  assertCustomerInOrg,
} from '../../common/tenant-scope.util';
import { writeCreateAssignees } from '../tasks/records/task-create-steps';
import type { Prisma, TaskPriority } from '@prisma/client';

/** A repeat's references, and making one real task from it (the manual "Generate" and the scheduler). */

/**
 * The ids on this template all belong to this organization.
 *
 * These three checks were written out here after a security audit; task
 * creation never adopted them and could be handed another tenant's workflow.
 * They live in tenant-scope.util now, so the rule has one statement and the
 * next path that takes an id from a client finds it rather than reinventing
 * it — slightly differently.
 */
export async function assertTemplateRefsInOrg(
  prisma: PrismaService,
  organizationId: string,
  spaceId?: string,
  workflowId?: string,
  assigneeIds?: string[],
  customerId?: string,
) {
  // An archived workspace takes no new work — nor a repeat that would keep making it there.
  await assertSpaceInOrg(prisma, spaceId, organizationId, { activeOnly: true });
  await assertWorkflowInOrg(prisma, workflowId, organizationId);
  await assertUsersInOrg(prisma, assigneeIds, organizationId);
  // The client every generated task will carry — an id from the body says nothing about whose it is.
  await assertCustomerInOrg(prisma, customerId, organizationId);
}

/** First non-cancel status of a task type (the flow's starting point). */
async function resolveInitialStatus(db: Prisma.TransactionClient, workflowId: string | null): Promise<string> {
  if (!workflowId) return 'NEW';
  const first = await db.workflowStatus.findFirst({
    where: { workflowId, isCanceled: false },
    orderBy: { position: 'asc' },
    select: { key: true },
  });
  return first?.key ?? 'NEW';
}

/** What a template carries into each job it makes. */
export interface MaterializableTemplate {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  spaceId: string | null;
  workflowId: string | null;
  customerId: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  estimatedHours: number | null;
  organizationId: string;
  assigneeIds: unknown;
  checklist: unknown;
}

/**
 * The template's people who can still be given the job: ACTIVE members of the organization and — for a
 * template in a workspace — assigned to that workspace now. Somebody who left (or left the workspace)
 * since the template was written is skipped, never handed a job they can no longer open.
 */
export async function activeTemplateAssignees(
  prisma: PrismaService,
  template: Pick<MaterializableTemplate, 'assigneeIds' | 'organizationId' | 'spaceId'>,
  now: Date,
): Promise<string[]> {
  const ids = Array.isArray(template.assigneeIds)
    ? (template.assigneeIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  if (!ids.length) return [];
  const members = new Set(await peopleWhoPass(prisma, ids, { organizationId: template.organizationId, active: true }));
  let kept = ids.filter((id) => members.has(id));
  if (template.spaceId && kept.length) {
    const rows = await prisma.spaceAssignment.findMany({
      where: { spaceId: template.spaceId, ...activeAssignmentWhere({ in: kept }, now) },
      select: { userId: true },
    });
    const rostered = new Set(rows.map((r) => r.userId));
    kept = kept.filter((id) => rostered.has(id));
  }
  return kept;
}

/**
 * Create one real Task from a template — space-, type- and flow-aware — INSIDE the caller's transaction
 * (task, checklist and crew together: a failure leaves no half-made job). Announcing it is the caller's,
 * after the commit, through the create route's own after-steps (TaskRecordsService.announceNew).
 */
export async function materializeTask(
  tx: Prisma.TransactionClient,
  template: MaterializableTemplate,
  userId: string,
  assigneeIds: string[],
): Promise<{ id: string }> {
  const checklist = Array.isArray(template.checklist) ? (template.checklist as { text: string }[]) : [];

  let status = await resolveInitialStatus(tx, template.workflowId ?? null);
  // Legacy field-service behaviour: an assigned task with no custom type starts ASSIGNED.
  if (assigneeIds.length > 0 && !template.workflowId) status = 'ASSIGNED';

  const task = await tx.task.create({
    data: {
      title: template.title,
      description: template.description,
      priority: template.priority,
      status: status,
      spaceId: template.spaceId ?? null,
      workflowId: template.workflowId ?? null,
      // The client it repeats for, onto every task it makes. Without this a
      // monthly service call produced the right address and no client.
      customerId: template.customerId ?? null,
      locationLat: template.locationLat,
      locationLng: template.locationLng,
      locationAddress: template.locationAddress,
      estimatedHours: template.estimatedHours,
      organizationId: template.organizationId,
      createdById: userId,
      ...(assigneeIds.length > 0 ? { assignedToId: assigneeIds[0] } : {}),
    },
    select: { id: true },
  });

  if (checklist.length > 0) {
    await tx.checklistItem.createMany({
      data: checklist.map((item, index) => ({ taskId: task.id, text: item.text, position: index })),
    });
  }
  // The crew as the create route writes it: the first person LEAD.
  await writeCreateAssignees(tx, task.id, assigneeIds, assigneeIds[0] ?? null);
  return task;
}
