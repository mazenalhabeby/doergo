/** Answer shapes about jobs: people, job time, a crew, a hand-over, a task open to a role, uploads, the work log. */

/** A person as most answers name one. */
export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

// ── tasks: time, crew, hand-over, role pool ──────────────────────────────────

export interface JobTimeSplit {
  travel: number;
  working: number;
  blocked: number;
}

export interface CrewView {
  /** The organization's crew rules: only the leader moves the job's step. */
  crewMode: boolean;
  leader: { userId: string | null; acting: boolean; source: 'TODAY' | 'LEAD' | 'ACTING' | 'NONE' };
  /** A lead handed over for today, while it lasts. */
  today: { userId: string; until: string } | null;
  members: Array<{
    user: PersonRef;
    role: 'LEAD' | 'MEMBER';
    joined: boolean;
    since: string | null;
    /** When they last left the job — null if they never joined it. */
    lastLeftAt?: string | null;
    selfBlockedSince: string | null;
    selfBlockReason: string | null;
    onClock: boolean;
  }>;
}

export interface JobTimeView {
  asOf: string;
  total: JobTimeSplit;
  /** `live`: what that person's time is running as now — their own stop makes it blocked. */
  byWorker: Array<JobTimeSplit & { user: PersonRef; live?: keyof JobTimeSplit | null }>;
  /** Who is on the crew now, and who leads (shared tasks/crew.ts). */
  crew?: CrewView | null;
  /** Running now: a screen may tick it forward from `asOf`. */
  live: { kind: keyof JobTimeSplit; workers: number } | null;
  /** The first move into counted time — and, when the office made it for somebody, who and why. */
  startedBy: { user: PersonRef | null; forUser: PersonRef | null; office: boolean; reason: string | null; at: string } | null;
}

export interface TaskHandover {
  id: string;
  note: string;
  attachmentIds: string[];
  workedMinutes: number | null;
  createdAt: string;
  author: PersonRef;
}

export interface OpenRoleTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  openedAt: string | null;
  openSpots: number | null;
  openSpotsLeft: number | null;
  roleId: string | null;
  roleName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  locationAddress: string | null;
  distanceKm: number | null;
}

/** What `/tasks/:id/attachments/presign` (and the other presign routes) answer. */
export interface PresignedUpload {
  uploadUrl: string;
  fileKey: string;
  fileUrl?: string;
  expiresIn: number;
  maxFileSize: number;
}

// ── attendance: work log, shift issues, overtime ─────────────────────────────

export interface WorkLogAttachment {
  id: string;
  fileKey: string;
  fileUrl: string;
  url?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface WorkLogNote {
  id: string;
  timeEntryId: string;
  userId: string;
  body: string;
  at: string;
  taskId?: string | null;
  attachments: WorkLogAttachment[];
  createdAt: string;
  /** Who wrote it (member or manager). */
  author?: { id: string; name: string };
  /** A manager/admin wrote it, not the session's member. */
  byManager?: boolean;
}
