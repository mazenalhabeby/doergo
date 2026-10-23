import { BadRequestException, Injectable } from '@nestjs/common';
import { planHandover, partiesAfter, type CustodyParty, type CustodyPeriod, type HandoverPlan } from '@hbcfield/shared';
import { CUSTODY_SELECT, Db } from './asset-custody-helpers';

/**
 * THE one writer of custody: AssetCustody periods AND the AssetHolder mirror, in
 * one transaction (`apply`). Nothing else writes either table.
 *
 * ⚠️ Provided by AssetCustodyModule and NOT exported: the only way in from
 * outside the module is `AssetCustodyService.apply`, so a second writer cannot
 * appear by injecting this one somewhere else.
 */
@Injectable()
export class CustodyWriterService {
  // ───────────────────────────────────────────────────────────────────────────
  // Writing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Move an asset from whoever holds it to whoever should.
   *
   * `planHandover` decides what happens; this only carries it out. The confirm
   * dialog calls the SAME function to render "closes Ahmed's custody, opens
   * Mira's", so what a person agreed to and what was written cannot differ.
   *
   * ⚠️ Must be called inside a transaction that also writes `AssetHolder` —
   * `apply` below is the only entry point that guarantees it.
   */
  private async write(
    db: Db,
    input: {
      assetId: string;
      organizationId: string;
      actorId: string;
      plan: HandoverPlan;
      reason?: string | null;
    },
  ): Promise<void> {
    const { plan } = input;
    const at = plan.at;

    if (plan.closing.length) {
      await db.assetCustody.updateMany({
        where: { id: { in: plan.closing.map((p) => p.id!).filter(Boolean) } },
        data: { endedAt: at, closedById: input.actorId, ...(input.reason ? { reason: input.reason } : {}) },
      });
    }

    if (plan.opening.length) {
      await db.assetCustody.createMany({
        data: plan.opening.map((party) => ({
          organizationId: input.organizationId,
          assetId: input.assetId,
          userId: party.userId ?? null,
          customerId: party.customerId ?? null,
          startedAt: at,
          openedById: input.actorId,
          reason: input.reason ?? null,
        })),
      });
    }

    await this.mirror(db, input.assetId, partiesAfter(plan));
  }

  /**
   * Make `AssetHolder` say exactly what the open periods say.
   *
   * Replaced as a set rather than diffed: the set is small and bounded, the
   * write is atomic either way, and a diff would be three queries and a class
   * of bug in exchange for saving one — the same reasoning the holders service
   * already applies.
   */
  private async mirror(db: Db, assetId: string, parties: CustodyParty[]): Promise<void> {
    await db.assetHolder.deleteMany({ where: { assetId } });
    if (parties.length) {
      await db.assetHolder.createMany({
        data: parties.map((p) => ({
          assetId,
          userId: p.userId ?? null,
          customerId: p.customerId ?? null,
        })),
        skipDuplicates: true,
      });
    }
  }

  /** Do these two sets name different people? Compared as SETS, not lists. */
  private differs(a: CustodyParty[], b: CustodyParty[]): boolean {
    const key = (p: CustodyParty) => (p.userId ? `u:${p.userId}` : `c:${p.customerId}`);
    const left = [...new Set(a.map(key))].sort();
    const right = [...new Set(b.map(key))].sort();
    return left.length !== right.length || left.some((v, i) => v !== right[i]);
  }

  /** The open periods of one asset, read for a plan. */
  async openFor(db: Db, assetId: string): Promise<CustodyPeriod[]> {
    return db.assetCustody.findMany({
      where: { assetId, endedAt: null },
      select: CUSTODY_SELECT,
    }) as unknown as Promise<CustodyPeriod[]>;
  }

  /**
   * Apply a change of holder, whatever asked for it.
   *
   * Both routes into this come here: the explicit "hand it over" button, and an
   * edit of the record that happens to change who holds it. One path means the
   * timeline is complete however somebody got there — an edit that quietly
   * skipped it would leave a gap nobody could explain later.
   */
  async apply(
    db: Db,
    input: {
      assetId: string;
      organizationId: string;
      actorId: string;
      to: CustodyParty[];
      at?: Date | string;
      reason?: string | null;
      limit: number;
      /** Throw on a refusal, or return quietly having done nothing. */
      strict?: boolean;
    },
  ): Promise<HandoverPlan> {
    // The periods AND the row that mirrors them, together: a no-op plan still
    // has to be able to notice that the two disagree. See below.
    const [periods, held] = await Promise.all([
      this.openFor(db, input.assetId),
      db.assetHolder.findMany({ where: { assetId: input.assetId }, select: { userId: true, customerId: true } }),
    ]);
    const plan = planHandover({ periods, to: input.to, at: input.at, limit: input.limit });

    if (plan.problems.length) {
      /*
        `nobody` means the plan is a no-op — the same people keep it. That is
        not an error on the edit path (saving a record without touching the
        driver must not fail), and it is not an error on the button either:
        there is simply nothing to write.
      */
      const onlyNoop = plan.problems.every((p) => p.kind === 'nobody');
      if (onlyNoop) {
        /*
          ⚠️ Except when the mirror has drifted.

          If `AssetHolder` names somebody with no open period — an asset that
          predates this, or a half-written state — then "nobody" is the answer
          to the wrong question: the plan compares against the PERIODS, sees no
          change, and the stale holder row survives every attempt to clear it.
          Nothing on any screen would show why. Reconciling here makes the
          drift self-healing on the next save instead of permanent.
        */
        if (this.differs(held, partiesAfter(plan))) {
          await this.mirror(db, input.assetId, partiesAfter(plan));
        }
        return plan;
      }
      if (input.strict) throw new BadRequestException(this.explain(plan));
      return plan;
    }

    await this.write(db, {
      assetId: input.assetId,
      organizationId: input.organizationId,
      actorId: input.actorId,
      plan,
      reason: input.reason,
    });
    return plan;
  }

  /** A refusal in the words the person reads, not a problem code. */
  private explain(plan: HandoverPlan): string {
    const first = plan.problems[0]!;
    switch (first.kind) {
      case 'too-many':
        return first.limit === 1
          ? 'This type is held by one at a time. Change the type to allow several.'
          : `At most ${first.limit} at a time.`;
      case 'future':
        return 'A handover cannot be dated in the future — record it when it happens.';
      case 'before-start':
        return 'That date is before the current holder was given it.';
      default:
        return 'Nothing to change.';
    }
  }
}
