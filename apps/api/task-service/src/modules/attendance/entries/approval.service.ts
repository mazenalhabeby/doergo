// size-exempt: deciding time entries — the pending list, approve, reject and bulk approve share one set of checks
import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { success, paginated, ApprovalStatus, handChangedMinutes } from '@hbcfield/shared';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../core/self-decision';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { MEMBER_SELECT } from '../core/attendance-selects';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES } from '@hbcfield/shared';
import { EntryChangeLog } from './entry-change-log';
import type { TimeEntryStatus } from '@prisma/client';
import { announceDayDecided, type DecidedEntry } from './day-decided';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: EntryChangeLog,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly rules: ApprovalRulesService,
  ) {}
  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    organizationId: string;
    page?: number;
    limit?: number;
    /** Just the counts — how many, and how many per workspace (the home's Crew card). */
    summary?: boolean;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const skip = (page - 1) * limit;

    const where = {
      organizationId: data.organizationId,
      // Only the caller's granted spaces — an entry outside them reads as
      // 'not found', which is also the right thing to tell them.
      ...scopeWhere(data.scopeSpaceIds),
      approvalStatus: ApprovalStatus.PENDING,
      status: { not: 'CLOCKED_IN' as TimeEntryStatus }, // Only completed entries
    };

    /*
      ⭐ COUNTS WITHOUT THE ROWS. The Crew card needs the total and a count per
      workspace; it used to download a whole page of shifts (170 KB for 95)
      every minute to count them itself. One grouped count answers it in bytes.
    */
    if (data.summary) {
      const groups = await this.prisma.timeEntry.groupBy({ by: ['locationId'], where, _count: { _all: true } });
      const bySpace: Record<string, number> = {};
      let total = 0;
      for (const g of groups) {
        total += g._count._all;
        if (g.locationId) bySpace[g.locationId] = g._count._all;
      }
      return { total, bySpace };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: MEMBER_SELECT,
          },
          location: {
            select: { id: true, name: true, timezone: true },
          },
          breaks: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryId: string;
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        // Only the caller's granted spaces — an entry outside them reads as
        // 'not found', which is also the right thing to tell them.
        ...scopeWhere(data.scopeSpaceIds),
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    // A second party approves hours — the overtime rule (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot approve your own time entry. Ask a manager or an administrator.',
    });

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException({
        code: 'ENTRY_ALREADY_DECIDED',
        message: `Entry is already ${entry.approvalStatus.toLowerCase()}`,
        params: { status: entry.approvalStatus },
      });
    }
    assertClosedForDecision(entry);

    // Office rules: hours changed by hand past a limit need a second person — step 1 writes nothing here.
    const step = await this.rules.firstStep({
      organizationId: data.organizationId,
      kind: 'hours',
      itemId: entry.id,
      facts: { spaceIds: [entry.locationId], minutes: handChangedMinutes(entry) },
      deciderId: data.approverId,
      subjectId: entry.userId,
    });
    if (step) return success({ ...entry, ...step }, `Approved — waiting for ${step.waitingFor}`);

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true, timezone: true },
        },
      },
    });

    this.logger.log(`Entry approved: entry=${data.entryId}, approver=${data.approverId}`);

    this.changes.announce(data.organizationId, 'approve', data.entryId, {
      userId: entry.userId,
      spaceId: entry.locationId,
    });
    await this.tellDayDecided(entry);
    return success(updated, 'Time entry approved');
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryId: string;
    approverId: string;
    organizationId: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        // Only the caller's granted spaces — an entry outside them reads as
        // 'not found', which is also the right thing to tell them.
        ...scopeWhere(data.scopeSpaceIds),
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    // Deciding your own entry, either way, needs somebody else (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: entry.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own time entry. Ask a manager or an administrator.',
    });

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException({
        code: 'ENTRY_ALREADY_DECIDED',
        message: `Entry is already ${entry.approvalStatus.toLowerCase()}`,
        params: { status: entry.approvalStatus },
      });
    }
    assertClosedForDecision(entry);
    // A refusal by anybody who may decide ends a half-approved entry too.
    await this.rules.clear(data.organizationId, 'hours', entry.id);

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.reason,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(`Entry rejected: entry=${data.entryId}, approver=${data.approverId}, reason=${data.reason}`);

    this.changes.announce(data.organizationId, 'reject', data.entryId, {
      userId: entry.userId,
      spaceId: entry.locationId,
    });
    await this.tellDayDecided(entry);
    return success(updated, 'Time entry rejected');
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    entryIds: string[];
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const results = {
      approved: [] as string[],
      /** Approved by the caller, still waiting for a second person (an office rule) — NOT approved yet. */
      waiting: [] as { id: string; waitingFor: string }[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const entryId of data.entryIds) {
      try {
        const done = await this.approveEntry({
          entryId,
          approverId: data.approverId,
          organizationId: data.organizationId,
          // Only the caller's granted spaces — an entry outside them reads as
          // 'not found'. ⚠️ This used to spread `scopeWhere(...)` here, which
          // passes `locationId: {in}` — a key approveEntry does not read — so
          // scopeSpaceIds arrived undefined and bulk approval was ORG-WIDE.
          scopeSpaceIds: data.scopeSpaceIds,
          notes: data.notes,
        });
        const step = done.data as { stage?: string; waitingFor?: string } | undefined;
        if (step?.stage === 'FIRST_STEP') results.waiting.push({ id: entryId, waitingFor: step.waitingFor ?? '' });
        else results.approved.push(entryId);
      } catch (error) {
        results.failed.push({ id: entryId, reason: error.message });
      }
    }

    if (results.approved.length) this.changes.announce(data.organizationId, 'bulk-approve');
    return success(results, `Approved ${results.approved.length} entries`);
  }

  /** The person hears when the last waiting entry of their day is decided (day-decided.ts). Never fails the decision. */
  private async tellDayDecided(entry: DecidedEntry) {
    try {
      await announceDayDecided(this.prisma, this.notificationClient, entry);
    } catch (err) {
      this.logger.warn(`day-decided push skipped: ${err}`);
    }
  }
}

/**
 * A day is decided once the shift is over (clock review B9): the list shows only finished shifts, and a decision
 * taken while it ran was rewritten by the clock-out from the labels — a manager's "approved" undone silently.
 */
function assertClosedForDecision(entry: { status: string }): void {
  if (entry.status === 'CLOCKED_IN') {
    throw new BadRequestException({
      code: 'ENTRY_STILL_OPEN',
      message: 'This shift is still running — it can be decided once it is clocked out.',
    });
  }
}
