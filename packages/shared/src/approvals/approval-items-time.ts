/** The time kinds: hours, away, extra time, overtime, requests, no-shows. Pure. */
import type { ApprovalItem } from './approval-kinds';
import {
  HOUR,
  iso,
  item,
  noShowGroup,
  person,
  spaceOf,
  within,
  type ApprovalContext,
  type Row,
} from './approval-item-base';

export const timeApprovals = {
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
      data: {
        leftAt: iso(r.leftRingAt),
        requestedMinutes: r.requestedMinutes ?? null,
        reason: r.reason ?? null,
        distanceM: r.lastDistanceM ?? null,
        // Which day it belongs to (a person's working day groups it with their hours).
        timezone: r.space?.timezone ?? r.timezone ?? null,
      },
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
      data: {
        clockInAt: iso(r.clockInAt),
        plannedEnd: iso(r.expectedClockOutAt),
        stillWorking: open,
        timezone: r.location?.timezone ?? null,
      },
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
      data: {
        timeEntryId: r.timeEntryId ?? null,
        cycle: r.cycle ?? null,
        reason: r.technicianReason ?? null,
        overtimeStartAt: iso(r.overtimeStartAt),
        timezone: r.location?.timezone ?? null,
      },
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
      data: {
        expectedClockInAt: expected,
        expectedClockOutAt: iso(r.expectedClockOutAt),
        state: r.state ?? null,
        localDate: r.localDate ?? null,
        reminderCount: typeof r.reminderCount === 'number' ? r.reminderCount : null,
        lastActiveAt: iso(r.lastActiveAt),
        missedThisMonth: typeof r.missedThisMonth === 'number' ? r.missedThisMonth : null,
        // A run of misses decided as one (attendance/no-show.ts).
        runCount: r.run?.count ?? null,
        runFrom: r.run?.from ?? null,
        runTo: r.run?.to ?? null,
        hint: r.hint?.kind ?? null,
        hintSpaceName: r.hint?.kind === 'ELSEWHERE' ? (r.hint.spaceName ?? null) : null,
        hintSince: r.hint?.kind === 'NOT_SEEN' ? iso(r.hint.since) : null,
        // "They were here" fills Add attendance with these; times read in the workspace's zone.
        timezone: r.timezone ?? null,
        userId: r.userId ?? null,
        spaceId: r.spaceId ?? null,
      },
    });
  },
};
