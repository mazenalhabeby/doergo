import { TaskSupportService } from './core/task-support.service';
import { TaskRecordsService } from './records/task-records.service';
import { TaskPortalService } from './records/task-portal.service';
import { TaskQueryService } from './query/task-query.service';
import { TaskStatusService } from './status/task-status.service';
import { TaskAssignmentService } from './assignment/task-assignment.service';
import { TaskChecklistService } from './checklist/task-checklist.service';
import { TaskActivityService } from './query/task-activity.service';
import { TechnicianSuggestionService } from './assignment/technician-suggestion.service';
import { TaskHierarchyService } from './records/task-hierarchy.service';
import { TaskDeclineService } from './assignment/task-decline.service';
import { TaskCrewMembersService } from './assignment/task-crew-members.service';
import { TaskUpdateService } from './records/task-update.service';
import { WorkflowResyncService } from './records/workflow-resync.service';
import { TaskDetailService } from './query/task-detail.service';
import { TaskDependenciesService } from './records/task-dependencies.service';
import { TaskTriageService } from './records/task-triage.service';
import { RoleOpeningService } from './assignment/role-opening.service';

/**
 * The collaborators behind the TasksService facade, as ONE flat list for the tests that build
 * TasksService in a testing module. The app wires them through the sub-modules (core, assignment,
 * records, status, query, checklist — see tasks.module.ts); `tools/di-check.mjs` proves that wiring.
 */
export const TASK_SERVICE_PARTS = [
  TaskSupportService,
  TaskRecordsService,
  TaskUpdateService,
  WorkflowResyncService,
  TaskPortalService,
  TaskTriageService,
  TaskQueryService,
  TaskDetailService,
  TaskStatusService,
  TaskAssignmentService,
  TaskDeclineService,
  TaskCrewMembersService,
  TaskChecklistService,
  TaskActivityService,
  TechnicianSuggestionService,
  TaskHierarchyService,
  TaskDependenciesService,
  RoleOpeningService,
];
