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

export type PersonRef = { id: string; firstName: string; lastName: string };

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
