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

/**
 * The collaborators behind the TasksService facade. One list, read by the
 * module and by every test that builds TasksService, so the two cannot drift.
 */
export const TASK_SERVICE_PARTS = [
  TaskSupportService,
  TaskRecordsService,
  TaskPortalService,
  TaskQueryService,
  TaskStatusService,
  TaskAssignmentService,
  TaskChecklistService,
  TaskActivityService,
  TechnicianSuggestionService,
  TaskHierarchyService,
];
