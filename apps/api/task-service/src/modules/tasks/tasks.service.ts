import { Injectable } from '@nestjs/common';
import { TaskRecordsService } from './task-records.service';
import { TaskPortalService } from './task-portal.service';
import { TaskQueryService } from './task-query.service';
import { TaskStatusService } from './task-status.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskChecklistService } from './task-checklist.service';
import { TaskActivityService } from './task-activity.service';
import { TaskSupportService } from './task-support.service';
import { TechnicianSuggestionService } from './technician-suggestion.service';
import { TaskHierarchyService } from './task-hierarchy.service';
import { TaskDeclineService } from './task-decline.service';
import { TaskCrewMembersService } from './task-crew-members.service';
import { TaskUpdateService } from './task-update.service';
import { WorkflowResyncService } from './workflow-resync.service';
import { TaskDetailService } from './task-detail.service';
import { TaskDependenciesService } from './task-dependencies.service';
import { TaskTriageService } from './task-triage.service';

/**
 * Everything the per-task authorization rule needs about the caller.
 *
 * Named and passed as one object so a fact the gateway resolves — a space
 * grant, a cross-org share — cannot reach some checks and not others.
 */
/*
  The caller's identity for the task gate. Lives with the gate itself now
  (common/task-access) — re-exported so existing imports keep working.
*/
export type { TaskAccessFacts } from '../../common/task-access/task-access.service';

/**
 * The task service every caller injects — the processor, the controller, the
 * role pool, member offboarding.
 *
 * A facade: each method hands over to the collaborator that owns it, so the
 * signatures callers depend on stay exactly where they were while the work
 * lives in single-purpose services beside it (task-*.service.ts).
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly records: TaskRecordsService,
    private readonly workflowResync: WorkflowResyncService,
    private readonly taskUpdates: TaskUpdateService,
    private readonly portal: TaskPortalService,
    private readonly triage: TaskTriageService,
    private readonly query: TaskQueryService,
    private readonly taskDetail: TaskDetailService,
    private readonly status: TaskStatusService,
    private readonly assignment: TaskAssignmentService,
    private readonly crewMembers: TaskCrewMembersService,
    private readonly declines: TaskDeclineService,
    private readonly checklist: TaskChecklistService,
    private readonly activity: TaskActivityService,
    private readonly support: TaskSupportService,
    private readonly suggestions: TechnicianSuggestionService,
    private readonly hierarchy: TaskHierarchyService,
    private readonly dependencies: TaskDependenciesService,
  ) {}

  // ── A task as a record: create, edit, delete, re-sync a space onto its workflow.

  create(...args: Parameters<TaskRecordsService['create']>) {
    return this.records.create(...args);
  }

  resyncSpaceWorkflow(...args: Parameters<WorkflowResyncService['resyncSpaceWorkflow']>) {
    return this.workflowResync.resyncSpaceWorkflow(...args);
  }

  resyncAllSpaces(...args: Parameters<WorkflowResyncService['resyncAllSpaces']>) {
    return this.workflowResync.resyncAllSpaces(...args);
  }

  update(...args: Parameters<TaskUpdateService['update']>) {
    return this.taskUpdates.update(...args);
  }

  remove(...args: Parameters<TaskUpdateService['remove']>) {
    return this.taskUpdates.remove(...args);
  }

  // ── The customer portal: a customer's own requests, a portal's inbox, triage.

  listPortalRequests(...args: Parameters<TaskPortalService['listPortalRequests']>) {
    return this.portal.listPortalRequests(...args);
  }

  listPortalRequestsByPortal(...args: Parameters<TaskPortalService['listPortalRequestsByPortal']>) {
    return this.portal.listPortalRequestsByPortal(...args);
  }

  getPortalRequest(...args: Parameters<TaskPortalService['getPortalRequest']>) {
    return this.portal.getPortalRequest(...args);
  }

  triageRequest(...args: Parameters<TaskTriageService['triageRequest']>) {
    return this.triage.triageRequest(...args);
  }

  // ── Reading tasks: the list, one task, job time, step submissions.

  findAll(...args: Parameters<TaskQueryService['findAll']>) {
    return this.query.findAll(...args);
  }

  spaceOf(...args: Parameters<TaskDetailService['spaceOf']>) {
    return this.taskDetail.spaceOf(...args);
  }

  findOne(...args: Parameters<TaskDetailService['findOne']>) {
    return this.taskDetail.findOne(...args);
  }

  getJobTime(...args: Parameters<TaskDetailService['getJobTime']>) {
    return this.taskDetail.getJobTime(...args);
  }

  getJobTimeReport(...args: Parameters<TaskDetailService['getJobTimeReport']>) {
    return this.taskDetail.getJobTimeReport(...args);
  }

  getSubmissions(...args: Parameters<TaskQueryService['getSubmissions']>) {
    return this.query.getSubmissions(...args);
  }

  // ── Moving a task through its steps, and resuming a paused job.

  updateStatus(...args: Parameters<TaskStatusService['updateStatus']>) {
    return this.status.updateStatus(...args);
  }

  resumeWork(...args: Parameters<TaskStatusService['resumeWork']>) {
    return this.status.resumeWork(...args);
  }

  // ── Who is on a task — and the role pool's hooks into the same path.

  assign(...args: Parameters<TaskAssignmentService['assign']>) {
    return this.assignment.assign(...args);
  }

  decline(...args: Parameters<TaskDeclineService['decline']>) {
    return this.declines.decline(...args);
  }

  addAssignee(...args: Parameters<TaskCrewMembersService['addAssignee']>) {
    return this.crewMembers.addAssignee(...args);
  }

  removeAssignee(...args: Parameters<TaskCrewMembersService['removeAssignee']>) {
    return this.crewMembers.removeAssignee(...args);
  }

  getAssignees(...args: Parameters<TaskAssignmentService['getAssignees']>) {
    return this.assignment.getAssignees(...args);
  }

  releaseMemberFromOpenWork(...args: Parameters<TaskCrewMembersService['releaseMemberFromOpenWork']>) {
    return this.crewMembers.releaseMemberFromOpenWork(...args);
  }

  assertCanReceiveTasks(...args: Parameters<TaskAssignmentService['assertCanReceiveTasks']>) {
    return this.assignment.assertCanReceiveTasks(...args);
  }

  onAssigneesChanged(...args: Parameters<TaskAssignmentService['onAssigneesChanged']>) {
    return this.assignment.onAssigneesChanged(...args);
  }

  assertMayAssignTask(...args: Parameters<TaskAssignmentService['assertMayAssignTask']>) {
    return this.assignment.assertMayAssignTask(...args);
  }

  // ── The checklist.

  addChecklistItem(...args: Parameters<TaskChecklistService['addChecklistItem']>) {
    return this.checklist.addChecklistItem(...args);
  }

  updateChecklistItem(...args: Parameters<TaskChecklistService['updateChecklistItem']>) {
    return this.checklist.updateChecklistItem(...args);
  }

  deleteChecklistItem(...args: Parameters<TaskChecklistService['deleteChecklistItem']>) {
    return this.checklist.deleteChecklistItem(...args);
  }

  reorderChecklist(...args: Parameters<TaskChecklistService['reorderChecklist']>) {
    return this.checklist.reorderChecklist(...args);
  }

  getChecklist(...args: Parameters<TaskChecklistService['getChecklist']>) {
    return this.checklist.getChecklist(...args);
  }

  // ── Timeline and comments.

  getTimeline(...args: Parameters<TaskActivityService['getTimeline']>) {
    return this.activity.getTimeline(...args);
  }

  addComment(...args: Parameters<TaskActivityService['addComment']>) {
    return this.activity.addComment(...args);
  }

  getComments(...args: Parameters<TaskActivityService['getComments']>) {
    return this.activity.getComments(...args);
  }

  // ── Status counts (cached; the cache lives with its invalidation).

  getStatusCounts(...args: Parameters<TaskSupportService['getStatusCounts']>) {
    return this.support.getStatusCounts(...args);
  }

  // ── Who should take this task.

  getSuggestedTechnicians(...args: Parameters<TechnicianSuggestionService['getSuggestedTechnicians']>) {
    return this.suggestions.getSuggestedTechnicians(...args);
  }

  // ── Subtasks and dependencies.

  createSubtask(...args: Parameters<TaskHierarchyService['createSubtask']>) {
    return this.hierarchy.createSubtask(...args);
  }

  getSubtasks(...args: Parameters<TaskHierarchyService['getSubtasks']>) {
    return this.hierarchy.getSubtasks(...args);
  }

  addDependency(...args: Parameters<TaskDependenciesService['addDependency']>) {
    return this.dependencies.addDependency(...args);
  }

  removeDependency(...args: Parameters<TaskDependenciesService['removeDependency']>) {
    return this.dependencies.removeDependency(...args);
  }
}
