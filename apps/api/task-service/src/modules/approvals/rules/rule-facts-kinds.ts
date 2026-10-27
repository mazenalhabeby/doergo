import type { ModuleRef } from '@nestjs/core';
import {
  NO_SHOW_OPEN_STATES,
  noShowRuns,
  type NoShowRun,
  handChangedMinutes,
  isUrgentPriority,
  personName,
  peopleNames,
  proposalReviewSpaces,
  type PrismaService,
} from '@hbcfield/shared';
import { runsFor } from '../../attendance/no-shows/no-show-run-facts';
import { ProposalPlacesService } from '../../assets/proposals/proposal-places.service';
import { inSpaces, type RuleItem, type RuleItemWindow } from './rule-items';

/** People's names for a list of ids — one query. */
export async function namesOf(prisma: PrismaService, ids: string[]): Promise<Map<string, string>> {
  const people = await peopleNames(prisma, [...new Set(ids)]);
  return new Map(people.map((p) => [p.id, personName(p)]));
}

/** One read looks at no more than this many items per organization and kind — the NEWEST, so a long backlog
 * never hides what was raised today. */
export const MAX_ITEMS = 500;

/**
 * The items of the four newer rule kinds, as office rules read them (rule-facts.reader.ts holds the first three).
 * Each builds its facts with the SAME helper its approve path hands the gate (handChangedMinutes, the run of
 * missed days, the proposal's place, isUrgentPriority), so the sweep and the page see what the gate sees.
 */

/** Hours waiting for approval (closed entries only); changed by hand = how far from what was clocked. */
export async function hoursItems(prisma: PrismaService, organizationId: string, window: RuleItemWindow) {
  const rows = await prisma.timeEntry.findMany({
    where: window.since
      ? // The window: finished entries a person looked at or changed — not every automatic shift of 90 days.
        {
          organizationId,
          ...inSpaces(window, 'locationId'),
          clockInAt: { gte: window.since },
          status: { not: 'CLOCKED_IN' },
          OR: [{ approvalStatus: { not: 'AUTO' } }, { isEdited: true }],
        }
      : {
          organizationId,
          ...inSpaces(window, 'locationId'),
          approvalStatus: 'PENDING',
          status: { not: 'CLOCKED_IN' },
          clockOutAt: { lte: window.waitingBefore },
        },
    select: {
      id: true,
      userId: true,
      locationId: true,
      clockInAt: true,
      clockOutAt: true,
      isEdited: true,
      originalClockIn: true,
      originalClockOut: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { clockInAt: 'desc' },
    take: MAX_ITEMS,
  });
  return rows.map((e): RuleItem => ({
    itemId: e.id,
    since: e.clockOutAt ?? e.clockInAt,
    subjectId: e.userId,
    subjectName: personName(e.user),
    facts: { spaceIds: [e.locationId], minutes: handChangedMinutes(e) },
  }));
}

/**
 * Missed clock-ins that waited for a person; days = the run of consecutive missed days. A run is ONE item —
 * its newest day, as the inbox and the decision key it — so a five-day run is not five reminders.
 * The window counts days somebody had to answer: still open, marked absent, or excused BY A PERSON (a day the
 * system closed itself — a late clock-in, leave — never asked anybody).
 */
export async function noShowItems(prisma: PrismaService, organizationId: string, window: RuleItemWindow) {
  const rows = await prisma.shiftInstance.findMany({
    where: window.since
      ? {
          organizationId,
          ...inSpaces(window, 'spaceId'),
          expectedClockInAt: { gte: window.since },
          OR: [{ state: { in: [...NO_SHOW_OPEN_STATES, 'ABSENT'] } }, { state: 'EXCUSED', closedAutomatically: false }],
        }
      : {
          organizationId,
          ...inSpaces(window, 'spaceId'),
          state: { in: [...NO_SHOW_OPEN_STATES] },
          expectedClockInAt: { lte: window.waitingBefore },
        },
    select: {
      id: true,
      userId: true,
      spaceId: true,
      shiftId: true,
      expectedClockInAt: true,
    },
    orderBy: { expectedClockInAt: 'desc' },
    take: MAX_ITEMS,
  });
  const [runs, names] = await Promise.all([
    window.since ? decidedRuns(prisma, rows, window.since) : runsFor(prisma, rows, new Date()),
    namesOf(
      prisma,
      rows.map((r) => r.userId),
    ),
  ]);
  return rows
    .filter((i) => !runs.get(i.id) || runs.get(i.id)!.latestId === i.id)
    .map((i): RuleItem => ({
      itemId: i.id,
      since: i.expectedClockInAt,
      subjectId: i.userId,
      subjectName: names.get(i.userId) ?? '',
      facts: { spaceIds: i.spaceId ? [i.spaceId] : [], days: runs.get(i.id)?.count ?? 1 },
    }));
}

/**
 * Runs among days already decided (the rules page's window): the same consecutive-days rule the inbox uses,
 * with each day a person had to answer standing in as "open" and every other day of that shift breaking it.
 * One query.
 */
async function decidedRuns(
  prisma: PrismaService,
  asked: { id: string; userId: string; shiftId: string | null }[],
  since: Date,
) {
  if (!asked.length) return new Map<string, NoShowRun>();
  const askedIds = new Set(asked.map((r) => r.id));
  const all = await prisma.shiftInstance.findMany({
    where: {
      userId: { in: [...new Set(asked.map((r) => r.userId))] },
      shiftId: { in: [...new Set(asked.map((r) => r.shiftId).filter((x): x is string => !!x))] },
      expectedClockInAt: { gte: since },
    },
    select: { id: true, userId: true, spaceId: true, shiftId: true, localDate: true, state: true },
  });
  return noShowRuns(all.map((r) => ({ ...r, state: askedIds.has(r.id) ? NO_SHOW_OPEN_STATES[0] : 'CLOSED' })));
}

/** Asset papers members sent in; where they belong is the review queue's own place (the kind's, else the member's). */
export async function proposalItems(
  prisma: PrismaService,
  moduleRef: ModuleRef,
  organizationId: string,
  window: RuleItemWindow,
) {
  const rows = await prisma.assetProposal.findMany({
    where: window.since
      ? { organizationId, createdAt: { gte: window.since } }
      : { organizationId, status: 'PENDING', createdAt: { lte: window.waitingBefore } },
    select: {
      id: true,
      categoryId: true,
      holderUserId: true,
      raisedById: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ITEMS,
  });
  // The assets module owns where a proposal belongs; asked through the container, never imported into this module.
  const [places, names] = await Promise.all([
    moduleRef.get(ProposalPlacesService, { strict: false }).placesOf(rows, organizationId),
    namesOf(
      prisma,
      rows.map((r) => r.raisedById),
    ),
  ]);
  return rows.map((p): RuleItem => ({
    itemId: p.id,
    since: p.createdAt,
    subjectId: p.raisedById,
    subjectName: names.get(p.raisedById) ?? '',
    facts: { spaceIds: places.get(p.id) ? proposalReviewSpaces(places.get(p.id)!) : [], categoryId: p.categoryId },
  }));
}

/** Client requests not yet turned into jobs; the workspace is the one chosen, else the client's portal's. */
export async function clientRequestItems(prisma: PrismaService, organizationId: string, window: RuleItemWindow) {
  const rows = await prisma.task.findMany({
    where: {
      organizationId,
      source: 'CUSTOMER_PORTAL',
      ...(window.spaceIds
        ? {
            OR: [
              { spaceId: { in: window.spaceIds } },
              { spaceId: null, customer: { portal: { spaceId: { in: window.spaceIds } } } },
            ],
          }
        : {}),
      ...(window.since
        ? { createdAt: { gte: window.since } }
        : { triaged: false, createdAt: { lte: window.waitingBefore } }),
    },
    select: {
      id: true,
      createdAt: true,
      priority: true,
      spaceId: true,
      customer: { select: { name: true, portal: { select: { spaceId: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ITEMS,
  });
  return rows.map((t): RuleItem => {
    const spaceId = t.spaceId ?? t.customer?.portal?.spaceId ?? null;
    return {
      itemId: t.id,
      since: t.createdAt,
      // The asker is a client, not a member: nobody to leave out of the reminders.
      subjectId: null,
      subjectName: t.customer?.name ?? '',
      facts: { spaceIds: spaceId ? [spaceId] : [], urgent: isUrgentPriority(t.priority) },
    };
  });
}
