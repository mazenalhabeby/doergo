import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { canAccessTask, isTaskAssignee, isWithinTaskBoundary } from '@hbcfield/shared';
import { PrismaService } from '../prisma/prisma.service';
import { holdsOpenRole } from '@hbcfield/shared';
import type { TaskAccessFacts as SharedTaskAccessFacts } from '@hbcfield/shared/microservices';

/**
 * The caller's whole identity as the gateway forwards it, in one piece.
 *
 * This used to be seven positional arguments, and the last two — the cross-org
 * shares and the SPACE grants — were supplied by exactly one of the eleven call
 * sites. Passing the payload itself means a new fact reaches every check the
 * moment the gateway sends it. There is nothing left to forget.
 */
export type TaskAccessFacts = SharedTaskAccessFacts;

export interface TaskAccessOptions {
  /**
   * A task OPEN TO A ROLE is also readable by whoever holds that role in its
   * workspace — the person who may take it. ⚠️ READ ONLY: only the reads opt
   * in. Somebody who has not taken the job must not comment on it, tick its
   * checklist, attach to it or write its report.
   */
  roleHolderMayRead?: boolean;
}

/**
 * May this caller touch this task?
 *
 * ONE gate for the task itself, its attachments, its service report and its
 * custom-field values. It used to exist as three private copies (tasks,
 * reports, attachments) and they had drifted: the attachments copy never looked
 * up co-assignee rows, so a crew member without canViewAllTasks could comment
 * on a job and was refused its photos; and the attachments and reports copies
 * asked "does this person hold the open role?" BEFORE the organization
 * boundary, the task copy after it. A copy is how a rule becomes two rules.
 *
 * Order is load-bearing:
 *   1. the decision itself is the shared rule (`canAccessTask`), which checks
 *      the ORGANIZATION BOUNDARY first — a relationship to a task grants access
 *      within the boundary, never across it;
 *   2. the co-assignee row is read only when the task is already inside the
 *      boundary, so an out-of-org probe cannot make us query on its behalf;
 *   3. the role-holder exemption is asked last, only after the normal rule said
 *      no, only for reads, and only for a task of the caller's own organization.
 */
@Injectable()
export class TaskAccessService {
  private readonly logger = new Logger(TaskAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws unless the caller may touch the task: 404 outside the caller's
   * boundary, 403 inside it.
   *
   * ⚠️ OUTSIDE the boundary the answer must be byte-for-byte the "no such task"
   * answer. A 403 there confirms that the id is a real task in some other
   * organization — the same oracle the documents and the job report already
   * close with a 404. Inside the boundary the caller may know the task exists
   * (it is on their board), so "you may not" stays 403.
   */
  async assert(task: any, data: TaskAccessFacts, opts: TaskAccessOptions = {}): Promise<void> {
    if (await this.allows(task, data, opts)) return;

    const { userId, organizationId, sharedSpaceIds, canViewAllTasks, viewAllSpaceIds } = data;
    if (!task || !isWithinTaskBoundary(task, { userId, organizationId, sharedSpaceIds } as never)) {
      throw new NotFoundException('Task not found');
    }
    /*
      Log WHY, not just that. These fields are the whole rule: which space the
      task is in, which spaces the caller holds, whether they hold it org-wide.
      Ids only; no titles, no names. ABSENT and EMPTY scopes print differently —
      absent means the gateway sent none (admin / org-wide / old code), empty
      means it was computed and found nothing.
    */
    this.logger.warn(
      `Authorization denied for task ${task?.id}: user=${userId} taskSpace=${task?.spaceId ?? 'none'} ` +
        `grantedSpaces=${viewAllSpaceIds === undefined ? 'absent' : `[${viewAllSpaceIds.join(',')}]`} ` +
        `orgWide=${canViewAllTasks === true}`,
    );
    throw new ForbiddenException('Access denied');
  }

  /** The same decision as `assert`, as a boolean. */
  async allows(task: any, data: TaskAccessFacts, opts: TaskAccessOptions = {}): Promise<boolean> {
    if (!task) return false;
    const { userId, userRole, organizationId, canViewAllTasks, sharedSpaceIds, viewAllSpaceIds } = data;
    const caller = { userId, userRole, organizationId, canViewAllTasks, sharedSpaceIds, viewAllSpaceIds };

    // Recognise BOTH the LEAD (legacy assignedToId) and the multi-assignee
    // MEMBER rows — only hitting the database when the answer is unknown AND the
    // task is inside the boundary.
    let assignee = isTaskAssignee(task, userId);
    if (assignee === null && isWithinTaskBoundary(task, caller)) {
      const membership = await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId },
        select: { id: true },
      });
      assignee = !!membership;
    }
    if (canAccessTask(task, caller, assignee ?? false)) return true;

    return (
      opts.roleHolderMayRead === true &&
      !!task.openRoleId &&
      task.organizationId === organizationId &&
      (await holdsOpenRole(this.prisma as never, task, userId))
    );
  }
}
