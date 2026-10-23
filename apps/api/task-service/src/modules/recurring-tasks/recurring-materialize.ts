import { PrismaService } from '@hbcfield/shared';
import {
  assertSpaceInOrg,
  assertWorkflowInOrg,
  assertUsersInOrg,
  assertCustomerInOrg,
} from '../../common/tenant-scope.util';
import type { TaskPriority } from '@prisma/client';

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
  await assertSpaceInOrg(prisma, spaceId, organizationId);
  await assertWorkflowInOrg(prisma, workflowId, organizationId);
  await assertUsersInOrg(prisma, assigneeIds, organizationId);
  // The client every generated task will carry — an id from the body says nothing about whose it is.
  await assertCustomerInOrg(prisma, customerId, organizationId);
}

/** First non-cancel status of a task type (the flow's starting point). */
async function resolveInitialStatus(prisma: PrismaService, workflowId: string | null): Promise<string> {
  if (!workflowId) return 'NEW';
  const first = await prisma.workflowStatus.findFirst({
    where: { workflowId, isCanceled: false },
    orderBy: { position: 'asc' },
    select: { key: true },
  });
  return first?.key ?? 'NEW';
}

/**
 * Create one real Task from a template — space-, type- and flow-aware. Shared
 * by the manual "Generate" action and the scheduler.
 */
export async function materializeTask(
  prisma: PrismaService,
  template: {
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
  },
  userId: string,
): Promise<{ id: string }> {
  const assigneeIds = Array.isArray(template.assigneeIds) ? (template.assigneeIds as string[]) : [];
  const checklist = Array.isArray(template.checklist) ? (template.checklist as { text: string }[]) : [];

  let status = await resolveInitialStatus(prisma, template.workflowId ?? null);
  // Legacy field-service behaviour: an assigned task with no custom type starts ASSIGNED.
  if (assigneeIds.length > 0 && !template.workflowId) status = 'ASSIGNED';

  const task = await prisma.task.create({
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
  });

  if (checklist.length > 0) {
    await prisma.checklistItem.createMany({
      data: checklist.map((item, index) => ({ taskId: task.id, text: item.text, position: index })),
    });
  }
  if (assigneeIds.length > 0) {
    await prisma.taskAssignee.createMany({
      data: assigneeIds.map((uid, index) => ({
        taskId: task.id,
        userId: uid,
        role: index === 0 ? 'LEAD' : 'MEMBER',
      })),
    });
  }
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId,
      eventType: 'CREATED',
      metadata: {
        source: 'recurring_template',
        templateId: template.id,
        templateTitle: template.title,
      },
    },
  });

  return task;
}
