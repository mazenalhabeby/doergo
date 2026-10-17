import { TaskSupportService } from './task-support.service';
import { TaskRecordsService } from './task-records.service';
import { TaskPortalService } from './task-portal.service';
import { TaskQueryService } from './task-query.service';
import { TaskStatusService } from './task-status.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskChecklistService } from './task-checklist.service';
import { TaskActivityService } from './task-activity.service';
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
 * The collaborators behind the TasksService facade. One list, read by the
 * module and by every test that builds TasksService, so the two cannot drift.
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
];
