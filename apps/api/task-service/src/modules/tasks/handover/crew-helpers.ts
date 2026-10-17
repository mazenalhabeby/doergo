import { CREW_REASON_MAX, type OccurrenceEvidence, type ResolvedAccess } from '@hbcfield/shared';

/** Who is asking, as the gateway resolved it. */
export interface CrewActor {
  userId: string;
  userRole: string;
  organizationId: string;
  /** Org-wide "view all tasks" — the office's authority over a job's step. */
  canViewAllTasks?: boolean;
  /** Org-wide "assign tasks" — the office's authority over who leads. */
  canAssignTasks?: boolean;
  access?: ResolvedAccess | null;
  /** Spaces where the caller holds canViewAllTasks by a SPACE role — the task gate reads them. */
  viewAllSpaceIds?: string[];
  /** Cross-org shared spaces (reads only; the gateway sends [] on writes). */
  sharedSpaceIds?: string[];
}

type CrewTask = {
  id: string;
  title: string;
  status: string;
  organizationId: string;
  spaceId: string | null;
  workflowId: string | null;
  assignedToId: string | null;
  pausedAt: Date | null;
  leadOverrideId: string | null;
  leadOverrideUntil: Date | null;
};

const TASK_SELECT = {
  id: true, title: true, status: true, organizationId: true, spaceId: true, workflowId: true,
  assignedToId: true, pausedAt: true, leadOverrideId: true, leadOverrideUntil: true,
} as const;

const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

/** What the phone said about a crew tap, kept on the event like a status move keeps it. */
const evidenceMeta = (evidence: OccurrenceEvidence | undefined, flags: readonly string[]) => ({
  ...(flags.length ? { occurrenceFlags: [...flags] } : {}),
  ...(evidence?.fix ? { fix: { lat: evidence.fix.lat, lng: evidence.fix.lng, accuracy: evidence.fix.accuracy } } : {}),
});

const cleanReason = (r?: string | null) => (typeof r === 'string' ? r.replace(/\s+/g, ' ').trim().slice(0, CREW_REASON_MAX) : '');

export { CrewTask, TASK_SELECT, PERSON, evidenceMeta, cleanReason };
