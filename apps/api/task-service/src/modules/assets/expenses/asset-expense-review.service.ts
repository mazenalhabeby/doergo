import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, success, clampListLimit, peopleFaces } from '@hbcfield/shared';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { AssetAccessService, type AssetActor } from '../core/asset-access.service';
import { AssetNotifier } from '../core/asset-notifier.service';
import { assertNotSelfDecision } from '../../attendance/core/self-decision';
import { EXPENSE_STATUS } from './asset-expense-helpers';

/**
 * What happens to an expense after it is sent: the member's own list, the office's
 * queue, and the decision (with the office's rules).
 */
@Injectable()
export class AssetExpenseReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly notifier: AssetNotifier,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    private readonly rules: ApprovalRulesService,
  ) {}

  /** What the caller has sent in, newest first — the phone's "my expenses". */
  async mine(data: { userId: string; organizationId: string; limit?: number }) {
    const take = clampListLimit(data.limit, 50, 100);
    const entries = await this.prisma.assetMoney.findMany({
      /*
        Money only. Logbook entries share the table, and an app built before the
        logbook renders every row here as an amount — a dent would read €0.00.
        The phone's logbook reads `/assets/log/mine` for the rest.
      */
      where: { organizationId: data.organizationId, authorId: data.userId, amountCents: { gt: 0 } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        assetId: true,
        category: true,
        direction: true,
        amountCents: true,
        note: true,
        occurredAt: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        receiptKey: true,
        // Logbook entries share the table; the screen names their type (null = a cost).
        logType: true,
        asset: { select: { id: true, name: true } },
      },
    });
    // The KEY is never sent to a client — only whether there is one, so the
    // screen can offer to open it through the endpoint that mints a link.
    return success(entries.map(({ receiptKey, ...e }) => ({ ...e, hasReceipt: !!receiptKey })));
  }

  // ── The office's queue ─────────────────────────────────────────────────────

  /** Everything waiting on a decision. */
  async pending(data: { limit?: number } & AssetActor) {
    this.access.assertMay(data, 'view');
    const take = clampListLimit(data.limit, 100, 200);
    // Only records in the caller's workspaces — the same reach as each record's Money tab.
    const kind = this.access.spaceFilter(data, 'view');

    const entries = await this.prisma.assetMoney.findMany({
      where: {
        organizationId: data.organizationId,
        status: EXPENSE_STATUS.SUBMITTED,
        ...(kind ? { asset: { category: kind } } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }],
      take,
      select: {
        id: true,
        assetId: true,
        category: true,
        direction: true,
        amountCents: true,
        note: true,
        occurredAt: true,
        authorId: true,
        receiptKey: true,
        createdAt: true,
        // A logbook entry waiting for a decision is in the same queue; the screen names its type.
        logType: true,
        values: true,
        asset: { select: { id: true, name: true } },
      },
    });
    if (entries.length === 0) return success({ entries: [], totalCents: 0 });

    const authorIds = [...new Set(entries.map((e) => e.authorId).filter((v): v is string => !!v))];
    const authors = authorIds.length
      ? await peopleFaces(this.prisma, authorIds, { organizationId: data.organizationId })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));

    return success({
      entries: entries.map(({ receiptKey, ...e }) => ({
        ...e,
        hasReceipt: !!receiptKey,
        author: e.authorId ? (byId.get(e.authorId) ?? null) : null,
      })),
      totalCents: entries.reduce((n, e) => n + (e.direction === 'IN' ? 0 : e.amountCents), 0),
    });
  }

  /**
   * Accept it, or refuse it with a reason.
   *
   * Only ever moves a SUBMITTED entry, and the `where` says so rather than a
   * read-then-write: two people opening the queue at once would otherwise both
   * see it pending and the second decision would silently overwrite the first.
   */
  async review(
    data: {
      entryId: string;
      decision: 'accept' | 'reject';
      note?: string;
    } & AssetActor,
  ) {
    this.access.assertMay(data, 'manage');

    // A member's expense counts for nothing until SOMEBODY ELSE accepts it — an
    // asset manager who filed a slip must not be the one to accept it. The
    // overtime rule, shared (attendance/core/self-decision.ts). The read only feeds
    // this check; the guarded update below still decides the race.
    const filed = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId },
      select: { authorId: true, amountCents: true, asset: { select: { category: { select: { spaceId: true } } } } },
    });
    /*
      ⚠️ Decided in the RECORD's workspace. A depot manager accepts the depot's
      slips, never another depot's — refused exactly like an entry that is not
      waiting, so the queue of another workspace cannot be probed id by id.
    */
    if (!filed || !this.access.mayIn(data, 'manage', filed.asset?.category?.spaceId ?? null)) {
      throw new NotFoundException('That expense is not waiting for a decision');
    }
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.userId,
      subjectId: filed?.authorId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own expense. Ask a manager or an administrator.',
    });

    // Office rules: past a threshold accepting is step 1 of 2; the slip stays submitted. A refusal ends it.
    if (data.decision === 'reject') await this.rules.clear(data.organizationId, 'expense', data.entryId);
    if (data.decision === 'accept' && this.rules) {
      const spaceId = filed.asset?.category?.spaceId ?? null;
      const verdict = await this.rules.gate({
        organizationId: data.organizationId,
        kind: 'expense',
        itemId: data.entryId,
        facts: { spaceIds: spaceId ? [spaceId] : [], amountCents: filed.amountCents ?? 0 },
        deciderId: data.userId,
        subjectId: filed.authorId,
      });
      if (!verdict.finalize) {
        return success({
          id: data.entryId,
          status: EXPENSE_STATUS.SUBMITTED,
          stage: 'FIRST_STEP',
          waitingFor: verdict.roleName,
        });
      }
    }

    const { count } = await this.prisma.assetMoney.updateMany({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        status: EXPENSE_STATUS.SUBMITTED,
      },
      data: {
        status: data.decision === 'accept' ? EXPENSE_STATUS.RECORDED : EXPENSE_STATUS.REJECTED,
        reviewedById: data.userId,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim().slice(0, 300) || null,
      },
    });
    if (!count) throw new NotFoundException('That expense is not waiting for a decision');

    await this.notifier.expenseDecided({
      entryId: data.entryId,
      organizationId: data.organizationId,
      decision: data.decision === 'accept' ? 'accept' : 'reject',
      note: data.note?.trim().slice(0, 300) || null,
      reviewerId: data.userId,
    });

    return success({
      id: data.entryId,
      status: data.decision === 'accept' ? EXPENSE_STATUS.RECORDED : EXPENSE_STATUS.REJECTED,
    });
  }
}
