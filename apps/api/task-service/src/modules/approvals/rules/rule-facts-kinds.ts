import type { ModuleRef } from '@nestjs/core';
import {
  NO_SHOW_OPEN_STATES,
  handChangedMinutes,
  isUrgentPriority,
  personName,
  peopleNames,
  proposalReviewSpaces,
  type PrismaService,
} from '@hbcfield/shared';
import { runsFor } from '../../attendance/no-shows/no-show-run-facts';
import { ProposalPlacesService } from '../../assets/proposals/proposal-places.service';
import type { RuleItem, RuleItemWindow } from './rule-facts.reader';

/** People's names for a list of ids — one query. */
async function namesOf(prisma: PrismaService, ids: string[]): Promise<Map<string, string>> {
  const people = await peopleNames(prisma, [...new Set(ids)]);
  return new Map(people.map((p) => [p.id, personName(p)]));
}

/** One read looks at no more than this many items per organization and kind. */
const MAX_ITEMS = 500;

/**
 * The items of the four newer rule kinds, as office rules read them (rule-facts.reader.ts holds the first three).
 * Each builds its facts with the SAME helper its approve path hands the gate (handChangedMinutes, the run of
 * missed days, the proposal's place, isUrgentPriority), so the sweep and the page see what the gate sees.
 */

/** Hours waiting for approval (closed entries only); changed by hand = how far from what was clocked. */
export async function hoursItems(prisma: PrismaService, organizationId: string, window: RuleItemWindow) {
  const rows = await prisma.timeEntry.findMany({
    where: window.since
      ? { organizationId, clockInAt: { gte: window.since } }
      : {
          organizationId,
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
    orderBy: { clockInAt: 'asc' },
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

/** Missed clock-ins still open; days = the run of consecutive missed days it belongs to. */
export async function noShowItems(prisma: PrismaService, organizationId: string, window: RuleItemWindow) {
  const rows = await prisma.shiftInstance.findMany({
    where: window.since
      ? { organizationId, expectedClockInAt: { gte: window.since }, state: { not: 'PLANNED' } }
      : { organizationId, state: { in: [...NO_SHOW_OPEN_STATES] }, expectedClockInAt: { lte: window.waitingBefore } },
    select: {
      id: true,
      userId: true,
      spaceId: true,
      shiftId: true,
      expectedClockInAt: true,
    },
    orderBy: { expectedClockInAt: 'asc' },
    take: MAX_ITEMS,
  });
  const [runs, names] = await Promise.all([
    runsFor(prisma, rows, new Date()),
    namesOf(
      prisma,
      rows.map((r) => r.userId),
    ),
  ]);
  return rows.map((i): RuleItem => ({
    itemId: i.id,
    since: i.expectedClockInAt,
    subjectId: i.userId,
    subjectName: names.get(i.userId) ?? '',
    facts: { spaceIds: i.spaceId ? [i.spaceId] : [], days: runs.get(i.id)?.count ?? 1 },
  }));
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
    orderBy: { createdAt: 'asc' },
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
    orderBy: { createdAt: 'asc' },
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
