import { ClientProxy } from '@nestjs/microservices';
import { CREW_REASON_MAX, PrismaService, type OccurrenceEvidence, type WorkTimelineEvent } from '@hbcfield/shared';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';

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

/** When the job's current stretch of counted time began — what "I'm with him" counts from. */
const runStartOf = (timeline: WorkTimelineEvent[], kind: (s: string) => unknown): number | null => {
  let counting = false;
  let start: number | null = null;
  let status: string | undefined;
  let paused = false;
  for (const e of [...timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) {
    if (e.kind === 'STATUS') {
      status = e.status;
      paused = false;
    } else if (e.kind === 'PAUSED') paused = true;
    else if (e.kind === 'RESUMED') paused = false;
    else continue;
    const now = !paused && !!kind(status ?? '');
    if (now && !counting) start = new Date(e.at).getTime();
    counting = now;
  }
  return counting ? start : null;
};

/** Every open screen on this job redraws: the board, the job page, the phones. Never waits, never throws. */
const announceCrewChanged = (
  prisma: PrismaService,
  notifications: ClientProxy,
  task: Pick<CrewTask, 'id' | 'organizationId'>,
  actorId: string,
) => {
  void prisma.task
    .findUnique({ where: { id: task.id } })
    .then((t) => {
      if (t) emitEvent(notifications, taskUpdatedEvent, { task: t, actorId });
    })
    .catch(() => undefined);
};

export { CrewTask, TASK_SELECT, PERSON, evidenceMeta, cleanReason, runStartOf, announceCrewChanged };
