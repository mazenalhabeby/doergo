import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TaskStatus, accessAllowsInSpace, activeAssignmentWhere } from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { assertWorkflowInOrg } from '../../common/tenant-scope.util';
import { resolveSpaceDefaultWorkflowId, listSpaceWorkflowIds } from '../../common/space-workflow.util';

/** The steps of `TaskRecordsService.create`, in the order it runs them. */

/**
 * Which workspace the task goes into, written onto `data.spaceId`.
 * Un-triaged portal requests stay space-less.
 */
export async function settleCreateSpace(prisma: PrismaService, data: any, isUntriaged: boolean): Promise<void> {
  /*
    SPACE-scoped users create inside a workspace they are assigned to.

    ⚠️ The phone's New job may send NO workspace (it was never required, and
    this rule was dead code until the gateway forwarded the scope). A member
    assigned to exactly ONE workspace has an unambiguous answer, so it is
    used; only somebody with a real choice is asked to make it. Refusing them
    all would have broken job creation on every installed phone.
  */
  if (data.taskCreationScope === 'SPACE' && !data.spaceId) {
    const mine = await prisma.spaceAssignment.findMany({
      where: activeAssignmentWhere(data.userId),
      select: { spaceId: true },
      distinct: ['spaceId'],
      take: 2,
    });
    if (mine.length !== 1) {
      throw new ForbiddenException('Task creation scope is SPACE — you must select a space');
    }
    data.spaceId = mine[0]!.spaceId;
  }

  // Space-centric: every (triaged) task belongs to a space. If none was chosen,
  // fall back to the org's default ("General") space so no task is space-less.
  if (!data.spaceId && !isUntriaged) {
    const defaultSpace = await prisma.companyLocation.findFirst({
      where: { organizationId: data.organizationId, isDefault: true },
      select: { id: true },
    });
    if (defaultSpace) data.spaceId = defaultSpace.id;
  }
}

export interface CreatePlacement {
  locationLat: any;
  locationLng: any;
  locationAddress: any;
  spaceWorkflowId: string | null;
  /** The org the task will BELONG to. */
  effectiveOrgId: string;
}

/** If spaceId provided, validate it belongs to the org and auto-populate location. */
export async function resolveCreatePlacement(prisma: PrismaService, data: any): Promise<CreatePlacement> {
  const placement: CreatePlacement = {
    locationLat: data.locationLat,
    locationLng: data.locationLng,
    locationAddress: data.locationAddress,
    spaceWorkflowId: null,
    // For a cross-org shared space the task lives in the OWNER org (so the owner
    // sees/counts it), even though a guest created it.
    effectiveOrgId: data.organizationId,
  };
  if (!data.spaceId) return placement;

  const space = await prisma.companyLocation.findUnique({
    where: { id: data.spaceId },
    select: { organizationId: true, lat: true, lng: true, address: true, workflowId: true },
  });
  if (!space) {
    throw new NotFoundException('Space not found');
  }
  // Through the shared resolver: the join first, the column as fallback.
  placement.spaceWorkflowId = await resolveSpaceDefaultWorkflowId(prisma, data.spaceId);
  if (space.organizationId !== data.organizationId) {
    // Foreign space → allowed ONLY if the caller holds a cross-org CONTRIBUTE/
    // CONTROL grant for THIS exact space (server-authoritative access, checked
    // against the resource's real spaceId). The task then belongs to the owner.
    if (!accessAllowsInSpace(data.access, 'canCreateTasks', data.spaceId)) {
      // No relationship to this space at all → it does not exist for them
      // (a 403 confirmed a real workspace of another organization). A guest
      // who CAN see the shared space but not create in it keeps the 403.
      if (!data.access?.perSpace?.[data.spaceId]) throw new NotFoundException('Space not found');
      throw new ForbiddenException('Cannot create task in a space outside your organization');
    }
    placement.effectiveOrgId = space.organizationId;
  } else if (data.taskCreationScope === 'SPACE') {
    // Native space, SPACE scope → user must be assigned to the space.
    // Assigned NOW — a row whose window has closed is a former member.
    const assignment = await prisma.spaceAssignment.findFirst({
      where: { ...activeAssignmentWhere(data.userId), spaceId: data.spaceId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You can only create tasks in spaces you are assigned to');
    }
  }

  // Auto-populate location from space if not provided
  if (!placement.locationLat && !placement.locationLng && !placement.locationAddress) {
    placement.locationLat = space.lat;
    placement.locationLng = space.lng;
    placement.locationAddress = space.address;
  }
  return placement;
}

/** The workflow must be the task's organization's, and one its space offers. */
export async function assertWorkflowUsable(
  prisma: PrismaService,
  effWorkflowId: string | null,
  effectiveOrgId: string,
  spaceId: string | undefined,
): Promise<void> {
  /*
    A workflow id arriving from a client says nothing about whose it is.

    This was used unchecked: the status lookup below filters on workflowId
    alone, so passing another tenant's id created a task running on THEIR
    state machine — their status names, their transitions, inside this
    organization. Narrow to exploit and trivial to prevent.

    Checked against effectiveOrgId, the org the TASK will belong to, which is
    not always the caller's: in a cross-org shared space the task belongs to
    the space's owner, so its workflow must be the owner's too. The triage
    path has always done this; creation had not.
  */
  await assertWorkflowInOrg(prisma, effWorkflowId, effectiveOrgId);

  /*
    And it must be a task type this SPACE offers — not merely one the
    organization owns.

    Owning it is no longer enough now that each space chooses its own set: a
    space that deliberately does not offer "Logistics" should not receive a
    task running on it because someone passed the id. One level stricter than
    the ownership check above, and the same shape — an id from a client says
    nothing about where it may be used.

    Only when the space HAS offerings. A space still on the legacy column has
    none, and its inherited default already passed the ownership check.
  */
  if (effWorkflowId && spaceId) {
    const offered = await listSpaceWorkflowIds(prisma, spaceId);
    if (offered.length > 0 && !offered.includes(effWorkflowId)) {
      throw new BadRequestException('That task type is not available in this space');
    }
  }
}

/** The workflow's first status, else the canonical NEW/ASSIGNED. */
export async function initialTaskStatus(
  prisma: PrismaService,
  effWorkflowId: string | null,
  hasAssignment: boolean,
): Promise<string> {
  let initialStatus: string = hasAssignment ? TaskStatus.ASSIGNED : TaskStatus.NEW;
  if (effWorkflowId) {
    const firstStatus = await prisma.workflowStatus.findFirst({
      where: { workflowId: effWorkflowId, isCanceled: false },
      orderBy: { position: 'asc' },
      select: { key: true },
    });
    if (firstStatus) initialStatus = firstStatus.key;
  }
  return initialStatus;
}

const PERSON_SELECT = { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } as const;

export const TASK_CREATE_INCLUDE = {
  createdBy: { select: PERSON_SELECT },
  assignedTo: { select: PERSON_SELECT },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

/** The crew rows of a new task, inside its transaction. */
export async function writeCreateAssignees(
  tx: Prisma.TransactionClient,
  taskId: string,
  assigneeIds: string[],
  assignedToId: string | undefined,
): Promise<void> {
  // Create TaskAssignee records if assigneeIds provided
  if (assigneeIds.length > 0) {
    // If there is a primary assignedToId, mark them as LEAD
    const assigneeData = assigneeIds.map((userId: string) => ({
      taskId,
      userId,
      role: userId === assignedToId ? ('LEAD' as const) : ('MEMBER' as const),
    }));

    await tx.taskAssignee.createMany({
      data: assigneeData,
      skipDuplicates: true,
    });
  }

  // If assignedToId is set but not in assigneeIds, add as LEAD assignee
  if (assignedToId && !assigneeIds.includes(assignedToId)) {
    await tx.taskAssignee
      .create({
        data: {
          taskId,
          userId: assignedToId,
          role: 'LEAD',
        },
      })
      .catch(() => {
        // Ignore duplicate
      });
  }
}
