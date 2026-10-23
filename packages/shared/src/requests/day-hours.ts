/**
 * The office sets ONE day's hours for a member (docs/plans/time-counting-model.md, phase 2).
 * What the form reads first — the rota's plan, hours already set, clocked in, leave — with every
 * time as HH:MM in the WORKSPACE's zone, like the clock. Server: task-service technicians/day-hours-read.ts.
 */
export interface DayHoursView {
  timezone: string;
  plan: { start: string; end: string; name: string | null } | null;
  changed: {
    id: string;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
    setBy: string | null;
    setAt: string | null;
  } | null;
  clockedIn: { at: string; open: boolean } | null;
  leave: { from: string; to: string; status: string } | null;
}

