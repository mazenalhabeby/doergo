import { scopeFor } from '../../common/permission-scope';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { addOnDef, moduleMonthlyCents, isAdmin } from '@hbcfield/shared';
import { isFeatureEntitled } from '../../common/entitlements';
import { assertExternalMayWriteTask } from '../../common/external-task-write';
import type { TasksService } from './tasks.service';

import type { AuthedRequest } from '../../common/request.types';
import type { SessionUser } from '../../common/request.types';

/*
  The checks the /tasks controllers make before a write: fields the org bought, an
  external member's own jobs, assigning in a workspace.
*/

/**
 * Closes the "set a premium field via the plain task endpoint" backdoor: the
 * dedicated sprints/epics/phases controllers are gated, but sprintId/epicId/
 * phaseId/storyPoints also flow through create/update. Reject (402) any
 * premium field the org's tier/modules don't entitle. DRY via isFeatureEntitled.
 */
export function assertTaskFieldEntitlements(
  user: SessionUser,
  dto: { sprintId?: string; epicId?: string; phaseId?: string; storyPoints?: number },
) {
  const checks: Array<[unknown, string]> = [
    [dto.sprintId, 'sprints'],
    [dto.epicId, 'epics'],
    [dto.phaseId, 'phases'],
    [dto.storyPoints, 'story_points'],
  ];
  for (const [value, feature] of checks) {
    if (value !== undefined && value !== null && value !== '' && !isFeatureEntitled(user, feature)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: `The "${feature}" feature is not available on your plan.`,
          error: 'PlanUpgradeRequired',
          feature,
          // No tier to name — say what it is and what it costs.
          monthlyCents: addOnDef(feature)?.monthlyCents ?? moduleMonthlyCents(feature),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}

/**
 * An external member writes (comment, attachment) only on a job they raised —
 * see `assertExternalMayWriteTask`. Internal callers pass with no lookup.
 */
export function assertExternalMayWrite(
  tasksService: TasksService,
  req: AuthedRequest,
  taskId: string,
  opts?: { attachmentId?: string },
) {
  return assertExternalMayWriteTask(req, taskId, (data) => tasksService.findOne(data), opts);
}

/** May the caller assign work in this workspace? (org-wide, or a space grant there) */
export function assertMayAssignIn(req: AuthedRequest, spaceId?: string) {
  if (isAdmin(req.user) || req.user.canAssignTasks === true) return;
  if (spaceId && (scopeFor(req.user, 'canAssignTasks') ?? []).includes(spaceId)) return;
  throw new ForbiddenException('You do not have permission to assign work in this workspace');
}
