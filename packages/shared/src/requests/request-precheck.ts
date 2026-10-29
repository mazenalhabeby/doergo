/**
 * WHAT A LEADER WOULD CHECK, shown to the member BEFORE they send — so a
 * request arrives already answered on the obvious questions. Advice only:
 * nothing here refuses a request (the server's own rules still do that when
 * it is sent).
 */
export interface RequestPrecheck {
  /** Working days it costs (leave), the server's count. */
  workingDays: number | null;
  /**
   * VACATION only: remaining before → after. A request across the leave-year boundary draws on
   * each year for its own days (`years`, in order); the top-level pair is the year left LOWEST.
   */
  balance: {
    before: number;
    after: number;
    years?: Array<{ start: string; end: string; days: number; before: number; after: number }>;
  } | null;
  /** Their own requests it would collide with (sending would be refused). */
  clashes: Array<{ kind: string; startDate: string; endDate: string; status: string }>;
  /**
   * Leave only: how many would still be in, as a LEVEL — never who is off
   * (other people's leave is not the member's to read).
   */
  cover: 'ok' | 'tight' | 'short' | 'skill' | null;
  /** Overtime: the day's planned time plus what is asked, against the daily guide. */
  dailyLimit: { plannedMinutes: number; requestedMinutes: number; limitMinutes: number; over: boolean } | null;
  /** An office rule will need a second approval — said up-front, with the role. */
  secondApproval: string | null;
}

/** The working-day guide a day's planned time + overtime is compared with (a warning, never a refusal). */
export const DAILY_WORK_GUIDE_MINUTES = 600;
