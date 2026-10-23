import { TaskEventType } from '@prisma/client';
import { type JobTimeKind, type WorkTimelineEvent } from '@hbcfield/shared';
import { EventRow, PERSONAL_KIND, MoveMeta } from './job-time-helpers';

/** A job's saved events as job time reads them (shared job-time.ts / crew.ts). */
export function jobTimeline(rows: readonly EventRow[]): WorkTimelineEvent[] {
  return rows.flatMap((e): WorkTimelineEvent[] => {
    if (e.eventType === TaskEventType.UNASSIGNED || e.eventType === TaskEventType.ASSIGNEE_REMOVED) {
      const m = (e.metadata ?? {}) as { previousWorkerId?: string; assigneeId?: string };
      const left = m.previousWorkerId ?? m.assigneeId;
      return left ? [{ at: e.createdAt, userId: left, kind: 'LEFT' }] : [];
    }
    // A crew member's own presence: `userId` is the person, `at` the moment it counts from.
    const personal = PERSONAL_KIND[e.eventType as string];
    if (personal) {
      const m = (e.metadata ?? {}) as { at?: string; reason?: string };
      return [
        {
          at: m.at ?? e.createdAt,
          userId: e.userId,
          kind: personal,
          ...(personal === 'SELF_BLOCKED' ? { reason: m.reason ?? null } : {}),
        },
      ];
    }
    const m = (e.metadata ?? {}) as MoveMeta;
    const kind =
      e.eventType === TaskEventType.STATUS_CHANGED
        ? 'STATUS'
        : e.eventType === TaskEventType.PAUSED
          ? 'PAUSED'
          : 'RESUMED';
    return [
      {
        at: m.occurredAt ?? m.at ?? e.createdAt,
        userId: e.userId,
        kind,
        status: m.newStatus,
        forUserId: m.forUserId ?? null,
      },
    ];
  });
}

/**
 * Who is credited on a job: whoever it is assigned to, and whoever made — or
 * had made for them — a move into time that counts. The office moving a card
 * to Completed is not a worker on it.
 */
export function jobWorkers(
  timeline: WorkTimelineEvent[],
  kindOf: (s: string) => JobTimeKind | null,
  assigned: string[],
): string[] {
  const ids = new Set(assigned);
  for (const e of timeline)
    if (e.kind === 'JOINED' || e.kind === 'RESUMED' || (e.kind === 'STATUS' && kindOf(e.status ?? '')))
      ids.add(e.forUserId ?? e.userId);
  return [...ids];
}

/** The first move into counted time, and whether the office made it for somebody. */
export function jobStartedBy(rows: readonly EventRow[], kindOf: (s: string) => JobTimeKind | null) {
  const first = rows.find(
    (e) => e.eventType === TaskEventType.STATUS_CHANGED && kindOf((e.metadata as MoveMeta | null)?.newStatus ?? ''),
  );
  if (!first) return null;
  const m = (first.metadata ?? {}) as MoveMeta;
  return {
    userId: first.userId,
    forUserId: m.byOffice ? (m.forUserId ?? null) : null,
    reason: m.byOffice ? (m.officeReason ?? null) : null,
    at: m.occurredAt ?? first.createdAt.toISOString(),
  };
}
