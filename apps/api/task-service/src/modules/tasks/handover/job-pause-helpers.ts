import { TaskStatus } from '@hbcfield/shared';

/** A note written at the clock-out, for one job. */
export interface ClockOutHandover {
  /** Made on the phone, so a replayed clock-out writes it once. */
  id?: string;
  taskId: string;
  note: string;
  attachmentIds?: string[];
}

/** Steps a job is never "being worked" in, whatever its workflow says. */
const NEVER_WORKING = [TaskStatus.DRAFT, TaskStatus.NEW, TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED] as string[];

const AUTHOR = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

type Candidate = { id: string; title: string; status: string; workflowId: string | null; spaceId: string | null; organizationId: string; assignedToId: string | null; pausedAt: Date | null };

export { NEVER_WORKING, AUTHOR, Candidate };
