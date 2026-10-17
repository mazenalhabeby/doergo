/** What handing an asset over WILL do — the plan the dialog shows and the server runs. */
import { ms, openPeriods, partyKey, type CustodyParty, type CustodyPeriod } from './periods';

// ─────────────────────────────────────────────────────────────────────────────
// Handover
// ─────────────────────────────────────────────────────────────────────────────

export interface HandoverPlan {
  /** Periods this handover would END, and the instant they would end at. */
  closing: CustodyPeriod[];
  /** Parties this handover would give it to. */
  opening: CustodyParty[];
  /** Parties already holding it who simply stay — nothing is written for them. */
  unchanged: CustodyPeriod[];
  /** When it happens. */
  at: Date;
  /**
   * Why the plan cannot be carried out. Empty means it can.
   *
   * Returned rather than thrown so the SCREEN can show the reason beside the
   * date box while the person is still choosing, instead of after they commit.
   * The server calls the same function and refuses on the same list, so the
   * preview and the refusal can never disagree.
   */
  problems: HandoverProblem[];
}

export type HandoverProblem =
  | { kind: 'before-start'; period: CustodyPeriod }
  | { kind: 'future'; at: Date }
  | { kind: 'too-many'; limit: number; asked: number }
  | { kind: 'nobody' };

/**
 * What handing an asset over would actually do — computed once, read twice.
 *
 * The confirm dialog renders this list ("closes Ahmed's custody, opens Mira's")
 * and the service executes exactly it. A separate preview would be a second
 * implementation of the rule, and the two would drift the first time anything
 * changed.
 *
 * @param limit  How many holders the KIND allows. 1 for a van, more for a
 *               machine with a shift on it. A plan that exceeds it is refused
 *               here rather than by a unique index later.
 */
export function planHandover(input: {
  periods: CustodyPeriod[];
  to: CustodyParty[];
  at?: Date | string;
  limit?: number;
  now?: Date;
}): HandoverPlan {
  const now = input.now ?? new Date();
  const at = input.at ? new Date(input.at) : now;
  const problems: HandoverProblem[] = [];

  const open = openPeriods(input.periods);

  // Deduplicated, and blanks dropped: a picker that submits an empty row must
  // not be able to open a period held by nobody.
  const wanted = new Map<string, CustodyParty>();
  for (const p of input.to ?? []) {
    const key = partyKey(p);
    if (!key) continue;
    wanted.set(key, p.userId ? { userId: p.userId } : { customerId: p.customerId });
  }

  const limit = input.limit ?? 1;
  if (limit > 0 && wanted.size > limit) {
    problems.push({ kind: 'too-many', limit, asked: wanted.size });
  }

  const closing = open.filter((p) => !wanted.has(partyKey(p)));
  const unchanged = open.filter((p) => wanted.has(partyKey(p)));
  const opening = [...wanted.entries()]
    .filter(([key]) => !open.some((p) => partyKey(p) === key))
    .map(([, party]) => party);

  if (Number.isNaN(at.getTime())) {
    problems.push({ kind: 'future', at });
  } else {
    /*
      A handover cannot be dated into the future.

      "Ahmed gets it next Monday" reads like a plan and would be stored as a
      fact: for the days in between the asset would have NO holder at all, so
      every receipt in that gap falls out of both custodies and the totals stop
      adding up. Scheduling a future handover is a different feature with a
      different shape, and pretending this one is it is how the data gets wrong.
    */
    if (at.getTime() > now.getTime() + 60_000) problems.push({ kind: 'future', at });

    // Closing a period before it began would store a negative custody, which
    // every reader here would then treat as covering nothing.
    for (const p of closing) {
      if (at.getTime() < ms(p.startedAt)) problems.push({ kind: 'before-start', period: p });
    }
  }

  if (closing.length === 0 && opening.length === 0) problems.push({ kind: 'nobody' });

  return { closing, opening, unchanged, at, problems };
}

/** A plan worth carrying out. */
export function canHandOver(plan: HandoverPlan): boolean {
  return plan.problems.length === 0;
}

/**
 * The parties an asset ends up with after a plan — for the row that has to
 * stay in step with `AssetHolder`.
 */
export function partiesAfter(plan: HandoverPlan): CustodyParty[] {
  return [
    ...plan.unchanged.map((p) => (p.userId ? { userId: p.userId } : { customerId: p.customerId })),
    ...plan.opening,
  ];
}
