import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type PrismaService,
  assertFoundInOrg,
  assertMemberInScope,
  dayKeyIn,
  leaveLedgerSource,
  leaveYearDayFromQuery,
  toISODateString,
  type LeaveAdjustmentKind,
  type LeaveLedgerEntry,
  orgLeaveFacts,
  personLeaveFacts,
} from '@hbcfield/shared';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { OrgLeave, PERSON_BRIEF } from './leave-ledger-helpers';

/*
  The leave ledger's reads and its write rule: today's day, the person and the organization,
  who may write a balance, and a ledger entry's shape. Shared by the ledger and starting balances.
*/

export function leaveToday(org: Pick<OrgLeave, 'timezone'>) {
  return dayKeyIn(new Date(), org.timezone);
}

export function leaveDayFrom(q: { on?: unknown; year?: unknown }, org: OrgLeave): string {
  const day = leaveYearDayFromQuery(q, leaveToday(org));
  if (!day)
    throw new BadRequestException({ code: 'LEAVE_DAY_INVALID', message: 'Choose a valid day (YYYY-MM-DD) or year' });
  return day;
}

/** One person and their organization — one query. 404 for anybody outside it. */
export async function loadLeavePerson(prisma: PrismaService, organizationId: string, userId: string) {
  const person = await personLeaveFacts(prisma, userId, organizationId);
  assertFoundInOrg(person, organizationId, 'Employee');
  return { person, org: person.organization as OrgLeave };
}

/* ================================================================ who may write */

/**
 * The rule for writing somebody's balance is the rule for deciding their leave: the person is
 * in a workspace the caller manages the rota of (`scopeSpaceIds`, server-resolved; undefined =
 * org-wide) and it is not the caller's own balance — an organization administrator excepted
 * (the same exemption as deciding leave, attendance/core/self-decision.ts).
 */
export async function assertMayWriteLeave(
  prisma: PrismaService,
  organizationId: string,
  subjectId: string,
  callerId: string,
  scopeSpaceIds?: string[],
) {
  await assertMemberInScope(prisma as never, { userId: subjectId, organizationId, scopeSpaceIds });
  await assertNotSelfDecision(prisma as never, {
    deciderId: callerId,
    subjectId,
    organizationId,
    message: 'You cannot change your own leave balance. Ask a manager or an administrator.',
  });
}

export async function mayWriteLeave(
  prisma: PrismaService,
  organizationId: string,
  subjectId: string,
  callerId: string,
  scopeSpaceIds: string[] | undefined | null,
) {
  if (scopeSpaceIds === null) return false;
  try {
    await assertMayWriteLeave(prisma, organizationId, subjectId, callerId, scopeSpaceIds);
    return true;
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

/* ================================================================ the ledger */

export function leaveEntryOf(row: {
  id: string;
  kind: string;
  days: number;
  leaveYearStart: Date;
  reason: string | null;
  sourceKey: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  voidedBy: { id: string; firstName: string; lastName: string } | null;
}): LeaveLedgerEntry {
  return {
    id: row.id,
    kind: row.kind as LeaveAdjustmentKind,
    days: row.days,
    leaveYearStart: toISODateString(row.leaveYearStart),
    reason: row.reason,
    source: leaveLedgerSource(row.sourceKey),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidedBy: row.voidedBy,
  };
}

export const LEAVE_ENTRY_SELECT = {
  id: true,
  kind: true,
  days: true,
  leaveYearStart: true,
  reason: true,
  sourceKey: true,
  createdAt: true,
  voidedAt: true,
  userId: true,
  createdBy: { select: PERSON_BRIEF },
  voidedBy: { select: PERSON_BRIEF },
} as const;

export async function loadLeaveOrg(prisma: PrismaService, organizationId: string): Promise<OrgLeave> {
  const org = await orgLeaveFacts(prisma, organizationId);
  if (!org) throw new NotFoundException('Organization not found');
  return org as OrgLeave;
}
