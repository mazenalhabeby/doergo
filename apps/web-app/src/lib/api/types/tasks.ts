import type { Epic } from "./epics"
import type { Phase } from "./phases"
import type { Sprint } from "./sprints"
import type { Attachment } from "./task-attachments"
import type { WorkflowStatus } from "./workflows"
import {
  type TaskAssignee,
  type ChecklistItem,
  type TaskDependency,
  type TaskHandover,
  type Comment,
} from "./task-assignee"
export {
  type TaskAssignee,
  type ChecklistItem,
  type TaskDependency,
  type TaskHandover,
  type Comment,
  type JobTimeView,
  type CrewView,
  type JobTimeReport,
  type OnBehalf,
  type TaskEvent,
  type RoleOption,
  type CandidateState,
  type RolePreview,
  type OpenRoleTask,
  type RoleStats,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TasksQueryParams,
  type StatusCountsResponse,
  type TaskStepSubmission,
} from "./task-assignee"

export interface Task {
  id: string
  title: string
  /** Open to a WORK role (shared tasks/role-pool.ts): whoever holds it in the workspace may take a place. */
  openRoleId?: string | null
  openRole?: { id: string; name: string } | null
  openSpots?: number | null
  openSpotsLeft?: number | null
  openedAt?: string | null
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  startDate: string | null
  estimatedHours: number | null
  locationLat: number | null
  locationLng: number | null
  locationAddress: string | null
  organizationId: string
  createdById: string
  assignedToId: string | null
  createdAt: string
  updatedAt: string
  // Route tracking fields
  routeStartedAt: string | null
  routeEndedAt: string | null
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null
  completedAt?: string | null
  /*
    Paused at a clock-out (packages/shared/src/tasks/handover.ts): in a working
    step with nobody on it. "Resume work" clears it; so does any move.
  */
  pausedAt?: string | null
  pausedById?: string | null
  /** Who still owes the note of what they did. */
  handoverDueById?: string | null
  /** Detail only: names, and the time the one who owes the note put in. */
  pausedBy?: { id: string; firstName: string; lastName: string } | null
  handoverDue?: {
    user: { id: string; firstName: string; lastName: string } | null
    workedMinutes: number | null
  } | null
  /** Detail only: newest first. */
  handovers?: TaskHandover[]
  // Hierarchy fields
  parentId?: string | null
  depth?: number
  position?: number
  phaseId?: string | null
  sprintId?: string | null
  workflowId?: string | null
  /**
   * The task's EFFECTIVE workflow (its own, else its space's), as the detail
   * read resolves it — statuses included, each with its step form. Present on
   * GET /tasks/:id only; the list does not carry it.
   */
  workflow?: { id: string; name: string; statuses?: WorkflowStatus[] } | null
  // Agile fields
  storyPoints?: number | null
  epicId?: string | null
  epic?: Epic | null
  // Relations
  subtasks?: Task[]
  parent?: { id: string; title: string } | null
  phase?: Phase | null
  sprint?: Sprint | null
  predecessors?: TaskDependency[]
  successors?: TaskDependency[]
  _count?: { subtasks?: number }
  // Space
  spaceId?: string | null
  space?: { id: string; name: string; workflowId?: string | null } | null
  // Multi-assignee & checklist
  assignees?: TaskAssignee[]
  checklistItems?: ChecklistItem[]
  createdBy?: {
    id: string
    firstName: string
    lastName: string
    email?: string
    avatarUrl?: string | null
  }
  assignedTo?: {
    id: string
    firstName: string
    lastName: string
    email?: string
    avatarUrl?: string | null
  } | null
  organization?: {
    id: string
    name: string
  }
  assetId?: string | null
  asset?: {
    id: string
    name: string
    serialNumber: string | null
    model: string | null
    manufacturer: string | null
    status: string
    category?: {
      id: string
      name: string
      icon: string | null
      color: string | null
    } | null
    type?: {
      id: string
      name: string
    } | null
  } | null
  comments?: Comment[]
  attachments?: Attachment[]
}

export interface TasksListResponse {
  success: boolean
  data: Task[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface TaskResponse {
  success: boolean
  data: Task
}
