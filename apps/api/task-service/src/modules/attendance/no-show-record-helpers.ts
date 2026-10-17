import { type NoShowDayMark } from '@hbcfield/shared';

/** How far back a run of misses is looked for. */
const RUN_DAYS = 60;

const DAY = 86_400_000;

/** Worst first: what a day shows when two shifts that day ended differently. */
const MARK_RANK: Record<NoShowDayMark, number> = { open: 0, absent: 1, excused: 2, late: 3, worked: 4, planned: 5 };

type Instance = {
  id: string;
  organizationId: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  localDate: string;
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
  state: string;
  reminderCount: number;
  timeEntryId: string | null;
  excuseReason: string | null;
  closeReason: string | null;
  closedAutomatically: boolean;
  settledSpaceId: string | null;
};

export { RUN_DAYS, DAY, MARK_RANK, Instance };
