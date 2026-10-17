import type { PresenceFreshness, WorkPresence } from "@hbcfield/shared/client"
import type { OrgMember, Task } from "@/lib/api"

export interface AttendanceFacts {
  locationId: string
  isRemote: boolean
  withinGeofence: boolean
  /** Open session the reminder engine escalated and stopped chasing. */
  needsReview: boolean
  /**
   * Where they are working now, decided by the server from evidence. Null on
   * entries from before it existed — those keep the reading below.
   */
  workPresence?: WorkPresence | null
  /** How fresh that is: a phone gone quiet, or a clock-in that never reports. */
  freshness?: PresenceFreshness
  lastSeenAt?: string | null
}

export interface BuildWorkspaceBoxesInput {
  /** Spaces the viewer may see, already scoped. */
  locations: Array<{ id: string; name: string; isActive: boolean }>
  tasks: Task[]
  /** Org directory; empty for viewers who may not read it. */
  members: OrgMember[]
  /** id → member, merged from the directory and the space rosters. */
  memberMap: Map<string, OrgMember>
  /** locationId → assigned user ids. */
  assignmentsPerLocation: Map<string, Set<string>>
  clockedInUserIds: Set<string>
  onBreakUserIds: Set<string>
  attendanceByUser: Map<string, AttendanceFacts>
  activeTaskMap: Map<string, Task>
  rosterActiveTaskMap: Map<string, { title: string; status: string }>
  /** The one space a clocked-in member counts as active in. */
  activeSpaceByUser: Map<string, string>
  spaceNameById: Map<string, string>
  /** Is this space shift-based, and is the member confirmed inside its geofence? */
  shiftLabelInfo: (userId: string) => { isShiftBased: boolean; atSpace: boolean }
  isAdminOrDispatcher: boolean
  /** The signed-in member, for the per-space capability checks below. */
  currentUser?: {
    canManageWorkspaces?: boolean
    canManageUsers?: boolean
    /** The ORG-wide resolution — see viewerIsOrgWide. */
    canViewAllTasks?: boolean
    access?: unknown
  } | null
  /** Viewer — always treated as online, since they are looking at the page. */
  currentUserId?: string
  handlers: {
    onEdit?: (locationId: string) => void
    onAssign?: (locationId: string) => void
    onViewTasks: (locationId: string) => void
    onPersonClick: (userId: string) => void
  }
}
