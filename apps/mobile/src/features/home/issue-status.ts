import type { ShiftIssue, ShiftIssueEvent, ShiftIssueStatus, ShiftIssueSeverity } from '@/lib/api/shift-issues';

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
interface IssueLook {
  /** Which colour token the dot takes. */
  tone: 'warn' | 'accent' | 'muted';
  /** Solid = still wants something from somebody. */
  solid: boolean;
  /** The i18n key for the line under the title, in a LIST. */
  readsAs: string;
  /**
   * The i18n key for the same status as a HEADER label.
   *
   * ⚠️ TWO PHRASINGS FOR ONE STATUS, ON PURPOSE. A list row has room for
   * `Anna is on it · 2h ago` and needs it, because the reader is scanning
   * several. A thread header is already about one issue and one person, so the
   * long form repeats what the messages below it say — `Being fixed` is the
   * status, and the name is in the conversation.
   */
  label: string;
  /** Still the reporter's to worry about. */
  open: boolean;
}

const LOOK: Record<ShiftIssueStatus, IssueLook> = {
  OPEN: { tone: 'warn', solid: true, readsAs: 'issues.reads.open', label: 'issues.label.open', open: true },
  ACKNOWLEDGED: { tone: 'accent', solid: false, readsAs: 'issues.reads.acknowledged', label: 'issues.label.acknowledged', open: true },
  IN_PROGRESS: { tone: 'accent', solid: true, readsAs: 'issues.reads.inProgress', label: 'issues.label.inProgress', open: true },
  RESOLVED: { tone: 'muted', solid: false, readsAs: 'issues.reads.resolved', label: 'issues.label.resolved', open: false },
  CLOSED: { tone: 'muted', solid: false, readsAs: 'issues.reads.closed', label: 'issues.label.closed', open: false },
  CANCELED: { tone: 'muted', solid: false, readsAs: 'issues.reads.closed', label: 'issues.label.closed', open: false },
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
 * The scale runs NEUTRAL · NEUTRAL · WARN · CRITICAL.
 *
 * ⚠️ AND `MEDIUM` WAS BLUE — A HUE THAT APPEARS NOWHERE ELSE IN THIS SYSTEM.
 * Four colours for four levels gives the scale no shape: every row shouts
 * something. Low and Medium stay quiet, High is `warn` because it is owed
 * attention, and only Urgent takes `critical`, which is the one word in the
 * palette that means *this is going wrong now*.
 */
export function severityTone(s: ShiftIssueSeverity): 'warn' | 'critical' | null {
  if (s === 'URGENT') return 'critical';
  if (s === 'HIGH') return 'warn';
  return null;
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
 * WHICH ACTIONS THIS VIEWER IS OFFERED — ⚠️ AND IT MIRRORS THE SERVER,
 * NOT A GUESS AT IT.
 *
 * ⚠️ THE REPORTER NEVER GETS ACKNOWLEDGE (rule 11). One sheet serves both
 * roles, so it has to know which one is looking. Both buttons used to appear
 * as equal outlines whoever was looking, which asks the person who reported a
 * seized valve to acknowledge their own report.
 *
 * ⚠️ AND A PLAIN REPORTER CANNOT RESOLVE — THEY WITHDRAW. The sheet offered
 * every reporter `Fixed? Mark it resolved`, and the server refuses it:
 * `shift-issues.service.ts` allows a status change only to somebody who can
 * manage, or the assignee, **or** the reporter *when the status is CANCELED*.
 * So a member tapping that link got a 403 the sheet swallowed — a button that
 * does nothing, on the one screen whose whole job is showing that reporting
 * something works. Withdrawing is the act the server actually offers them, and
 * it is the honest one: "this was not an issue after all" is the reporter's
 * to say; "it is fixed" is not.
 *
 * | The reporter, plainly  | reply, add a photo, and `Withdraw it`           |
 * | The responsible person | `Acknowledge` while OPEN, then `Resolve`        |
 * | Anybody, once settled  | reply, and `Reopen` if they may change status   |
 */
export interface IssueActions {
  /** Take responsibility. Only the responsible person, only while OPEN. */
  acknowledge: boolean;
  /** "It is fixed." Needs the authority the server checks for. */
  resolve: boolean;
  /** "It was not an issue." The reporter's own ending — CANCELED. */
  withdraw: boolean;
  /** It came back. Offered on a settled issue to whoever may change status. */
  reopen: boolean;
  /** Writing on the thread — ⚠️ never withdrawn, see the sheet. */
  reply: boolean;
}

export function offeredTo(input: {
  issue: Pick<ShiftIssue, 'status' | 'reportedById' | 'assignedToId'>;
  viewerId: string | null | undefined;
  /** The viewer can act on other people's issues. */
  canManage: boolean;
}): IssueActions {
  const me = input.viewerId;
  const mine = !!me && input.issue.reportedById === me;
  const assigned = !!me && !!input.issue.assignedToId && input.issue.assignedToId === me;
  /* The server's own test, in the server's own order — see the note above. */
  const mayChangeStatus = input.canManage || assigned;
  const settled = !lookFor(input.issue.status).open;

  if (settled) {
    return { acknowledge: false, resolve: false, withdraw: false, reopen: mayChangeStatus, reply: true };
  }
  /*
    ⚠️ ONE STEP AT A TIME, AND ACKNOWLEDGE IS NOT A STEP ON YOUR OWN REPORT.
    Offering Acknowledge *and* Resolve together is what made them equal
    outline buttons in the first place. So: if taking it on is the next thing,
    that is what is offered — otherwise ending it is. On the viewer's own
    issue there is nothing to acknowledge, so it goes straight to Resolve
    rather than stalling on a button they can never press.
  */
  const acknowledge = mayChangeStatus && !mine && input.issue.status === 'OPEN';
  return {
    acknowledge,
    resolve: mayChangeStatus && !acknowledge,
    /* Only ever the reporter's, and only when they have no stronger ending. */
    withdraw: mine && !mayChangeStatus,
    reopen: false,
    reply: true,
  };
}

/**
 * THE TRAIL — WHAT HAS HAPPENED TO THIS ISSUE, NOT ONLY WHAT WAS SAID.
 *
 * ⚠️ EVERY SYSTEM EVENT WAS BEING THROWN AWAY. The thread rendered a bubble
 * per event and returned `null` for anything with no body, so `ACKNOWLEDGED`,
 * `ASSIGNED`, `REOPENED` and most `STATUS_CHANGED` drew **nothing at all** —
 * the member watched a conversation with silent gaps in it and could not see
 * the one thing they opened the sheet for: that somebody picked it up. The web
 * has shown these as a centred line since the feature shipped; this is that,
 * on the phone.
 *
 * ⚠️ `CREATED` CARRIES THE DESCRIPTION AS ITS BODY. It therefore rendered as a
 * chat bubble from the reporter that repeated, word for word, the description
 * printed directly above it. It is the opening line of the trail, not a
 * message — which is also what lets the header stop repeating it.
 *
 * ⚠️ THE REASON IS A LINE OF ITS OWN, NOT `— appended`. "Resolved — parts not
 * delivered, the supplier says Thursday" is a sentence somebody wrote; hanging
 * it off a dash after a system phrase on a 390pt screen wraps into mush.
 */
export type ThreadEntry =
  /** Somebody wrote something. A bubble. */
  | { kind: 'message'; event: ShiftIssueEvent }
  /** Something happened. A centred line, with the reason under it when there is one. */
  | { kind: 'note'; event: ShiftIssueEvent; key: string; who: string; reason: string | null };

/** `IN_PROGRESS` reads as work starting; the rest have their own event type. */
const STATUS_NOTE: Partial<Record<ShiftIssueStatus, string>> = {
  OPEN: 'issues.trail.reopened',
  ACKNOWLEDGED: 'issues.trail.acknowledged',
  IN_PROGRESS: 'issues.trail.started',
  RESOLVED: 'issues.trail.resolved',
  CLOSED: 'issues.trail.closed',
  CANCELED: 'issues.trail.withdrawn',
};

export function readThread(thread: readonly ShiftIssueEvent[]): ThreadEntry[] {
  return thread.map((event) => {
    if (event.type === 'MESSAGE') return { kind: 'message', event } as const;

    const who = event.actorName?.trim() || '';
    const meta = (event.metadata ?? {}) as { assignedToName?: string; toStatus?: ShiftIssueStatus };
    const reason = event.body?.trim() || null;

    /*
      ⚠️ AN UNKNOWN TYPE FROM A NEWER SERVER STILL DRAWS A LINE. A silent gap
      is exactly the bug this function exists to fix, so the fallback says
      that something changed rather than pretending nothing did.
    */
    const key =
      event.type === 'CREATED' ? 'issues.trail.created'
      : event.type === 'ACKNOWLEDGED' ? 'issues.trail.acknowledged'
      : event.type === 'ASSIGNED' ? 'issues.trail.assigned'
      : event.type === 'RESOLVED' ? 'issues.trail.resolved'
      : event.type === 'REOPENED' ? 'issues.trail.reopened'
      : event.type === 'CLOSED' ? 'issues.trail.closed'
      : event.type === 'STATUS_CHANGED' ? (meta.toStatus && STATUS_NOTE[meta.toStatus]) || 'issues.trail.changed'
      : 'issues.trail.changed';

    /* ⚠️ `ASSIGNED` is about the person it went TO, not the one who sent it. */
    const name = event.type === 'ASSIGNED' ? meta.assignedToName?.trim() || '' : who;
    return { kind: 'note', event, key, who: name, reason } as const;
  });
}
