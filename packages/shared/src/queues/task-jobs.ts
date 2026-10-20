/**
 * The task queue's jobs as contracts: the same names as TASK_JOB_TYPES on the wire,
 * each carrying what its handler reads (see job-contract.ts).
 */
import type { ResolvedAccess } from '../types/permissions/resolved-access';
import type { OccurrenceEvidence } from '../sync/occurrence';
import type { LeadScope } from '../tasks/crew';
import type { TaskAccessFacts } from '../microservices/contracts/task-service-types';
import { job } from './job-contract';
import { TASK_JOB_TYPES } from './constants';
import type {
  ChecklistJobCaller,
  CrewActor,
  SubtaskCreateJob,
  TaskCreateJob,
  TaskStatusJob,
  TaskUpdateJob,
} from './task-jobs-types';

/** A caller who acts on one task: the facts the task gate reads. */
interface TaskActorFacts {
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}

/** The assign right, org-wide or per workspace. */
interface AssignGrants {
  /** The ORG-wide resolution of canAssignTasks. */
  canAssignTasks?: boolean;
  /** Spaces where the caller holds canAssignTasks through a SPACE role. */
  assignSpaceIds?: string[];
}

/** The create right a dependency is judged on (assertMayCreateUnder). */
interface CreateGrants {
  userId: string;
  organizationId: string;
  userRole?: string;
  canCreateTasks?: boolean;
  createSpaceIds?: string[];
}

export const TASK_JOBS = {
  create: job<TaskCreateJob>(TASK_JOB_TYPES.CREATE),
  update: job<TaskUpdateJob>(TASK_JOB_TYPES.UPDATE),
  assign: job<
    TaskActorFacts &
      AssignGrants & {
        id: string;
        workerId: string;
        /** The caller's resolved access, forwarded by the gateway (cross-org shared spaces). */
        access?: ResolvedAccess | null;
      }
  >(TASK_JOB_TYPES.ASSIGN),
  decline: job<
    TaskActorFacts & {
      id: string;
      /** Why the worker declines — optional, sent by the gateway. */
      reason?: string | null;
    }
  >(TASK_JOB_TYPES.DECLINE),
  updateStatus: job<TaskStatusJob>(TASK_JOB_TYPES.UPDATE_STATUS),
  remove: job<TaskActorFacts & { id: string }>(TASK_JOB_TYPES.DELETE),
  addComment: job<
    TaskActorFacts & {
      /** Id made on the phone — see createOnce. */
      id?: string;
      taskId: string;
      content: string;
    }
  >(TASK_JOB_TYPES.ADD_COMMENT),
  resumeWork: job<TaskAccessFacts & { id: string; evidence?: OccurrenceEvidence }>(TASK_JOB_TYPES.RESUME_WORK),
  addHandover: job<{
    id?: string;
    taskId: string;
    note: string;
    attachmentIds?: string[];
    userId: string;
    organizationId: string;
  }>(TASK_JOB_TYPES.ADD_HANDOVER),
  crewJoin: job<
    CrewActor & {
      taskId: string;
      evidence?: OccurrenceEvidence;
      viaLeaderStart?: boolean;
      forUserId?: string;
      reason?: string;
    }
  >(TASK_JOB_TYPES.CREW_JOIN),
  crewLeave: job<CrewActor & { taskId: string; evidence?: OccurrenceEvidence; forUserId?: string; reason?: string }>(
    TASK_JOB_TYPES.CREW_LEAVE,
  ),
  crewSelfIssue: job<CrewActor & { taskId: string; reason?: string; evidence?: OccurrenceEvidence }>(
    TASK_JOB_TYPES.CREW_SELF_ISSUE,
  ),
  crewSelfResume: job<CrewActor & { taskId: string; evidence?: OccurrenceEvidence }>(TASK_JOB_TYPES.CREW_SELF_RESUME),
  crewChangeLead: job<CrewActor & { taskId: string; toUserId: string; scope: LeadScope; reason?: string }>(
    TASK_JOB_TYPES.CREW_CHANGE_LEAD,
  ),
  addAssignee: job<
    Omit<TaskActorFacts, 'userId'> &
      AssignGrants & {
        taskId: string;
        userId: string;
        role?: string;
        requestUserId: string;
      }
  >(TASK_JOB_TYPES.ADD_ASSIGNEE),
  removeAssignee: job<
    Omit<TaskActorFacts, 'userId'> & AssignGrants & { taskId: string; userId: string; requestUserId: string }
  >(TASK_JOB_TYPES.REMOVE_ASSIGNEE),
  addChecklistItem: job<
    ChecklistJobCaller & {
      taskId: string;
      text: string;
      position?: number;
      /** Whose part it is — somebody on the crew, judged like any owner change. */
      assigneeId?: string | null;
    }
  >(TASK_JOB_TYPES.ADD_CHECKLIST_ITEM),
  updateChecklistItem: job<
    ChecklistJobCaller & {
      taskId: string;
      itemId: string;
      text?: string;
      isCompleted?: boolean;
      /** A new owner (somebody on the crew), or null for nobody. Absent = unchanged. */
      assigneeId?: string | null;
    }
  >(TASK_JOB_TYPES.UPDATE_CHECKLIST_ITEM),
  deleteChecklistItem: job<ChecklistJobCaller & { taskId: string; itemId: string }>(
    TASK_JOB_TYPES.DELETE_CHECKLIST_ITEM,
  ),
  reorderChecklist: job<TaskActorFacts & { taskId: string; itemIds: string[] }>(TASK_JOB_TYPES.REORDER_CHECKLIST),
  createSubtask: job<SubtaskCreateJob>(TASK_JOB_TYPES.CREATE_SUBTASK),
  addDependency: job<CreateGrants & { predecessorId: string; successorId: string; type?: string; lagDays?: number }>(
    TASK_JOB_TYPES.ADD_DEPENDENCY,
  ),
  removeDependency: job<CreateGrants & { dependencyId: string }>(TASK_JOB_TYPES.REMOVE_DEPENDENCY),
  addAttachment: job<{
    /** Id made on the phone — see createOnce. */
    attachmentId?: string;
    taskId: string;
    uploadedById: string;
    userRole?: string;
    fileName: string;
    /** The key the presign step returned. Sent by apps newer than 1.0.5. */
    fileKey?: string;
    /** LEGACY: the URL app 1.0.5 sends instead of the key. */
    fileUrl?: string;
    /** A MIME type, as the client reports it — NOT an AttachmentType. */
    fileType: string;
    fileSize: number;
    organizationId: string;
  }>(TASK_JOB_TYPES.ADD_ATTACHMENT),
  deleteAttachment: job<{ id: string; userId: string; userRole: string; organizationId: string }>(
    TASK_JOB_TYPES.DELETE_ATTACHMENT,
  ),
  getPresignedUrl: job<{
    taskId: string;
    fileName: string;
    fileType: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }>(TASK_JOB_TYPES.GET_PRESIGNED_URL),
} as const;

export type TaskJobs = typeof TASK_JOBS;
