/**
 * Each existing pending list's row → one inbox item. Pure; the gateway feeds
 * it what the lists returned (as the caller), nothing more.
 *
 * The group (NOW / TODAY / LATER) is decided here, once, from facts the row
 * already carries — never stored, so it moves on its own as time passes.
 */
import { APPROVAL_KIND_SPECS, type ApprovalGroup, type ApprovalItem, type ApprovalKind } from './approval-kinds';

export interface ApprovalContext {
  now: Date;
  /** The caller's user id. */
  me: string;
  /** May the caller decide this kind here — the gateway answers it with the same rule its guard reads. */
  mayDecide: (kind: ApprovalKind, spaceId: string | null) => boolean;
  /** The organization's currency — an expense carries none of its own. */
  currency?: string | null;
}

type Row = Record<string, any>;

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const nameOf = (p: Row | null | undefined, fallback = ''): string =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || p.email || fallback : fallback;
const person = (p: Row | null | undefined, fallbackName = '') => ({
  id: (p?.id as string) ?? null,
  name: nameOf(p, fallbackName),
  avatarUrl: (p?.avatarUrl as string | null | undefined) ?? null,
});
const spaceOf = (s: Row | null | undefined) => (s?.id ? { id: String(s.id), name: String(s.name ?? '') } : null);
const HOUR = 3_600_000;
const within = (at: string | null, now: Date, ms: number) => !!at && new Date(at).getTime() - now.getTime() <= ms;

/**
 * A no-show is urgent only while it can still change something: the shift is
 * running (somebody should be there NOW), or it ended within the day. Last
 * week's is a record to tidy, not an emergency.
 */
function noShowGroup(end: string | null, now: Date): ApprovalGroup {
  if (!end) return 'LATER';
  const left = new Date(end).getTime() - now.getTime();
  if (left > 0) return 'NOW';
  return -left < 18 * HOUR ? 'TODAY' : 'LATER';
}

function item(
  kind: ApprovalKind,
  ctx: ApprovalContext,
  base: Omit<ApprovalItem, 'kind' | 'canDecide' | 'group'> & { group: ApprovalGroup },
): ApprovalItem {
  return { kind, ...base, canDecide: ctx.mayDecide(kind, base.space?.id ?? null) };
}

export const toApproval = {
  /** A finished shift waiting for its hours to be approved. */
  hours(r: Row, ctx: ApprovalContext): ApprovalItem {
    const raised = iso(r.clockOutAt) ?? iso(r.clockInAt);
    return item('hours', ctx, {
      id: r.id,
      subject: person(r.user),
      space: spaceOf(r.location),
      raisedAt: raised,
      dueAt: null,
      // Yesterday's and today's shifts are today's work; older ones can wait.
      group: raised && ctx.now.getTime() - new Date(raised).getTime() < 36 * HOUR ? 'TODAY' : 'LATER',
      data: {
        clockInAt: iso(r.clockInAt),
        clockOutAt: iso(r.clockOutAt),
        minutes: r.paidMinutes ?? r.totalMinutes ?? null,
        flags: Array.isArray(r.flagReasons) ? r.flagReasons.join(',') : null,
        timezone: r.timezone ?? r.location?.timezone ?? null,
      },
    });
  },

  /** Somebody stepped away from the site and asks for the time — they are out right now. */
  away(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('away', ctx, {
      id: r.id,
      subject: person(r.user),
      space: spaceOf(r.space),
      raisedAt: iso(r.reportedAt) ?? iso(r.leftRingAt) ?? iso(r.createdAt),
      dueAt: iso(r.expiresAt),
      group: 'NOW',
      data: { leftAt: iso(r.leftRingAt), requestedMinutes: r.requestedMinutes ?? null, reason: r.reason ?? null, distanceM: r.lastDistanceM ?? null },
    });
  },

  /** More time on a shift — NOW while they are still clocked in. */
  extraTime(r: Row, ctx: ApprovalContext): ApprovalItem {
    const open = r.status === 'CLOCKED_IN';
    return item('extraTime', ctx, {
      id: r.id, // the time entry: the route takes it
      subject: person(r.user),
      space: spaceOf(r.location),
      raisedAt: iso(r.updatedAt) ?? iso(r.clockInAt),
      dueAt: iso(r.expectedClockOutAt),
      group: open ? 'NOW' : 'TODAY',
      data: { clockInAt: iso(r.clockInAt), plannedEnd: iso(r.expectedClockOutAt), stillWorking: open, timezone: r.location?.timezone ?? null },
    });
  },

  /** The formal overtime round (asked, signed, waiting for a leader). */
  overtime(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('overtime', ctx, {
      id: r.id,
      subject: person(r.technician),
      space: spaceOf(r.location),
      raisedAt: iso(r.technicianRespondedAt) ?? iso(r.createdAt),
      dueAt: iso(r.approvalTimeoutAt),
      group: 'TODAY',
      data: { timeEntryId: r.timeEntryId ?? null, cycle: r.cycle ?? null, reason: r.technicianReason ?? null, overtimeStartAt: iso(r.overtimeStartAt) },
    });
  },

  /** Leave and every other request kind. */
  request(r: Row, ctx: ApprovalContext): ApprovalItem {
    const start = iso(r.startDate);
    return item('request', ctx, {
      id: r.id,
      subject: person(r.technician),
      space: spaceOf(r.space),
      raisedAt: iso(r.createdAt),
      dueAt: start,
      // Starting within two days is today's problem.
      group: within(start, ctx.now, 48 * HOUR) ? 'TODAY' : 'LATER',
      data: {
        requestKind: r.kind ?? 'LEAVE',
        type: r.type ?? null,
        startDate: start,
        endDate: iso(r.endDate),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        workingDays: r.workingDays ?? null,
        minutes: r.minutes ?? null,
        reason: r.reason ?? null,
        // The wallchart's own verdict: how many would still be in on the worst day, against the floor.
        coverLevel: r.cover?.level ?? null,
        coverWorst: r.cover?.worst ?? null,
        coverFloor: r.cover?.floor ?? null,
      },
    });
  },

  /** A planned shift nobody clocked in for. */
  noShow(r: Row, ctx: ApprovalContext): ApprovalItem {
    const expected = iso(r.expectedClockInAt);
    return item('noShow', ctx, {
      id: r.id,
      subject: { id: r.userId ?? null, name: r.userName ?? '', avatarUrl: r.avatarUrl ?? null },
      space: r.spaceId ? { id: r.spaceId, name: r.spaceName ?? '' } : null,
      raisedAt: expected,
      dueAt: iso(r.expectedClockOutAt),
      group: noShowGroup(iso(r.expectedClockOutAt), ctx.now),
      data: { expectedClockInAt: expected, expectedClockOutAt: iso(r.expectedClockOutAt), state: r.state ?? null, localDate: r.localDate ?? null },
    });
  },

  /** A problem reported on a shift, not yet taken by anybody. */
  issue(r: Row, ctx: ApprovalContext, spaceNames: Map<string, string>): ApprovalItem {
    const urgent = r.severity === 'URGENT' || r.severity === 'HIGH';
    const it = item('issue', ctx, {
      id: r.id,
      subject: { id: r.reportedById ?? null, name: r.reporterName ?? '', avatarUrl: null },
      space: r.spaceId ? { id: r.spaceId, name: spaceNames.get(r.spaceId) ?? '' } : null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: urgent ? 'NOW' : 'LATER',
      data: { title: r.title ?? null, severity: r.severity ?? null, assigneeName: r.assigneeName ?? null },
    });
    // Acknowledging is the org's or the assignee's (the route's own rule).
    if (r.assignedToId && r.assignedToId === ctx.me) it.canDecide = true;
    return it;
  },

  /** Money a member filed against an asset, waiting to count. */
  expense(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('expense', ctx, {
      id: r.id,
      subject: person(r.author),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: { assetName: r.asset?.name ?? null, category: r.category ?? null, amountCents: r.amountCents ?? null, currency: ctx.currency ?? null, occurredAt: iso(r.occurredAt), hasReceipt: !!r.hasReceipt },
    });
  },

  /** A page a member sent in to become an asset. */
  assetProposal(r: Row, ctx: ApprovalContext): ApprovalItem {
    const f = (r.fields ?? {}) as Row;
    return item('assetProposal', ctx, {
      id: r.id,
      subject: person(r.raisedBy),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: { documentKind: r.documentKind ?? null, categoryId: r.categoryId ?? null, plate: f.plate ?? f.registration ?? null, name: f.name ?? f.model ?? null, holderName: nameOf(r.holder) || null },
    });
  },

  /** A member-supplied document to verify. */
  document(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('document', ctx, {
      id: r.id,
      subject: person(r.member),
      space: null,
      raisedAt: iso(r.submittedAt),
      dueAt: null,
      group: 'LATER',
      data: { title: r.title ?? r.typeLabel ?? null, typeLabel: r.typeLabel ?? null, expiresOn: r.expiresOn ?? null, hasExpiry: !!r.hasExpiry, blocksWork: !!r.blocksWork },
    });
  },

  /** Somebody who used the organization's join code. */
  join(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('join', ctx, {
      id: r.id,
      subject: person(r.user),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: { email: r.user?.email ?? null, message: r.message ?? null },
    });
  },

  /** A client's request through the portal, not yet a job. */
  clientRequest(r: Row, ctx: ApprovalContext, portalId: string): ApprovalItem {
    return item('clientRequest', ctx, {
      id: r.id,
      subject: { id: r.customerId ?? null, name: r.customerName ?? '', avatarUrl: null },
      space: r.spaceId ? { id: r.spaceId, name: r.spaceName ?? '' } : null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'TODAY',
      data: {
        title: r.title ?? null,
        reference: r.reference ?? null,
        unitName: r.unitName ?? null,
        priority: r.priority ?? null,
        portalId,
        suggestedSpaceId: r.suggestedSpaceId ?? null,
        suggestedSpaceName: r.suggestedSpaceName ?? null,
      },
    });
  },

  /** A guest organization asks for a job or a worker in a shared workspace. */
  guestRequest(r: Row, ctx: ApprovalContext, space: { id: string; name: string }): ApprovalItem {
    return item('guestRequest', ctx, {
      id: r.id,
      subject: { id: r.requestedById ?? null, name: '', avatarUrl: null },
      space,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'TODAY',
      data: { requestType: r.type ?? null, title: r.title ?? null, note: r.note ?? null },
    });
  },
};

/**
 * Extra time and overtime read the SAME OvertimeRequest rows when a shift's
 * extra time is asked through the new flow: show each shift once — the live
 * extra-time item wins, because it is the one still being worked.
 */
export function dedupeApprovals(items: ApprovalItem[]): ApprovalItem[] {
  const liveEntries = new Set(items.filter((i) => i.kind === 'extraTime').map((i) => i.id));
  return items.filter((i) => !(i.kind === 'overtime' && i.data.timeEntryId && liveEntries.has(String(i.data.timeEntryId))));
}

/** The decision buttons an item shows, after its own needs. */
export function approvalActionsFor(item: ApprovalItem) {
  const spec = APPROVAL_KIND_SPECS[item.kind];
  if (!item.canDecide || spec.needsPage?.(item)) return [];
  // The first of two approvals is already theirs: only the second person approves; anybody may still reject.
  if (item.step?.mine) return spec.actions.filter((a) => a.id !== 'approve');
  return spec.actions;
}
