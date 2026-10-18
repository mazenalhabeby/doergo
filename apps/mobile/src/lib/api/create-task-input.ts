import { TaskStatus } from '@hbcfield/shared/client';
import type { TaskHandover } from '@hbcfield/shared/client';

// ============================================================================
// Task Types
// ============================================================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  assignedToId?: string;
  spaceId?: string;
  /**
   * The CRM client this job is for — a client VISIT rather than a bare task.
   *
   * Accepted by `CreateTaskDto` on the gateway since client visits shipped; the
   * phone had no client concept at all, so a job raised from a client record
   * arrived unattached to them.
   */
  customerId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
}

/** One job in the member's own handover picture (GET /tasks/handover/mine). */
export interface HandoverJob {
  id: string;
  /** My working minutes on it so far (open and paused jobs only). */
  workedMinutes?: number;
  /** Somebody else who joined is still on the clock: the crew carries on after this clock-out (shared tasks/crew.ts). */
  crewContinues?: boolean;
  /** Checklist items given to me on this job that are still open (shared tasks/checklist.ts). */
  myOpenItems?: number;
  title: string;
  status: string;
  pausedAt: string | null;
  pausedById: string | null;
  locationAddress: string | null;
  customer: { name: string } | null;
}

export interface MyHandovers {
  /** In a working step now — what the clock-out sheet lists. */
  open: HandoverJob[];
  /** A note I still owe. */
  owed: HandoverJob[];
  /** Paused on me — offered at the next clock-in. */
  paused: HandoverJob[];
}

export interface Task {
  /** Open to a WORK role (shared tasks/role-pool.ts): whoever holds it in the workspace may take a place. */
  openRoleId?: string | null;
  openRole?: { id: string; name: string } | null;
  openSpots?: number | null;
  openSpotsLeft?: number | null;
  openedAt?: string | null;
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  /**
   * Does this task's flow have a travel step? Server-computed from the
   * workflow, NOT from the presence of coordinates. Absent on older gateways —
   * see isMyRouteStop for why absent must read as yes.
   */
  tracksLocation?: boolean;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
  /*
    Paused at a clock-out (packages/shared/src/tasks/handover.ts): the job is in a
    working step with nobody on it. "Resume work" clears it; so does any move.
  */
  pausedAt?: string | null;
  pausedById?: string | null;
  /** Who still owes the note of what they did — asked on every app open until written. */
  handoverDueById?: string | null;
  /** Detail only: the names, and the time the one who owes it put in. */
  pausedBy?: { id: string; firstName: string; lastName: string } | null;
  handoverDue?: { user: { id: string; firstName: string; lastName: string } | null; workedMinutes: number | null } | null;
  /** Detail only: the newest notes first. */
  handovers?: TaskHandover[];
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null;
  completedAt?: string | null;
  /**
   * Stamped when the task goes En Route -> Arrived. The product's own record
   * that this drive has been made, which is how "Start navigation" knows not
   * to route somebody back to a stop they are standing at.
   */
  routeStartedAt?: string | null;
  routeEndedAt?: string | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  };
  /** The task's checklist, in order — present on `GET /tasks/:id`. */
  checklistItems?: ChecklistItem[];
  /** The workspace it lives in — present on `GET /tasks/:id`. */
  space?: { id: string; name: string; enabledModules?: string[] | null; workflowId?: string | null } | null;
}

/** A person named on a checklist item — names only. */
export interface ChecklistPerson { id: string; firstName: string; lastName: string }

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  position: number;
  /** Whose part of the work it is (shared tasks/checklist.ts) — somebody on the crew, or nobody. */
  assigneeId?: string | null;
  assignee?: ChecklistPerson | null;
  /** Who ticked it, and when — written by the tick itself. */
  completedById?: string | null;
  completedBy?: ChecklistPerson | null;
  completedAt?: string | null;
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
  metadata?: Record<string, any>;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ============================================================================
// Tracking Types
// ============================================================================

export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
}

export type LocationPoint = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
};

export interface LocationBatchUpdate {
  taskId?: string;
  points: LocationPoint[];
}

export interface LocationResponse {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

// ============================================================================
// Report Types
// ============================================================================

/** One row of `GET /tasks/:id/submissions` — the answers a job was moved into a step with. */
export interface StepSubmission {
  id: string;
  statusKey: string;
  formVersion?: number;
  /** The form as it was when answered — a later edit of the workflow does not rewrite an old report. */
  form: unknown;
  answers: Record<string, string | string[] | number | boolean>;
  /** The photos and signatures the answers name, by attachment id, with signed links. */
  files: Record<string, { id?: string; fileName?: string | null; url?: string | null; fileUrl?: string | null; mimeType?: string | null }>;
  submittedAt: string;
  submittedBy?: { id?: string; firstName?: string | null; lastName?: string | null } | null;
}

export interface ServiceReport {
  id: string;
  taskId: string;
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: string;
  completedById: string;
}
