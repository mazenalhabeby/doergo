import { CREW_REASON_MAX, type OccurrenceEvidence, type ResolvedAccess } from '@hbcfield/shared';

/** Who is asking, as the gateway resolved it — the crew jobs' caller (shared queues/task-jobs-types.ts). */
export type { CrewActor } from '@hbcfield/shared';

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
  id: true,
  title: true,
  status: true,
  organizationId: true,
  spaceId: true,
  workflowId: true,
  assignedToId: true,
  pausedAt: true,
  leadOverrideId: true,
  leadOverrideUntil: true,
} as const;

const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

/** What the phone said about a crew tap, kept on the event like a status move keeps it. */
const evidenceMeta = (evidence: OccurrenceEvidence | undefined, flags: readonly string[]) => ({
  ...(flags.length ? { occurrenceFlags: [...flags] } : {}),
  ...(evidence?.fix ? { fix: { lat: evidence.fix.lat, lng: evidence.fix.lng, accuracy: evidence.fix.accuracy } } : {}),
});

const cleanReason = (r?: string | null) =>
  typeof r === 'string' ? r.replace(/\s+/g, ' ').trim().slice(0, CREW_REASON_MAX) : '';

export { CrewTask, TASK_SELECT, PERSON, evidenceMeta, cleanReason };
