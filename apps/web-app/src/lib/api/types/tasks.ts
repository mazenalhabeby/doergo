import type { Epic } from './epics';
import type { Phase } from './phases';
import type { Sprint } from './sprints';
import type { Attachment } from './task-attachments';
import type { WorkflowStatus } from './workflows';
import type { StepFormAnswers } from '@hbcfield/shared/client';

export interface TaskAssignee {
  id: string;
  userId: string;
  role: 'LEAD' | 'MEMBER';
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
  createdAt: string;
}


export interface ChecklistPerson { id: string; firstName: string; lastName: string }


export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
  /** Whose part of the work it is (shared tasks/checklist.ts) — somebody on the crew, or nobody. */
  assigneeId?: string | null;
  assignee?: ChecklistPerson | null;
  /** Who ticked it, and when — written by the tick itself. */
  completedById?: string | null;
  completedBy?: ChecklistPerson | null;
  completedAt?: string | null;
}


export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH' | 'START_TO_FINISH';
  lagDays: number;
  createdAt: string;
  predecessor?: { id: string; title: string; status: string };
  successor?: { id: string; title: string; status: string };
}


/** Minutes of a job's time (packages/shared/src/tasks/job-time.ts). */
export interface JobTimeSplit { travel: number; working: number; blocked: number }

type PersonRef = { id: string; firstName: string; lastName: string };


/** GET /tasks/:id/time — read, never stored; only time inside shifts counts. */
export interface JobTimeView {
  asOf: string;
  total: JobTimeSplit;
  byWorker: Array<JobTimeSplit & { user: PersonRef }>;
  live: { kind: keyof JobTimeSplit; workers: number } | null;
  startedBy: { user: PersonRef | null; forUser: PersonRef | null; office: boolean; reason: string | null; at: string } | null;
  /** Who is on the crew now, and who leads (packages/shared/src/tasks/crew.ts). */
  crew?: CrewView | null;
}


/** A crew on one job — rides on GET /tasks/:id/time. */
export interface CrewView {
  /** The organization's crew rules: only the leader moves the job's step. */
  crewMode: boolean;
  leader: { userId: string | null; acting: boolean; source: "TODAY" | "LEAD" | "ACTING" | "NONE" };
  today: { userId: string; until: string } | null;
  members: Array<{
    user: PersonRef & { avatarUrl?: string | null };
    role: "LEAD" | "MEMBER";
    joined: boolean;
    since: string | null;
    /** When they last left the job — null if they never joined it. */
    lastLeftAt?: string | null;
    selfBlockedSince: string | null;
    selfBlockReason: string | null;
    onClock: boolean;
  }>;
}


/** GET /tasks/job-time/report */
export interface JobTimeReport {
  totals: JobTimeSplit & { clock: number };
  rows: Array<JobTimeSplit & {
    taskId: string;
    title: string;
    startedBy: { userId: string; office: boolean; user: PersonRef | null } | null;
    officeReason: string | null;
    pausedAt: string | null;
    blockedReason: string | null;
  }>;
}


/** The office starting somebody's job for them: why, and when it really started. */
export interface OnBehalf { reason: string; at?: string }


/** "What I did, and what is left" — written by a worker who stopped. */
export interface TaskHandover {
  id: string;
  note: string;
  attachmentIds: string[];
  workedMinutes: number | null;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
}


export interface Task {
  id: string;
  title: string;
  /** Open to a WORK role (shared tasks/role-pool.ts): whoever holds it in the workspace may take a place. */
  openRoleId?: string | null;
  openRole?: { id: string; name: string } | null;
  openSpots?: number | null;
  openSpotsLeft?: number | null;
  openedAt?: string | null;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  organizationId: string;
  createdById: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  // Route tracking fields
  routeStartedAt: string | null;
  routeEndedAt: string | null;
  routeDistance: number | null;
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null;
  completedAt?: string | null;
  /*
    Paused at a clock-out (packages/shared/src/tasks/handover.ts): in a working
    step with nobody on it. "Resume work" clears it; so does any move.
  */
  pausedAt?: string | null;
  pausedById?: string | null;
  /** Who still owes the note of what they did. */
  handoverDueById?: string | null;
  /** Detail only: names, and the time the one who owes the note put in. */
  pausedBy?: { id: string; firstName: string; lastName: string } | null;
  handoverDue?: { user: { id: string; firstName: string; lastName: string } | null; workedMinutes: number | null } | null;
  /** Detail only: newest first. */
  handovers?: TaskHandover[];
  // Hierarchy fields
  parentId?: string | null;
  depth?: number;
  position?: number;
  phaseId?: string | null;
  sprintId?: string | null;
  workflowId?: string | null;
  /**
   * The task's EFFECTIVE workflow (its own, else its space's), as the detail
   * read resolves it — statuses included, each with its step form. Present on
   * GET /tasks/:id only; the list does not carry it.
   */
  workflow?: { id: string; name: string; statuses?: WorkflowStatus[] } | null;
  // Agile fields
  storyPoints?: number | null;
  epicId?: string | null;
  epic?: Epic | null;
  // Relations
  subtasks?: Task[];
  parent?: { id: string; title: string } | null;
  phase?: Phase | null;
  sprint?: Sprint | null;
  predecessors?: TaskDependency[];
  successors?: TaskDependency[];
  _count?: { subtasks?: number };
  // Space
  spaceId?: string | null;
  space?: { id: string; name: string; workflowId?: string | null } | null;
  // Multi-assignee & checklist
  assignees?: TaskAssignee[];
  checklistItems?: ChecklistItem[];
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    avatarUrl?: string | null;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    avatarUrl?: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
  };
  assetId?: string | null;
  asset?: {
    id: string;
    name: string;
    serialNumber: string | null;
    model: string | null;
    manufacturer: string | null;
    status: string;
    category?: {
      id: string;
      name: string;
      icon: string | null;
      color: string | null;
    } | null;
    type?: {
      id: string;
      name: string;
    } | null;
  } | null;
  comments?: Comment[];
  attachments?: Attachment[];
}


export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}


export interface TaskEvent {
  id: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}


export interface TasksListResponse {
  success: boolean;
  data: Task[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


export interface TaskResponse {
  success: boolean;
  data: Task;
}


export interface RoleOption { id: string; name: string; holders: number }

export type CandidateState = "FREE" | "BUSY" | "NOT_WORKING" | "ON_LEAVE";

export interface RolePreview {
  role: { id: string; name: string };
  total: number; free: number; busy: number; notWorking: number; onLeave: number;
  candidates: { userId: string; name: string; state: CandidateState; distanceKm: number | null; jobsToday: number; takenThisWeek: number }[];
}

export interface OpenRoleTask {
  id: string; title: string; status: string; priority: string; dueDate: string | null; openedAt: string | null;
  openSpots: number | null; openSpotsLeft: number | null; roleId: string | null; roleName: string | null;
  spaceId: string | null; spaceName: string | null; locationAddress: string | null; distanceKm: number | null;
}

export interface RoleStats {
  roles: { roleId: string; roleName: string; opened: number; taken: number; avgMinutesToTake: number | null; openNow: number; overdue: number; topTakers: { name: string; count: number }[] }[];
}


export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  assigneeIds?: string[];
  /** Open the task to a work role instead of naming people (never both). */
  openRoleId?: string;
  openSpots?: number;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string;
  phaseId?: string;
  sprintId?: string;
  workflowId?: string;
  parentId?: string;
  storyPoints?: number;
  epicId?: string;
  spaceId?: string;
  customerId?: string;
  unitId?: string;
  checklistItems?: { text: string }[];
  customFieldValues?: { definitionId: string; value: string }[];
}


export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string | null;
  phaseId?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  epicId?: string | null;
  spaceId?: string | null;
  workflowId?: string | null;
  position?: number;
}


export interface TasksQueryParams {
  status?: string;
  /** A tab group — several statuses at once. Sent comma-separated. */
  statuses?: string[];
  priority?: string;
  /** Free-text over title and description, matched server-side. */
  search?: string;
  /** Sprint id, or 'none' for the backlog (tasks in no sprint). */
  sprintId?: string;
  /** Epic id, or 'none' for tasks in no epic. */
  epicId?: string;
  page?: number;
  limit?: number;
  /** Scope tasks to a single space. Used by the guest shared-space view. */
  spaceId?: string;
  /** Scope tasks to a single CRM customer (their record's task feed). */
  customerId?: string;
  /** Scope tasks to a single apartment/unit (the apartment's history). */
  unitId?: string;
  /**
   * Only the caller's own work — as lead or co-assignee.
   *
   * Asked of the SERVER, not of a fetched page: somebody who oversees the work
   * sees the whole organization, so their own task is one row among hundreds and
   * may not be in the page at all. Narrowing only — the server ANDs it with what
   * the caller may already see, so it can never widen anybody's visibility.
   */
  assignedToMe?: boolean;
}


// Status counts response type
export interface StatusCountsResponse {
  success: boolean;
  data: Record<string, number>;
}


/** One step form answered on a job — its report for that move. */
export interface TaskStepSubmission {
  id: string;
  statusKey: string;
  formVersion: number;
  /** The form as it was answered (a snapshot) — never today's definition. */
  form: unknown;
  answers: StepFormAnswers;
  /** Photos and signatures named by the answers, with short-lived signed links. */
  files: Record<string, { id: string; fileName: string; url?: string; fileUrl?: string; mimeType?: string | null; fileType?: string }>;
  submittedAt: string;
  submittedBy: { id: string; firstName: string | null; lastName: string | null; avatarUrl?: string | null };
}
