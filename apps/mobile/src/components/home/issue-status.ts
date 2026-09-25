import type { ShiftIssue, ShiftIssueStatus, ShiftIssueSeverity } from '../../lib/api/shift-issues';

/**
 * THE SIX STATUSES, AND WHY ALL SIX ARE ON SCREEN.
 *
 * ⚠️ `ACKNOWLEDGED` AND `IN_PROGRESS` ARE THE WHOLE REASON SOMEBODY REPORTS
 * ANYTHING. They are the difference between a reporting tool and a suggestion
 * box: a member who files a fault and sees nothing change learns, once, that
 * filing faults does nothing. The sheet showed two statuses — open and not —
 * and threw the other four away, so the moment a person actually picked it up
 * never reached the person waiting.
 *
 * ⚠️ SOLID MEANS IT STILL WANTS SOMETHING. HOLLOW MEANS IT DOES NOT. That is
 * the whole read of the list at arm's length, before any word is read, which
 * is why the dot carries it and not the colour alone.
 */
export interface IssueLook {
  /** Which colour token the dot takes. */
  tone: 'warn' | 'accent' | 'muted';
  /** Solid = still wants something from somebody. */
  solid: boolean;
  /** The i18n key for the line under the title. */
  readsAs: string;
  /** Still the reporter's to worry about. */
  open: boolean;
}

const LOOK: Record<ShiftIssueStatus, IssueLook> = {
  OPEN: { tone: 'warn', solid: true, readsAs: 'issues.reads.open', open: true },
  ACKNOWLEDGED: { tone: 'accent', solid: false, readsAs: 'issues.reads.acknowledged', open: true },
  IN_PROGRESS: { tone: 'accent', solid: true, readsAs: 'issues.reads.inProgress', open: true },
  RESOLVED: { tone: 'muted', solid: false, readsAs: 'issues.reads.resolved', open: false },
  CLOSED: { tone: 'muted', solid: false, readsAs: 'issues.reads.closed', open: false },
  CANCELED: { tone: 'muted', solid: false, readsAs: 'issues.reads.closed', open: false },
};

export function lookFor(status: ShiftIssueStatus): IssueLook {
  /* An unknown status from a newer server reads as open rather than vanishing:
     a fault nobody can see is worse than one labelled imprecisely. */
  return LOOK[status] ?? LOOK.OPEN;
}

/**
 * ⚠️ SEVERITY SHOWS AT `HIGH` AND ABOVE ONLY. Below that it is noise — a list
 * where every row carries a coloured word has no emphasis left for the row
 * that needs it, and `MEDIUM` is the default nobody chose.
 */
export function severityShown(s: ShiftIssueSeverity): boolean {
  return s === 'HIGH' || s === 'URGENT';
}

/**
 * ⚠️ BADGE UNREAD, NEVER A TOTAL — rule 10. `"5 updates"` is the wrong number:
 * a thread with five of the member's own messages has nothing waiting in it.
 * The question is whether anybody replied to *you* since you last looked.
 *
 * The server sends no read cursor, so "unread" is answered with what it does
 * send: events on the thread that are NOT the member's own. A message the
 * member wrote cannot be news to them, whatever the count says.
 */
export function unreadFor(issue: ShiftIssue, viewerId: string | null | undefined): number {
  const thread = issue.thread ?? [];
  if (!thread.length) return 0;
  return thread.filter((e) => !!e.body && e.actorId && e.actorId !== viewerId).length;
}

/**
 * Split the list the way the member thinks about it: is this still mine to
 * worry about, or is it done?
 */
export function groupIssues(issues: readonly ShiftIssue[]): { open: ShiftIssue[]; done: ShiftIssue[] } {
  const open: ShiftIssue[] = [];
  const done: ShiftIssue[] = [];
  for (const i of issues) (lookFor(i.status).open ? open : done).push(i);
  return { open, done };
}

/**
 * WHICH BUTTONS THIS VIEWER IS OFFERED — ⚠️ AND THE REPORTER NEVER GETS
 * ACKNOWLEDGE (rule 11).
 *
 * One sheet serves both roles, so it has to know which one is looking. Today
 * both *Acknowledge* and *Resolve* appear as equal outline buttons, which asks
 * the person who reported a seized valve to acknowledge their own report.
 *
 * | The reporter            | reply, add a photo, a quiet `Mark it resolved` |
 * | The responsible person  | `Acknowledge` while OPEN, then `Resolve`       |
 */
export function offeredTo(input: {
  issue: Pick<ShiftIssue, 'status' | 'reportedById'>;
  viewerId: string | null | undefined;
  /** The viewer can act on other people's issues. */
  canManage: boolean;
}): { acknowledge: boolean; resolve: boolean; reply: boolean } {
  const mine = !!input.viewerId && input.issue.reportedById === input.viewerId;
  const settled = !lookFor(input.issue.status).open;
  if (settled) return { acknowledge: false, resolve: false, reply: true };
  if (mine) return { acknowledge: false, resolve: true, reply: true };
  if (!input.canManage) return { acknowledge: false, resolve: false, reply: true };
  return {
    acknowledge: input.issue.status === 'OPEN',
    resolve: input.issue.status !== 'OPEN',
    reply: true,
  };
}
